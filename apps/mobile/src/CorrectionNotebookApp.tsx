import { Ionicons } from "@expo/vector-icons";
import { createId, nowIso, type AIAnalysis, type GeneratedQuestion, type Mistake, type PracticeAttempt } from "@correction-notebook/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { buildAnswerPaperHtml, buildStudentPaperHtml } from "./print/paperHtml";
import { printHtml, sharePdf } from "./print/actions";
import {
  addCapturedMistake,
  confirmMistakeMastered,
  createInitialNotebookState,
  deleteMistake,
  getDueReviewMistakes,
  recordPracticeAttempt,
  recordTestPaper,
  replaceMistakeAI,
  setSection,
  updateMistake,
  withDefaultSettings
} from "./notebook-state";
import { createFreshTestPaper, enrichMistakeWithServerAI, submitPracticeAttempt, type EnrichMistakeResult } from "./api/enrich";
import { loadArchivedNotebookState, saveArchivedNotebookState } from "./storage/archive";
import { exportNotebookBackupToICloudDrive, importNotebookBackupFromICloudDrive } from "./storage/icloud-backup";
import type { AppSection, NotebookState } from "./types";
import { Metric, MistakeRow, Panel, PrimaryAction, SecondaryButton, Sidebar } from "./ui/components";
import { palette, styles } from "./ui/styles";
import { CaptureScreen } from "./screens/CaptureScreen";
import { CollectionScreen, EmptyNotebookScreen, NotebookScreen } from "./screens/NotebookScreen";
import { ReportScreen } from "./screens/ReportScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

function applyEnrichmentResult(state: NotebookState, mistakeId: string, result: EnrichMistakeResult): NotebookState {
  const analysis: AIAnalysis = {
    ...result.analysis,
    id: result.analysis.analysis_id,
    mistake_id: mistakeId
  };
  const questions: GeneratedQuestion[] = result.questions.map((question) => ({
    ...question,
    mistake_id: mistakeId
  }));
  return replaceMistakeAI(state, mistakeId, analysis, questions);
}

export function CorrectionNotebookApp() {
  const [state, setState] = useState<NotebookState>(() => createInitialNotebookState());
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [practiceGenerationStatus, setPracticeGenerationStatus] = useState<Record<string, "generating" | "failed">>({});
  const [practiceGenerationError, setPracticeGenerationError] = useState<Record<string, string>>({});
  const [paperGenerationStatus, setPaperGenerationStatus] = useState<"idle" | "generating" | "failed">("idle");
  const [paperGenerationError, setPaperGenerationError] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const enrichmentInFlightRef = useRef<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const activeMistakes = state.mistakes.filter((mistake) => !state.archivedMistakeIds.includes(mistake.id));
  const archivedMistakes = state.mistakes.filter((mistake) => state.archivedMistakeIds.includes(mistake.id));
  const selectedMistake = activeMistakes.find((mistake) => mistake.id === state.selectedMistakeId) ?? activeMistakes[0];
  const isCompact = width < 760;

  const goTo = (section: AppSection) => setState((current) => setSection(current, section));
  const selectMistake = (mistakeId: string) =>
    setState((current) => ({ ...current, selectedMistakeId: mistakeId, activeSection: "notebook" }));
  const confirmMastered = (mistakeId: string) => {
    setState((current) => confirmMistakeMastered(current, mistakeId));
  };
  const gradePractice = async (question: GeneratedQuestion, answerText: string): Promise<PracticeAttempt> => {
    try {
      const result = await submitPracticeAttempt({
        studentId: state.profile.id,
        questionId: question.id,
        answerText,
        practiceTotal: state.settings.practiceCount,
        model: state.settings.deepseekModel
      });
      setState((current) => recordPracticeAttempt(current, result.attempt, current.settings.practiceCount));
      return result.attempt;
    } catch (error) {
      const attempt: PracticeAttempt = {
        id: createId("local_attempt"),
        student_id: state.profile.id,
        mistake_id: question.mistake_id,
        generated_question_id: question.id,
        answer_text: answerText,
        grading_status: "ungraded",
        is_correct: null,
        error_type_if_wrong: null,
        graded_by: null,
        feedback: "DeepSeek V4 暂未完成批改。你可以先看标准答案和解法，稍后重试。",
        grading_error: error instanceof Error ? error.message : "practice_grading_failed",
        created_at: nowIso()
      };
      setState((current) => recordPracticeAttempt(current, attempt, current.settings.practiceCount));
      return attempt;
    }
  };
  const createPaper = () => {
    if (paperGenerationStatus === "generating") return;
    setPaperGenerationStatus("generating");
    setPaperGenerationError("");
    createFreshTestPaper({
      studentId: state.profile.id,
      questionCount: 10,
      difficultyMode: state.settings.practiceDifficulty,
      includeAnswerPdf: true
    }).then((result) => {
      setState((current) => recordTestPaper(current, result.paper));
      setPaperGenerationStatus("idle");
    }).catch((error: unknown) => {
      setPaperGenerationStatus("failed");
      setPaperGenerationError(error instanceof Error ? error.message : "复测卷生成失败。");
    });
  };
  const exportBackup = () => {
    setBackupStatus("正在导出备份…");
    exportNotebookBackupToICloudDrive(state)
      .then((uri) => setBackupStatus(`备份已写入：${uri}`))
      .catch((error: unknown) => setBackupStatus(error instanceof Error ? error.message : "备份导出失败。"));
  };
  const importBackup = () => {
    setBackupStatus("正在读取备份…");
    importNotebookBackupFromICloudDrive()
      .then((restored) => {
        if (!restored) {
          setBackupStatus("未读取到有效备份。");
          return;
        }
        setState(withDefaultSettings(restored));
        setBackupStatus("备份已恢复。");
      })
      .catch((error: unknown) => setBackupStatus(error instanceof Error ? error.message : "备份恢复失败。"));
  };
  const refreshPractice = (mistake: Mistake) => {
    setPracticeGenerationStatus((status) => ({ ...status, [mistake.id]: "generating" }));
    setPracticeGenerationError((errors) => {
      const nextErrors = { ...errors };
      delete nextErrors[mistake.id];
      return nextErrors;
    });
    enrichMistakeWithServerAI({
      studentId: state.profile.id,
      grade: state.profile.grade,
      ocrText: mistake.normalized_question_text || mistake.ocr_text,
      studentAnswer: mistake.student_answer,
      imageUri: mistake.cropped_image_uri ?? mistake.original_image_uri,
      settings: state.settings
    }).then((result) => {
      if (result) {
        setPracticeGenerationStatus((status) => {
          const nextStatus = { ...status };
          if (result.questions.length > 0) {
            delete nextStatus[mistake.id];
          } else {
            nextStatus[mistake.id] = "failed";
          }
          return nextStatus;
        });
        if (result.questions.length === 0) {
          setPracticeGenerationError((errors) => ({ ...errors, [mistake.id]: result.practiceError ?? "模型没有返回可用题目。" }));
        }
        setState((prev) => applyEnrichmentResult(prev, mistake.id, result));
      } else {
        setPracticeGenerationStatus((status) => ({ ...status, [mistake.id]: "failed" }));
        setPracticeGenerationError((errors) => ({ ...errors, [mistake.id]: "服务端没有返回生成结果。" }));
      }
    }).catch((err: unknown) => {
      setPracticeGenerationStatus((status) => ({ ...status, [mistake.id]: "failed" }));
      setPracticeGenerationError((errors) => ({ ...errors, [mistake.id]: err instanceof Error ? err.message : "刷新生成失败。" }));
      console.error("[practice] Refresh practice failed:", err);
    });
  };

  useEffect(() => {
    loadArchivedNotebookState().then((archived) => {
      if (archived) {
        setState(withDefaultSettings(archived));
      }
      setArchiveLoaded(true);
    });
  }, []);

  useEffect(() => {
    const mistakeId = state.enrichingMistakeId;
    if (!mistakeId || enrichmentInFlightRef.current.has(mistakeId)) return;

    const mistake = state.mistakes.find((item) => item.id === mistakeId);
    if (!mistake) {
      setState((current) => current.enrichingMistakeId === mistakeId ? { ...current, enrichingMistakeId: null } : current);
      return;
    }

    enrichmentInFlightRef.current.add(mistakeId);
    setPracticeGenerationStatus((status) => ({ ...status, [mistakeId]: "generating" }));
    setPracticeGenerationError((errors) => {
      const nextErrors = { ...errors };
      delete nextErrors[mistakeId];
      return nextErrors;
    });

    enrichMistakeWithServerAI({
      studentId: state.profile.id,
      grade: state.profile.grade,
      ocrText: mistake.normalized_question_text || mistake.ocr_text,
      studentAnswer: mistake.student_answer,
      imageUri: mistake.cropped_image_uri ?? mistake.original_image_uri,
      settings: state.settings
    }).then((result) => {
      if (result) {
        setPracticeGenerationStatus((status) => {
          const nextStatus = { ...status };
          if (result.questions.length > 0) {
            delete nextStatus[mistakeId];
          } else {
            nextStatus[mistakeId] = "failed";
          }
          return nextStatus;
        });
        if (result.questions.length === 0) {
          setPracticeGenerationError((errors) => ({ ...errors, [mistakeId]: result.practiceError ?? "模型没有返回可用题目。" }));
        }
        setState((prev) => {
          const cleared = prev.enrichingMistakeId === mistakeId ? { ...prev, enrichingMistakeId: null } : prev;
          return applyEnrichmentResult(cleared, mistakeId, result);
        });
      } else {
        setPracticeGenerationStatus((status) => ({ ...status, [mistakeId]: "failed" }));
        setPracticeGenerationError((errors) => ({ ...errors, [mistakeId]: "服务端没有返回生成结果。" }));
        setState((prev) => prev.enrichingMistakeId === mistakeId ? { ...prev, enrichingMistakeId: null } : prev);
      }
    }).catch((err: unknown) => {
      setPracticeGenerationStatus((status) => ({ ...status, [mistakeId]: "failed" }));
      setPracticeGenerationError((errors) => ({ ...errors, [mistakeId]: err instanceof Error ? err.message : "生成变式练习失败。" }));
      setState((prev) => prev.enrichingMistakeId === mistakeId ? { ...prev, enrichingMistakeId: null } : prev);
      console.error("[enrich] Server AI enrichment failed:", err);
    }).finally(() => {
      enrichmentInFlightRef.current.delete(mistakeId);
    });
  }, [state.enrichingMistakeId, state.mistakes, state.profile.grade, state.profile.id, state.settings]);

  useEffect(() => {
    if (!archiveLoaded) return;
    void saveArchivedNotebookState(state);
  }, [archiveLoaded, state]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.shell, isCompact && styles.shellCompact]}>
        <Sidebar activeSection={state.activeSection} compact={isCompact} onNavigate={goTo} />
        <View style={styles.content}>
          {state.activeSection === "home" ? (
            <HomeScreen state={state} onNavigate={goTo} onSelectMistake={selectMistake} onCreatePaper={createPaper} />
          ) : null}
          {state.activeSection === "capture" ? (
            <CaptureScreen
              onCaptured={(input) => {
                setState((current) => {
                  const next = addCapturedMistake(current, input);
                  return next.selectedMistakeId ? { ...next, enrichingMistakeId: next.selectedMistakeId } : next;
                });
              }}
            />
          ) : null}
          {state.activeSection === "notebook" ? (
            selectedMistake ? (
              <NotebookScreen
                state={state}
                mistakes={activeMistakes}
                selectedMistake={selectedMistake}
                enrichingMistakeId={state.enrichingMistakeId}
                onSelectMistake={selectMistake}
                onAttempt={gradePractice}
                onUpdateMistake={(mistakeId, patch) => setState((current) => updateMistake(current, mistakeId, patch))}
                onDeleteMistake={(mistakeId) => {
                  setState((current) => deleteMistake(current, mistakeId));
                  setPracticeGenerationError((errors) => {
                    const nextErrors = { ...errors };
                    delete nextErrors[mistakeId];
                    return nextErrors;
                  });
                }}
                onConfirmMastered={confirmMastered}
                practiceGenerationStatus={practiceGenerationStatus[selectedMistake.id]}
                practiceGenerationError={practiceGenerationError[selectedMistake.id]}
                deepseekModel={state.settings.deepseekModel}
                onRefreshPractice={refreshPractice}
              />
            ) : (
              <EmptyNotebookScreen onCapture={() => goTo("capture")} />
            )
          ) : null}
          {state.activeSection === "collection" ? (
            <CollectionScreen mistakes={archivedMistakes} />
          ) : null}
          {state.activeSection === "paper" ? <PaperScreen state={state} onCreatePaper={createPaper} generationStatus={paperGenerationStatus} generationError={paperGenerationError} /> : null}
          {state.activeSection === "report" ? <ReportScreen state={state} onCreatePaper={createPaper} /> : null}
          {state.activeSection === "settings" ? (
            <SettingsScreen
              settings={state.settings}
              onChange={(patch) => setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }))}
              backupStatus={backupStatus}
              onExportBackup={exportBackup}
              onImportBackup={importBackup}
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  state,
  onNavigate,
  onSelectMistake,
  onCreatePaper
}: {
  state: NotebookState;
  onNavigate: (section: AppSection) => void;
  onSelectMistake: (id: string) => void;
  onCreatePaper: () => void;
}) {
  const dueMistakes = useMemo(() => getDueReviewMistakes(state), [state]);
  const activeMistakeCount = state.mistakes.filter((mistake) => !state.archivedMistakeIds.includes(mistake.id)).length;
  const highFrequency = state.mistakes[0]?.knowledge_points[0] ?? "暂无重点";

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.homeHero}>
        <View style={styles.screenHeader}>
          <Text style={styles.heroKicker}>今日复盘</Text>
          <Text style={styles.heroTitle}>今天要掌握的数学错题</Text>
          <Text style={styles.heroSubtitle}>
            今天有 {dueMistakes.length} 道到期复习，其中重点是 {highFrequency}。
          </Text>
        </View>
      </View>
      <View style={styles.actionRow}>
        <PrimaryAction icon="camera-outline" label="拍一道错题" onPress={() => onNavigate("capture")} />
        <PrimaryAction icon="play-circle-outline" label="开始今日复习" onPress={() => dueMistakes[0] && onSelectMistake(dueMistakes[0].id)} />
        <PrimaryAction icon="print-outline" label="生成复测卷" onPress={onCreatePaper} />
      </View>
      <View style={styles.gridTwo}>
        <Panel title="最近未掌握">
          {dueMistakes.length > 0 ? (
            dueMistakes.slice(0, 4).map((mistake) => (
              <MistakeRow key={mistake.id} mistake={mistake} onPress={() => onSelectMistake(mistake.id)} />
            ))
          ) : (
            <Text style={styles.bodyText}>今天没有到期复习。可以拍新错题，或从错题本继续练习。</Text>
          )}
        </Panel>
        <Panel title="本周一句话">
          <Text style={styles.summaryText}>
            本周新增数学错题 {state.mistakes.length} 道。今日队列按到期时间、掌握状态和错因优先级排序，先完成到期复习再生成 10 题复测卷。
          </Text>
          <View style={styles.metricRow}>
            <Metric label="已掌握" value={`${state.mistakes.filter((m) => m.mastery_status === "mastered").length}`} />
            <Metric label="待掌握" value={`${activeMistakeCount}`} />
            <Metric label="变式题" value={`${state.generatedQuestions.length}`} />
          </View>
        </Panel>
      </View>
    </ScrollView>
  );
}

function PaperScreen({
  state,
  onCreatePaper,
  generationStatus,
  generationError
}: {
  state: NotebookState;
  onCreatePaper: () => void;
  generationStatus: "idle" | "generating" | "failed";
  generationError: string;
}) {
  const latestPaper = state.papers[0];
  const questions = latestPaper?.questions.length ? latestPaper.questions : state.generatedQuestions.slice(0, latestPaper?.question_count ?? 3);
  const studentHtml = latestPaper ? buildStudentPaperHtml(latestPaper, questions) : "";
  const answerHtml = latestPaper ? buildAnswerPaperHtml(latestPaper, questions) : "";

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>复习测试卷</Text>
        <Text style={styles.pageSubtitle}>学生卷和答案卷分开生成，答案卷不会默认一起打印。</Text>
      </View>
      <Panel title="快速生成">
        <View style={styles.paperPreviewRow}>
          <View style={styles.paperPreviewCard}>
            <Ionicons name="document-text-outline" size={24} color={palette.primary} />
            <Text style={styles.paperPreviewTitle}>学生卷</Text>
            <Text style={styles.paperPreviewText}>只保留题目和作答区。</Text>
          </View>
          <View style={styles.paperPreviewCard}>
            <Ionicons name="lock-closed-outline" size={24} color={palette.teal} />
            <Text style={styles.paperPreviewTitle}>答案卷</Text>
            <Text style={styles.paperPreviewText}>单独打印，避免提前泄露。</Text>
          </View>
        </View>
        <View style={styles.paperOptions}>
          <Metric label="时间范围" value="最近 30 天" />
          <Metric label="题量" value="10 题" />
          <Metric label="范围" value="方法性错误" />
        </View>
        <Pressable style={styles.saveButton} onPress={onCreatePaper}>
          <Ionicons name="document-text-outline" size={20} color={palette.canvas} />
          <Text style={styles.saveButtonText}>生成测试卷预览</Text>
        </Pressable>
      </Panel>
      {latestPaper ? (
        <Panel title="PDF 与打印">
          <Text style={styles.bodyText}>正式复测卷任务：{latestPaper.latex_job?.status ?? "queued"}。输出目录：{latestPaper.latex_job?.expected_outputs.student_pdf_path ?? latestPaper.student_pdf_url}</Text>
          <Text style={styles.tipText}>下方 HTML/Expo 打印仅作为非正式预览；正式学生卷和答案卷以 Claude Code + LaTeX 输出 PDF 为准。</Text>
          <View style={styles.formActions}>
            <SecondaryButton icon="print-outline" label="打印学生卷" onPress={() => printHtml(studentHtml)} />
            <SecondaryButton icon="share-outline" label="分享学生 PDF" onPress={() => sharePdf(studentHtml)} />
            <SecondaryButton icon="lock-closed-outline" label="单独打印答案卷" onPress={() => printHtml(answerHtml)} />
          </View>
        </Panel>
      ) : null}
      {generationStatus === "generating" ? (
        <Panel title="生成中">
          <Text style={styles.bodyText}>DeepSeek V4 正在重新生成复测题，并准备 Claude Code LaTeX 任务。</Text>
        </Panel>
      ) : null}
      {generationStatus === "failed" ? (
        <Panel title="生成失败">
          <Text style={styles.bodyText}>{generationError || "复测卷生成失败，请稍后重试。"}</Text>
        </Panel>
      ) : null}
    </ScrollView>
  );
}

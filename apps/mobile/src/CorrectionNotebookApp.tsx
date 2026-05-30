import { Ionicons } from "@expo/vector-icons";
import type { AIAnalysis, GeneratedQuestion, Mistake } from "@correction-notebook/shared";
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
  createTestPaper,
  deleteMistake,
  recordPracticeAttempt,
  replaceMistakeAI,
  setSection,
  updateMistake,
  withDefaultSettings
} from "./notebook-state";
import { enrichMistakeWithServerAI, type EnrichMistakeResult } from "./api/enrich";
import { loadArchivedNotebookState, saveArchivedNotebookState } from "./storage/archive";
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
            <HomeScreen state={state} onNavigate={goTo} onSelectMistake={selectMistake} onCreatePaper={() => setState(createTestPaper)} />
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
                onAttempt={(question, answer, correct) => setState((current) => recordPracticeAttempt(current, question.id, answer, correct))}
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
          {state.activeSection === "paper" ? <PaperScreen state={state} onCreatePaper={() => setState(createTestPaper)} /> : null}
          {state.activeSection === "report" ? <ReportScreen state={state} onCreatePaper={() => setState(createTestPaper)} /> : null}
          {state.activeSection === "settings" ? (
            <SettingsScreen
              settings={state.settings}
              onChange={(patch) => setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }))}
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
  const dueMistakes = useMemo(() => state.mistakes.filter((mistake) => mistake.mastery_status !== "mastered"), [state.mistakes]);
  const highFrequency = state.mistakes[0]?.knowledge_points[0] ?? "暂无重点";

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.homeHero}>
        <View style={styles.screenHeader}>
          <Text style={styles.heroKicker}>今日复盘</Text>
          <Text style={styles.heroTitle}>今天要掌握的数学错题</Text>
          <Text style={styles.heroSubtitle}>
            今天有 {dueMistakes.length} 道需要复习，其中重点是 {highFrequency}。
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
            <Text style={styles.bodyText}>还没有错题记录。</Text>
          )}
        </Panel>
        <Panel title="本周一句话">
          <Text style={styles.summaryText}>
            本周新增数学错题 {state.mistakes.length} 道，主要错误不是计算，而是等量关系和审题方向。建议先完成 3 道变式题，再打印一份 10 题复测卷。
          </Text>
          <View style={styles.metricRow}>
            <Metric label="已掌握" value={`${state.mistakes.filter((m) => m.mastery_status === "mastered").length}`} />
            <Metric label="未掌握" value={`${dueMistakes.length}`} />
            <Metric label="变式题" value={`${state.generatedQuestions.length}`} />
          </View>
        </Panel>
      </View>
    </ScrollView>
  );
}

function PaperScreen({ state, onCreatePaper }: { state: NotebookState; onCreatePaper: () => void }) {
  const latestPaper = state.papers[0];
  const questions = state.generatedQuestions.slice(0, latestPaper?.question_count ?? 3);
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
          <Text style={styles.bodyText}>已生成：{latestPaper.title}</Text>
          <View style={styles.formActions}>
            <SecondaryButton icon="print-outline" label="打印学生卷" onPress={() => printHtml(studentHtml)} />
            <SecondaryButton icon="share-outline" label="分享学生 PDF" onPress={() => sharePdf(studentHtml)} />
            <SecondaryButton icon="lock-closed-outline" label="单独打印答案卷" onPress={() => printHtml(answerHtml)} />
          </View>
        </Panel>
      ) : null}
    </ScrollView>
  );
}

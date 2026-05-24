import { Ionicons } from "@expo/vector-icons";
import type { GeneratedQuestion, Mistake } from "@correction-notebook/shared";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { adjustCropRect, percentRectToPixelCrop, type CropPercentRect, type ImageSize } from "./crop/rect";
import { CropOverlay } from "./crop/CropOverlay";
import { buildAnswerPaperHtml, buildStudentPaperHtml } from "./print/paperHtml";
import { printHtml, sharePdf } from "./print/actions";
import {
  addCapturedMistake,
  createInitialNotebookState,
  createTestPaper,
  deleteMistake,
  recordPracticeAttempt,
  setSection,
  updateMistake
} from "./notebook-state";
import { recognizeMistakeImage, type OcrResult } from "./ocr/recognize";
import type { AppSection, NotebookState } from "./types";

const navItems: Array<{ key: AppSection; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "home", label: "首页", icon: "home-outline" },
  { key: "capture", label: "拍题", icon: "camera-outline" },
  { key: "notebook", label: "错题本", icon: "albums-outline" },
  { key: "paper", label: "测试卷", icon: "print-outline" },
  { key: "report", label: "报告", icon: "bar-chart-outline" }
];

export function CorrectionNotebookApp() {
  const [state, setState] = useState<NotebookState>(() => createInitialNotebookState());
  const { width } = useWindowDimensions();
  const selectedMistake = state.mistakes.find((mistake) => mistake.id === state.selectedMistakeId) ?? state.mistakes[0];
  const isCompact = width < 760;

  const goTo = (section: AppSection) => setState((current) => setSection(current, section));
  const selectMistake = (mistakeId: string) =>
    setState((current) => ({ ...current, selectedMistakeId: mistakeId, activeSection: "notebook" }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.shell, isCompact && styles.shellCompact]}>
        <Sidebar activeSection={state.activeSection} compact={isCompact} onNavigate={goTo} />
        <View style={styles.content}>
          {state.activeSection === "home" ? (
            <HomeScreen state={state} onNavigate={goTo} onSelectMistake={selectMistake} onCreatePaper={() => setState(createTestPaper)} />
          ) : null}
          {state.activeSection === "capture" ? <CaptureScreen onCaptured={(input) => setState((current) => addCapturedMistake(current, input))} /> : null}
          {state.activeSection === "notebook" && selectedMistake ? (
            <NotebookScreen
              state={state}
              selectedMistake={selectedMistake}
              onSelectMistake={selectMistake}
              onAttempt={(question, answer, correct) => setState((current) => recordPracticeAttempt(current, question.id, answer, correct))}
              onUpdateMistake={(mistakeId, patch) => setState((current) => updateMistake(current, mistakeId, patch))}
              onDeleteMistake={(mistakeId) => setState((current) => deleteMistake(current, mistakeId))}
            />
          ) : null}
          {state.activeSection === "paper" ? <PaperScreen state={state} onCreatePaper={() => setState(createTestPaper)} /> : null}
          {state.activeSection === "report" ? <ReportScreen state={state} onCreatePaper={() => setState(createTestPaper)} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Sidebar({ activeSection, compact, onNavigate }: { activeSection: AppSection; compact: boolean; onNavigate: (section: AppSection) => void }) {
  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View style={styles.brandBlock}>
        <View style={styles.brandMark}>
          <Ionicons name="checkmark-done" size={20} color="#0b4a6f" />
        </View>
        {!compact ? (
          <View>
            <Text style={styles.brandTitle}>Correction</Text>
            <Text style={styles.brandSubtitle}>Notebook</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.navList}>
        {navItems.map((item) => {
          const active = activeSection === item.key;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              key={item.key}
              style={[styles.navItem, active && styles.navItemActive, compact && styles.navItemCompact]}
              onPress={() => onNavigate(item.key)}
            >
              <Ionicons name={item.icon} size={21} color={active ? "#0b4a6f" : "#5c6978"} />
              {!compact ? <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
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
  const highFrequency = state.mistakes[0]?.knowledge_points[0] ?? "一元一次方程";

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>今天要掌握的数学错题</Text>
        <Text style={styles.pageSubtitle}>
          今天有 {dueMistakes.length} 道需要复习，其中重点是 {highFrequency}。
        </Text>
      </View>
      <View style={styles.actionRow}>
        <PrimaryAction icon="camera-outline" label="拍一道错题" onPress={() => onNavigate("capture")} />
        <PrimaryAction icon="play-circle-outline" label="开始今日复习" onPress={() => dueMistakes[0] && onSelectMistake(dueMistakes[0].id)} />
        <PrimaryAction icon="print-outline" label="生成复测卷" onPress={onCreatePaper} />
      </View>
      <View style={styles.gridTwo}>
        <Panel title="最近未掌握">
          {dueMistakes.slice(0, 4).map((mistake) => (
            <MistakeRow key={mistake.id} mistake={mistake} onPress={() => onSelectMistake(mistake.id)} />
          ))}
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

function CaptureScreen({ onCaptured }: { onCaptured: (input: { imageUri?: string; ocrText: string; studentAnswer: string }) => void }) {
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [originalImageUri, setOriginalImageUri] = useState<string | undefined>();
  const [imageSize, setImageSize] = useState<ImageSize | undefined>();
  const [cropRect, setCropRect] = useState<CropPercentRect>({ left: 8, top: 8, width: 84, height: 64 });
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");
  const [ocrState, setOcrState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [ocrResult, setOcrResult] = useState<OcrResult | undefined>();

  const runOcr = async (uri: string) => {
    setOcrState("running");
    setOcrResult(undefined);
    try {
      const result = await recognizeMistakeImage(uri);
      setOcrText(result.normalizedText);
      setOcrResult(result);
      setOcrState("done");
    } catch {
      setOcrState("failed");
      setOcrText("");
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      setOriginalImageUri(asset.uri);
      setImageUri(asset.uri);
      setImageSize(asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined);
      setCropRect({ left: 8, top: 8, width: 84, height: 64 });
      await runOcr(asset.uri);
    }
  };

  const captureWithCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      setOriginalImageUri(asset.uri);
      setImageUri(asset.uri);
      setImageSize(asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined);
      setCropRect({ left: 8, top: 8, width: 84, height: 64 });
      await runOcr(asset.uri);
    }
  };

  const applyCrop = async () => {
    if (!originalImageUri || !imageSize) return;
    setIsCropping(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        originalImageUri,
        [{ crop: percentRectToPixelCrop(cropRect, imageSize) }],
        { compress: 0.94, format: ImageManipulator.SaveFormat.JPEG }
      );
      setImageUri(result.uri);
      setImageSize({ width: result.width, height: result.height });
      setCropRect({ left: 0, top: 0, width: 100, height: 100 });
      await runOcr(result.uri);
    } finally {
      setIsCropping(false);
    }
  };

  const resetCrop = async () => {
    if (!originalImageUri) return;
    setImageUri(originalImageUri);
    setCropRect({ left: 8, top: 8, width: 84, height: 64 });
    await runOcr(originalImageUri);
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>拍题并确认 OCR</Text>
        <Text style={styles.pageSubtitle}>图片可先离线保存，OCR 和 AI 分析失败也不会阻止归档。</Text>
      </View>
      <View style={styles.captureLayout}>
        <View style={styles.captureMediaColumn}>
          <View
            style={styles.capturePreview}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setContainerSize({ width, height });
            }}
          >
            {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" /> : <Text style={styles.previewText}>错题图片预览</Text>}
            {imageUri && originalImageUri === imageUri ? (
              <CropOverlay
                rect={cropRect}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                imageSize={imageSize}
                onRectChange={setCropRect}
              />
            ) : null}
          </View>
          <View style={styles.previewActions}>
            <SecondaryButton icon="camera-outline" label="拍照" onPress={captureWithCamera} />
            <SecondaryButton icon="image-outline" label="相册导入" onPress={pickFromLibrary} />
          </View>
          {imageUri ? (
            <View style={styles.cropPanel}>
              <Text style={styles.inputLabel}>框出错题区域</Text>
              <View style={styles.cropGrid}>
                <CropStepper label="上移" icon="arrow-up-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "top", -3))} />
                <CropStepper label="下移" icon="arrow-down-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "top", 3))} />
                <CropStepper label="左移" icon="arrow-back-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "left", -3))} />
                <CropStepper label="右移" icon="arrow-forward-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "left", 3))} />
                <CropStepper label="变窄" icon="remove-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "width", -4))} />
                <CropStepper label="变宽" icon="add-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "width", 4))} />
                <CropStepper label="变矮" icon="remove-circle-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "height", -4))} />
                <CropStepper label="变高" icon="add-circle-outline" onPress={() => setCropRect((rect) => adjustCropRect(rect, "height", 4))} />
              </View>
              <View style={styles.previewActions}>
                <SecondaryButton icon="crop-outline" label={isCropping ? "裁剪中" : "应用裁剪并重新 OCR"} onPress={applyCrop} />
                <SecondaryButton icon="refresh-outline" label="重置原图" onPress={resetCrop} />
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.formPanel}>
          <View style={[styles.ocrStatus, ocrState === "failed" && styles.ocrStatusFailed]}>
            <Ionicons
              name={ocrState === "running" ? "sync-outline" : ocrState === "done" ? "checkmark-circle-outline" : ocrState === "failed" ? "alert-circle-outline" : "scan-outline"}
              size={18}
              color={ocrState === "failed" ? "#9a3412" : "#0b4a6f"}
            />
            <Text style={[styles.ocrStatusText, ocrState === "failed" && styles.ocrStatusTextFailed]}>
              {ocrState === "idle" ? "拍照或导入后会自动执行 OCR" : null}
              {ocrState === "running" ? "OCR 识别中，完成后会自动填入题干" : null}
              {ocrState === "done" ? `OCR 已完成，置信度 ${Math.round((ocrResult?.confidence ?? 0) * 100)}%，请核对` : null}
              {ocrState === "failed" ? "OCR 失败，可先手动录入题干并保存" : null}
            </Text>
          </View>
          <Text style={styles.inputLabel}>OCR 题干，可手动修改</Text>
          <TextInput multiline value={ocrText} onChangeText={setOcrText} placeholder="拍照或导入图片后自动识别，也可手动输入" style={styles.textArea} />
          <Text style={styles.inputLabel}>学生原答案</Text>
          <TextInput value={studentAnswer} onChangeText={setStudentAnswer} style={styles.input} />
          <Pressable
            style={styles.saveButton}
            onPress={() => onCaptured({ ...(imageUri ? { imageUri } : {}), ocrText, studentAnswer })}
          >
            <Ionicons name="save-outline" size={20} color="#ffffff" />
            <Text style={styles.saveButtonText}>保存到错题本</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function NotebookScreen({
  state,
  selectedMistake,
  onSelectMistake,
  onAttempt,
  onUpdateMistake,
  onDeleteMistake
}: {
  state: NotebookState;
  selectedMistake: Mistake;
  onSelectMistake: (id: string) => void;
  onAttempt: (question: GeneratedQuestion, answer: string, correct: boolean) => void;
  onUpdateMistake: (
    mistakeId: string,
    patch: Pick<Mistake, "normalized_question_text" | "ocr_text" | "student_answer" | "knowledge_points" | "main_error_type" | "secondary_error_types">
  ) => void;
  onDeleteMistake: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const listIsCompact = width < 1100;
  const [isEditing, setIsEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState(selectedMistake.normalized_question_text || selectedMistake.ocr_text);
  const [editAnswer, setEditAnswer] = useState(selectedMistake.student_answer);
  const [editKnowledgePoints, setEditKnowledgePoints] = useState(selectedMistake.knowledge_points.join("、"));
  const [editMainErrorType, setEditMainErrorType] = useState<string>(selectedMistake.main_error_type ?? "方法性错误");
  const [editSecondaryErrorTypes, setEditSecondaryErrorTypes] = useState(selectedMistake.secondary_error_types.join("、"));
  const analysis = state.analyses.find((item) => item.mistake_id === selectedMistake.id);
  const questions = state.generatedQuestions.filter((question) => question.mistake_id === selectedMistake.id);

  const beginEdit = () => {
    setEditQuestion(selectedMistake.normalized_question_text || selectedMistake.ocr_text);
    setEditAnswer(selectedMistake.student_answer);
    setEditKnowledgePoints(selectedMistake.knowledge_points.join("、"));
    setEditMainErrorType(selectedMistake.main_error_type ?? "方法性错误");
    setEditSecondaryErrorTypes(selectedMistake.secondary_error_types.join("、"));
    setIsEditing(true);
  };

  const saveEdit = () => {
    const normalizedQuestion = editQuestion.trim();
    onUpdateMistake(selectedMistake.id, {
      normalized_question_text: normalizedQuestion,
      ocr_text: normalizedQuestion,
      student_answer: editAnswer.trim(),
      knowledge_points: splitTags(editKnowledgePoints),
      main_error_type: normalizePrimaryErrorType(editMainErrorType),
      secondary_error_types: splitTags(editSecondaryErrorTypes).slice(0, 2)
    });
    setIsEditing(false);
  };

  return (
    <View style={styles.notebookLayout}>
      <ScrollView style={[styles.mistakeList, listIsCompact && styles.mistakeListCompact]} contentContainerStyle={styles.mistakeListContent}>
        {state.mistakes.map((mistake) => (
          <MistakeRow key={mistake.id} mistake={mistake} active={selectedMistake.id === mistake.id} onPress={() => onSelectMistake(mistake.id)} />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.detailContent} style={styles.detailPane}>
        <View style={styles.detailHero}>
          <View style={styles.problemImage}>
            {selectedMistake.cropped_image_uri ? <Image source={{ uri: selectedMistake.cropped_image_uri }} style={styles.previewImage} /> : <Text style={styles.problemImageText}>原题图片 / 裁切图</Text>}
          </View>
          <View style={styles.problemText}>
            {isEditing ? (
              <View style={styles.editForm}>
                <Text style={styles.inputLabel}>题干 / OCR 文本</Text>
                <TextInput multiline value={editQuestion} onChangeText={setEditQuestion} style={styles.textArea} />
                <Text style={styles.inputLabel}>学生答案</Text>
                <TextInput value={editAnswer} onChangeText={setEditAnswer} style={styles.input} />
                <Text style={styles.inputLabel}>知识点，用顿号分隔</Text>
                <TextInput value={editKnowledgePoints} onChangeText={setEditKnowledgePoints} style={styles.input} />
                <Text style={styles.inputLabel}>主错因</Text>
                <TextInput value={editMainErrorType} onChangeText={setEditMainErrorType} style={styles.input} />
                <Text style={styles.inputLabel}>辅助错因，最多 2 个</Text>
                <TextInput value={editSecondaryErrorTypes} onChangeText={setEditSecondaryErrorTypes} style={styles.input} />
              </View>
            ) : (
              <>
                <Text style={styles.detailTitle}>{selectedMistake.normalized_question_text || selectedMistake.ocr_text}</Text>
                <Text style={styles.wrongAnswer}>学生答案：{selectedMistake.student_answer || "未填写"}</Text>
                <TagRow tags={[selectedMistake.main_error_type ?? "待分析", ...selectedMistake.secondary_error_types]} />
              </>
            )}
            <View style={styles.editActions}>
              {isEditing ? (
                <>
                  <SecondaryButton icon="checkmark-outline" label="完成修改" onPress={saveEdit} />
                  <SecondaryButton icon="close-outline" label="取消" onPress={() => setIsEditing(false)} />
                </>
              ) : (
                <>
                  <SecondaryButton icon="create-outline" label="编辑错题" onPress={beginEdit} />
                  <SecondaryButton icon="trash-outline" label="删除" onPress={() => onDeleteMistake(selectedMistake.id)} />
                </>
              )}
            </View>
          </View>
        </View>
        <Panel title="错因讲解">
          {analysis ? (
            <View>
              <Text style={styles.explainLead}>{analysis.student_friendly_explanation}</Text>
              <Text style={styles.bodyText}>{analysis.error_summary}</Text>
              <Text style={styles.bodyText}>错在：{analysis.wrong_step_location}</Text>
              {analysis.correct_solution_steps.map((step) => (
                <Text key={step} style={styles.stepText}>• {step}</Text>
              ))}
              <Text style={styles.tipText}>避错：{analysis.avoidance_tip}</Text>
            </View>
          ) : (
            <Text style={styles.bodyText}>这道题仍在 AI 待确认队列，可先保存并稍后分析。</Text>
          )}
        </Panel>
        <Panel title="3 道变式练习">
          {questions.map((question) => (
            <PracticeQuestion key={question.id} question={question} onAttempt={onAttempt} />
          ))}
        </Panel>
      </ScrollView>
    </View>
  );
}

function splitTags(value: string): string[] {
  return [...new Set(value.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean))];
}

function normalizePrimaryErrorType(value: string): Mistake["main_error_type"] {
  const options: NonNullable<Mistake["main_error_type"]>[] = [
    "知识性错误",
    "方法性错误",
    "过程性错误",
    "审题性错误",
    "表达性错误",
    "习惯性错误"
  ];
  return options.includes(value as NonNullable<Mistake["main_error_type"]>)
    ? (value as NonNullable<Mistake["main_error_type"]>)
    : "方法性错误";
}

function PracticeQuestion({ question, onAttempt }: { question: GeneratedQuestion; onAttempt: (question: GeneratedQuestion, answer: string, correct: boolean) => void }) {
  const [answer, setAnswer] = useState("");

  return (
    <View style={styles.practiceBox}>
      <Text style={styles.practiceTitle}>{question.question_text}</Text>
      <Text style={styles.practiceReason}>{question.why_related_to_original_mistake}</Text>
      <TextInput value={answer} onChangeText={setAnswer} placeholder="输入答案，或手动标记正误" style={styles.input} />
      <View style={styles.formActions}>
        <SecondaryButton icon="checkmark-circle-outline" label="标记正确" onPress={() => onAttempt(question, answer || question.answer, true)} />
        <SecondaryButton icon="close-circle-outline" label="标记错误" onPress={() => onAttempt(question, answer || "未掌握", false)} />
      </View>
    </View>
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
        <View style={styles.paperOptions}>
          <Metric label="时间范围" value="最近 30 天" />
          <Metric label="题量" value="10 题" />
          <Metric label="范围" value="方法性错误" />
        </View>
        <Pressable style={styles.saveButton} onPress={onCreatePaper}>
          <Ionicons name="document-text-outline" size={20} color="#ffffff" />
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

function ReportScreen({ state, onCreatePaper }: { state: NotebookState; onCreatePaper: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>本周报告</Text>
        <Text style={styles.pageSubtitle}>少用图表，多给下一步行动建议。</Text>
      </View>
      <Panel title="自然语言总结">
        <Text style={styles.summaryText}>
          本周新增数学错题 {state.mistakes.length} 道，主要集中在“一元一次方程”和“等量关系”。主要错误不是计算，而是方法性错误与审题方向混在一起。
        </Text>
        <Text style={styles.tipText}>建议今天完成 3 道变式题，并打印一份 10 题复测卷。</Text>
        <Pressable style={styles.saveButton} onPress={onCreatePaper}>
          <Ionicons name="print-outline" size={20} color="#ffffff" />
          <Text style={styles.saveButtonText}>从报告生成复测卷</Text>
        </Pressable>
      </Panel>
      <View style={styles.metricRow}>
        <Metric label="高频错因" value="方法性" />
        <Metric label="薄弱知识点" value="方程" />
        <Metric label="通过率" value="67%" />
      </View>
    </ScrollView>
  );
}

function PrimaryAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.primaryAction} onPress={onPress}>
      <Ionicons name={icon} size={24} color="#0b4a6f" />
      <Text style={styles.primaryActionText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Ionicons name={icon} size={18} color="#0b4a6f" />
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function CropStepper({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.cropStepper} onPress={onPress}>
      <Ionicons name={icon} size={16} color="#0b4a6f" />
      <Text style={styles.cropStepperText}>{label}</Text>
    </Pressable>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MistakeRow({ mistake, active = false, onPress }: { mistake: Mistake; active?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.mistakeRow, active && styles.mistakeRowActive]} onPress={onPress}>
      <View style={styles.thumbnail}>
        <Ionicons name="document-text-outline" size={20} color="#476175" />
      </View>
      <View style={styles.mistakeRowText}>
        <Text numberOfLines={4} style={styles.mistakeTitle}>{mistake.normalized_question_text || mistake.ocr_text || "未识别题干"}</Text>
        <Text style={styles.mistakeMeta}>{mistake.knowledge_points.join(" / ")} · {mistake.mastery_status}</Text>
      </View>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  return (
    <View style={styles.tagRow}>
      {tags.slice(0, 3).map((tag) => (
        <Text key={tag} style={styles.tag}>{tag}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7f8"
  },
  shell: {
    flex: 1,
    flexDirection: "row"
  },
  shellCompact: {
    flexDirection: "row"
  },
  sidebar: {
    width: 190,
    padding: 18,
    borderRightWidth: 1,
    borderColor: "#dce3e8",
    backgroundColor: "#ffffff"
  },
  sidebarCompact: {
    width: 74,
    paddingHorizontal: 10
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 24
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d7eef8"
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#17202a"
  },
  brandSubtitle: {
    fontSize: 12,
    color: "#607083"
  },
  navList: {
    gap: 8
  },
  navItem: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  navItemCompact: {
    justifyContent: "center",
    paddingHorizontal: 0
  },
  navItemActive: {
    backgroundColor: "#e0f2f8"
  },
  navText: {
    fontSize: 15,
    color: "#5c6978",
    fontWeight: "600"
  },
  navTextActive: {
    color: "#0b4a6f"
  },
  content: {
    flex: 1
  },
  screen: {
    padding: 24,
    gap: 18
  },
  screenHeader: {
    gap: 8,
    maxWidth: 760
  },
  pageTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    color: "#17202a"
  },
  pageSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#5f6b7a"
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  primaryAction: {
    minWidth: 180,
    minHeight: 76,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e3e8"
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#17202a"
  },
  gridTwo: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  panel: {
    flexGrow: 1,
    flexBasis: 320,
    borderRadius: 8,
    padding: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e3e8",
    gap: 12
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17202a"
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 25,
    color: "#263341"
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  metric: {
    minWidth: 112,
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#edf5f7"
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0b4a6f"
  },
  metricLabel: {
    fontSize: 12,
    color: "#607083",
    marginTop: 4
  },
  mistakeRow: {
    minHeight: 82,
    borderRadius: 8,
    flexDirection: "row",
    gap: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dde5ea"
  },
  mistakeRowActive: {
    borderColor: "#2d8fb3",
    backgroundColor: "#eef9fc"
  },
  thumbnail: {
    width: 42,
    height: 42,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf2f5"
  },
  mistakeRowText: {
    flex: 1,
    gap: 5
  },
  mistakeTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: "#17202a",
    flexShrink: 1
  },
  mistakeMeta: {
    fontSize: 12,
    color: "#647184"
  },
  captureLayout: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18
  },
  captureMediaColumn: {
    flexGrow: 1,
    flexBasis: 320,
    gap: 12
  },
  capturePreview: {
    flexGrow: 1,
    minHeight: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5dc",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative"
  },
  previewImage: {
    width: "100%",
    height: "100%"
  },
  previewText: {
    color: "#647184",
    fontSize: 16
  },
  previewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10
  },
  cropPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d9e3e8",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10
  },
  cropGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center"
  },
  cropStepper: {
    minHeight: 36,
    minWidth: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bdd7e1",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#f7fbfc"
  },
  cropStepperText: {
    fontSize: 12,
    color: "#0b4a6f",
    fontWeight: "700"
  },
  formPanel: {
    flexGrow: 1,
    flexBasis: 340,
    borderRadius: 8,
    padding: 18,
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e3e8"
  },
  formActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bdd7e1",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f7fbfc"
  },
  secondaryButtonText: {
    color: "#0b4a6f",
    fontWeight: "700"
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#425062"
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5dc",
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    fontSize: 15
  },
  textArea: {
    minHeight: 126,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5dc",
    padding: 12,
    backgroundColor: "#ffffff",
    fontSize: 15,
    textAlignVertical: "top"
  },
  ocrStatus: {
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#eef9fc",
    borderWidth: 1,
    borderColor: "#bdd7e1"
  },
  ocrStatusFailed: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74"
  },
  ocrStatusText: {
    flex: 1,
    color: "#0b4a6f",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  ocrStatusTextFailed: {
    color: "#9a3412"
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#0b4a6f"
  },
  saveButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15
  },
  notebookLayout: {
    flex: 1,
    flexDirection: "row"
  },
  mistakeList: {
    width: 280,
    maxWidth: 300,
    borderRightWidth: 1,
    borderColor: "#dce3e8",
    backgroundColor: "#f8fafb"
  },
  mistakeListCompact: {
    width: 238
  },
  mistakeListContent: {
    padding: 14,
    gap: 10
  },
  detailPane: {
    flex: 1
  },
  detailContent: {
    padding: 22,
    gap: 16
  },
  detailHero: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  problemImage: {
    flexGrow: 1,
    flexBasis: 300,
    minHeight: 220,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e3e8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  problemImageText: {
    color: "#647184",
    fontSize: 15
  },
  problemText: {
    flexGrow: 1,
    flexBasis: 320,
    borderRadius: 8,
    padding: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e3e8",
    gap: 12
  },
  detailTitle: {
    fontSize: 20,
    lineHeight: 30,
    fontWeight: "800",
    color: "#17202a"
  },
  editForm: {
    gap: 9
  },
  editActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 2
  },
  wrongAnswer: {
    fontSize: 15,
    color: "#8a3b2b"
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#edf5f7",
    color: "#0b4a6f",
    fontWeight: "700",
    fontSize: 12
  },
  explainLead: {
    fontSize: 17,
    lineHeight: 25,
    color: "#0b4a6f",
    fontWeight: "800"
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: "#263341"
  },
  stepText: {
    fontSize: 15,
    lineHeight: 24,
    color: "#263341"
  },
  tipText: {
    fontSize: 15,
    lineHeight: 24,
    color: "#226b3d",
    fontWeight: "700"
  },
  practiceBox: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#f8fafb",
    borderWidth: 1,
    borderColor: "#dce3e8",
    gap: 10
  },
  practiceTitle: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "800",
    color: "#17202a"
  },
  practiceReason: {
    fontSize: 13,
    lineHeight: 20,
    color: "#607083"
  },
  paperOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  }
});

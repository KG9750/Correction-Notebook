import { Ionicons } from "@expo/vector-icons";
import type { GeneratedQuestion, Mistake, PracticeAttempt } from "@correction-notebook/shared";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import type { ImageSize } from "../crop/rect";
import type { AppSettings, NotebookState } from "../types";
import { groupMistakesForArchive, IconButton, MistakeRow, Panel, SecondaryButton, TagRow } from "../ui/components";
import { palette, styles } from "../ui/styles";

export function NotebookScreen({
  state,
  mistakes,
  selectedMistake,
  enrichingMistakeId,
  onSelectMistake,
  onAttempt,
  onUpdateMistake,
  onDeleteMistake,
  onConfirmMastered,
  practiceGenerationStatus,
  practiceGenerationError,
  deepseekModel,
  onRefreshPractice
}: {
  state: NotebookState;
  mistakes: Mistake[];
  selectedMistake: Mistake;
  enrichingMistakeId: string | null;
  onSelectMistake: (id: string) => void;
  onAttempt: (question: GeneratedQuestion, answer: string) => Promise<PracticeAttempt>;
  onUpdateMistake: (
    mistakeId: string,
    patch: Pick<Mistake, "normalized_question_text" | "ocr_text" | "student_answer" | "knowledge_points" | "main_error_type" | "secondary_error_types">
  ) => void;
  onDeleteMistake: (id: string) => void;
  onConfirmMastered: (id: string) => void;
  practiceGenerationStatus: "generating" | "failed" | undefined;
  practiceGenerationError: string | undefined;
  deepseekModel: AppSettings["deepseekModel"];
  onRefreshPractice: (mistake: Mistake) => void;
}) {
  const { width } = useWindowDimensions();
  const listIsCompact = width < 1100;
  const [detailImageSize, setDetailImageSize] = useState<ImageSize | undefined>();
  const [isEditing, setIsEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState(selectedMistake.normalized_question_text || selectedMistake.ocr_text);
  const [editAnswer, setEditAnswer] = useState(selectedMistake.student_answer);
  const [editKnowledgePoints, setEditKnowledgePoints] = useState(selectedMistake.knowledge_points.join("、"));
  const [editMainErrorType, setEditMainErrorType] = useState<string>(selectedMistake.main_error_type ?? "方法性错误");
  const [editSecondaryErrorTypes, setEditSecondaryErrorTypes] = useState(selectedMistake.secondary_error_types.join("、"));
  const analysis = state.analyses.find((item) => item.mistake_id === selectedMistake.id);
  const questions = state.generatedQuestions.filter((question) => question.mistake_id === selectedMistake.id);
  const visibleQuestions = questions.slice(0, state.settings.practiceCount);
  const practiceCompletion = getPracticeCompletion(visibleQuestions, state.attempts);
  const modelLabel = deepseekModel === "deepseek-v4-flash" ? "DeepSeek V4 Flash" : "DeepSeek V4 Pro";
  const detailImageAspect = detailImageSize ? detailImageSize.width / detailImageSize.height : undefined;
  const detailImageHeight = detailImageAspect ? Math.max(150, Math.min(360, 340 / detailImageAspect)) : undefined;

  useEffect(() => {
    setDetailImageSize(undefined);
    if (!selectedMistake.cropped_image_uri) return;
    Image.getSize(
      selectedMistake.cropped_image_uri,
      (imageWidth, imageHeight) => setDetailImageSize({ width: imageWidth, height: imageHeight }),
      () => setDetailImageSize(undefined)
    );
  }, [selectedMistake.cropped_image_uri]);

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
        <View style={styles.listHeader}>
          <Text style={styles.listKicker}>错题档案</Text>
          <Text style={styles.listTitle}>{mistakes.length} 道待掌握</Text>
        </View>
        {groupMistakesForArchive(mistakes).map((group) => (
          <View key={group.title} style={styles.mistakeGroup}>
            <View style={styles.mistakeGroupHeader}>
              <Text style={styles.mistakeGroupTitle}>{group.title}</Text>
              <Text style={styles.mistakeGroupCount}>{group.mistakes.length}</Text>
            </View>
            {group.mistakes.map((mistake) => (
              <MistakeRow
                key={mistake.id}
                mistake={mistake}
                active={selectedMistake.id === mistake.id}
                onPress={() => onSelectMistake(mistake.id)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.detailContent} style={styles.detailPane}>
        {enrichingMistakeId === selectedMistake.id ? (
          <View style={styles.enrichingBanner}>
            <Ionicons name="sync-outline" size={18} color={palette.teal} />
            <Text style={styles.enrichingText}>Analyzing…</Text>
          </View>
        ) : null}
        <View style={styles.detailHero}>
          <View style={[styles.problemImage, detailImageHeight ? { height: detailImageHeight } : null]}>
            {selectedMistake.cropped_image_uri ? <Image source={{ uri: selectedMistake.cropped_image_uri }} style={styles.detailImage} resizeMode="contain" /> : <Text style={styles.problemImageText}>原题图片 / 裁切图</Text>}
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
                <Text style={styles.detailTitle}>
                  <Text style={styles.detailLabel}>试卷题目：</Text>
                  {selectedMistake.normalized_question_text || selectedMistake.ocr_text}
                </Text>
                <Text style={styles.wrongAnswer}>
                  <Text style={styles.answerLabel}>学生答案：</Text>
                  <Text style={styles.answerValue}>{selectedMistake.student_answer || "未填写"}</Text>
                </Text>
                <View style={styles.metaActionRow}>
                  <TagRow tags={[selectedMistake.main_error_type ?? "待分析", ...selectedMistake.secondary_error_types]} />
                  <View style={styles.iconActionRow}>
                    <IconButton icon="create-outline" label="编辑错题" onPress={beginEdit} />
                    <IconButton icon="trash-outline" label="删除错题" onPress={() => onDeleteMistake(selectedMistake.id)} />
                  </View>
                </View>
              </>
            )}
            {isEditing ? (
              <View style={styles.editActions}>
                <>
                  <SecondaryButton icon="checkmark-outline" label="完成修改" onPress={saveEdit} />
                  <SecondaryButton icon="close-outline" label="取消" onPress={() => setIsEditing(false)} />
                </>
              </View>
            ) : null}
          </View>
        </View>
        <Panel title="错因讲解">
          {analysis ? (
            <View>
              <Text style={styles.explainLead}>{analysis.student_friendly_explanation}</Text>
              <Text style={styles.bodyText}>{analysis.error_summary}</Text>
              <Text style={styles.bodyText}>错在：{analysis.wrong_step_location}</Text>
              {analysis.correct_solution_steps.map((step) => (
                <Text key={step} style={styles.solutionStepText}>• {step}</Text>
              ))}
              <Text style={styles.tipText}>避错：{analysis.avoidance_tip}</Text>
            </View>
          ) : (
            <Text style={styles.bodyText}>这道题仍在 {modelLabel} 待分析队列，完成后会显示错因讲解。</Text>
          )}
        </Panel>
        <Panel
          title={`${state.settings.practiceCount} 道变式练习`}
          action={
            <SecondaryButton
              icon="refresh-outline"
              label={practiceGenerationStatus === "generating" ? "生成中" : "刷新生成"}
              onPress={() => {
                if (practiceGenerationStatus !== "generating") onRefreshPractice(selectedMistake);
              }}
            />
          }
        >
          {practiceGenerationStatus === "generating" && visibleQuestions.length > 0 ? (
            <View style={styles.practiceStatusBox}>
              <Ionicons name="sync-outline" size={18} color={palette.teal} />
              <Text style={styles.bodyText}>{modelLabel} 正在刷新变式练习，当前题目可先继续查看。</Text>
            </View>
          ) : null}
          {visibleQuestions.length > 0 ? (
            <>
              {visibleQuestions.map((question) => (
                <PracticeQuestion key={question.id} question={question} onAttempt={onAttempt} />
              ))}
              {practiceCompletion.allAnswered ? (
                <View style={practiceCompletion.allCorrect ? styles.masteryConfirmBox : styles.masteryWaitingBox}>
                  <Ionicons
                    name={practiceCompletion.allCorrect ? "ribbon-outline" : "refresh-circle-outline"}
                    size={20}
                    color={practiceCompletion.allCorrect ? palette.teal : palette.primary}
                  />
                  <View style={styles.masteryConfirmText}>
                    <Text style={styles.practiceTitle}>
                      {practiceCompletion.allCorrect ? "已批改练习全部正确" : "练习还未全部批改正确"}
                    </Text>
                    <Text style={styles.practiceReason}>
                      {practiceCompletion.allCorrect
                        ? "确认后，这道错题会移动到错题集，并按知识点大类归档。"
                        : "DeepSeek V4 批改达到掌握标准后，才可以确认掌握。"}
                    </Text>
                  </View>
                  {practiceCompletion.allCorrect ? (
                    <SecondaryButton icon="checkmark-done-outline" label="确认已掌握" onPress={() => onConfirmMastered(selectedMistake.id)} />
                  ) : null}
                </View>
              ) : null}
            </>
          ) : practiceGenerationStatus === "generating" ? (
            <View style={styles.practiceStatusBox}>
              <Ionicons name="sync-outline" size={18} color={palette.teal} />
              <Text style={styles.bodyText}>{modelLabel} 正在生成变式练习，完成后会自动显示。</Text>
            </View>
          ) : practiceGenerationStatus === "failed" ? (
            <View style={styles.practiceStatusBox}>
              <Ionicons name="alert-circle-outline" size={18} color={palette.primary} />
              <Text style={styles.bodyText}>错因讲解已完成，但 {modelLabel} 没有成功返回变式练习。{practiceGenerationError ? `原因：${practiceGenerationError}` : "请稍后重试或检查 API 状态。"}</Text>
            </View>
          ) : analysis ? (
            <View style={styles.practiceStatusBox}>
              <Ionicons name="alert-circle-outline" size={18} color={palette.primary} />
              <Text style={styles.bodyText}>错因讲解已完成，但这条记录还没有变式练习。可稍后重新生成或重新拍题。</Text>
            </View>
          ) : (
            <Text style={styles.bodyText}>{modelLabel} 生成完成后会显示变式练习。</Text>
          )}
        </Panel>
      </ScrollView>
    </View>
  );
}

export function EmptyNotebookScreen({ onCapture }: { onCapture: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Panel title="错题本">
        <Text style={styles.bodyText}>还没有保存错题。</Text>
        <View style={styles.formActions}>
          <SecondaryButton icon="camera-outline" label="拍一道错题" onPress={onCapture} />
        </View>
      </Panel>
    </ScrollView>
  );
}

export function CollectionScreen({ mistakes }: { mistakes: Mistake[] }) {
  const groups = groupMistakesForArchive(mistakes);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>错题集</Text>
        <Text style={styles.pageSubtitle}>已确认掌握的错题会按知识点一级大类沉淀在这里。</Text>
      </View>
      {groups.length > 0 ? (
        groups.map((group) => (
          <Panel
            key={group.title}
            title={group.title}
            action={<Text style={styles.collectionCount}>{group.mistakes.length} 道</Text>}
          >
            <View style={styles.collectionGrid}>
              {group.mistakes.map((mistake) => (
                <View key={mistake.id} style={styles.collectionCard}>
                  <View style={styles.collectionCardHeader}>
                    <Ionicons name="checkmark-done-circle-outline" size={20} color={palette.teal} />
                    <Text style={styles.collectionCategory}>{mistake.main_error_type ?? "已掌握"}</Text>
                  </View>
                  <Text numberOfLines={3} style={styles.collectionTitle}>
                    {mistake.normalized_question_text || mistake.ocr_text || "未识别题干"}
                  </Text>
                  <Text numberOfLines={2} style={styles.mistakeMeta}>{mistake.knowledge_points.join(" / ")}</Text>
                </View>
              ))}
            </View>
          </Panel>
        ))
      ) : (
        <Panel title="暂无归档错题">
          <Text style={styles.bodyText}>当变式练习全部答对，并确认知识点已掌握后，错题会自动移动到这里。</Text>
        </Panel>
      )}
    </ScrollView>
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

function PracticeQuestion({ question, onAttempt }: { question: GeneratedQuestion; onAttempt: (question: GeneratedQuestion, answer: string) => Promise<PracticeAttempt> }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<PracticeAttempt | undefined>();
  const [isGrading, setIsGrading] = useState(false);
  const judgeAnswer = () => {
    if (isGrading) return;
    setIsGrading(true);
    setResult(undefined);
    onAttempt(question, answer || "未填写")
      .then(setResult)
      .finally(() => setIsGrading(false));
  };

  return (
    <View style={styles.practiceBox}>
      <Text style={styles.practiceTitle}>{question.question_text}</Text>
      <Text style={styles.practiceReason}>{question.why_related_to_original_mistake}</Text>
      <View style={styles.answerInputRow}>
        <TextInput
          value={answer}
          onChangeText={(value) => {
            setAnswer(value);
            setResult(undefined);
          }}
          placeholder="输入答案后交给 DeepSeek V4 批改"
          returnKeyType="done"
          onSubmitEditing={judgeAnswer}
          style={[styles.input, styles.answerInput]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="提交答案批改" style={styles.answerJudgeButton} onPress={judgeAnswer}>
          <Ionicons name={isGrading ? "sync-outline" : "checkmark-circle-outline"} size={22} color={palette.canvas} />
        </Pressable>
      </View>
      {isGrading ? <Text style={styles.bodyText}>DeepSeek V4 正在批改…</Text> : null}
      {result ? (
        <View>
          <Text style={result.grading_status === "ungraded" ? styles.wrongText : result.is_correct ? styles.correctText : styles.wrongText}>
            {result.grading_status === "ungraded" ? "暂未批改" : result.is_correct ? "DeepSeek V4 判定正确" : "DeepSeek V4 判定错误，可修改后重试"}
          </Text>
          <Text style={styles.practiceReason}>{result.feedback}</Text>
          <Text style={styles.practiceReason}>标准答案：{question.answer}</Text>
          <Text style={styles.practiceReason}>解法：{question.solution_steps.join("；")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function getPracticeCompletion(questions: GeneratedQuestion[], attempts: NotebookState["attempts"]) {
  if (questions.length === 0) return { allAnswered: false, allCorrect: false };

  const latestAttemptByQuestion = new Map<string, NotebookState["attempts"][number]>();
  attempts.forEach((attempt) => {
    latestAttemptByQuestion.set(attempt.generated_question_id, attempt);
  });
  const latestAttempts = questions.map((question) => latestAttemptByQuestion.get(question.id));
  const allAnswered = latestAttempts.every((attempt) => attempt?.grading_status === "graded");
  const allCorrect = allAnswered && latestAttempts.every((attempt) => attempt?.is_correct === true);

  return { allAnswered, allCorrect };
}

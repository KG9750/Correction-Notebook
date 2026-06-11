import { Ionicons } from "@expo/vector-icons";
import { isValidChoiceQuestion, type GeneratedQuestion, type Mistake, type PracticeAttempt } from "@correction-notebook/shared";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import type { ImageSize } from "../crop/rect";
import { usePracticeSession } from "../hooks/usePracticeSession";
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
  analysisRefreshStatus,
  analysisRefreshError,
  practiceGenerationStatus,
  practiceGenerationError,
  deepseekModel,
  onRefreshAnalysis,
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
  analysisRefreshStatus: "generating" | "failed" | undefined;
  analysisRefreshError: string | undefined;
  practiceGenerationStatus: "generating" | "failed" | undefined;
  practiceGenerationError: string | undefined;
  deepseekModel: AppSettings["deepseekModel"];
  onRefreshAnalysis: (mistake: Mistake) => void;
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
  const visibleQuestions = questions.filter(isChoicePracticeQuestion).slice(0, state.settings.practiceCount);
  const visibleQuestionSignature = visibleQuestions.map((question) => [
    question.id,
    question.question_text,
    question.answer,
    question.choice_answer_type,
    ...(question.choice_options ?? []).map((option) => `${option.label}:${option.text}`)
  ].join("|")).join("||");
  const {
    practiceAnswers,
    practiceResults,
    isBatchGrading,
    latestPracticeAttemptByQuestion,
    hasRequiredPracticeQuestions,
    practiceCompletion,
    batchPracticeSummary,
    answeredPracticeCount,
    allPracticeAnswered,
    updatePracticeAnswer,
    gradeAllPractice
  } = usePracticeSession({
    selectedMistakeId: selectedMistake.id,
    visibleQuestions,
    visibleQuestionSignature,
    attempts: state.attempts,
    requiredCount: state.settings.practiceCount,
    practiceGenerationStatus,
    onAttempt
  });
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
  }, [selectedMistake.id, selectedMistake.cropped_image_uri]);

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
        <Panel
          title="错因讲解"
          action={
            <IconButton
              icon={analysisRefreshStatus === "generating" ? "sync-outline" : "refresh-outline"}
              label="刷新错因讲解"
              spinning={analysisRefreshStatus === "generating"}
              disabled={analysisRefreshStatus === "generating"}
              onPress={() => {
                if (analysisRefreshStatus !== "generating") onRefreshAnalysis(selectedMistake);
              }}
            />
          }
        >
          {analysisRefreshStatus === "generating" ? (
            <View style={styles.practiceStatusBox}>
              <Ionicons name="sync-outline" size={18} color={palette.teal} />
              <Text style={styles.bodyText}>{modelLabel} 正在刷新错因讲解。</Text>
            </View>
          ) : null}
          {analysisRefreshStatus === "failed" ? (
            <View style={styles.practiceStatusBox}>
              <Ionicons name="alert-circle-outline" size={18} color={palette.primary} />
              <Text style={styles.bodyText}>错因讲解刷新失败。{analysisRefreshError ? `原因：${analysisRefreshError}` : "请稍后重试或检查 API 状态。"}</Text>
            </View>
          ) : null}
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
            <IconButton
              icon={practiceGenerationStatus === "generating" ? "sync-outline" : "refresh-outline"}
              label={practiceGenerationStatus === "generating" ? "正在生成变式练习" : "刷新变式练习"}
              spinning={practiceGenerationStatus === "generating"}
              disabled={practiceGenerationStatus === "generating"}
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
                <PracticeQuestion
                  key={question.id}
                  question={question}
                  answer={practiceAnswers[question.id] ?? ""}
                  result={practiceResults[question.id] ?? latestPracticeAttemptByQuestion.get(question.id)}
                  onChangeAnswer={(answer) => updatePracticeAnswer(question.id, answer)}
                />
              ))}
              <View style={styles.practiceBatchActions}>
                <Text style={[
                  styles.practiceReason,
                  batchPracticeSummary?.tone === "correct"
                    ? styles.correctText
                    : batchPracticeSummary?.tone === "wrong"
                      ? styles.wrongText
                      : null
                ]}>
                  {batchPracticeSummary?.text ?? `已完成 ${answeredPracticeCount}/${visibleQuestions.length} 题。`}
                </Text>
                <SecondaryButton
                  icon={isBatchGrading ? "sync-outline" : "checkmark-circle-outline"}
                  label={isBatchGrading ? "判卷中" : "判断对错"}
                  disabled={!allPracticeAnswered || isBatchGrading}
                  onPress={gradeAllPractice}
                />
              </View>
              {practiceCompletion.allAnswered && !practiceCompletion.allCorrect ? (
                <View style={styles.masteryWaitingBox}>
                  <Ionicons
                    name="refresh-circle-outline"
                    size={20}
                    color={palette.primary}
                  />
                  <View style={styles.masteryConfirmText}>
                    <Text style={styles.practiceTitle}>
                      练习还未全部批改正确
                    </Text>
                    <Text style={styles.practiceReason}>
                      全部练习达到掌握标准后，才可以确认掌握。
                    </Text>
                  </View>
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
        <Panel title="掌握与存档">
          <View style={practiceCompletion.allCorrect ? styles.masteryConfirmBox : styles.masteryWaitingBox}>
            <Ionicons
              name={practiceCompletion.allCorrect ? "archive-outline" : "lock-closed-outline"}
              size={20}
              color={practiceCompletion.allCorrect ? palette.teal : palette.primary}
            />
            <View style={styles.masteryConfirmText}>
              <Text style={styles.practiceTitle}>
                {practiceCompletion.allCorrect ? "可以存档到错题集" : "完成判卷后再存档"}
              </Text>
              <Text style={styles.practiceReason}>
                {practiceCompletion.allCorrect
                  ? "存档后仍可在错题集查看；后续复测失败时再回到错题本。"
                  : hasRequiredPracticeQuestions
                    ? `需要 ${state.settings.practiceCount} 道变式练习全部判定正确。`
                    : `当前只有 ${visibleQuestions.length}/${state.settings.practiceCount} 道有效变式练习，请刷新生成。`}
              </Text>
            </View>
            {practiceCompletion.allCorrect ? (
              <SecondaryButton
                icon="archive-outline"
                label="存档到错题集"
                onPress={() => onConfirmMastered(selectedMistake.id)}
              />
            ) : null}
          </View>
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

function PracticeQuestion({
  question,
  answer,
  result,
  onChangeAnswer
}: {
  question: GeneratedQuestion;
  answer: string;
  result: PracticeAttempt | undefined;
  onChangeAnswer: (answer: string) => void;
}) {
  const choiceOptions = question.choice_options ?? [];
  const isChoiceQuestion = choiceOptions.length >= 4 && (question.choice_answer_type === "single" || question.choice_answer_type === "multiple");
  const selectedLabels = answer.split(",").map((label) => label.trim()).filter(Boolean);
  const toggleChoice = (label: string) => {
    if (question.choice_answer_type !== "multiple") {
      onChangeAnswer(label);
      return;
    }
    const selected = new Set(selectedLabels);
    if (selected.has(label)) {
      selected.delete(label);
    } else {
      selected.add(label);
    }
    const ordered = choiceOptions.map((option) => option.label).filter((optionLabel) => selected.has(optionLabel));
    onChangeAnswer(ordered.join(","));
  };

  return (
    <View style={styles.practiceBox}>
      {isChoiceQuestion ? (
        <Text style={[
          styles.choiceTypePill,
          question.choice_answer_type === "multiple" ? styles.choiceTypePillMultiple : styles.choiceTypePillSingle
        ]}>
          {question.choice_answer_type === "multiple" ? "多选题" : "单选题"}
        </Text>
      ) : null}
      <Text style={styles.practiceTitle}>{question.question_text}</Text>
      <Text style={styles.practiceReason}>{question.why_related_to_original_mistake}</Text>
      {isChoiceQuestion ? (
        <>
          <View style={styles.choiceOptions}>
            {choiceOptions.map((option) => {
              const selected = selectedLabels.includes(option.label);
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityLabel={`选择 ${option.label}`}
                  style={[styles.choiceOption, selected && styles.choiceOptionSelected]}
                  onPress={() => toggleChoice(option.label)}
                >
                  <Text style={[styles.choiceOptionLabel, selected && styles.choiceOptionLabelSelected]}>{option.label}</Text>
                  <Text style={styles.choiceOptionText}>{option.text}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.practiceReason}>已选：{answer || "未选择"}</Text>
        </>
      ) : (
        <View style={styles.answerInputRow}>
          <TextInput
            value={answer}
            onChangeText={onChangeAnswer}
            placeholder="输入答案"
            returnKeyType="done"
            style={[styles.input, styles.answerInput]}
          />
        </View>
      )}
      {result ? (
        <View>
          <Text style={result.grading_status === "ungraded" ? styles.wrongText : result.is_correct ? styles.correctText : styles.wrongText}>
            {result.grading_status === "ungraded" ? "暂未批改" : result.is_correct ? "判定正确" : "判定错误，可修改后重试"}
          </Text>
          <Text style={styles.practiceReason}>{result.feedback}</Text>
          <Text style={styles.practiceReason}>标准答案：{question.answer}</Text>
          <Text style={styles.practiceReason}>解法：{question.solution_steps.join("；")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function isChoicePracticeQuestion(question: GeneratedQuestion): boolean {
  return isValidChoiceQuestion(question);
}

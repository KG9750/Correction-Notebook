import {
  computeMasteryFromPractice,
  createId,
  nextReviewDueForMastery,
  nowIso,
  type Mistake,
  type PracticeAttempt,
  type TestPaper
} from "@correction-notebook/shared";
import { sampleAnalyses, sampleGeneratedQuestions, sampleMistakes, sampleProfile } from "./sample-data";
import type { AppSection, NotebookState } from "./types";

export function createInitialNotebookState(): NotebookState {
  return {
    profile: sampleProfile,
    activeSection: "home",
    selectedMistakeId: sampleMistakes[0]?.id ?? "",
    mistakes: sampleMistakes,
    analyses: sampleAnalyses,
    generatedQuestions: sampleGeneratedQuestions,
    attempts: [],
    papers: []
  };
}

export function setSection(state: NotebookState, section: AppSection): NotebookState {
  return { ...state, activeSection: section };
}

export function addCapturedMistake(state: NotebookState, input: { imageUri?: string; ocrText: string; studentAnswer: string }): NotebookState {
  const timestamp = nowIso();
  const mistake = {
    id: createId("local_mistake"),
    student_id: state.profile.id,
    subject: "math" as const,
    grade: state.profile.grade,
    source_type: "exam_paper" as const,
    source_name: "iPad 拍题",
    ...(input.imageUri ? { original_image_uri: input.imageUri, cropped_image_uri: input.imageUri } : {}),
    ocr_text: input.ocrText,
    normalized_question_text: input.ocrText,
    student_answer: input.studentAnswer,
    knowledge_points: ["一元一次方程", "等量关系"],
    main_error_type: "方法性错误" as const,
    secondary_error_types: ["审题性错误"],
    mastery_status: "pending_practice" as const,
    review_due_at: timestamp,
    needs_user_review: input.ocrText.trim().length < 20,
    created_at: timestamp,
    updated_at: timestamp
  };

  return {
    ...state,
    activeSection: "notebook",
    selectedMistakeId: mistake.id,
    mistakes: [mistake, ...state.mistakes]
  };
}

export function updateMistake(
  state: NotebookState,
  mistakeId: string,
  patch: Pick<Mistake, "normalized_question_text" | "ocr_text" | "student_answer" | "knowledge_points" | "main_error_type" | "secondary_error_types">
): NotebookState {
  return {
    ...state,
    mistakes: state.mistakes.map((mistake) =>
      mistake.id === mistakeId
        ? {
            ...mistake,
            ...patch,
            secondary_error_types: patch.secondary_error_types.slice(0, 2),
            updated_at: nowIso()
          }
        : mistake
    )
  };
}

export function deleteMistake(state: NotebookState, mistakeId: string): NotebookState {
  const remainingMistakes = state.mistakes.filter((mistake) => mistake.id !== mistakeId);
  const nextSelectedMistakeId =
    state.selectedMistakeId === mistakeId ? remainingMistakes[0]?.id ?? "" : state.selectedMistakeId;

  return {
    ...state,
    selectedMistakeId: nextSelectedMistakeId,
    activeSection: remainingMistakes.length > 0 ? state.activeSection : "home",
    mistakes: remainingMistakes,
    analyses: state.analyses.filter((analysis) => analysis.mistake_id !== mistakeId),
    generatedQuestions: state.generatedQuestions.filter((question) => question.mistake_id !== mistakeId),
    attempts: state.attempts.filter((attempt) => attempt.mistake_id !== mistakeId)
  };
}

export function recordPracticeAttempt(state: NotebookState, questionId: string, answerText: string, isCorrect: boolean): NotebookState {
  const question = state.generatedQuestions.find((item) => item.id === questionId);
  if (!question) return state;

  const attempt = {
    id: createId("local_attempt"),
    student_id: state.profile.id,
    mistake_id: question.mistake_id,
    generated_question_id: question.id,
    questionText: question.question_text,
    answer_text: answerText,
    is_correct: isCorrect,
    error_type_if_wrong: isCorrect ? null : question.target_error_type,
    graded_by: "manual" as const,
    feedback: isCorrect ? "答对了。等量关系已经写清楚。" : "这次仍然和原错因有关，先写等量关系再计算。",
    created_at: nowIso()
  } satisfies PracticeAttempt & { questionText: string };

  const attempts = [...state.attempts, attempt];
  const related = attempts.filter((item) => item.mistake_id === question.mistake_id).slice(-3);
  const mastery = related.length === 3 ? computeMasteryFromPractice(3, related.filter((item) => item.is_correct).length) : "practicing";

  return {
    ...state,
    attempts,
    mistakes: state.mistakes.map((mistake) =>
      mistake.id === question.mistake_id
        ? {
            ...mistake,
            mastery_status: mastery,
            review_due_at: nextReviewDueForMastery(mastery),
            updated_at: nowIso()
          }
        : mistake
    )
  };
}

export function createTestPaper(state: NotebookState): NotebookState {
  const id = createId("local_paper");
  const paper = {
    id,
    student_id: state.profile.id,
    title: "一元一次方程错因复测卷",
    filters: {
      time_range_days: 30,
      knowledge_points: ["一元一次方程"],
      error_types: ["方法性错误"],
      mastery_statuses: ["not_mastered", "partially_mastered"]
    },
    question_count: Math.min(10, state.generatedQuestions.length),
    student_pdf_url: `local://test-papers/${id}/student.pdf`,
    answer_pdf_url: `local://test-papers/${id}/answer.pdf`,
    created_at: nowIso()
  } satisfies TestPaper;

  return { ...state, activeSection: "paper", papers: [paper, ...state.papers] };
}

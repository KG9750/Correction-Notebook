import {
  computeMasteryFromGradedAttempts,
  createId,
  dueReviewMistakes,
  hasMasteryConfirmationEvidence,
  nextReviewDueForMastery,
  nowIso,
  type LatexJobHandoff,
  type AIAnalysis,
  type GeneratedQuestion,
  type Mistake,
  type PracticeAttempt,
  type TestPaper
} from "@correction-notebook/shared";
import { sampleProfile } from "./sample-data";
import type { AppSection, AppSettings, NotebookState } from "./types";

export const defaultAppSettings: AppSettings = {
  deepseekModel: "deepseek-v4-pro",
  practiceCount: 3,
  practiceDifficulty: "adaptive"
};

export function replaceMistakeAI(
  state: NotebookState,
  mistakeId: string,
  analysis: AIAnalysis,
  questions: GeneratedQuestion[]
): NotebookState {
  const nextQuestions = questions.length > 0
    ? [
        ...questions.filter((q) => !state.generatedQuestions.some((existing) => existing.id === q.id)),
        ...state.generatedQuestions.filter((q) => q.mistake_id !== mistakeId)
      ]
    : state.generatedQuestions;

  return {
    ...state,
    analyses: [analysis, ...state.analyses.filter((a) => a.mistake_id !== mistakeId && a.id !== analysis.id)],
    generatedQuestions: nextQuestions,
    attempts: questions.length > 0
      ? state.attempts.filter((attempt) => attempt.mistake_id !== mistakeId)
      : state.attempts,
    mistakes: state.mistakes.map((m) =>
      m.id === mistakeId
        ? {
            ...m,
            main_error_type: analysis.main_error_type,
            secondary_error_types: analysis.secondary_error_types,
            knowledge_points: mergeKnowledgePoints(questions, m.knowledge_points),
            updated_at: nowIso()
          }
        : m
    )
  };
}

export function createInitialNotebookState(): NotebookState {
  return {
    profile: sampleProfile,
    activeSection: "home",
    selectedMistakeId: "",
    enrichingMistakeId: null,
    archivedMistakeIds: [],
    mistakes: [],
    analyses: [],
    generatedQuestions: [],
    attempts: [],
    papers: [],
    settings: defaultAppSettings
  };
}

export function withDefaultSettings(state: NotebookState): NotebookState {
  return {
    ...state,
    archivedMistakeIds: state.archivedMistakeIds ?? [],
    settings: {
      ...defaultAppSettings,
      ...(state.settings ?? {})
    }
  };
}

export function setSection(state: NotebookState, section: AppSection): NotebookState {
  return { ...state, activeSection: section };
}

export function addCapturedMistake(state: NotebookState, input: { imageUri?: string; ocrText: string; studentAnswer: string }): NotebookState {
  const timestamp = nowIso();
  const mistake: Mistake = {
    id: createId("local_mistake"),
    student_id: state.profile.id,
    subject: "math",
    grade: state.profile.grade,
    source_type: "exam_paper",
    source_name: "iPad 拍题",
    ...(input.imageUri ? { original_image_uri: input.imageUri, cropped_image_uri: input.imageUri } : {}),
    ocr_text: input.ocrText,
    normalized_question_text: input.ocrText,
    student_answer: input.studentAnswer,
    knowledge_points: ["待识别知识点"],
    secondary_error_types: [],
    mastery_status: "pending_analysis",
    review_due_at: timestamp,
    needs_user_review: input.ocrText.trim().length < 20,
    created_at: timestamp,
    updated_at: timestamp
  };

  return {
    ...state,
    activeSection: "notebook",
    selectedMistakeId: mistake.id,
    archivedMistakeIds: state.archivedMistakeIds,
    mistakes: [mistake, ...state.mistakes],
    analyses: state.analyses,
    generatedQuestions: state.generatedQuestions
  };
}

function mergeKnowledgePoints(questions: GeneratedQuestion[], fallback: string[]): string[] {
  const points = [...new Set(questions.flatMap((question) => question.knowledge_points).filter(Boolean))];
  return points.length > 0 ? points.slice(0, 3) : fallback;
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
    archivedMistakeIds: state.archivedMistakeIds.filter((id) => id !== mistakeId),
    mistakes: remainingMistakes,
    analyses: state.analyses.filter((analysis) => analysis.mistake_id !== mistakeId),
    generatedQuestions: state.generatedQuestions.filter((question) => question.mistake_id !== mistakeId),
    attempts: state.attempts.filter((attempt) => attempt.mistake_id !== mistakeId)
  };
}

export function recordPracticeAttempt(state: NotebookState, attempt: PracticeAttempt, practiceTotal: 3 | 5): NotebookState {
  const question = state.generatedQuestions.find((item) => item.id === attempt.generated_question_id);
  if (!question) return state;

  const localAttempt = {
    ...attempt,
    mistake_id: question.mistake_id,
    generated_question_id: question.id,
    questionText: question.question_text
  };

  const attempts = [...state.attempts, localAttempt];
  if (attempt.grading_status !== "graded") {
    return { ...state, attempts };
  }

  const related = attempts.filter((item) => item.mistake_id === question.mistake_id);
  const computedMastery = computeMasteryFromGradedAttempts(practiceTotal, related);
  const mastery = computedMastery === "mastered" ? "practicing" : computedMastery;

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

export function confirmMistakeMastered(state: NotebookState, mistakeId: string): NotebookState {
  if (!canConfirmMistakeMastered(state, mistakeId)) return state;
  const remainingActiveMistakes = state.mistakes.filter((mistake) => mistake.id !== mistakeId && !state.archivedMistakeIds.includes(mistake.id));
  const nextSelectedMistakeId = state.selectedMistakeId === mistakeId
    ? remainingActiveMistakes[0]?.id ?? mistakeId
    : state.selectedMistakeId;

  return {
    ...state,
    activeSection: "collection",
    selectedMistakeId: nextSelectedMistakeId,
    archivedMistakeIds: state.archivedMistakeIds.includes(mistakeId)
      ? state.archivedMistakeIds
      : [mistakeId, ...state.archivedMistakeIds],
    mistakes: state.mistakes.map((mistake) =>
      mistake.id === mistakeId
        ? {
            ...mistake,
            mastery_status: "mastered",
            review_due_at: nextReviewDueForMastery("mastered"),
            updated_at: nowIso()
          }
        : mistake
    )
  };
}

export function canConfirmMistakeMastered(state: NotebookState, mistakeId: string): boolean {
  const related = state.attempts.filter((attempt) => attempt.mistake_id === mistakeId);
  return hasMasteryConfirmationEvidence(state.settings.practiceCount, related);
}

export function getDueReviewMistakes(state: NotebookState, asOf = new Date()): Mistake[] {
  const activeMistakes = state.mistakes.filter((mistake) => !state.archivedMistakeIds.includes(mistake.id));
  return dueReviewMistakes(activeMistakes, asOf);
}

export function recordTestPaper(state: NotebookState, paper: TestPaper): NotebookState {
  return { ...state, activeSection: "paper", papers: [paper, ...state.papers] };
}

export function replaceTestPaperLatexJob(state: NotebookState, paperId: string, latexJob: LatexJobHandoff): NotebookState {
  return {
    ...state,
    papers: state.papers.map((paper) =>
      paper.id === paperId
        ? {
            ...paper,
            student_pdf_url: latexJob.output_paths.student_pdf_path ?? paper.student_pdf_url,
            answer_pdf_url: latexJob.output_paths.answer_pdf_path ?? paper.answer_pdf_url,
            latex_job: latexJob
          }
        : paper
    )
  };
}

export function createPreviewTestPaper(state: NotebookState): TestPaper | undefined {
  const questions = state.generatedQuestions.slice(0, 10);
  if (questions.length === 0) return undefined;

  const id = createId("local_paper");
  return {
    id,
    student_id: state.profile.id,
    title: "非正式复测卷预览",
    filters: {
      time_range_days: 30,
      knowledge_points: [...new Set(questions.flatMap((question) => question.knowledge_points))],
      error_types: [...new Set(questions.map((question) => question.target_error_type))],
      mastery_statuses: ["not_mastered", "partially_mastered", "relapsed"]
    },
    question_count: questions.length,
    student_pdf_url: `local-preview://test-papers/${id}/student.pdf`,
    answer_pdf_url: `local-preview://test-papers/${id}/answer.pdf`,
    questions: questions.map((question) => ({
      id: question.id,
      question_text: question.question_text,
      ...(question.question_latex ? { question_latex: question.question_latex } : {}),
      difficulty: question.difficulty,
      answer: question.answer,
      solution_steps: question.solution_steps,
      knowledge_points: question.knowledge_points,
      target_error_type: question.target_error_type,
      source_mistake_ids: [question.mistake_id]
    })),
    latex_job: {
      id: createId("local_latex_job"),
      workspace_path: "local-preview",
      manifest_path: `local-preview://test-papers/${id}/manifest.json`,
      status: "failed",
      expected_outputs: {
        student_pdf_path: `local-preview://test-papers/${id}/student.pdf`,
        answer_pdf_path: `local-preview://test-papers/${id}/answer.pdf`
      },
      output_paths: {},
      failure_reason: "DeepSeek V4 或 Claude Code LaTeX 任务不可用，已生成非正式预览。"
    },
    generation_manifest_url: `local-preview://test-papers/${id}/manifest.json`,
    created_at: nowIso()
  };
}

import {
  computeMasteryFromPractice,
  createId,
  nextReviewDueForMastery,
  nowIso,
  type AIAnalysis,
  type GeneratedQuestion,
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
    knowledge_points: ["一元一次方程", "等量关系"],
    main_error_type: "方法性错误",
    secondary_error_types: ["审题性错误"],
    mastery_status: "pending_practice",
    review_due_at: timestamp,
    needs_user_review: input.ocrText.trim().length < 20,
    created_at: timestamp,
    updated_at: timestamp
  };

  const analysis = createLocalAnalysis(mistake);
  const questions = createLocalPracticeQuestions(mistake);

  return {
    ...state,
    activeSection: "notebook",
    selectedMistakeId: mistake.id,
    mistakes: [mistake, ...state.mistakes],
    analyses: [analysis, ...state.analyses],
    generatedQuestions: [...questions, ...state.generatedQuestions]
  };
}

function createLocalAnalysis(mistake: Mistake): AIAnalysis {
  const questionText = mistake.normalized_question_text || mistake.ocr_text;
  const combined = `${questionText} ${mistake.student_answer}`;
  const isEquation = /方程|等量|x|未知数|解|设/.test(combined);
  const isWordProblem = /米|元|页|个|只|本|支|根|条|块/.test(combined);
  const confidence = combined.trim().length < 20 ? 0.52 : 0.84;

  const studentAnswer = mistake.student_answer || "未填写";
  const answerSummary = studentAnswer.length > 30 ? studentAnswer.slice(0, 30) + "…" : studentAnswer;

  const summary = isEquation
    ? `"${questionText.slice(0, 60)}" 这道题主要问题在于没有先找准等量关系，你写的答案是「${answerSummary}」，说明关系方向可能反了。`
    : isWordProblem
      ? `"${questionText.slice(0, 60)}" 你写的答案是「${answerSummary}」— 错误集中在解题前半段的条件识别或方法选择上。`
      : `这道题的关键不是把答案背下来，而是把条件、方法和易错步骤重新理清。`;

  const wrongStep = isEquation
    ? `你把「${answerSummary}」直接算出来了，但中间没有先区分条件里的数量属于总量、部分量还是结果。`
    : `你写的「${answerSummary}」表明错误发生在读题或方法选择阶段。`;

  return {
    id: createId("local_analysis"),
    mistake_id: mistake.id,
    main_error_type: "方法性错误",
    secondary_error_types: ["审题性错误"],
    error_summary: summary,
    wrong_step_location: wrongStep,
    correct_solution_steps: isEquation
      ? ["设未知数 x。", "圈出题目中的总量和部分量。", "根据等量关系列方程。", "解方程并回代检查。"]
      : ["先读清题目求什么。", "写出已知条件。", "选择对应方法解题。", "把答案代回题目检查。"],
    avoidance_tip: isEquation
      ? "遇到应用题先写一句等量关系，再列方程，不要直接凑算式。"
      : "下次先用 20 秒标出条件和问题，再开始计算。",
    student_friendly_explanation: isEquation
      ? "不是你不会算，而是关系找反了。先把关系摆正，计算会简单很多。"
      : "这类题要先想清楚方法，再动笔，速度会更稳。",
    confidence,
    needs_human_review: confidence < 0.7,
    model_provider: "local",
    model_name: "offline-template",
    created_at: nowIso()
  };
}

function createLocalPracticeQuestions(mistake: Mistake): GeneratedQuestion[] {
  const point = mistake.knowledge_points[0] ?? "一元一次方程";
  const questionText = mistake.normalized_question_text || mistake.ocr_text;
  const numbers = extractNumbers(questionText);
  const timestamp = nowIso();
  const target = mistake.main_error_type ?? "方法性错误";

  const a = numbers[0] ?? 8;
  const b = numbers[1] ?? 17;
  const c = numbers[2] ?? 5;

  return [
    {
      id: createId("local_gq"),
      mistake_id: mistake.id,
      question_text: `一根绳子剪去 ${a} 米后还剩 ${b} 米，原来长多少米？请列方程解答。`,
      difficulty: "basic",
      question_type: "same_pattern",
      estimated_time_seconds: 90,
      answer: `x = ${a + b}`,
      solution_steps: ["设原来长 x 米。", `根据原长 - 剪去 = 剩下，列 x - ${a} = ${b}。`, `解得 x = ${a + b}。`],
      knowledge_points: [point],
      target_error_type: target,
      why_related_to_original_mistake: "同样检查是否能把总量、部分量和剩余量放进正确的等量关系。",
      verification_status: "passed",
      created_at: timestamp
    },
    {
      id: createId("local_gq"),
      mistake_id: mistake.id,
      question_text: `一本书读了 ${a + b} 页后，还剩全书的 3/5。全书一共有多少页？`,
      difficulty: "standard",
      question_type: "condition_change",
      estimated_time_seconds: 150,
      answer: `x = ${Math.round(((a + b) * 5) / 2)} 页`,
      solution_steps: ["设全书 x 页。", `已经读的页数是全书的 2/5。`, `列 2x/5 = ${a + b}。`, `解得 x = ${Math.round(((a + b) * 5) / 2)}。`],
      knowledge_points: [point],
      target_error_type: target,
      why_related_to_original_mistake: "条件从具体数量变成分率，仍然考查能否找准等量关系。",
      verification_status: "passed",
      created_at: timestamp
    },
    {
      id: createId("local_gq"),
      mistake_id: mistake.id,
      question_text: `甲数比乙数的 ${a} 倍少 ${c}，甲数是 ${a * b}。乙数是多少？`,
      difficulty: "standard",
      question_type: "trap",
      estimated_time_seconds: 150,
      answer: `x = ${b + c}`,
      solution_steps: ["设乙数为 x。", `甲数 = ${a}x - ${c}。`, `列 ${a}x - ${c} = ${a * b}。`, `解得 x = ${b + c}。`],
      knowledge_points: [point],
      target_error_type: target,
      why_related_to_original_mistake: '容易把"少 X"写反，用来检测关系方向错误是否复发。',
      verification_status: "passed",
      created_at: timestamp
    }
  ];
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+/g);
  return (matches ?? []).map(Number).filter((n) => n > 0 && n < 1000);
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

import { getApiBaseUrl } from "./client";
import type { AppSettings } from "../types";
import type { AIAnalysis, GeneratedQuestion, LatexJobHandoff, PracticeAttempt, TestPaper, TestPaperQuestion } from "@correction-notebook/shared";

export type ServerAnalysisResponse = AIAnalysis & {
  analysis_id: string;
};

type ServerPracticeResponse = {
  filtered_out?: number;
  questions: GeneratedQuestion[];
};

type EnrichInput = {
  studentId: string;
  grade: string;
  ocrText: string;
  studentAnswer: string;
  imageUri?: string | undefined;
  settings: Pick<AppSettings, "deepseekModel" | "practiceCount" | "practiceDifficulty">;
};

export type EnrichMistakeResult = {
  analysis: ServerAnalysisResponse;
  questions: ServerPracticeResponse["questions"];
  practiceError?: string;
};

export type SubmitPracticeAttemptResult = {
  attempt: PracticeAttempt;
  is_correct: boolean | null;
  feedback: string;
  updated_mastery_status: string;
  grading_status: "graded" | "ungraded";
};

export type CreateFreshTestPaperResult = {
  paper_id: string;
  student_pdf_url: string;
  answer_pdf_url?: string;
  latex_job: LatexJobHandoff;
  paper: TestPaper;
  questions: TestPaperQuestion[];
};

export async function enrichMistakeWithServerAI(input: EnrichInput): Promise<EnrichMistakeResult | undefined> {
  const base = getApiBaseUrl();

  // 1. Create mistake on server
  const createRes = await fetch(`${base}/api/v1/mistakes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: input.studentId,
      grade: input.grade,
      ocr_text: input.ocrText,
      normalized_question_text: input.ocrText,
      student_answer: input.studentAnswer,
      ...(input.imageUri ? { image_uri: input.imageUri } : {}),
      source_name: "iPad 拍题"
    })
  }).catch(() => undefined);

  if (!createRes?.ok) {
    console.error("[enrich] Create mistake failed:", createRes?.status);
    return undefined;
  }
  const { mistake_id: serverMistakeId } = (await createRes.json()) as { mistake_id: string };

  // 2. Get AI analysis
  const analyzeRes = await fetch(`${base}/api/v1/mistakes/${encodeURIComponent(serverMistakeId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.settings.deepseekModel })
  }).catch(() => undefined);

  if (!analyzeRes?.ok) {
    const payload = await readErrorPayload(analyzeRes);
    const log = payload?.error === "deepseek_not_configured" ? console.warn : console.error;
    log("[enrich] Analyze failed:", analyzeRes?.status, payload?.error ?? "");
    return undefined;
  }
  const analysis = (await analyzeRes.json()) as ServerAnalysisResponse;

  // 3. Generate AI practice questions
  const practiceRes = await fetch(`${base}/api/v1/mistakes/${encodeURIComponent(serverMistakeId)}/generate-practice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      count: input.settings.practiceCount,
      difficulty_mode: input.settings.practiceDifficulty,
      model: input.settings.deepseekModel
    })
  }).catch(() => undefined);

  if (!practiceRes?.ok) {
    const payload = await readErrorPayload(practiceRes);
    const log = payload?.error === "deepseek_not_configured" ? console.warn : console.error;
    log("[enrich] Generate practice failed:", practiceRes?.status, payload?.error ?? "");
    return { analysis, questions: [], practiceError: payload?.message ?? payload?.error ?? "practice_generation_failed" };
  }
  const practice = (await practiceRes.json()) as ServerPracticeResponse;
  if (practice.questions.length === 0) {
    return {
      analysis,
      questions: [],
      practiceError: practice.filtered_out && practice.filtered_out > 0 ? "生成题目未通过校验。" : "模型未返回可用题目。"
    };
  }

  return { analysis, questions: practice.questions };
}

export async function submitPracticeAttempt(input: {
  studentId: string;
  questionId: string;
  answerText: string;
  practiceTotal: 3 | 5;
  model: AppSettings["deepseekModel"];
}): Promise<SubmitPracticeAttemptResult> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/api/v1/practice-attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: input.studentId,
      question_id: input.questionId,
      answer_text: input.answerText,
      practice_total: input.practiceTotal,
      model: input.model
    })
  });
  if (!response.ok && response.status !== 202) {
    const payload = await readErrorPayload(response);
    throw new Error(payload?.message ?? payload?.error ?? "practice_grading_failed");
  }
  return response.json() as Promise<SubmitPracticeAttemptResult>;
}

export async function createFreshTestPaper(input: {
  studentId: string;
  questionCount: 5 | 10 | 15 | 20;
  difficultyMode: AppSettings["practiceDifficulty"];
  includeAnswerPdf: boolean;
}): Promise<CreateFreshTestPaperResult> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/api/v1/test-papers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: input.studentId,
      question_count: input.questionCount,
      difficulty_mode: input.difficultyMode,
      include_answer_pdf: input.includeAnswerPdf,
      filters: {
        time_range_days: 30,
        knowledge_points: [],
        error_types: [],
        mastery_statuses: ["not_mastered", "partially_mastered", "relapsed"]
      }
    })
  });
  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new Error(payload?.message ?? payload?.error ?? "test_paper_generation_failed");
  }
  return response.json() as Promise<CreateFreshTestPaperResult>;
}

async function readErrorPayload(response: Response | undefined): Promise<{ error?: string; message?: string } | undefined> {
  return response?.json().catch(() => undefined) as Promise<{ error?: string; message?: string } | undefined>;
}

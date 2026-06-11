import { getApiBaseUrl } from "./client";
import type { AppSettings } from "../types";
import type { AIAnalysis, GeneratedQuestion, LatexJobHandoff, Mistake, PracticeAttempt, TestPaper, TestPaperQuestion } from "@correction-notebook/shared";

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
  avoidQuestionTexts?: string[];
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

export type TestPaperStatusResult = {
  paper_id: string;
  latex_job: LatexJobHandoff;
  paper: TestPaper;
};

export async function enrichMistakeWithServerAI(input: EnrichInput): Promise<EnrichMistakeResult | undefined> {
  const serverMistakeId = await createServerMistake(input);
  const analysis = await analyzeServerMistake(serverMistakeId, input.settings.deepseekModel);

  const base = getApiBaseUrl();
  const practiceRes = await fetchOrThrow(`${base}/api/v1/mistakes/${encodeURIComponent(serverMistakeId)}/generate-practice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      count: input.settings.practiceCount,
      difficulty_mode: input.settings.practiceDifficulty,
      avoid_question_texts: input.avoidQuestionTexts ?? [],
      model: input.settings.deepseekModel
    })
  }).catch((error: unknown) => error instanceof Error ? error : new Error("生成变式练习时发生未知网络错误。"));

  if (practiceRes instanceof Error) {
    return { analysis, questions: [], practiceError: practiceRes.message };
  }

  if (!practiceRes?.ok) {
    const payload = await readErrorPayload(practiceRes);
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

export async function analyzeMistakeWithServerAI(input: EnrichInput): Promise<ServerAnalysisResponse> {
  const serverMistakeId = await createServerMistake(input);
  return analyzeServerMistake(serverMistakeId, input.settings.deepseekModel);
}

async function createServerMistake(input: EnrichInput): Promise<string> {
  const base = getApiBaseUrl();
  const createRes = await fetchOrThrow(`${base}/api/v1/mistakes`, {
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
  });

  if (!createRes?.ok) {
    const payload = await readErrorPayload(createRes);
    throw new Error(`创建服务端错题失败（${createRes.status}）：${payload?.message ?? payload?.error ?? "后端没有返回错误详情。"}`);
  }
  const { mistake_id: serverMistakeId } = (await createRes.json()) as { mistake_id: string };
  return serverMistakeId;
}

async function analyzeServerMistake(serverMistakeId: string, model: AppSettings["deepseekModel"]): Promise<ServerAnalysisResponse> {
  const base = getApiBaseUrl();
  const analyzeRes = await fetchOrThrow(`${base}/api/v1/mistakes/${encodeURIComponent(serverMistakeId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model })
  });

  if (!analyzeRes?.ok) {
    const payload = await readErrorPayload(analyzeRes);
    throw new Error(`DeepSeek 错因讲解失败（${analyzeRes.status}）：${payload?.message ?? payload?.error ?? "后端没有返回错误详情。"}`);
  }

  return analyzeRes.json() as Promise<ServerAnalysisResponse>;
}

export async function submitPracticeAttempt(input: {
  studentId: string;
  question: GeneratedQuestion;
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
      question_id: input.question.id,
      question: input.question,
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
  sourceMistakes: Mistake[];
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
      },
      source_mistakes: input.sourceMistakes
    })
  });
  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new Error(payload?.message ?? payload?.error ?? "test_paper_generation_failed");
  }
  return response.json() as Promise<CreateFreshTestPaperResult>;
}

export async function getTestPaperStatus(paperId: string): Promise<TestPaperStatusResult> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/api/v1/test-papers/${encodeURIComponent(paperId)}/status`);
  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new Error(payload?.message ?? payload?.error ?? "test_paper_status_failed");
  }
  return response.json() as Promise<TestPaperStatusResult>;
}

async function fetchOrThrow(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(`无法连接后端 API ${getApiBaseUrl()}。请确认 Mac 上已启动 API 服务，且 iPad 与 Mac 在同一局域网。原始错误：${formatError(error)}`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readErrorPayload(response: Response | undefined): Promise<{ error?: string; message?: string } | undefined> {
  return response?.json().catch(() => undefined) as Promise<{ error?: string; message?: string } | undefined>;
}

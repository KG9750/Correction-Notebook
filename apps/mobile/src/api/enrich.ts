import { getApiBaseUrl } from "./client";
import type { AppSettings } from "../types";
import type { AIAnalysis, GeneratedQuestion } from "@correction-notebook/shared";

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

async function readErrorPayload(response: Response | undefined): Promise<{ error?: string; message?: string } | undefined> {
  return response?.json().catch(() => undefined) as Promise<{ error?: string; message?: string } | undefined>;
}

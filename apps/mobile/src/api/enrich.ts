import { getApiBaseUrl } from "./client";

type ServerAnalysisResponse = {
  analysis_id: string;
  mistake_id: string;
  main_error_type: string;
  secondary_error_types: string[];
  error_summary: string;
  wrong_step_location: string;
  correct_solution_steps: string[];
  avoidance_tip: string;
  student_friendly_explanation: string;
  confidence: number;
  needs_human_review: boolean;
  model_provider: string;
  model_name: string;
  created_at: string;
};

type ServerPracticeResponse = {
  questions: Array<{
    id: string;
    mistake_id: string;
    question_text: string;
    difficulty: string;
    question_type: string;
    estimated_time_seconds: number;
    answer: string;
    solution_steps: string[];
    knowledge_points: string[];
    target_error_type: string;
    why_related_to_original_mistake: string;
    verification_status: string;
    created_at: string;
  }>;
};

type EnrichInput = {
  studentId: string;
  grade: string;
  ocrText: string;
  studentAnswer: string;
  imageUri?: string | undefined;
};

export async function enrichMistakeWithServerAI(input: EnrichInput): Promise<{
  analysis: ServerAnalysisResponse;
  questions: ServerPracticeResponse["questions"];
} | undefined> {
  const base = getApiBaseUrl();

  // 1. Create mistake on server
  console.log("[enrich] Starting server AI enrichment, base:", base);
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
    body: "{}"
  }).catch(() => undefined);

  if (!analyzeRes?.ok) {
    console.error("[enrich] Analyze failed:", analyzeRes?.status);
    return undefined;
  }
  const analysis = (await analyzeRes.json()) as ServerAnalysisResponse;

  // 3. Generate AI practice questions
  const practiceRes = await fetch(`${base}/api/v1/mistakes/${encodeURIComponent(serverMistakeId)}/generate-practice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 3, difficulty_mode: "adaptive" })
  }).catch(() => undefined);

  if (!practiceRes?.ok) {
    console.error("[enrich] Generate practice failed:", practiceRes?.status);
    return undefined;
  }
  const practice = (await practiceRes.json()) as ServerPracticeResponse;

  return { analysis, questions: practice.questions };
}

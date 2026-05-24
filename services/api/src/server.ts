import cors from "@fastify/cors";
import { MockLLMProvider, type LLMProvider } from "@correction-notebook/ai";
import {
  AIAnalysisSchema,
  CreateMistakeRequestSchema,
  CreateTestPaperRequestSchema,
  GeneratedQuestionSchema,
  GeneratePracticeRequestSchema,
  OcrRequestSchema,
  OcrResultSchema,
  PracticeAttemptRequestSchema,
  PracticeAttemptSchema,
  TestPaperSchema,
  computeMasteryFromPractice,
  createId,
  defaultKnowledgePointList,
  filterPassedQuestions,
  initialMistakeStatus,
  nextReviewDueForMastery,
  normalizeErrorTags,
  nowIso,
  reviewPriorityScore,
  type GeneratedQuestion,
  type Mistake
} from "@correction-notebook/shared";
import Fastify from "fastify";
import type { ZodError, ZodType } from "zod";
import { createVirtualPdfUrl } from "./pdf-links.js";
import { BaiduOcrClient, BaiduOcrConfigurationError } from "./ocr/baidu.js";
import { createMemoryStore, type AppStore } from "./store.js";

type CreateAppOptions = {
  store?: AppStore;
  aiProvider?: LLMProvider;
  ocrClient?: BaiduOcrClient;
};

export async function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 8 * 1024 * 1024 });
  const store = options.store ?? createMemoryStore();
  const ai = options.aiProvider ?? new MockLLMProvider();
  const ocrClient = options.ocrClient ?? new BaiduOcrClient();

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, service: "correction-notebook-api" }));

  app.post("/api/v1/ocr", async (request, reply) => {
    const body = parseOrReply(OcrRequestSchema, request.body, reply);
    if (!body) return reply;

    try {
      const result = OcrResultSchema.parse(await ocrClient.recognize(body.image_base64, body.language_type));
      return result;
    } catch (error) {
      if (error instanceof BaiduOcrConfigurationError) {
        return reply.code(503).send({
          error: "baidu_ocr_not_configured",
          message: "Set BAIDU_OCR_API_KEY and BAIDU_OCR_SECRET_KEY on the API service."
        });
      }
      request.log.error(error);
      return reply.code(502).send({
        error: "baidu_ocr_failed",
        message: error instanceof Error ? error.message : "Baidu OCR request failed"
      });
    }
  });

  app.get("/api/v1/mistakes", async () => ({
    mistakes: [...store.mistakes.values()].sort((a, b) => reviewPriorityScore(b) - reviewPriorityScore(a))
  }));

  app.post("/api/v1/mistakes", async (request, reply) => {
    const body = parseOrReply(CreateMistakeRequestSchema, request.body, reply);
    if (!body) return reply;

    const timestamp = nowIso();
    const mistake: Mistake = {
      id: createId("mistake"),
      student_id: body.student_id,
      subject: "math",
      grade: body.grade,
      source_type: "exam_paper",
      ...(body.source_name ? { source_name: body.source_name } : {}),
      ...(body.image_uri ? { original_image_uri: body.image_uri } : {}),
      ...(body.cropped_image_uri ? { cropped_image_uri: body.cropped_image_uri } : {}),
      ocr_text: body.ocr_text,
      normalized_question_text: body.normalized_question_text ?? body.ocr_text,
      student_answer: body.student_answer,
      knowledge_points: defaultKnowledgePointList(body.knowledge_points),
      secondary_error_types: [],
      mastery_status: initialMistakeStatus(body.ocr_text),
      needs_user_review: body.ocr_text.trim().length < 20,
      created_at: timestamp,
      updated_at: timestamp
    };

    store.mistakes.set(mistake.id, mistake);
    return reply.code(201).send({ mistake_id: mistake.id, status: "created", mistake });
  });

  app.post("/api/v1/mistakes/:mistakeId/analyze", async (request, reply) => {
    const mistake = findMistake(store, (request.params as { mistakeId: string }).mistakeId, reply);
    if (!mistake) return reply;

    const rawAnalysis = await ai.analyzeMistake({
      student_profile: { grade: mistake.grade },
      mistake
    });
    const analysis = AIAnalysisSchema.parse(rawAnalysis);
    const tags = normalizeErrorTags({
      main: analysis.main_error_type,
      secondary: analysis.secondary_error_types
    });

    const updated: Mistake = {
      ...mistake,
      main_error_type: tags.main,
      secondary_error_types: tags.secondary,
      mastery_status: "pending_practice",
      needs_user_review: analysis.needs_human_review,
      updated_at: nowIso()
    };
    store.mistakes.set(updated.id, updated);
    store.analyses.set(analysis.id, analysis);

    return { analysis_id: analysis.id, ...analysis, mistake: updated };
  });

  app.post("/api/v1/mistakes/:mistakeId/generate-practice", async (request, reply) => {
    const mistake = findMistake(store, (request.params as { mistakeId: string }).mistakeId, reply);
    if (!mistake) return reply;
    const body = parseOrReply(GeneratePracticeRequestSchema, request.body, reply);
    if (!body) return reply;

    const generated = await ai.generatePractice({
      mistake,
      count: body.count,
      difficulty_mode: body.difficulty_mode
    });
    const passed = filterPassedQuestions(generated.map((question) => GeneratedQuestionSchema.parse(question)));
    for (const question of passed) store.generatedQuestions.set(question.id, question);

    const updated: Mistake = {
      ...mistake,
      mastery_status: "practicing",
      updated_at: nowIso()
    };
    store.mistakes.set(updated.id, updated);

    return { questions: passed, filtered_out: generated.length - passed.length, mistake: updated };
  });

  app.post("/api/v1/practice-attempts", async (request, reply) => {
    const body = parseOrReply(PracticeAttemptRequestSchema, request.body, reply);
    if (!body) return reply;
    const question = store.generatedQuestions.get(body.question_id);
    if (!question) return reply.code(404).send({ error: "generated question not found" });
    const mistake = findMistake(store, question.mistake_id, reply);
    if (!mistake) return reply;

    const gradeInput = {
      question,
      answer_text: body.answer_text,
      ...(body.manual_is_correct === undefined ? {} : { manual_is_correct: body.manual_is_correct })
    };
    const grade = await ai.gradeAnswer(gradeInput);
    const attempt = PracticeAttemptSchema.parse({
      id: createId("attempt"),
      student_id: body.student_id,
      mistake_id: question.mistake_id,
      generated_question_id: question.id,
      answer_text: body.answer_text,
      ...grade,
      created_at: nowIso()
    });
    store.practiceAttempts.set(attempt.id, attempt);

    const relatedAttempts = [...store.practiceAttempts.values()].filter((item) => item.mistake_id === mistake.id);
    const total = relatedAttempts.length >= 5 ? 5 : 3;
    const recent = relatedAttempts.slice(-total);
    const correct = recent.filter((item) => item.is_correct).length;
    const updatedMastery = recent.length >= total ? computeMasteryFromPractice(total, correct) : "practicing";

    const updated: Mistake = {
      ...mistake,
      mastery_status: updatedMastery,
      review_due_at: nextReviewDueForMastery(updatedMastery),
      updated_at: nowIso()
    };
    store.mistakes.set(updated.id, updated);

    return {
      attempt,
      is_correct: attempt.is_correct,
      feedback: attempt.feedback,
      updated_mastery_status: updated.mastery_status,
      mistake: updated
    };
  });

  app.post("/api/v1/test-papers", async (request, reply) => {
    const body = parseOrReply(CreateTestPaperRequestSchema, request.body, reply);
    if (!body) return reply;

    const candidates = selectPaperQuestions(store, body.student_id, body.question_count);
    const paperId = createId("paper");
    const paper = TestPaperSchema.parse({
      id: paperId,
      student_id: body.student_id,
      title: "数学错因复测卷",
      filters: body.filters,
      question_count: candidates.length,
      student_pdf_url: createVirtualPdfUrl(paperId, "student"),
      answer_pdf_url: createVirtualPdfUrl(paperId, "answer"),
      created_at: nowIso()
    });
    store.testPapers.set(paper.id, paper);

    return {
      paper_id: paper.id,
      student_pdf_url: paper.student_pdf_url,
      answer_pdf_url: body.include_answer_pdf ? paper.answer_pdf_url : undefined,
      paper,
      questions: candidates
    };
  });

  return app;
}

function selectPaperQuestions(store: AppStore, studentId: string, questionCount: number): GeneratedQuestion[] {
  const relatedMistakeIds = new Set(
    [...store.mistakes.values()].filter((mistake) => mistake.student_id === studentId).map((mistake) => mistake.id)
  );
  return [...store.generatedQuestions.values()]
    .filter((question) => relatedMistakeIds.has(question.mistake_id) && question.verification_status === "passed")
    .slice(0, questionCount);
}

function findMistake(store: AppStore, mistakeId: string, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }): Mistake | undefined {
  const mistake = store.mistakes.get(mistakeId);
  if (!mistake) reply.code(404).send({ error: "mistake not found" });
  return mistake;
}

function parseOrReply<T>(schema: ZodType<T>, value: unknown, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }): T | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  return reply.code(400).send({ error: "invalid request", issues: formatZodError(result.error) }) as undefined;
}

function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

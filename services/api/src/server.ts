import cors from "@fastify/cors";
import { DeepSeekProvider, MockLLMProvider, type LLMProvider } from "@correction-notebook/ai";
import {
  AIAnalysisSchema,
  AnalyzeMistakeRequestSchema,
  CreateMistakeRequestSchema,
  CreateTestPaperRequestSchema,
  GeneratedQuestionSchema,
  GeneratePracticeRequestSchema,
  OcrRequestSchema,
  OcrResultSchema,
  PracticeAttemptRequestSchema,
  PracticeAttemptSchema,
  TestPaperSchema,
  TestPaperQuestionSchema,
  computeMasteryFromGradedAttempts,
  createId,
  defaultKnowledgePointList,
  filterPassedQuestions,
  initialMistakeStatus,
  nextReviewDueForMastery,
  normalizeErrorTags,
  nowIso,
  reviewPriorityScore,
  type Mistake
} from "@correction-notebook/shared";
import Fastify from "fastify";
import type { ZodError, ZodType } from "zod";
import { GoogleVisionOcrClient, GoogleVisionConfigurationError } from "./ocr/google.js";
import { createMemoryStore, type AppStore } from "./store.js";

const latexExamWorkspace = "/Users/leo/Library/Mobile Documents/com~apple~CloudDocs/Personal/M3U Codex Workspace/Zan/latex-exams";

type CreateAppOptions = {
  store?: AppStore;
  aiProvider?: LLMProvider;
  ocrClient?: GoogleVisionOcrClient;
};

export async function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 8 * 1024 * 1024 });
  const store = options.store ?? createMemoryStore();
  const ai = options.aiProvider ?? createDefaultAiProvider();
  const ocrClient = options.ocrClient ?? new GoogleVisionOcrClient();

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, service: "correction-notebook-api" }));

  app.post("/api/v1/ocr", async (request, reply) => {
    const body = parseOrReply(OcrRequestSchema, request.body, reply);
    if (!body) return reply;

    try {
      const result = OcrResultSchema.parse(await ocrClient.recognize(body.image_base64, body.language_type));
      return result;
    } catch (error) {
      if (error instanceof GoogleVisionConfigurationError) {
        return reply.code(503).send({
          error: "google_vision_not_configured",
          message: "Set GOOGLE_CLOUD_VISION_API_KEY on the API service."
        });
      }
      request.log.error(error);
      return reply.code(502).send({
        error: "google_vision_failed",
        message: error instanceof Error ? error.message : "Google Vision request failed"
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
    if (!ai) return reply.code(503).send(deepSeekNotConfiguredError());
    const mistake = findMistake(store, (request.params as { mistakeId: string }).mistakeId, reply);
    if (!mistake) return reply;
    const body = parseOrReply(AnalyzeMistakeRequestSchema, request.body ?? {}, reply);
    if (!body) return reply;

    const rawAnalysis = await ai.analyzeMistake({
      student_profile: { grade: mistake.grade },
      mistake,
      ...(body.model ? { model: body.model } : {})
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
    if (!ai) return reply.code(503).send(deepSeekNotConfiguredError());
    const mistake = findMistake(store, (request.params as { mistakeId: string }).mistakeId, reply);
    if (!mistake) return reply;
    const body = parseOrReply(GeneratePracticeRequestSchema, request.body, reply);
    if (!body) return reply;

    const generated = await ai.generatePractice({
      mistake,
      count: body.count,
      difficulty_mode: body.difficulty_mode,
      ...(body.model ? { model: body.model } : {})
    }).catch((error: unknown) => {
      request.log.error(error);
      return undefined;
    });
    if (!generated) {
      return reply.code(502).send({
        error: "practice_generation_failed",
        message: "DeepSeek did not complete practice generation."
      });
    }
    if (generated.length === 0) {
      return reply.code(502).send({
        error: "practice_generation_empty",
        message: "DeepSeek did not return usable practice questions."
      });
    }
    const passed = filterPassedQuestions(generated.map((question) => GeneratedQuestionSchema.parse(question)));
    if (passed.length === 0) {
      return reply.code(502).send({
        error: "practice_generation_filtered",
        message: `DeepSeek returned ${generated.length} question(s), but none passed verification.`
      });
    }
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
    if (!ai) return reply.code(503).send(deepSeekNotConfiguredError());
    const body = parseOrReply(PracticeAttemptRequestSchema, request.body, reply);
    if (!body) return reply;
    const question = store.generatedQuestions.get(body.question_id);
    if (!question) return reply.code(404).send({ error: "generated question not found" });
    const mistake = findMistake(store, question.mistake_id, reply);
    if (!mistake) return reply;

    const gradeInput = {
      question,
      answer_text: body.answer_text,
      ...(body.manual_is_correct === undefined ? {} : { manual_is_correct: body.manual_is_correct }),
      ...(body.model ? { model: body.model } : {})
    };
    const grade = await ai.gradeAnswer(gradeInput).catch((error: unknown) => {
      request.log.error(error);
      return undefined;
    });
    if (!grade) {
      const attempt = PracticeAttemptSchema.parse({
        id: createId("attempt"),
        student_id: body.student_id,
        mistake_id: question.mistake_id,
        generated_question_id: question.id,
        answer_text: body.answer_text,
        grading_status: "ungraded",
        is_correct: null,
        error_type_if_wrong: null,
        graded_by: null,
        feedback: "DeepSeek V4 暂未完成批改。你可以先查看标准答案和解法，稍后重试批改。",
        grading_error: "deepseek_grading_failed",
        created_at: nowIso()
      });
      store.practiceAttempts.set(attempt.id, attempt);

      return reply.code(202).send({
        attempt,
        is_correct: null,
        feedback: attempt.feedback,
        updated_mastery_status: mistake.mastery_status,
        mistake,
        grading_status: "ungraded"
      });
    }
    const attempt = PracticeAttemptSchema.parse({
      id: createId("attempt"),
      student_id: body.student_id,
      mistake_id: question.mistake_id,
      generated_question_id: question.id,
      answer_text: body.answer_text,
      grading_status: "graded",
      ...grade,
      created_at: nowIso()
    });
    store.practiceAttempts.set(attempt.id, attempt);

    const relatedAttempts = [...store.practiceAttempts.values()].filter((item) => item.mistake_id === mistake.id);
    const updatedMastery = computeMasteryFromGradedAttempts(body.practice_total, relatedAttempts);

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
    if (!ai) return reply.code(503).send(deepSeekNotConfiguredError());
    const body = parseOrReply(CreateTestPaperRequestSchema, request.body, reply);
    if (!body) return reply;

    const paperId = createId("paper");
    const candidates = selectPaperMistakes(store, body.student_id, body.filters);
    const questions = await ai.generateTestPaper({
      student_profile: { grade: candidates[0]?.grade ?? "初一" },
      question_count: body.question_count,
      difficulty_mode: body.difficulty_mode,
      knowledge_distribution: countDistribution(candidates.flatMap((mistake) => mistake.knowledge_points), "综合复习"),
      error_distribution: countDistribution(candidates.map((mistake) => mistake.main_error_type ?? "待分析"), "待分析"),
      source_mistakes: candidates,
    }).catch((error: unknown) => {
      request.log.error(error);
      return undefined;
    });
    if (!questions || questions.length === 0) {
      return reply.code(502).send({
        error: "test_paper_generation_failed",
        message: "DeepSeek did not return usable fresh test-paper questions."
      });
    }

    const parsedQuestions = questions.map((question) => TestPaperQuestionSchema.parse(question));
    const latexJob = createLatexJobHandoff(paperId);
    const paper = TestPaperSchema.parse({
      id: paperId,
      student_id: body.student_id,
      title: "数学错因复测卷",
      filters: body.filters,
      question_count: parsedQuestions.length,
      student_pdf_url: latexJob.expected_outputs.student_pdf_path,
      answer_pdf_url: latexJob.expected_outputs.answer_pdf_path,
      questions: parsedQuestions,
      latex_job: latexJob,
      generation_manifest_url: latexJob.manifest_path,
      created_at: nowIso()
    });
    store.testPapers.set(paper.id, paper);

    return {
      paper_id: paper.id,
      student_pdf_url: paper.student_pdf_url,
      answer_pdf_url: body.include_answer_pdf ? paper.answer_pdf_url : undefined,
      latex_job: latexJob,
      paper,
      questions: parsedQuestions
    };
  });

  return app;
}

function createDefaultAiProvider(): LLMProvider | undefined {
  if (process.env.DEEPSEEK_API_KEY) return new DeepSeekProvider();
  if (process.env.NODE_ENV === "test") return new MockLLMProvider();
  return undefined;
}

function deepSeekNotConfiguredError() {
  return {
    error: "deepseek_not_configured",
    message: "Set DEEPSEEK_API_KEY on the API service to enable DeepSeek V4 analysis and practice generation."
  };
}

function selectPaperMistakes(
  store: AppStore,
  studentId: string,
  filters: { knowledge_points: string[]; error_types: string[]; mastery_statuses: string[] }
): Mistake[] {
  const selected = [...store.mistakes.values()].filter((mistake) => {
    if (mistake.student_id !== studentId) return false;
    if (filters.mastery_statuses.length > 0 && !filters.mastery_statuses.includes(mistake.mastery_status)) return false;
    if (filters.knowledge_points.length > 0 && !mistake.knowledge_points.some((point) => filters.knowledge_points.includes(point))) return false;
    if (filters.error_types.length > 0 && (!mistake.main_error_type || !filters.error_types.includes(mistake.main_error_type))) return false;
    return true;
  });
  return selected.length > 0 ? selected : [...store.mistakes.values()].filter((mistake) => mistake.student_id === studentId);
}

function countDistribution(values: string[], fallback: string): Array<{ knowledge_point: string; count: number }> & Array<{ error_type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value.trim() || fallback;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size === 0) counts.set(fallback, 1);
  return Array.from(counts.entries())
    .sort(([leftLabel, leftCount], [rightLabel, rightCount]) => rightCount - leftCount || leftLabel.localeCompare(rightLabel))
    .map(([label, count]) => ({ knowledge_point: label, error_type: label, count })) as Array<{ knowledge_point: string; count: number }> & Array<{ error_type: string; count: number }>;
}

function createLatexJobHandoff(paperId: string) {
  const outputDir = `${latexExamWorkspace}/output/${paperId}`;
  return {
    id: createId("latex_job"),
    workspace_path: latexExamWorkspace,
    manifest_path: `${latexExamWorkspace}/jobs/${paperId}.json`,
    status: "queued" as const,
    expected_outputs: {
      student_pdf_path: `${outputDir}/student.pdf`,
      answer_pdf_path: `${outputDir}/answer.pdf`
    },
    output_paths: {}
  };
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

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
  type DeepSeekModel,
  type LatexJobHandoff,
  type GeneratedQuestion,
  computeMasteryFromGradedAttempts,
  createId,
  defaultKnowledgePointList,
  initialMistakeStatus,
  isValidChoiceQuestion,
  nextReviewDueForMastery,
  normalizeErrorTags,
  nowIso,
  reviewPriorityScore,
  type Mistake
} from "@correction-notebook/shared";
import Fastify from "fastify";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ZodError, ZodType } from "zod";
import { GoogleVisionOcrClient, GoogleVisionConfigurationError } from "./ocr/google.js";
import { createMemoryStore, type AppStore } from "./store.js";

const latexExamWorkspace = "/Users/leo/Library/Mobile Documents/com~apple~CloudDocs/Personal/M3U Codex Workspace/Zan/latex-exams";

type CreateAppOptions = {
  store?: AppStore;
  aiProvider?: LLMProvider;
  ocrClient?: GoogleVisionOcrClient;
  latexWorkspace?: string;
};

export async function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 8 * 1024 * 1024 });
  const store = options.store ?? createMemoryStore();
  const ai = options.aiProvider ?? createDefaultAiProvider();
  const ocrClient = options.ocrClient ?? new GoogleVisionOcrClient();
  const latexWorkspace = options.latexWorkspace ?? latexExamWorkspace;

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

    const generation = await generateVerifiedPracticeQuestions({
      ai,
      mistake,
      count: body.count,
      difficultyMode: body.difficulty_mode,
      avoidQuestionTexts: body.avoid_question_texts,
      ...(body.model ? { model: body.model } : {}),
      logError: (error) => request.log.error(error)
    });
    if (!generation) {
      return reply.code(502).send({
        error: "practice_generation_failed",
        message: "DeepSeek did not complete practice generation."
      });
    }
    if (generation.generatedCount === 0) {
      return reply.code(502).send({
        error: "practice_generation_empty",
        message: "DeepSeek did not return usable practice questions."
      });
    }
    if (generation.questions.length < body.count) {
      return reply.code(502).send({
        error: "practice_generation_filtered",
        message: `DeepSeek returned ${generation.generatedCount} question(s), but only ${generation.questions.length} passed choice-question verification.`
      });
    }
    for (const question of generation.questions) store.generatedQuestions.set(question.id, question);

    const updated: Mistake = {
      ...mistake,
      mastery_status: "practicing",
      updated_at: nowIso()
    };
    store.mistakes.set(updated.id, updated);

    return { questions: generation.questions, filtered_out: generation.generatedCount - generation.questions.length, mistake: updated };
  });

  app.post("/api/v1/practice-attempts", async (request, reply) => {
    if (!ai) return reply.code(503).send(deepSeekNotConfiguredError());
    const body = parseOrReply(PracticeAttemptRequestSchema, request.body, reply);
    if (!body) return reply;
    const question = body.question ?? (body.question_id ? store.generatedQuestions.get(body.question_id) : undefined);
    if (!question) {
      return reply.code(body.question_id ? 404 : 400).send({
        error: "generated question not found",
        message: "Submit the full generated question snapshot when the API cache may have restarted."
      });
    }
    store.generatedQuestions.set(question.id, question);
    const mistake = store.mistakes.get(question.mistake_id);

    const gradeInput = {
      question,
      answer_text: body.answer_text,
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
        feedback: "暂未完成批改。你可以先查看标准答案和解法，稍后重试批改。",
        grading_error: "deepseek_grading_failed",
        created_at: nowIso()
      });
      store.practiceAttempts.set(attempt.id, attempt);

      return reply.code(202).send({
        attempt,
        is_correct: null,
        feedback: attempt.feedback,
        updated_mastery_status: mistake?.mastery_status ?? "practicing",
        ...(mistake ? { mistake } : {}),
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

    const relatedAttempts = [...store.practiceAttempts.values()].filter((item) => item.mistake_id === question.mistake_id);
    const updatedMastery = computeMasteryFromGradedAttempts(body.practice_total, relatedAttempts);
    if (!mistake) {
      return {
        attempt,
        is_correct: attempt.is_correct,
        feedback: attempt.feedback,
        updated_mastery_status: updatedMastery,
        grading_status: "graded"
      };
    }

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
      mistake: updated,
      grading_status: "graded"
    };
  });

  app.post("/api/v1/test-papers", async (request, reply) => {
    if (!ai) return reply.code(503).send(deepSeekNotConfiguredError());
    const body = parseOrReply(CreateTestPaperRequestSchema, request.body, reply);
    if (!body) return reply;

    const paperId = createId("paper");
    const candidates = selectPaperMistakes(body.source_mistakes, body.student_id, body.filters);
    if (candidates.length === 0) {
      return reply.code(422).send({
        error: "test_paper_source_mistakes_empty",
        message: "No local notebook mistakes were submitted for fresh test-paper generation."
      });
    }
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
    const latexJob = createLatexJobHandoff(paperId, latexWorkspace);
    await writeLatexJobManifest(latexJob, {
      paper_id: paperId,
      student_id: body.student_id,
      title: "数学错因复测卷",
      created_at: latexJob.created_at,
      questions: parsedQuestions,
      source_mistake_ids: candidates.map((mistake) => mistake.id),
      expected_outputs: latexJob.expected_outputs,
      instructions: "请使用 Claude Code 的制卷 skill 在本工作区生成正式 LaTeX 学生卷和答案卷 PDF。"
    });
    const currentLatexJob = await refreshLatexJobStatus(latexJob);
    const paper = TestPaperSchema.parse({
      id: paperId,
      student_id: body.student_id,
      title: "数学错因复测卷",
      filters: body.filters,
      question_count: parsedQuestions.length,
      student_pdf_url: currentLatexJob.expected_outputs.student_pdf_path,
      answer_pdf_url: currentLatexJob.expected_outputs.answer_pdf_path,
      questions: parsedQuestions,
      latex_job: currentLatexJob,
      generation_manifest_url: currentLatexJob.manifest_path,
      created_at: nowIso()
    });
    store.testPapers.set(paper.id, paper);

    return {
      paper_id: paper.id,
      student_pdf_url: paper.student_pdf_url,
      answer_pdf_url: body.include_answer_pdf ? paper.answer_pdf_url : undefined,
      latex_job: currentLatexJob,
      paper,
      questions: parsedQuestions
    };
  });

  app.get("/api/v1/test-papers/:paperId/status", async (request, reply) => {
    const paperId = (request.params as { paperId: string }).paperId;
    const paper = store.testPapers.get(paperId);
    if (!paper?.latex_job) return reply.code(404).send({ error: "test paper not found" });

    const latexJob = await refreshLatexJobStatus(paper.latex_job);
    const updatedPaper = TestPaperSchema.parse({
      ...paper,
      student_pdf_url: latexJob.output_paths.student_pdf_path ?? paper.student_pdf_url,
      answer_pdf_url: latexJob.output_paths.answer_pdf_path ?? paper.answer_pdf_url,
      latex_job: latexJob
    });
    store.testPapers.set(paperId, updatedPaper);

    return { paper_id: paperId, latex_job: latexJob, paper: updatedPaper };
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
  sourceMistakes: Mistake[],
  studentId: string,
  filters: { knowledge_points: string[]; error_types: string[]; mastery_statuses: string[] }
): Mistake[] {
  return sourceMistakes.filter((mistake) => {
    if (mistake.student_id !== studentId) return false;
    if (filters.mastery_statuses.length > 0 && !filters.mastery_statuses.includes(mistake.mastery_status)) return false;
    if (filters.knowledge_points.length > 0 && !mistake.knowledge_points.some((point) => filters.knowledge_points.includes(point))) return false;
    if (filters.error_types.length > 0 && (!mistake.main_error_type || !filters.error_types.includes(mistake.main_error_type))) return false;
    return true;
  });
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

function createLatexJobHandoff(paperId: string, workspacePath: string): LatexJobHandoff {
  const outputDir = join(workspacePath, "output", paperId);
  const timestamp = nowIso();
  return {
    id: createId("latex_job"),
    workspace_path: workspacePath,
    manifest_path: join(workspacePath, "jobs", `${paperId}.json`),
    status: "queued" as const,
    progress_message: "DeepSeek V4 已生成 fresh 复测题，正在写入 Claude Code LaTeX 制卷任务。",
    created_at: timestamp,
    updated_at: timestamp,
    expected_outputs: {
      student_pdf_path: join(outputDir, "student.pdf"),
      answer_pdf_path: join(outputDir, "answer.pdf")
    },
    output_paths: {},
    files: {
      manifest_exists: false,
      student_pdf_exists: false,
      answer_pdf_exists: false
    }
  };
}

async function writeLatexJobManifest(latexJob: LatexJobHandoff, payload: unknown): Promise<void> {
  await mkdir(dirname(latexJob.manifest_path), { recursive: true });
  await mkdir(dirname(latexJob.expected_outputs.student_pdf_path), { recursive: true });
  await writeFile(latexJob.manifest_path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function refreshLatexJobStatus(latexJob: LatexJobHandoff): Promise<LatexJobHandoff> {
  const { failure_reason: _failureReason, ...jobWithoutFailure } = latexJob;
  const manifestExists = await fileExists(latexJob.manifest_path);
  const studentPdfExists = await fileExists(latexJob.expected_outputs.student_pdf_path);
  const answerPdfExists = await fileExists(latexJob.expected_outputs.answer_pdf_path);
  const status =
    !manifestExists ? "failed" :
    studentPdfExists && answerPdfExists ? "completed" :
    studentPdfExists || answerPdfExists ? "running" :
    "queued";
  const output_paths = {
    ...(studentPdfExists ? { student_pdf_path: latexJob.expected_outputs.student_pdf_path } : {}),
    ...(answerPdfExists ? { answer_pdf_path: latexJob.expected_outputs.answer_pdf_path } : {})
  };

  return {
    ...jobWithoutFailure,
    status,
    progress_message: progressMessageForLatexJob(status, { manifestExists, studentPdfExists, answerPdfExists }),
    updated_at: nowIso(),
    output_paths,
    files: {
      manifest_exists: manifestExists,
      student_pdf_exists: studentPdfExists,
      answer_pdf_exists: answerPdfExists
    },
    ...(!manifestExists ? { failure_reason: "Claude Code LaTeX 任务清单未写入或已被移除。" } : {})
  };
}

async function generateVerifiedPracticeQuestions(input: {
  ai: LLMProvider;
  mistake: Mistake;
  count: 3 | 5;
  difficultyMode: "adaptive" | "basic" | "standard" | "challenge";
  avoidQuestionTexts: string[];
  model?: DeepSeekModel;
  logError: (error: unknown) => void;
}): Promise<{ questions: GeneratedQuestion[]; generatedCount: number } | undefined> {
  const questions: GeneratedQuestion[] = [];
  let generatedCount = 0;
  const avoidQuestionTexts = [...input.avoidQuestionTexts];

  for (let attempt = 0; attempt < 3 && questions.length < input.count; attempt += 1) {
    const generated = await input.ai.generatePractice({
      mistake: input.mistake,
      count: input.count,
      difficulty_mode: input.difficultyMode,
      avoid_question_texts: [...avoidQuestionTexts],
      ...(input.model ? { model: input.model } : {})
    }).catch((error: unknown) => {
      input.logError(error);
      return undefined;
    });
    if (!generated) return undefined;

    generatedCount += generated.length;
    const passed = filterAvoidedQuestions(
      await verifyPracticeQuestions(input.ai, generated, input.model, input.logError),
      avoidQuestionTexts
    );

    for (const question of passed) {
      if (questions.length >= input.count) break;
      questions.push(question);
      avoidQuestionTexts.push(question.question_text);
    }
  }

  return { questions, generatedCount };
}

async function verifyPracticeQuestions(
  ai: LLMProvider,
  generated: GeneratedQuestion[],
  model: DeepSeekModel | undefined,
  logError: (error: unknown) => void
): Promise<GeneratedQuestion[]> {
  const verified: GeneratedQuestion[] = [];
  for (const rawQuestion of generated) {
    try {
      const question = GeneratedQuestionSchema.parse(rawQuestion);
      if (!isValidChoiceQuestion(question)) continue;
      const verification = await ai.verifyMath({
        question: stripVerificationStatus(question),
        ...(model ? { model } : {})
      });
      if (verification.verification_status === "passed") {
        verified.push({ ...question, verification_status: "passed" });
      }
    } catch (error) {
      logError(error);
    }
  }
  return verified;
}

function stripVerificationStatus(question: GeneratedQuestion): Omit<GeneratedQuestion, "verification_status"> {
  const { verification_status: _verificationStatus, ...rest } = question;
  return rest;
}

function progressMessageForLatexJob(
  status: LatexJobHandoff["status"],
  files: { manifestExists: boolean; studentPdfExists: boolean; answerPdfExists: boolean }
): string {
  if (status === "failed") return "未找到 Claude Code 制卷任务清单，请重新生成复测卷。";
  if (status === "completed") return "学生卷和答案卷 PDF 均已在目标目录生成。";
  if (files.studentPdfExists) return "学生卷 PDF 已生成，正在等待答案卷 PDF。";
  if (files.answerPdfExists) return "答案卷 PDF 已生成，正在等待学生卷 PDF。";
  return "已写入 Claude Code 制卷任务清单，等待 LaTeX 输出学生卷和答案卷 PDF。";
}

function filterAvoidedQuestions<T extends { question_text: string }>(questions: T[], avoidQuestionTexts: string[]): T[] {
  const avoided = new Set(avoidQuestionTexts.map(normalizeQuestionTextForComparison).filter(Boolean));
  if (avoided.size === 0) return questions;
  return questions.filter((question) => !avoided.has(normalizeQuestionTextForComparison(question.question_text)));
}

function normalizeQuestionTextForComparison(value: string): string {
  return value.replace(/\s+/g, "").replace(/[，。！？；：,.!?;:]/g, "").trim();
}

async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
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

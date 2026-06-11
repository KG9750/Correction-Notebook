import { describe, expect, it } from "vitest";
import type { AnalyzeMistakeInput, GeneratePracticeInput, GenerateTestPaperInput, LLMProvider } from "@correction-notebook/ai";
import { createApp } from "./server.js";
import { GoogleVisionOcrClient } from "./ocr/google.js";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeneratedQuestion, Mistake } from "@correction-notebook/shared";

async function createMistakeAndPractice(options?: Parameters<typeof createApp>[0]) {
  const app = await createApp(options);
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/v1/mistakes",
    payload: {
      student_id: "student_1",
      grade: "初一",
      ocr_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？列方程。",
      student_answer: "17-8",
      source_name: "期中考试"
    }
  });
  const created = createResponse.json();
  const sourceMistake: Mistake = {
    ...created.mistake,
    main_error_type: "方法性错误",
    knowledge_points: ["一元一次方程"],
    mastery_status: "not_mastered"
  };
  return { app, mistakeId: created.mistake_id as string, sourceMistake };
}

function makeChoiceQuestion(id: string, mistakeId: string): GeneratedQuestion {
  return {
    id,
    mistake_id: mistakeId,
    question_text: "一根绳子剪去 5 米后还剩 12 米，原来长多少米？",
    choice_answer_type: "single",
    choice_options: [
      { label: "A", text: "7 米" },
      { label: "B", text: "12 米" },
      { label: "C", text: "17 米" },
      { label: "D", text: "60 米" }
    ],
    difficulty: "standard",
    question_type: "same_pattern",
    estimated_time_seconds: 120,
    answer: "C",
    solution_steps: ["5+12=17", "故正确选项为 C。"],
    knowledge_points: ["方程"],
    target_error_type: "方法性错误",
    why_related_to_original_mistake: "同类数量关系。",
    verification_status: "passed",
    created_at: new Date().toISOString()
  };
}

describe("Correction Notebook API", () => {
  it("returns a typed OCR result from the configured Google Vision OCR client", async () => {
    const app = await createApp({
      ocrClient: {
        recognize: async () => ({
          raw_text: "一根绳子剪去 8 米",
          normalized_text: "一根绳子剪去 8 米",
          confidence: 0.91,
          needs_user_review: false,
          provider: "google-vision",
          words: ["一根绳子剪去 8 米"],
          math_latex: []
        })
      } as GoogleVisionOcrClient
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ocr",
      payload: {
        image_base64: "abc",
        language_type: "CHN_ENG"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().provider).toBe("google-vision");
    expect(response.json().normalized_text).toContain("绳子");
  });

  it("returns a clear OCR configuration error when Google Vision credentials are absent", async () => {
    const app = await createApp({ ocrClient: new GoogleVisionOcrClient({ apiKey: "" }) });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ocr",
      payload: {
        image_base64: "abc"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("google_vision_not_configured");
  });

  it("creates a mistake even when OCR text is too short and marks it for user review", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/mistakes",
      payload: {
        student_id: "student_1",
        grade: "初一",
        ocr_text: "x?",
        student_answer: ""
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().mistake.needs_user_review).toBe(true);
  });

  it("analyzes a low-information mistake with human review required", async () => {
    const app = await createApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/mistakes",
      payload: {
        student_id: "student_1",
        grade: "初一",
        ocr_text: "x?",
        student_answer: ""
      }
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${created.json().mistake_id}/analyze`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().needs_human_review).toBe(true);
    expect(response.json().mistake.mastery_status).toBe("pending_practice");
  });

  it("does not silently use mock AI outside tests when DeepSeek is not configured", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.DEEPSEEK_API_KEY;

    try {
      const app = await createApp();
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/mistakes",
        payload: {
          student_id: "student_1",
          grade: "初一",
          ocr_text: "解方程 3x - 7 = 11。",
          student_answer: "x = 4/3"
        }
      });
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/mistakes/${created.json().mistake_id}/analyze`
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe("deepseek_not_configured");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalDeepSeekKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      }
    }
  });

  it("generates verified practice questions with answers and linkage", async () => {
    const { app, mistakeId } = await createMistakeAndPractice();
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: { count: 3, difficulty_mode: "adaptive" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().questions).toHaveLength(3);
    expect(response.json().questions.every((question: { answer: string }) => question.answer.length > 0)).toBe(true);
    expect(response.json().questions.every((question: { choice_answer_type?: string; choice_options?: unknown[] }) =>
      (question.choice_answer_type === "single" || question.choice_answer_type === "multiple") &&
      (question.choice_options?.length ?? 0) >= 4
    )).toBe(true);
    expect(response.json().filtered_out).toBe(0);
  });

  it("retries practice generation until enough valid choice questions remain after filtering", async () => {
    let generationCalls = 0;
    const makeChoiceQuestion = (id: string, mistakeId: string, text: string) => ({
      id,
      mistake_id: mistakeId,
      question_text: text,
      choice_answer_type: "single" as const,
      choice_options: [
        { label: "A", text: "7 米" },
        { label: "B", text: "12 米" },
        { label: "C", text: "17 米" },
        { label: "D", text: "60 米" }
      ],
      difficulty: "standard" as const,
      question_type: "same_pattern" as const,
      estimated_time_seconds: 120,
      answer: "C",
      solution_steps: ["5+12=17"],
      knowledge_points: ["方程"],
      target_error_type: "方法性错误",
      why_related_to_original_mistake: "同类数量关系。",
      verification_status: "passed" as const,
      created_at: new Date().toISOString()
    });
    const aiProvider = {
      async analyzeMistake(input: AnalyzeMistakeInput) {
        return {
          id: "analysis_retry",
          mistake_id: input.mistake.id,
          main_error_type: "方法性错误",
          secondary_error_types: [],
          error_summary: "等量关系不清。",
          wrong_step_location: "列式。",
          correct_solution_steps: ["找等量关系。", "列方程。"],
          avoidance_tip: "先写关系式。",
          student_friendly_explanation: "先看清楚总量和剩余量。",
          confidence: 0.9,
          needs_human_review: false,
          model_provider: "deepseek",
          model_name: "deepseek-v4-pro",
          created_at: new Date().toISOString()
        };
      },
      async generatePractice(input: GeneratePracticeInput) {
        generationCalls += 1;
        if (generationCalls === 1) {
          return [
            makeChoiceQuestion("gq_retry_1", input.mistake.id, "变式一"),
            makeChoiceQuestion("gq_retry_2", input.mistake.id, "变式二"),
            {
              ...makeChoiceQuestion("gq_retry_bad", input.mistake.id, "一根绳子剪去 5 米后还剩 12 米，原来长____米。"),
              choice_answer_type: undefined,
              choice_options: undefined,
              answer: "17"
            }
          ];
        }
        return [makeChoiceQuestion("gq_retry_3", input.mistake.id, "变式三")];
      },
      async gradeAnswer() {
        return { is_correct: true, feedback: "正确。", error_type_if_wrong: null, graded_by: "manual" as const };
      },
      async generateTestPaper() {
        return [];
      },
      async verifyMath() {
        return { verification_status: "passed" as const, reason: "ok" };
      }
    } satisfies LLMProvider;
    const { app, mistakeId } = await createMistakeAndPractice({ aiProvider });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: { count: 3, difficulty_mode: "adaptive" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().questions.map((question: { id: string }) => question.id)).toEqual(["gq_retry_1", "gq_retry_2", "gq_retry_3"]);
    expect(response.json().filtered_out).toBe(1);
    expect(generationCalls).toBe(2);
  });

  it("passes the selected DeepSeek model to analysis and practice generation", async () => {
    const seenModels: string[] = [];
    const seenAvoidQuestionTexts: string[][] = [];
    const aiProvider = {
      async analyzeMistake(input: AnalyzeMistakeInput) {
        seenModels.push(input.model ?? "");
        return {
          id: "analysis_model",
          mistake_id: input.mistake.id,
          main_error_type: "方法性错误",
          secondary_error_types: [],
          error_summary: "模型选择已传递。",
          wrong_step_location: "列式阶段。",
          correct_solution_steps: ["读题。", "列式。", "计算。"],
          avoidance_tip: "先确认数量关系。",
          student_friendly_explanation: "注意题意。",
          confidence: 0.9,
          needs_human_review: false,
          model_provider: "deepseek",
          model_name: input.model ?? "missing",
          created_at: new Date().toISOString()
        };
      },
      async generatePractice(input: GeneratePracticeInput) {
        seenModels.push(input.model ?? "");
        seenAvoidQuestionTexts.push(input.avoid_question_texts ?? []);
        return [1, 2, 3].map((index) => ({
          id: `gq_model_${index}`,
          mistake_id: input.mistake.id,
          question_text: `一根绳子剪去 5 米后还剩 12 米，原来长多少米？${index}`,
          choice_answer_type: "single",
          choice_options: [
            { label: "A", text: "7 米" },
            { label: "B", text: "12 米" },
            { label: "C", text: "17 米" },
            { label: "D", text: "60 米" }
          ],
          difficulty: "standard",
          question_type: "same_pattern",
          estimated_time_seconds: 120,
          answer: "C",
          solution_steps: ["5+12=17"],
          knowledge_points: ["方程"],
          target_error_type: "方法性错误",
          why_related_to_original_mistake: "同类数量关系。",
          verification_status: "passed",
          created_at: new Date().toISOString()
        }));
      },
      async gradeAnswer() {
        return { is_correct: true, feedback: "正确。", error_type_if_wrong: null, graded_by: "manual" as const };
      },
      async generateTestPaper(input: GenerateTestPaperInput) {
        return [{
          id: "tpq_model",
          question_text: `围绕 ${input.knowledge_distribution[0]?.knowledge_point ?? "方程"} 的新题`,
          difficulty: "standard" as const,
          answer: "17",
          solution_steps: ["列式。", "计算。"],
          knowledge_points: ["方程"],
          target_error_type: "方法性错误",
          source_mistake_ids: input.source_mistakes.map((mistake) => mistake.id)
        }];
      },
      async verifyMath() {
        return { verification_status: "passed" as const, reason: "ok" };
      }
    } satisfies LLMProvider;
    const app = await createApp({ aiProvider });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/mistakes",
      payload: {
        student_id: "student_1",
        grade: "初一",
        ocr_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
        student_answer: "17-8"
      }
    });
    const mistakeId = created.json().mistake_id;

    await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/analyze`,
      payload: { model: "deepseek-v4-flash" }
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: {
        count: 3,
        difficulty_mode: "adaptive",
        model: "deepseek-v4-flash",
        avoid_question_texts: ["旧变式题"]
      }
    });

    expect(seenModels).toEqual(["deepseek-v4-flash", "deepseek-v4-flash"]);
    expect(seenAvoidQuestionTexts).toEqual([["旧变式题"]]);
  });

  it("filters refreshed practice questions that repeat avoided old question text", async () => {
    const aiProvider = {
      async analyzeMistake(input: AnalyzeMistakeInput) {
        return {
          id: "analysis_repeated",
          mistake_id: input.mistake.id,
          main_error_type: "方法性错误",
          secondary_error_types: [],
          error_summary: "等量关系不清。",
          wrong_step_location: "列式。",
          correct_solution_steps: ["找等量关系。", "列方程。"],
          avoidance_tip: "先写关系式。",
          student_friendly_explanation: "先看清楚总量和剩余量。",
          confidence: 0.9,
          needs_human_review: false,
          model_provider: "deepseek",
          model_name: "deepseek-v4-pro",
          created_at: new Date().toISOString()
        };
      },
      async generatePractice(input: GeneratePracticeInput) {
        return [{
          id: "gq_repeated",
          mistake_id: input.mistake.id,
          question_text: "旧变式题？",
          choice_answer_type: "single",
          choice_options: [
            { label: "A", text: "7 米" },
            { label: "B", text: "12 米" },
            { label: "C", text: "17 米" },
            { label: "D", text: "60 米" }
          ],
          difficulty: "standard",
          question_type: "same_pattern",
          estimated_time_seconds: 120,
          answer: "C",
          solution_steps: ["5+12=17"],
          knowledge_points: ["方程"],
          target_error_type: "方法性错误",
          why_related_to_original_mistake: "同类数量关系。",
          verification_status: "passed",
          created_at: new Date().toISOString()
        }];
      },
      async gradeAnswer() {
        return { is_correct: true, feedback: "正确。", error_type_if_wrong: null, graded_by: "manual" as const };
      },
      async generateTestPaper() {
        return [];
      },
      async verifyMath() {
        return { verification_status: "passed" as const, reason: "ok" };
      }
    } satisfies LLMProvider;
    const { app, mistakeId } = await createMistakeAndPractice({ aiProvider });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: { count: 3, avoid_question_texts: ["旧变式题"] }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().message).toContain("choice-question verification");
  });

  it("filters non-choice practice questions so fill-in variants are not exposed", async () => {
    const aiProvider = {
      async analyzeMistake(input: AnalyzeMistakeInput) {
        return {
          id: "analysis_non_choice",
          mistake_id: input.mistake.id,
          main_error_type: "方法性错误",
          secondary_error_types: [],
          error_summary: "等量关系不清。",
          wrong_step_location: "列式。",
          correct_solution_steps: ["找等量关系。", "列方程。"],
          avoidance_tip: "先写关系式。",
          student_friendly_explanation: "先看清楚总量和剩余量。",
          confidence: 0.9,
          needs_human_review: false,
          model_provider: "deepseek",
          model_name: "deepseek-v4-pro",
          created_at: new Date().toISOString()
        };
      },
      async generatePractice(input: GeneratePracticeInput) {
        return [{
          id: "gq_fill_blank",
          mistake_id: input.mistake.id,
          question_text: "一根绳子剪去 5 米后还剩 12 米，原来长____米。",
          difficulty: "standard",
          question_type: "same_pattern",
          estimated_time_seconds: 120,
          answer: "17",
          solution_steps: ["5+12=17"],
          knowledge_points: ["方程"],
          target_error_type: "方法性错误",
          why_related_to_original_mistake: "同类数量关系。",
          verification_status: "passed",
          created_at: new Date().toISOString()
        }];
      },
      async gradeAnswer() {
        return { is_correct: true, feedback: "正确。", error_type_if_wrong: null, graded_by: "manual" as const };
      },
      async generateTestPaper() {
        return [];
      },
      async verifyMath() {
        return { verification_status: "passed" as const, reason: "ok" };
      }
    } satisfies LLMProvider;
    const { app, mistakeId } = await createMistakeAndPractice({ aiProvider });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: { count: 3 }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().message).toContain("choice-question verification");
  });

  it("updates mastery after three attempts and schedules a three-day review for 2/3 correct", async () => {
    const { app, mistakeId } = await createMistakeAndPractice();
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    const generated = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: { count: 3 }
    });
    const questionIds = generated.json().questions.map((question: { id: string }) => question.id);

    await app.inject({ method: "POST", url: "/api/v1/practice-attempts", payload: { student_id: "student_1", question_id: questionIds[0], answer_text: "C" } });
    await app.inject({ method: "POST", url: "/api/v1/practice-attempts", payload: { student_id: "student_1", question_id: questionIds[1], answer_text: "wrong" } });
    const final = await app.inject({ method: "POST", url: "/api/v1/practice-attempts", payload: { student_id: "student_1", question_id: questionIds[2], answer_text: "B" } });

    expect(final.json().updated_mastery_status).toBe("partially_mastered");
    expect(final.json().mistake.review_due_at).toBeTruthy();
  });

  it("stores an ungraded attempt and leaves mastery unchanged when DeepSeek grading fails", async () => {
    const aiProvider = {
      async analyzeMistake(input: AnalyzeMistakeInput) {
        return {
          id: "analysis_ungraded",
          mistake_id: input.mistake.id,
          main_error_type: "方法性错误",
          secondary_error_types: [],
          error_summary: "需要练习。",
          wrong_step_location: "列式阶段。",
          correct_solution_steps: ["读题。", "列式。", "计算。"],
          avoidance_tip: "先写等量关系。",
          student_friendly_explanation: "先找关系再算。",
          confidence: 0.9,
          needs_human_review: false,
          model_provider: "deepseek",
          model_name: "deepseek-v4-pro",
          created_at: new Date().toISOString()
        };
      },
      async generatePractice(input: GeneratePracticeInput) {
        return [1, 2, 3].map((index) => ({
          id: `gq_ungraded_${index}`,
          mistake_id: input.mistake.id,
          question_text: `一根绳子剪去 5 米后还剩 12 米，原来长多少米？${index}`,
          choice_answer_type: "single",
          choice_options: [
            { label: "A", text: "7 米" },
            { label: "B", text: "12 米" },
            { label: "C", text: "17 米" },
            { label: "D", text: "60 米" }
          ],
          difficulty: "standard",
          question_type: "same_pattern",
          estimated_time_seconds: 120,
          answer: "C",
          solution_steps: ["5+12=17"],
          knowledge_points: ["方程"],
          target_error_type: "方法性错误",
          why_related_to_original_mistake: "同类数量关系。",
          verification_status: "passed",
          created_at: new Date().toISOString()
        }));
      },
      async gradeAnswer() {
        throw new Error("DeepSeek timeout");
      },
      async generateTestPaper() {
        return [];
      },
      async verifyMath() {
        return { verification_status: "passed" as const, reason: "ok" };
      }
    } satisfies LLMProvider;
    const app = await createApp({ aiProvider });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/mistakes",
      payload: {
        student_id: "student_1",
        grade: "初一",
        ocr_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
        student_answer: "17-8"
      }
    });
    const mistakeId = created.json().mistake_id;
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    const generated = await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/generate-practice`, payload: { count: 3 } });
    const questionId = generated.json().questions[0].id;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/practice-attempts",
      payload: { student_id: "student_1", question_id: questionId, answer_text: "17", practice_total: 3 }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().attempt.grading_status).toBe("ungraded");
    expect(response.json().attempt.is_correct).toBeNull();
    expect(response.json().updated_mastery_status).toBe("practicing");
  });

  it("grades a submitted question snapshot when the API cache has no generated question", async () => {
    const app = await createApp();
    const question = makeChoiceQuestion("local_gq_1", "local_mistake_1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/practice-attempts",
      payload: {
        student_id: "student_1",
        question_id: question.id,
        question,
        answer_text: "C",
        practice_total: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().attempt.generated_question_id).toBe(question.id);
    expect(response.json().attempt.grading_status).toBe("graded");
    expect(response.json().attempt.graded_by).toBe("ai");
  });

  it("ignores manual correctness payloads for formal mastery grading", async () => {
    const app = await createApp();
    const question = makeChoiceQuestion("local_gq_2", "local_mistake_2");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/practice-attempts",
      payload: {
        student_id: "student_1",
        question,
        answer_text: "wrong",
        manual_is_correct: true,
        practice_total: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().attempt.graded_by).toBe("ai");
    expect(response.json().attempt.is_correct).toBe(false);
  });

  it("returns separate student and answer PDF URLs and hides answer URL unless requested", async () => {
    const latexWorkspace = await mkdtemp(join(tmpdir(), "correction-notebook-latex-"));
    const { app, mistakeId, sourceMistake } = await createMistakeAndPractice({ latexWorkspace });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/generate-practice`, payload: { count: 3 } });

    const hiddenAnswer = await app.inject({
      method: "POST",
      url: "/api/v1/test-papers",
      payload: {
        student_id: "student_1",
        question_count: 10,
        include_answer_pdf: false,
        filters: {
          time_range_days: 30,
          knowledge_points: ["一元一次方程"],
          error_types: ["方法性错误"],
          mastery_statuses: ["not_mastered", "partially_mastered"]
        },
        source_mistakes: [sourceMistake]
      }
    });
    const visibleAnswer = await app.inject({
      method: "POST",
      url: "/api/v1/test-papers",
      payload: {
        student_id: "student_1",
        question_count: 10,
        include_answer_pdf: true,
        filters: {
          time_range_days: 30,
          knowledge_points: ["一元一次方程"],
          error_types: ["方法性错误"],
          mastery_statuses: ["not_mastered", "partially_mastered"]
        },
        source_mistakes: [sourceMistake]
      }
    });

    expect(hiddenAnswer.json().student_pdf_url).toContain("/student.pdf");
    expect(hiddenAnswer.json()).not.toHaveProperty("answer_pdf_url");
    expect(hiddenAnswer.json().latex_job.workspace_path).toBe(latexWorkspace);
    expect(hiddenAnswer.json().questions[0].id).toContain("tpq");
    expect(visibleAnswer.json().answer_pdf_url).toContain("/answer.pdf");
    expect(visibleAnswer.json().answer_pdf_url).not.toEqual(visibleAnswer.json().student_pdf_url);
  });

  it("rejects fresh test-paper generation without local source mistakes", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/test-papers",
      payload: {
        student_id: "student_1",
        question_count: 10,
        include_answer_pdf: true,
        filters: {
          time_range_days: 30,
          knowledge_points: [],
          error_types: [],
          mastery_statuses: ["not_mastered", "partially_mastered"]
        },
        source_mistakes: []
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("test_paper_source_mistakes_empty");
  });

  it("writes a Claude Code LaTeX manifest and reports PDF generation progress", async () => {
    const latexWorkspace = await mkdtemp(join(tmpdir(), "correction-notebook-latex-"));
    const { app, mistakeId, sourceMistake } = await createMistakeAndPractice({ latexWorkspace });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/generate-practice`, payload: { count: 3 } });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/test-papers",
      payload: {
        student_id: "student_1",
        question_count: 10,
        include_answer_pdf: true,
        filters: {
          time_range_days: 30,
          knowledge_points: [],
          error_types: [],
          mastery_statuses: ["not_mastered", "partially_mastered"]
        },
        source_mistakes: [sourceMistake]
      }
    });
    const payload = created.json();

    expect(created.statusCode).toBe(200);
    await expect(access(payload.latex_job.manifest_path)).resolves.toBeUndefined();
    expect(payload.latex_job.files).toEqual({
      manifest_exists: true,
      student_pdf_exists: false,
      answer_pdf_exists: false
    });
    expect(payload.latex_job.progress_message).toContain("等待");

    await writeFile(payload.latex_job.expected_outputs.student_pdf_path, "student pdf");
    await writeFile(payload.latex_job.expected_outputs.answer_pdf_path, "answer pdf");

    const status = await app.inject({
      method: "GET",
      url: `/api/v1/test-papers/${payload.paper_id}/status`
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().latex_job.status).toBe("completed");
    expect(status.json().latex_job.files).toEqual({
      manifest_exists: true,
      student_pdf_exists: true,
      answer_pdf_exists: true
    });
    expect(status.json().latex_job.output_paths.student_pdf_path).toContain("/student.pdf");
    expect(status.json().latex_job.output_paths.answer_pdf_path).toContain("/answer.pdf");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMistakeWithServerAI, createFreshTestPaper, enrichMistakeWithServerAI, submitPracticeAttempt } from "./enrich";

const input = {
  studentId: "student_1",
  grade: "初一",
  ocrText: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
  studentAnswer: "17-8",
  settings: {
    deepseekModel: "deepseek-v4-pro" as const,
    practiceCount: 3 as const,
    practiceDifficulty: "adaptive" as const
  }
};

describe("server AI enrichment client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  });

  it("surfaces backend network failures instead of returning undefined", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.50.191:8787";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network request failed")));

    await expect(enrichMistakeWithServerAI(input)).rejects.toThrow(
      "无法连接后端 API http://192.168.50.191:8787"
    );
    await expect(enrichMistakeWithServerAI(input)).rejects.toThrow("Network request failed");
  });

  it("includes the HTTP status and server payload when mistake creation fails", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.50.191:8787";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "api_unavailable", message: "API service unavailable" })
    }));

    await expect(enrichMistakeWithServerAI(input)).rejects.toThrow(
      "创建服务端错题失败（503）：API service unavailable"
    );
  });

  it("can refresh analysis without generating practice questions", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.50.191:8787";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mistake_id: "server_mistake_1" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          analysis_id: "analysis_1",
          mistake_id: "server_mistake_1",
          main_error_type: "方法性错误",
          secondary_error_types: [],
          error_summary: "方程关系没列清。",
          wrong_step_location: "列式",
          correct_solution_steps: ["设未知数。"],
          avoidance_tip: "先找等量关系。",
          student_friendly_explanation: "先把题目里的等量关系写出来。",
          confidence: 0.9,
          needs_human_review: false,
          model_provider: "deepseek",
          model_name: "deepseek-v4-pro",
          created_at: "2026-05-31T00:00:00.000Z"
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMistakeWithServerAI(input);

    expect(result.analysis_id).toBe("analysis_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/v1/mistakes/server_mistake_1/analyze");
  });

  it("sends existing practice question text so refresh can avoid repeating it", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.50.191:8787";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mistake_id: "server_mistake_1" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          analysis_id: "analysis_1",
          mistake_id: "server_mistake_1",
          main_error_type: "方法性错误",
          secondary_error_types: [],
          error_summary: "方程关系没列清。",
          wrong_step_location: "列式",
          correct_solution_steps: ["设未知数。"],
          avoidance_tip: "先找等量关系。",
          student_friendly_explanation: "先把题目里的等量关系写出来。",
          confidence: 0.9,
          needs_human_review: false,
          model_provider: "deepseek",
          model_name: "deepseek-v4-pro",
          created_at: "2026-05-31T00:00:00.000Z"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          questions: [{
            id: "gq_new",
            mistake_id: "server_mistake_1",
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
            solution_steps: ["5+12=17"],
            knowledge_points: ["方程"],
            target_error_type: "方法性错误",
            why_related_to_original_mistake: "同类数量关系。",
            verification_status: "passed",
            created_at: "2026-05-31T00:00:00.000Z"
          }]
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    await enrichMistakeWithServerAI({
      ...input,
      avoidQuestionTexts: ["旧变式题题面"]
    });

    const [, practiceInit] = fetchMock.mock.calls[2] as [string, { body: string }];
    expect(JSON.parse(practiceInit.body).avoid_question_texts).toEqual(["旧变式题题面"]);
  });

  it("submits the full generated question snapshot for grading", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.50.191:8787";
    const question = {
      id: "gq_1",
      mistake_id: "local_mistake_1",
      question_text: "一根绳子剪去 5 米后还剩 12 米，原来长多少米？",
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
      solution_steps: ["5+12=17", "故正确选项为 C。"],
      knowledge_points: ["方程"],
      target_error_type: "方法性错误",
      why_related_to_original_mistake: "同类数量关系。",
      verification_status: "passed" as const,
      created_at: "2026-05-31T00:00:00.000Z"
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        attempt: {
          id: "attempt_1",
          student_id: "student_1",
          mistake_id: "local_mistake_1",
          generated_question_id: "gq_1",
          answer_text: "C",
          grading_status: "graded",
          is_correct: true,
          error_type_if_wrong: null,
          graded_by: "ai",
          feedback: "正确。",
          created_at: "2026-05-31T00:00:00.000Z"
        },
        is_correct: true,
        feedback: "正确。",
        updated_mastery_status: "practicing",
        grading_status: "graded"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitPracticeAttempt({
      studentId: "student_1",
      question,
      answerText: "C",
      practiceTotal: 3,
      model: "deepseek-v4-pro"
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).question).toEqual(question);
  });

  it("submits local source mistakes for fresh test-paper generation", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://192.168.50.191:8787";
    const sourceMistakes = [{
      id: "mistake_1",
      student_id: "student_1",
      subject: "math" as const,
      grade: "初一" as const,
      source_type: "exam_paper" as const,
      ocr_text: "题干",
      normalized_question_text: "题干",
      student_answer: "错误答案",
      knowledge_points: ["一元一次方程"],
      main_error_type: "方法性错误" as const,
      secondary_error_types: [],
      mastery_status: "not_mastered" as const,
      needs_user_review: false,
      created_at: "2026-05-31T00:00:00.000Z",
      updated_at: "2026-05-31T00:00:00.000Z"
    }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        paper_id: "paper_1",
        student_pdf_url: "/tmp/student.pdf",
        answer_pdf_url: "/tmp/answer.pdf",
        latex_job: {
          id: "job_1",
          workspace_path: "/tmp",
          manifest_path: "/tmp/job.json",
          status: "queued",
          expected_outputs: { student_pdf_path: "/tmp/student.pdf", answer_pdf_path: "/tmp/answer.pdf" },
          output_paths: {}
        },
        paper: {
          id: "paper_1",
          student_id: "student_1",
          title: "数学错因复测卷",
          filters: { time_range_days: 30, knowledge_points: [], error_types: [], mastery_statuses: ["not_mastered"] },
          question_count: 0,
          student_pdf_url: "/tmp/student.pdf",
          answer_pdf_url: "/tmp/answer.pdf",
          questions: [],
          created_at: "2026-05-31T00:00:00.000Z"
        },
        questions: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await createFreshTestPaper({
      studentId: "student_1",
      questionCount: 10,
      difficultyMode: "adaptive",
      includeAnswerPdf: true,
      sourceMistakes
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).source_mistakes).toEqual(sourceMistakes);
  });
});

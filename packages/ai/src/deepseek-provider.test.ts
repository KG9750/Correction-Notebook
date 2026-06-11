import { describe, expect, it, vi } from "vitest";
import type { Mistake } from "@correction-notebook/shared";
import { DeepSeekProvider, resolveDeepSeekApiModel } from "./deepseek-provider.js";

describe("DeepSeekProvider model routing", () => {
  it("maps product-facing V4 labels to configured API model names", () => {
    expect(resolveDeepSeekApiModel("deepseek-v4-pro")).toBe("deepseek-chat");
    expect(resolveDeepSeekApiModel("deepseek-v4-flash")).toBe("deepseek-chat");
    expect(resolveDeepSeekApiModel("custom-model")).toBe("custom-model");
  });

  it("asks DeepSeek for choice-only practice questions and parses choice metadata", async () => {
    let requestBody = "";
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                questions: [{
                  question_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
                  choice_answer_type: "single",
                  choice_options: [
                    { label: "A", text: "9 米" },
                    { label: "B", text: "17 米" },
                    { label: "C", text: "25 米" },
                    { label: "D", text: "136 米" }
                  ],
                  difficulty: "basic",
                  question_type: "same_pattern",
                  estimated_time_seconds: 120,
                  answer: "C",
                  solution_steps: ["列 x - 8 = 17。"],
                  knowledge_points: ["一元一次方程"],
                  target_error_type: "方法性错误",
                  why_related_to_original_mistake: "同一数量关系。"
                }]
              })
            }
          }]
        })
      } as Response;
    });
    const provider = new DeepSeekProvider({ apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    const mistake = {
      id: "m_1",
      student_id: "student_1",
      ocr_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
      normalized_question_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
      student_answer: "17-8",
      source_name: "单元测试",
      cropped_image_uri: undefined,
      original_image_uri: undefined,
      knowledge_points: ["一元一次方程"],
      main_error_type: "方法性错误",
      secondary_error_types: [],
      mastery_status: "pending_practice",
      needs_user_review: false,
      created_at: "2026-05-31T00:00:00.000Z",
      updated_at: "2026-05-31T00:00:00.000Z"
    } satisfies Mistake;

    const questions = await provider.generatePractice({
      mistake,
      count: 1,
      difficulty_mode: "adaptive",
      avoid_question_texts: ["旧题：一根彩带剪去 6 米后还剩 14 米，原来长多少米？"]
    });

    expect(requestBody).toContain("每道变式练习必须是选择题");
    expect(requestBody).toContain("不要填写完整解答");
    expect(requestBody).toContain("不要出现 ____");
    expect(requestBody).toContain("禁止复用的旧题题面");
    expect(requestBody).toContain("旧题：一根彩带剪去 6 米后还剩 14 米");
    expect(questions[0]?.choice_answer_type).toBe("single");
    expect(questions[0]?.choice_options).toHaveLength(4);
    expect(questions[0]?.answer).toBe("C");
    expect(questions[0]?.verification_status).toBe("pending");
  });

  it("fails closed when DeepSeek returns malformed practice JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "{ not json" } }]
      })
    }) as Response);
    const provider = new DeepSeekProvider({ apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    const mistake = {
      id: "m_1",
      student_id: "student_1",
      ocr_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
      normalized_question_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
      student_answer: "17-8",
      knowledge_points: ["一元一次方程"],
      secondary_error_types: [],
      mastery_status: "pending_practice",
      needs_user_review: false,
      created_at: "2026-05-31T00:00:00.000Z",
      updated_at: "2026-05-31T00:00:00.000Z"
    } satisfies Mistake;

    await expect(provider.generatePractice({
      mistake,
      count: 1,
      difficulty_mode: "adaptive"
    })).rejects.toThrow("DeepSeek returned invalid JSON");
  });
});

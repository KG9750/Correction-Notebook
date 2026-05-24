import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "./mock-provider.js";
import type { Mistake } from "@correction-notebook/shared";

const mistake: Mistake = {
  id: "mistake_1",
  student_id: "student_1",
  subject: "math",
  grade: "初一",
  source_type: "exam_paper",
  source_name: "期中",
  ocr_text: "应用题列方程，剩下与已经用掉",
  normalized_question_text: "绳子剪去一部分后还剩多少，求原长",
  student_answer: "17-8",
  knowledge_points: ["一元一次方程", "等量关系"],
  main_error_type: "方法性错误",
  secondary_error_types: ["审题性错误"],
  mastery_status: "pending_practice",
  needs_user_review: false,
  created_at: "2026-05-23T00:00:00.000Z",
  updated_at: "2026-05-23T00:00:00.000Z"
};

describe("MockLLMProvider", () => {
  it("generates three verified practice questions with answer and linkage", async () => {
    const provider = new MockLLMProvider();
    const questions = await provider.generatePractice({
      mistake,
      count: 3,
      difficulty_mode: "adaptive"
    });

    expect(questions).toHaveLength(3);
    expect(questions.every((question) => question.verification_status === "passed")).toBe(true);
    expect(questions.every((question) => question.answer && question.solution_steps.length > 0)).toBe(true);
    expect(questions.every((question) => question.why_related_to_original_mistake.includes("关系"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeMasteryFromPractice,
  computeMasteryFromGradedAttempts,
  dueReviewMistakes,
  filterPassedChoiceQuestions,
  filterPassedQuestions,
  hasMasteryConfirmationEvidence,
  initialMistakeStatus,
  nextReviewDueForMastery,
  normalizeErrorTags,
  reviewPriorityScore
} from "./domain.js";
import type { GeneratedQuestion, Mistake, PracticeAttempt } from "./schemas.js";

function practiceAttempt(questionId: string, isCorrect: boolean): PracticeAttempt {
  return {
    id: `attempt_${questionId}`,
    student_id: "student_1",
    mistake_id: "m_1",
    generated_question_id: questionId,
    answer_text: isCorrect ? "correct" : "wrong",
    grading_status: "graded",
    is_correct: isCorrect,
    error_type_if_wrong: isCorrect ? null : "方法性错误",
    graded_by: "ai",
    feedback: isCorrect ? "正确。" : "错误。",
    created_at: "2026-05-23T00:00:00.000Z"
  };
}

function baseMistake(): Omit<Mistake, "mastery_status"> {
  return {
    id: "m_1",
    student_id: "student_1",
    subject: "math",
    grade: "初一",
    source_type: "exam_paper",
    ocr_text: "应用题",
    normalized_question_text: "应用题",
    student_answer: "",
    knowledge_points: ["一元一次方程"],
    secondary_error_types: [],
    needs_user_review: false,
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z"
  };
}

describe("mastery rules", () => {
  it("maps 3-question practice results to the PRD mastery statuses", () => {
    expect(computeMasteryFromPractice(3, 3)).toBe("mastered");
    expect(computeMasteryFromPractice(3, 2)).toBe("partially_mastered");
    expect(computeMasteryFromPractice(3, 1)).toBe("not_mastered");
    expect(computeMasteryFromPractice(3, 0)).toBe("not_mastered");
  });

  it("maps 5-question practice results to the PRD mastery statuses", () => {
    expect(computeMasteryFromPractice(5, 5)).toBe("mastered");
    expect(computeMasteryFromPractice(5, 4)).toBe("mastered");
    expect(computeMasteryFromPractice(5, 3)).toBe("partially_mastered");
    expect(computeMasteryFromPractice(5, 2)).toBe("not_mastered");
  });

  it("sets review intervals after practice", () => {
    const base = new Date("2026-05-23T00:00:00.000Z");
    expect(nextReviewDueForMastery("partially_mastered", base)).toBe("2026-05-26T00:00:00.000Z");
    expect(nextReviewDueForMastery("not_mastered", base)).toBe("2026-05-24T00:00:00.000Z");
  });

  it("computes mastery only from graded attempts", () => {
    const attempts = [
      practiceAttempt("q1", true),
      { ...practiceAttempt("q2", true), grading_status: "ungraded" as const, is_correct: null, graded_by: null },
      practiceAttempt("q3", true),
      practiceAttempt("q4", true)
    ];

    expect(computeMasteryFromGradedAttempts(3, attempts)).toBe("mastered");
    expect(hasMasteryConfirmationEvidence(3, attempts)).toBe(true);
    expect(computeMasteryFromGradedAttempts(5, attempts)).toBe("practicing");
  });

  it("starts captured mistakes in analysis regardless of OCR confidence", () => {
    expect(initialMistakeStatus()).toBe("pending_analysis");
  });
});

describe("error tag rules", () => {
  it("requires a valid main error and allows at most two secondary tags", () => {
    const result = normalizeErrorTags({
      main: "未知",
      secondary: ["审题性错误", "过程性错误", "知识性错误"]
    });

    expect(result).toEqual({
      main: "方法性错误",
      secondary: ["看错求什么", "过程性错误"]
    });
  });

  it("normalizes redundant freeform secondary tags", () => {
    const result = normalizeErrorTags({
      main: "知识性错误",
      secondary: ["审题不清", "概念混淆", "看错题意"]
    });

    expect(result).toEqual({
      main: "知识性错误",
      secondary: ["看错求什么"]
    });
  });
});

describe("review priority", () => {
  it("puts not-mastered and due mistakes ahead of mastered mistakes", () => {
    const baseMistake = {
      id: "m_1",
      student_id: "student_1",
      subject: "math",
      grade: "初一",
      source_type: "exam_paper",
      ocr_text: "应用题",
      normalized_question_text: "应用题",
      student_answer: "",
      knowledge_points: ["一元一次方程"],
      secondary_error_types: [],
      needs_user_review: false,
      created_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z"
    } satisfies Omit<Mistake, "mastery_status">;

    const notMastered: Mistake = {
      ...baseMistake,
      mastery_status: "not_mastered",
      review_due_at: "2026-05-22T00:00:00.000Z"
    };
    const mastered: Mistake = {
      ...baseMistake,
      mastery_status: "mastered",
      review_due_at: "2026-05-30T00:00:00.000Z"
    };

    expect(reviewPriorityScore(notMastered, new Date("2026-05-23T00:00:00.000Z"))).toBeGreaterThan(
      reviewPriorityScore(mastered, new Date("2026-05-23T00:00:00.000Z"))
    );
  });

  it("returns only active due review mistakes ordered by priority", () => {
    const asOf = new Date("2026-05-23T00:00:00.000Z");
    const base = baseMistake();
    const dueNotMastered: Mistake = {
      ...base,
      id: "due",
      mastery_status: "not_mastered",
      review_due_at: "2026-05-22T00:00:00.000Z"
    };
    const future: Mistake = {
      ...base,
      id: "future",
      mastery_status: "partially_mastered",
      review_due_at: "2026-05-30T00:00:00.000Z"
    };
    const mastered: Mistake = {
      ...base,
      id: "mastered",
      mastery_status: "mastered",
      review_due_at: "2026-05-22T00:00:00.000Z"
    };

    expect(dueReviewMistakes([future, mastered, dueNotMastered], asOf).map((mistake) => mistake.id)).toEqual(["due"]);
  });
});

describe("generated question safety", () => {
  it("does not expose failed verification questions", () => {
    const base = {
      id: "gq",
      mistake_id: "m_1",
      question_text: "题目",
      difficulty: "basic",
      question_type: "same_pattern",
      estimated_time_seconds: 120,
      answer: "x=3",
      solution_steps: ["列方程"],
      knowledge_points: ["一元一次方程"],
      target_error_type: "等量关系",
      why_related_to_original_mistake: "仍然检查等量关系",
      created_at: "2026-05-23T00:00:00.000Z"
    } satisfies Omit<GeneratedQuestion, "verification_status">;

    expect(
      filterPassedQuestions([
        { ...base, id: "passed", verification_status: "passed" },
        { ...base, id: "failed", verification_status: "failed" }
      ]).map((item) => item.id)
    ).toEqual(["passed"]);
  });

  it("keeps only verified choice questions for practice", () => {
    const base = {
      id: "gq",
      mistake_id: "m_1",
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
      target_error_type: "等量关系",
      why_related_to_original_mistake: "仍然检查等量关系",
      created_at: "2026-05-23T00:00:00.000Z"
    } satisfies Omit<GeneratedQuestion, "verification_status">;

    expect(
      filterPassedChoiceQuestions([
        { ...base, id: "choice", verification_status: "passed" },
        { ...base, id: "open", choice_answer_type: undefined, choice_options: undefined, answer: "x=25", verification_status: "passed" },
        { ...base, id: "blank", question_text: "一根绳子剪去 8 米后还剩 17 米，原来长____米。", verification_status: "passed" },
        { ...base, id: "contradictory", choice_answer_type: "multiple", answer: "A,B,D", solution_steps: ["若 b=-2，则元素为 2,-2,0，三个不同，不符合。", "故正确选项为 A 和 B。"], verification_status: "passed" },
        {
          ...base,
          id: "set_cardinality_wrong_answer",
          question_text: "已知集合{2, t, t+2}恰有2个元素，则不能取下列哪个值？",
          choice_options: [
            { label: "A", text: "0" },
            { label: "B", text: "2" },
            { label: "C", text: "4" },
            { label: "D", text: "6" }
          ],
          answer: "B",
          solution_steps: ["标准答案：B。"],
          verification_status: "passed"
        },
        { ...base, id: "failed", verification_status: "failed" }
      ]).map((item) => item.id)
    ).toEqual(["choice"]);
  });
});

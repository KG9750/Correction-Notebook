import { describe, expect, it } from "vitest";
import { addCapturedMistake, createInitialNotebookState, deleteMistake, recordPracticeAttempt, updateMistake } from "./notebook-state";

describe("mobile notebook state", () => {
  it("allows offline capture without blocking on AI", () => {
    const state = createInitialNotebookState();
    const next = addCapturedMistake(state, {
      ocrText: "",
      studentAnswer: ""
    });

    expect(next.mistakes[0]?.needs_user_review).toBe(true);
    expect(next.mistakes[0]?.mastery_status).toBe("pending_practice");
  });

  it("updates mastery after three local practice attempts", () => {
    let state = createInitialNotebookState();
    state = recordPracticeAttempt(state, "gq_001", "x = 20", true);
    state = recordPracticeAttempt(state, "gq_002", "wrong", false);
    state = recordPracticeAttempt(state, "gq_003", "x = 12", true);

    const mistake = state.mistakes.find((item) => item.id === "mistake_001");
    expect(mistake?.mastery_status).toBe("partially_mastered");
    expect(mistake?.review_due_at).toBeTruthy();
  });

  it("edits the selected mistake fields", () => {
    const state = createInitialNotebookState();
    const next = updateMistake(state, "mistake_001", {
      normalized_question_text: "修改后的题干",
      ocr_text: "修改后的题干",
      student_answer: "x = 25",
      knowledge_points: ["一元一次方程"],
      main_error_type: "过程性错误",
      secondary_error_types: ["符号错误", "审题性错误", "额外标签"]
    });

    const mistake = next.mistakes.find((item) => item.id === "mistake_001");
    expect(mistake?.normalized_question_text).toBe("修改后的题干");
    expect(mistake?.student_answer).toBe("x = 25");
    expect(mistake?.secondary_error_types).toEqual(["符号错误", "审题性错误"]);
  });

  it("deletes a mistake and related generated content", () => {
    const state = createInitialNotebookState();
    const next = deleteMistake(state, "mistake_001");

    expect(next.mistakes.some((item) => item.id === "mistake_001")).toBe(false);
    expect(next.analyses.some((item) => item.mistake_id === "mistake_001")).toBe(false);
    expect(next.generatedQuestions.some((item) => item.mistake_id === "mistake_001")).toBe(false);
    expect(next.selectedMistakeId).toBe("mistake_002");
  });
});

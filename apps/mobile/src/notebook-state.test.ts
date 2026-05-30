import { describe, expect, it } from "vitest";
import { addCapturedMistake, confirmMistakeMastered, createInitialNotebookState, deleteMistake, recordPracticeAttempt, replaceMistakeAI, updateMistake, withDefaultSettings } from "./notebook-state";
import { sampleAnalyses, sampleGeneratedQuestions, sampleMistakes } from "./sample-data";
import { parseArchivedNotebookState, serializeNotebookStateForArchive } from "./storage/codec";
import type { NotebookState } from "./types";

describe("mobile notebook state", () => {
  function stateWithSamples(): NotebookState {
    return {
      ...createInitialNotebookState(),
      selectedMistakeId: sampleMistakes[0]?.id ?? "",
      mistakes: sampleMistakes,
      analyses: sampleAnalyses,
      generatedQuestions: sampleGeneratedQuestions
    };
  }

  it("starts without bundled sample mistakes", () => {
    const state = createInitialNotebookState();

    expect(state.selectedMistakeId).toBe("");
    expect(state.mistakes).toEqual([]);
    expect(state.archivedMistakeIds).toEqual([]);
    expect(state.analyses).toEqual([]);
    expect(state.generatedQuestions).toEqual([]);
  });

  it("allows capture while waiting for server AI", () => {
    const state = createInitialNotebookState();
    const next = addCapturedMistake(state, {
      ocrText: "",
      studentAnswer: ""
    });

    expect(next.mistakes[0]?.needs_user_review).toBe(true);
    expect(next.mistakes[0]?.mastery_status).toBe("pending_analysis");
    expect(next.mistakes[0]?.knowledge_points).toEqual(["待识别知识点"]);
    expect(next.analyses.some((analysis) => analysis.mistake_id === next.mistakes[0]?.id)).toBe(false);
    expect(next.generatedQuestions.some((question) => question.mistake_id === next.mistakes[0]?.id)).toBe(false);
  });

  it("backfills captured mistake knowledge points from generated questions", () => {
    const state = addCapturedMistake(createInitialNotebookState(), {
      ocrText: "含有5个元素的集合共有____个非空真子集",
      studentAnswer: "31"
    });
    const mistakeId = state.selectedMistakeId;
    const next = replaceMistakeAI(
      state,
      mistakeId,
      {
        id: "analysis_test",
        mistake_id: mistakeId,
        main_error_type: "知识性错误",
        secondary_error_types: ["概念混淆"],
        error_summary: "集合真子集概念混淆。",
        wrong_step_location: "非空真子集计数。",
        correct_solution_steps: ["共有 2^5 个子集。", "去掉空集和全集。"],
        avoidance_tip: "真子集要排除全集。",
        student_friendly_explanation: "注意非空真子集要同时排除空集和全集。",
        confidence: 0.9,
        needs_human_review: false,
        model_provider: "deepseek",
        model_name: "deepseek-v4-pro",
        created_at: "2026-05-30T00:00:00.000Z"
      },
      [{
        id: "gq_test",
        mistake_id: mistakeId,
        question_text: "集合 A 有 4 个元素，非空真子集有多少个？",
        difficulty: "standard",
        question_type: "same_pattern",
        estimated_time_seconds: 120,
        answer: "14",
        solution_steps: ["2^4 - 2 = 14"],
        knowledge_points: ["集合与逻辑", "子集计数"],
        target_error_type: "知识性错误",
        why_related_to_original_mistake: "同样考查非空真子集计数。",
        verification_status: "passed",
        created_at: "2026-05-30T00:00:00.000Z"
      }]
    );

    expect(next.mistakes[0]?.knowledge_points).toEqual(["集合与逻辑", "子集计数"]);
  });

  it("updates mastery after three local practice attempts", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, "gq_001", "x = 20", true);
    state = recordPracticeAttempt(state, "gq_002", "wrong", false);
    state = recordPracticeAttempt(state, "gq_003", "x = 12", true);

    const mistake = state.mistakes.find((item) => item.id === "mistake_001");
    expect(mistake?.mastery_status).toBe("partially_mastered");
    expect(mistake?.review_due_at).toBeTruthy();
  });

  it("waits for explicit confirmation before marking all-correct practice as mastered", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, "gq_001", "x = 20", true);
    state = recordPracticeAttempt(state, "gq_002", "x = 90", true);
    state = recordPracticeAttempt(state, "gq_003", "x = 12", true);

    expect(state.mistakes.find((item) => item.id === "mistake_001")?.mastery_status).toBe("practicing");

    const confirmed = confirmMistakeMastered(state, "mistake_001");
    expect(confirmed.mistakes.find((item) => item.id === "mistake_001")?.mastery_status).toBe("mastered");
    expect(confirmed.archivedMistakeIds).toContain("mistake_001");
  });


  it("edits the selected mistake fields", () => {
    const state = stateWithSamples();
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
    const state = stateWithSamples();
    const next = deleteMistake(state, "mistake_001");

    expect(next.mistakes.some((item) => item.id === "mistake_001")).toBe(false);
    expect(next.analyses.some((item) => item.mistake_id === "mistake_001")).toBe(false);
    expect(next.generatedQuestions.some((item) => item.mistake_id === "mistake_001")).toBe(false);
    expect(next.selectedMistakeId).toBe("mistake_002");
  });

  it("moves a confirmed mastered mistake into the archived collection", () => {
    const state = stateWithSamples();
    const next = confirmMistakeMastered(state, "mistake_001");

    const mistake = next.mistakes.find((item) => item.id === "mistake_001");
    expect(next.activeSection).toBe("collection");
    expect(next.archivedMistakeIds).toContain("mistake_001");
    expect(mistake?.mastery_status).toBe("mastered");
    expect(mistake?.review_due_at).toBeTruthy();
  });

  it("serializes changed notebook state so a reload can restore edits, attempts, archives, and settings", () => {
    let state = stateWithSamples();
    state = addCapturedMistake(state, {
      ocrText: "解方程 x + 3 = 9。",
      studentAnswer: "x=5"
    });
    const capturedId = state.selectedMistakeId;
    state = updateMistake(state, capturedId, {
      normalized_question_text: "解方程 x + 3 = 9。",
      ocr_text: "解方程 x + 3 = 9。",
      student_answer: "x=6",
      knowledge_points: ["一元一次方程"],
      main_error_type: "过程性错误",
      secondary_error_types: ["计算错误"]
    });
    state = recordPracticeAttempt(state, "gq_001", "x = 20", true);
    state = confirmMistakeMastered(state, "mistake_001");
    state = {
      ...state,
      enrichingMistakeId: "transient",
      settings: {
        ...state.settings,
        deepseekModel: "deepseek-v4-flash",
        practiceCount: 5
      }
    };

    const restored = withDefaultSettings(parseArchivedNotebookState(serializeNotebookStateForArchive(state))!);

    expect(restored.enrichingMistakeId).toBeNull();
    expect(restored.mistakes.find((mistake) => mistake.id === capturedId)?.student_answer).toBe("x=6");
    expect(restored.attempts.some((attempt) => attempt.generated_question_id === "gq_001")).toBe(true);
    expect(restored.archivedMistakeIds).toContain("mistake_001");
    expect(restored.settings.deepseekModel).toBe("deepseek-v4-flash");
    expect(restored.settings.practiceCount).toBe(5);
  });
});

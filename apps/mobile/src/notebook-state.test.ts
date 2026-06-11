import { describe, expect, it } from "vitest";
import { addCapturedMistake, canConfirmMistakeMastered, confirmMistakeMastered, createInitialNotebookState, createPreviewTestPaper, deleteMistake, getDueReviewMistakes, recordPracticeAttempt, replaceMistakeAI, updateMistake, withDefaultSettings } from "./notebook-state";
import { sampleAnalyses, sampleGeneratedQuestions, sampleMistakes } from "./sample-data";
import { createNotebookBackupManifest, restoreNotebookStateFromBackup, serializeNotebookBackupManifest } from "./storage/backup-package";
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

  function gradedAttempt(questionId: string, isCorrect: boolean) {
    const question = sampleGeneratedQuestions.find((item) => item.id === questionId)!;
    return {
      id: `attempt_${questionId}_${isCorrect ? "correct" : "wrong"}`,
      student_id: createInitialNotebookState().profile.id,
      mistake_id: question.mistake_id,
      generated_question_id: question.id,
      answer_text: isCorrect ? question.answer : "wrong",
      grading_status: "graded" as const,
      is_correct: isCorrect,
      error_type_if_wrong: isCorrect ? null : question.target_error_type,
      graded_by: "ai" as const,
      feedback: isCorrect ? "正确。" : "错误。",
      created_at: "2026-05-30T00:00:00.000Z"
    };
  }

  function ungradedAttempt(questionId: string) {
    const question = sampleGeneratedQuestions.find((item) => item.id === questionId)!;
    return {
      id: `attempt_${questionId}_ungraded`,
      student_id: createInitialNotebookState().profile.id,
      mistake_id: question.mistake_id,
      generated_question_id: question.id,
      answer_text: "x = 20",
      grading_status: "ungraded" as const,
      is_correct: null,
      error_type_if_wrong: null,
      graded_by: null,
      feedback: "暂未批改。",
      grading_error: "deepseek_grading_failed",
      created_at: "2026-05-30T00:00:00.000Z"
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

  it("keeps existing generated questions when a refresh returns analysis but no usable practice", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, gradedAttempt("gq_001", true), 3);
    const next = replaceMistakeAI(
      state,
      "mistake_001",
      {
        ...sampleAnalyses[0]!,
        id: "analysis_refresh",
        error_summary: "刷新只更新了讲解。"
      },
      []
    );

    expect(next.analyses[0]?.id).toBe("analysis_refresh");
    expect(next.generatedQuestions.filter((question) => question.mistake_id === "mistake_001")).toHaveLength(3);
    expect(next.attempts.some((attempt) => attempt.mistake_id === "mistake_001")).toBe(true);
  });

  it("clears old practice attempts when refreshed practice questions replace the set", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, gradedAttempt("gq_001", true), 3);
    const mistakeId = "mistake_001";
    const next = replaceMistakeAI(
      state,
      mistakeId,
      {
        ...sampleAnalyses[0]!,
        id: "analysis_with_new_practice"
      },
      [{
        ...sampleGeneratedQuestions[0]!,
        id: "gq_new",
        mistake_id: mistakeId,
        question_text: "一根绳子剪去 5 米后还剩 12 米，原来长多少米？"
      }]
    );

    expect(next.generatedQuestions.some((question) => question.id === "gq_new")).toBe(true);
    expect(next.attempts.some((attempt) => attempt.mistake_id === mistakeId)).toBe(false);
  });

  it("updates mastery after three local practice attempts", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, gradedAttempt("gq_001", true), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_002", false), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_003", true), 3);

    const mistake = state.mistakes.find((item) => item.id === "mistake_001");
    expect(mistake?.mastery_status).toBe("partially_mastered");
    expect(mistake?.review_due_at).toBeTruthy();
  });

  it("waits for explicit confirmation before marking all-correct practice as mastered", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, gradedAttempt("gq_001", true), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_002", true), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_003", true), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_002", true), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_003", true), 3);

    expect(state.mistakes.find((item) => item.id === "mistake_001")?.mastery_status).toBe("practicing");
    expect(canConfirmMistakeMastered(state, "mistake_001")).toBe(true);

    const confirmed = confirmMistakeMastered(state, "mistake_001");
    expect(confirmed.mistakes.find((item) => item.id === "mistake_001")?.mastery_status).toBe("mastered");
    expect(confirmed.archivedMistakeIds).toContain("mistake_001");
  });

  it("normalizes server practice attempts to the local mistake before archive confirmation", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, { ...gradedAttempt("gq_001", true), mistake_id: "server_mistake_001" }, 3);
    state = recordPracticeAttempt(state, { ...gradedAttempt("gq_002", true), mistake_id: "server_mistake_001" }, 3);
    state = recordPracticeAttempt(state, { ...gradedAttempt("gq_003", true), mistake_id: "server_mistake_001" }, 3);

    expect(canConfirmMistakeMastered(state, "mistake_001")).toBe(true);

    const confirmed = confirmMistakeMastered(state, "mistake_001");
    expect(confirmed.activeSection).toBe("collection");
    expect(confirmed.archivedMistakeIds).toContain("mistake_001");
    expect(confirmed.mistakes.find((item) => item.id === "mistake_001")?.mastery_status).toBe("mastered");
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

  it("does not move a mistake into the archived collection without graded mastery evidence", () => {
    const state = stateWithSamples();
    const next = confirmMistakeMastered(state, "mistake_001");

    const mistake = next.mistakes.find((item) => item.id === "mistake_001");
    expect(next.activeSection).toBe(state.activeSection);
    expect(next.archivedMistakeIds).not.toContain("mistake_001");
    expect(mistake?.mastery_status).toBe("not_mastered");
  });

  it("keeps ungraded DeepSeek attempts out of mastery updates", () => {
    const state = stateWithSamples();
    const next = recordPracticeAttempt(state, ungradedAttempt("gq_001"), 3);

    const mistake = next.mistakes.find((item) => item.id === "mistake_001");
    expect(next.attempts[0]?.grading_status).toBe("ungraded");
    expect(mistake?.mastery_status).toBe("not_mastered");
    expect(mistake?.review_due_at).toBe("2026-05-23T00:00:00.000Z");
  });

  it("keeps manual attempts out of mastery and archive evidence", () => {
    let state = stateWithSamples();
    state = recordPracticeAttempt(state, { ...gradedAttempt("gq_001", true), graded_by: "manual" }, 3);
    state = recordPracticeAttempt(state, { ...gradedAttempt("gq_002", true), graded_by: "manual" }, 3);
    state = recordPracticeAttempt(state, { ...gradedAttempt("gq_003", true), graded_by: "manual" }, 3);

    expect(canConfirmMistakeMastered(state, "mistake_001")).toBe(false);
    expect(confirmMistakeMastered(state, "mistake_001").archivedMistakeIds).not.toContain("mistake_001");
  });

  it("shows only due active mistakes in review order", () => {
    const state = stateWithSamples();
    const due = getDueReviewMistakes(state, new Date("2026-05-24T00:00:00.000Z"));

    expect(due.map((mistake) => mistake.id)).toEqual(["mistake_001"]);
  });

  it("creates a restorable backup manifest with image and test paper assets", () => {
    const state: NotebookState = {
      ...stateWithSamples(),
      mistakes: [{
        ...sampleMistakes[0]!,
        original_image_uri: "file:///tmp/original.jpg",
        cropped_image_uri: "file:///tmp/cropped.jpg"
      }],
      papers: [{
        id: "paper_001",
        student_id: createInitialNotebookState().profile.id,
        title: "数学复测卷",
        filters: {
          time_range_days: 30,
          knowledge_points: ["一元一次方程"],
          error_types: ["方法性错误"],
          mastery_statuses: ["not_mastered"]
        },
        question_count: 1,
        student_pdf_url: "file:///tmp/student.pdf",
        answer_pdf_url: "file:///tmp/answer.pdf",
        questions: [],
        generation_manifest_url: "file:///tmp/paper-manifest.json",
        created_at: "2026-05-30T00:00:00.000Z"
      }]
    };

    const manifest = createNotebookBackupManifest(state, "2026-05-30T00:00:00.000Z");
    const restored = restoreNotebookStateFromBackup(serializeNotebookBackupManifest(manifest))!;

    expect(manifest.assets.map((asset) => asset.type)).toEqual([
      "original_image",
      "cropped_image",
      "student_pdf",
      "answer_pdf",
      "test_paper_manifest"
    ]);
    expect(restored.mistakes[0]?.original_image_uri).toMatch(/^backup:\/\//);
    expect(restored.papers[0]?.student_pdf_url).toMatch(/^backup:\/\//);
  });

  it("rewrites backup asset URIs during restore materialization", () => {
    const state: NotebookState = {
      ...stateWithSamples(),
      mistakes: [{
        ...sampleMistakes[0]!,
        original_image_uri: "file:///tmp/original.jpg",
        cropped_image_uri: "file:///tmp/cropped.jpg"
      }],
      papers: [{
        id: "paper_001",
        student_id: createInitialNotebookState().profile.id,
        title: "数学复测卷",
        filters: {
          time_range_days: 30,
          knowledge_points: ["一元一次方程"],
          error_types: ["方法性错误"],
          mastery_statuses: ["not_mastered"]
        },
        question_count: 1,
        student_pdf_url: "file:///tmp/student.pdf",
        answer_pdf_url: "file:///tmp/answer.pdf",
        questions: [],
        generation_manifest_url: "file:///tmp/paper-manifest.json",
        created_at: "2026-05-30T00:00:00.000Z"
      }]
    };
    const manifest = createNotebookBackupManifest(state, "2026-05-30T00:00:00.000Z");

    const restored = restoreNotebookStateFromBackup(
      serializeNotebookBackupManifest(manifest),
      (backupPath) => `file:///restored/${backupPath}`
    )!;

    expect(restored.mistakes[0]?.original_image_uri).toBe("file:///restored/original_image/mistake_001-1.jpg");
    expect(restored.papers[0]?.student_pdf_url).toBe("file:///restored/student_pdf/paper_001-3.pdf");
    expect(restored.papers[0]?.generation_manifest_url).toBe("file:///restored/test_paper_manifest/paper_001-5.json");
  });

  it("creates a non-final local preview test paper from existing generated questions", () => {
    const paper = createPreviewTestPaper(stateWithSamples());

    expect(paper?.title).toContain("非正式");
    expect(paper?.questions).toHaveLength(3);
    expect(paper?.student_pdf_url).toMatch(/^local-preview:\/\//);
    expect(paper?.latex_job?.status).toBe("failed");
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
    state = recordPracticeAttempt(state, gradedAttempt("gq_001", true), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_002", true), 3);
    state = recordPracticeAttempt(state, gradedAttempt("gq_003", true), 3);
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

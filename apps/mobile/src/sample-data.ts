import type { AIAnalysis, GeneratedQuestion, Mistake, StudentProfile } from "@correction-notebook/shared";

export const sampleProfile: StudentProfile = {
  id: "student_001",
  nickname: "小明",
  stage: "junior_high",
  grade: "初一",
  created_at: "2026-05-23T00:00:00.000Z"
};

export const sampleMistakes: Mistake[] = [
  {
    id: "mistake_001",
    student_id: sampleProfile.id,
    subject: "math",
    grade: "初一",
    source_type: "exam_paper",
    source_name: "期中考试",
    ocr_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？请列方程。",
    normalized_question_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？请列方程。",
    student_answer: "17 - 8 = 9",
    knowledge_points: ["一元一次方程", "等量关系"],
    main_error_type: "方法性错误",
    secondary_error_types: ["审题性错误"],
    mastery_status: "not_mastered",
    review_due_at: "2026-05-23T00:00:00.000Z",
    needs_user_review: false,
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z"
  },
  {
    id: "mistake_002",
    student_id: sampleProfile.id,
    subject: "math",
    grade: "初一",
    source_type: "homework",
    source_name: "周末作业",
    ocr_text: "解方程 3x - 7 = 11。",
    normalized_question_text: "解方程 3x - 7 = 11。",
    student_answer: "3x = 4, x = 4/3",
    knowledge_points: ["一元一次方程", "移项变号"],
    main_error_type: "过程性错误",
    secondary_error_types: ["符号错误"],
    mastery_status: "partially_mastered",
    review_due_at: "2026-05-26T00:00:00.000Z",
    needs_user_review: false,
    created_at: "2026-05-21T00:00:00.000Z",
    updated_at: "2026-05-21T00:00:00.000Z"
  }
];

export const sampleAnalyses: AIAnalysis[] = [
  {
    id: "analysis_001",
    mistake_id: "mistake_001",
    main_error_type: "方法性错误",
    secondary_error_types: ["审题性错误"],
    error_summary: "这道题主要错在没有找准等量关系。",
    wrong_step_location: "你把“剩下 17 米”当成了要减掉的数量。",
    correct_solution_steps: ["设原来长 x 米。", "根据原长 - 剪去 = 剩下，列 x - 8 = 17。", "解得 x = 25。"],
    avoidance_tip: "遇到应用题先圈出总量、部分量和问题，再写等量关系。",
    student_friendly_explanation: "不是你不会算，而是关系找反了。",
    confidence: 0.86,
    needs_human_review: false,
    model_provider: "mock",
    model_name: "deterministic-math-mock",
    created_at: "2026-05-23T00:00:00.000Z"
  }
];

export const sampleGeneratedQuestions: GeneratedQuestion[] = [
  {
    id: "gq_001",
    mistake_id: "mistake_001",
    question_text: "一根彩带剪去 6 米后还剩 14 米，原来长多少米？请列方程。",
    difficulty: "basic",
    question_type: "same_pattern",
    estimated_time_seconds: 90,
    answer: "x = 20",
    solution_steps: ["设原来长 x 米。", "列 x - 6 = 14。", "解得 x = 20。"],
    knowledge_points: ["一元一次方程"],
    target_error_type: "方法性错误",
    why_related_to_original_mistake: "同样检查是否能把原长、剪去和剩下放进正确关系。",
    verification_status: "passed",
    created_at: "2026-05-23T00:00:00.000Z"
  },
  {
    id: "gq_002",
    mistake_id: "mistake_001",
    question_text: "一本书读了 30 页后，还剩全书的 2/3。全书一共有多少页？",
    difficulty: "standard",
    question_type: "condition_change",
    estimated_time_seconds: 150,
    answer: "x = 90",
    solution_steps: ["设全书 x 页。", "已读页数是全书的 1/3。", "列 x/3 = 30。", "解得 x = 90。"],
    knowledge_points: ["一元一次方程"],
    target_error_type: "方法性错误",
    why_related_to_original_mistake: "条件变成分率，仍然要先找准等量关系。",
    verification_status: "passed",
    created_at: "2026-05-23T00:00:00.000Z"
  },
  {
    id: "gq_003",
    mistake_id: "mistake_001",
    question_text: "甲数比乙数的 2 倍少 5，甲数是 19。乙数是多少？",
    difficulty: "standard",
    question_type: "trap",
    estimated_time_seconds: 150,
    answer: "x = 12",
    solution_steps: ["设乙数为 x。", "列 2x - 5 = 19。", "解得 x = 12。"],
    knowledge_points: ["一元一次方程"],
    target_error_type: "方法性错误",
    why_related_to_original_mistake: "容易把“少 5”写反，用来检测关系方向错误是否复发。",
    verification_status: "passed",
    created_at: "2026-05-23T00:00:00.000Z"
  }
];

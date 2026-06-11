import { z } from "zod";
import { gradeOptions, primaryErrorTypes, stageOptions } from "./taxonomy.js";

export const StageSchema = z.enum(stageOptions);
export const GradeSchema = z.enum(gradeOptions);
export const PrimaryErrorTypeSchema = z.enum(primaryErrorTypes);
export const DeepSeekModelSchema = z.enum(["deepseek-v4-pro", "deepseek-v4-flash"]);

export const MasteryStatusSchema = z.enum([
  "pending_analysis",
  "analyzed",
  "pending_practice",
  "practicing",
  "not_mastered",
  "partially_mastered",
  "mastered",
  "review_due",
  "consolidated",
  "relapsed"
]);

export const VerificationStatusSchema = z.enum(["pending", "passed", "failed"]);
export const PracticeGradingStatusSchema = z.enum(["graded", "ungraded"]);
export const BackupAssetTypeSchema = z.enum(["original_image", "cropped_image", "student_pdf", "answer_pdf", "test_paper_manifest"]);
export const TestPaperJobStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export const StudentProfileSchema = z.object({
  id: z.string(),
  nickname: z.string().min(1),
  stage: StageSchema,
  grade: GradeSchema,
  textbook_version: z.string().optional(),
  created_at: z.string()
});

export const MistakeSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  subject: z.literal("math"),
  grade: GradeSchema,
  source_type: z.enum(["exam_paper", "homework", "quiz", "other"]).default("exam_paper"),
  source_name: z.string().optional(),
  original_image_uri: z.string().optional(),
  cropped_image_uri: z.string().optional(),
  ocr_text: z.string().default(""),
  normalized_question_text: z.string().default(""),
  student_answer: z.string().default(""),
  correct_answer: z.string().optional(),
  knowledge_points: z.array(z.string()).min(1),
  main_error_type: PrimaryErrorTypeSchema.optional(),
  secondary_error_types: z.array(z.string()).max(2).default([]),
  mastery_status: MasteryStatusSchema,
  review_due_at: z.string().optional(),
  needs_user_review: z.boolean().default(false),
  created_at: z.string(),
  updated_at: z.string()
});

export const AIAnalysisSchema = z.object({
  id: z.string(),
  mistake_id: z.string(),
  main_error_type: PrimaryErrorTypeSchema,
  secondary_error_types: z.array(z.string()).max(2).default([]),
  error_summary: z.string().min(1),
  wrong_step_location: z.string().min(1),
  correct_solution_steps: z.array(z.string()).min(1),
  avoidance_tip: z.string().min(1),
  student_friendly_explanation: z.string().min(1),
  confidence: z.number().min(0).max(1),
  needs_human_review: z.boolean(),
  model_provider: z.string(),
  model_name: z.string(),
  created_at: z.string()
});

export const GeneratedQuestionSchema = z.object({
  id: z.string(),
  mistake_id: z.string(),
  question_text: z.string().min(1),
  question_latex: z.string().optional(),
  choice_answer_type: z.enum(["single", "multiple"]).optional(),
  choice_options: z.array(z.object({
    label: z.string().min(1),
    text: z.string().min(1)
  })).optional(),
  difficulty: z.enum(["basic", "standard", "challenge"]),
  question_type: z.enum(["same_pattern", "condition_change", "trap", "number_change", "integrated"]),
  estimated_time_seconds: z.number().int().positive(),
  answer: z.string().min(1),
  solution_steps: z.array(z.string()).min(1),
  knowledge_points: z.array(z.string()).min(1),
  target_error_type: z.string().min(1),
  why_related_to_original_mistake: z.string().min(1),
  verification_status: VerificationStatusSchema,
  created_at: z.string()
});

export const PracticeAttemptSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  mistake_id: z.string(),
  generated_question_id: z.string(),
  answer_text: z.string(),
  grading_status: PracticeGradingStatusSchema.default("graded"),
  is_correct: z.boolean().nullable(),
  error_type_if_wrong: z.string().nullable(),
  graded_by: z.enum(["ai", "manual"]).nullable(),
  feedback: z.string(),
  grading_error: z.string().optional(),
  created_at: z.string()
});

export const TestPaperQuestionSchema = z.object({
  id: z.string(),
  question_text: z.string().min(1),
  question_latex: z.string().optional(),
  difficulty: z.enum(["basic", "standard", "challenge"]),
  answer: z.string().min(1),
  solution_steps: z.array(z.string()).min(1),
  knowledge_points: z.array(z.string()).min(1),
  target_error_type: z.string().min(1),
  source_mistake_ids: z.array(z.string()).default([])
});

export const LatexJobHandoffSchema = z.object({
  id: z.string(),
  workspace_path: z.string(),
  manifest_path: z.string(),
  status: TestPaperJobStatusSchema,
  progress_message: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  expected_outputs: z.object({
    student_pdf_path: z.string(),
    answer_pdf_path: z.string()
  }),
  output_paths: z.object({
    student_pdf_path: z.string().optional(),
    answer_pdf_path: z.string().optional()
  }).default({}),
  files: z.object({
    manifest_exists: z.boolean(),
    student_pdf_exists: z.boolean(),
    answer_pdf_exists: z.boolean()
  }).optional(),
  failure_reason: z.string().optional()
});

export const TestPaperSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  title: z.string(),
  filters: z.object({
    time_range_days: z.number().int().positive(),
    knowledge_points: z.array(z.string()),
    error_types: z.array(z.string()),
    mastery_statuses: z.array(MasteryStatusSchema)
  }),
  question_count: z.number().int().positive(),
  student_pdf_url: z.string(),
  answer_pdf_url: z.string(),
  questions: z.array(TestPaperQuestionSchema).default([]),
  latex_job: LatexJobHandoffSchema.optional(),
  generation_manifest_url: z.string().optional(),
  created_at: z.string()
});

export const NotebookBackupAssetSchema = z.object({
  id: z.string(),
  type: BackupAssetTypeSchema,
  source_uri: z.string(),
  backup_path: z.string(),
  owner_id: z.string()
});

export const NotebookBackupManifestSchema = z.object({
  version: z.literal(1),
  exported_at: z.string(),
  notebook_state: z.unknown(),
  assets: z.array(NotebookBackupAssetSchema)
});

export const CreateMistakeRequestSchema = z.object({
  student_id: z.string(),
  grade: GradeSchema,
  image_uri: z.string().optional(),
  cropped_image_uri: z.string().optional(),
  ocr_text: z.string().default(""),
  normalized_question_text: z.string().optional(),
  student_answer: z.string().default(""),
  source_name: z.string().optional(),
  knowledge_points: z.array(z.string()).optional()
});

export const OcrRequestSchema = z.object({
  image_base64: z.string().min(1),
  language_type: z.string().default("CHN_ENG")
});

export const OcrResultSchema = z.object({
  raw_text: z.string(),
  normalized_text: z.string(),
  math_latex: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  needs_user_review: z.boolean(),
  provider: z.string(),
  words: z.array(z.string()),
  log_id: z.string().optional()
});

export const GeneratePracticeRequestSchema = z.object({
  count: z.union([z.literal(3), z.literal(5)]).default(3),
  difficulty_mode: z.enum(["adaptive", "basic", "standard", "challenge"]).default("adaptive"),
  avoid_question_texts: z.array(z.string()).default([]),
  model: DeepSeekModelSchema.optional()
});

export const AnalyzeMistakeRequestSchema = z.object({
  model: DeepSeekModelSchema.optional()
});

export const PracticeAttemptRequestSchema = z.object({
  student_id: z.string(),
  question_id: z.string().optional(),
  question: GeneratedQuestionSchema.optional(),
  answer_text: z.string(),
  practice_total: z.union([z.literal(3), z.literal(5)]).default(3),
  model: DeepSeekModelSchema.optional()
}).refine((value) => Boolean(value.question_id || value.question), {
  message: "question_id or question is required",
  path: ["question"]
});

export const CreateTestPaperRequestSchema = z.object({
  student_id: z.string(),
  question_count: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20)
  ]).default(10),
  difficulty_mode: z.enum(["adaptive", "basic", "standard", "challenge"]).default("adaptive"),
  filters: z.object({
    time_range_days: z.number().int().positive().default(30),
    knowledge_points: z.array(z.string()).default([]),
    error_types: z.array(z.string()).default([]),
    mastery_statuses: z.array(MasteryStatusSchema).default(["not_mastered", "partially_mastered"])
  }),
  source_mistakes: z.array(MistakeSchema).default([]),
  include_answer_pdf: z.boolean().default(false)
});

export type StudentProfile = z.infer<typeof StudentProfileSchema>;
export type Mistake = z.infer<typeof MistakeSchema>;
export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type PracticeAttempt = z.infer<typeof PracticeAttemptSchema>;
export type TestPaperQuestion = z.infer<typeof TestPaperQuestionSchema>;
export type LatexJobHandoff = z.infer<typeof LatexJobHandoffSchema>;
export type TestPaper = z.infer<typeof TestPaperSchema>;
export type NotebookBackupAsset = z.infer<typeof NotebookBackupAssetSchema>;
export type NotebookBackupManifest = z.infer<typeof NotebookBackupManifestSchema>;
export type CreateMistakeRequest = z.infer<typeof CreateMistakeRequestSchema>;
export type OcrRequest = z.infer<typeof OcrRequestSchema>;
export type OcrResult = z.infer<typeof OcrResultSchema>;
export type GeneratePracticeRequest = z.infer<typeof GeneratePracticeRequestSchema>;
export type AnalyzeMistakeRequest = z.infer<typeof AnalyzeMistakeRequestSchema>;
export type PracticeAttemptRequest = z.infer<typeof PracticeAttemptRequestSchema>;
export type CreateTestPaperRequest = z.infer<typeof CreateTestPaperRequestSchema>;
export type MasteryStatus = z.infer<typeof MasteryStatusSchema>;
export type DeepSeekModel = z.infer<typeof DeepSeekModelSchema>;
export type PracticeGradingStatus = z.infer<typeof PracticeGradingStatusSchema>;

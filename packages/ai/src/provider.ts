import type {
  AIAnalysis,
  DeepSeekModel,
  GeneratedQuestion,
  Mistake,
  PracticeAttempt,
  TestPaperQuestion
} from "@correction-notebook/shared";

export type AnalyzeMistakeInput = {
  student_profile: {
    grade: string;
    stage?: string;
  };
  mistake: Mistake;
  model?: DeepSeekModel;
};

export type GeneratePracticeInput = {
  mistake: Mistake;
  count: 3 | 5;
  difficulty_mode: "adaptive" | "basic" | "standard" | "challenge";
  model?: DeepSeekModel;
};

export type GradeAnswerInput = {
  question: GeneratedQuestion;
  answer_text: string;
  manual_is_correct?: boolean;
  model?: DeepSeekModel;
};

export type GenerateTestPaperInput = {
  student_profile: {
    grade: string;
    stage?: string;
  };
  question_count: 5 | 10 | 15 | 20;
  difficulty_mode: "adaptive" | "basic" | "standard" | "challenge";
  knowledge_distribution: Array<{ knowledge_point: string; count: number }>;
  error_distribution: Array<{ error_type: string; count: number }>;
  source_mistakes: Mistake[];
  model?: DeepSeekModel;
};

export type VerifyMathInput = {
  question: Omit<GeneratedQuestion, "verification_status">;
  model?: DeepSeekModel;
};

export type VerifyMathOutput = {
  verification_status: "passed" | "failed";
  reason: string;
};

export interface LLMProvider {
  analyzeMistake(input: AnalyzeMistakeInput): Promise<AIAnalysis>;
  generatePractice(input: GeneratePracticeInput): Promise<GeneratedQuestion[]>;
  gradeAnswer(input: GradeAnswerInput): Promise<Pick<PracticeAttempt, "is_correct" | "feedback" | "error_type_if_wrong" | "graded_by">>;
  generateTestPaper(input: GenerateTestPaperInput): Promise<TestPaperQuestion[]>;
  verifyMath(input: VerifyMathInput): Promise<VerifyMathOutput>;
}

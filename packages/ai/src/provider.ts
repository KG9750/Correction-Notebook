import type {
  AIAnalysis,
  DeepSeekModel,
  GeneratedQuestion,
  Mistake,
  PracticeAttempt
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
  verifyMath(input: VerifyMathInput): Promise<VerifyMathOutput>;
}

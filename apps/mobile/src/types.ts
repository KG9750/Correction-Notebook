import type { AIAnalysis, DeepSeekModel, GeneratedQuestion, Mistake, PracticeAttempt, StudentProfile, TestPaper } from "@correction-notebook/shared";

export type AppSection = "home" | "capture" | "notebook" | "collection" | "paper" | "report" | "settings";

export type AppSettings = {
  deepseekModel: DeepSeekModel;
  practiceCount: 3 | 5;
  practiceDifficulty: "adaptive" | "basic" | "standard" | "challenge";
};

export type LocalQuestionAttempt = PracticeAttempt & {
  questionText: string;
};

export type NotebookState = {
  profile: StudentProfile;
  activeSection: AppSection;
  selectedMistakeId: string;
  enrichingMistakeId: string | null;
  archivedMistakeIds: string[];
  mistakes: Mistake[];
  analyses: AIAnalysis[];
  generatedQuestions: GeneratedQuestion[];
  attempts: LocalQuestionAttempt[];
  papers: TestPaper[];
  settings: AppSettings;
};

import type { AIAnalysis, GeneratedQuestion, Mistake, PracticeAttempt, StudentProfile, TestPaper } from "@correction-notebook/shared";

export type AppSection = "home" | "capture" | "notebook" | "paper" | "report";

export type LocalQuestionAttempt = PracticeAttempt & {
  questionText: string;
};

export type NotebookState = {
  profile: StudentProfile;
  activeSection: AppSection;
  selectedMistakeId: string;
  mistakes: Mistake[];
  analyses: AIAnalysis[];
  generatedQuestions: GeneratedQuestion[];
  attempts: LocalQuestionAttempt[];
  papers: TestPaper[];
};

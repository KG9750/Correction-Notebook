import type {
  AIAnalysis,
  GeneratedQuestion,
  Mistake,
  PracticeAttempt,
  TestPaper
} from "@correction-notebook/shared";

export type AppStore = {
  mistakes: Map<string, Mistake>;
  analyses: Map<string, AIAnalysis>;
  generatedQuestions: Map<string, GeneratedQuestion>;
  practiceAttempts: Map<string, PracticeAttempt>;
  testPapers: Map<string, TestPaper>;
};

export function createMemoryStore(seed?: Partial<AppStore>): AppStore {
  return {
    mistakes: seed?.mistakes ?? new Map(),
    analyses: seed?.analyses ?? new Map(),
    generatedQuestions: seed?.generatedQuestions ?? new Map(),
    practiceAttempts: seed?.practiceAttempts ?? new Map(),
    testPapers: seed?.testPapers ?? new Map()
  };
}

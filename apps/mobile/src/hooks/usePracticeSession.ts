import { useEffect, useMemo, useState } from "react";
import type { GeneratedQuestion, PracticeAttempt } from "@correction-notebook/shared";
import type { NotebookState } from "../types";

export function usePracticeSession(input: {
  selectedMistakeId: string;
  visibleQuestions: GeneratedQuestion[];
  visibleQuestionSignature: string;
  attempts: NotebookState["attempts"];
  requiredCount: 3 | 5;
  practiceGenerationStatus: "generating" | "failed" | undefined;
  onAttempt: (question: GeneratedQuestion, answer: string) => Promise<PracticeAttempt>;
}) {
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({});
  const [practiceResults, setPracticeResults] = useState<Record<string, PracticeAttempt>>({});
  const [isBatchGrading, setIsBatchGrading] = useState(false);
  const latestPracticeAttemptByQuestion = useMemo(
    () => getLatestAttemptByQuestion(input.visibleQuestions, input.attempts),
    [input.visibleQuestions, input.attempts]
  );
  const hasRequiredPracticeQuestions = input.visibleQuestions.length >= input.requiredCount;
  const practiceCompletion = getPracticeCompletion(input.visibleQuestions, input.attempts, input.requiredCount);
  const batchPracticeSummary = getPracticeBatchSummary(
    input.visibleQuestions,
    input.requiredCount,
    latestPracticeAttemptByQuestion,
    practiceResults,
    isBatchGrading
  );
  const answeredPracticeCount = input.visibleQuestions.filter((question) => Boolean(
    practiceAnswers[question.id] ||
    practiceResults[question.id] ||
    latestPracticeAttemptByQuestion.get(question.id)
  )).length;
  const allPracticeAnswered = hasRequiredPracticeQuestions && answeredPracticeCount === input.visibleQuestions.length;

  useEffect(() => {
    setPracticeAnswers({});
    setPracticeResults({});
    setIsBatchGrading(false);
  }, [input.selectedMistakeId, input.visibleQuestionSignature]);

  useEffect(() => {
    if (input.practiceGenerationStatus !== "generating") return;
    setPracticeAnswers({});
    setPracticeResults({});
    setIsBatchGrading(false);
  }, [input.practiceGenerationStatus]);

  const updatePracticeAnswer = (questionId: string, answer: string) => {
    setPracticeAnswers((current) => ({ ...current, [questionId]: answer }));
    setPracticeResults((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  };

  const gradeAllPractice = () => {
    if (isBatchGrading || !allPracticeAnswered) return;
    const submittedAnswers = Object.fromEntries(
      input.visibleQuestions.map((question) => [question.id, practiceAnswers[question.id] || "未填写"])
    );
    setIsBatchGrading(true);
    setPracticeResults({});
    Promise.all(
      input.visibleQuestions.map((question) => input.onAttempt(question, submittedAnswers[question.id] || "未填写"))
    )
      .then((attempts) => {
        const nextResults: Record<string, PracticeAttempt> = {};
        attempts.forEach((attempt) => {
          nextResults[attempt.generated_question_id] = attempt;
        });
        setPracticeAnswers((current) => ({ ...current, ...submittedAnswers }));
        setPracticeResults(nextResults);
      })
      .finally(() => setIsBatchGrading(false));
  };

  return {
    practiceAnswers,
    practiceResults,
    isBatchGrading,
    latestPracticeAttemptByQuestion,
    hasRequiredPracticeQuestions,
    practiceCompletion,
    batchPracticeSummary,
    answeredPracticeCount,
    allPracticeAnswered,
    updatePracticeAnswer,
    gradeAllPractice
  };
}

function getPracticeCompletion(questions: GeneratedQuestion[], attempts: NotebookState["attempts"], requiredCount: number) {
  if (questions.length < requiredCount) return { allAnswered: false, allCorrect: false };

  const latestAttemptByQuestion = getLatestAttemptByQuestion(questions, attempts);
  const latestAttempts = questions.map((question) => latestAttemptByQuestion.get(question.id));
  const allAnswered = latestAttempts.every((attempt) => attempt?.grading_status === "graded");
  const allCorrect = allAnswered && latestAttempts.every((attempt) => attempt?.is_correct === true);

  return { allAnswered, allCorrect };
}

function getPracticeBatchSummary(
  questions: GeneratedQuestion[],
  requiredCount: number,
  latestAttemptByQuestion: Map<string, NotebookState["attempts"][number]>,
  practiceResults: Record<string, PracticeAttempt>,
  isBatchGrading: boolean
): { text: string; tone: "correct" | "wrong" | "neutral" } | undefined {
  if (questions.length === 0) return undefined;
  if (questions.length < requiredCount) {
    return { text: `当前只有 ${questions.length}/${requiredCount} 道有效变式练习，请刷新生成。`, tone: "wrong" };
  }
  if (isBatchGrading) return { text: "判卷中…", tone: "neutral" };

  const attempts = questions.map((question) => practiceResults[question.id] ?? latestAttemptByQuestion.get(question.id));
  if (attempts.some((attempt) => !attempt)) return undefined;
  if (attempts.some((attempt) => attempt?.grading_status !== "graded")) {
    return { text: "有题暂未批改", tone: "wrong" };
  }

  const wrongCount = attempts.filter((attempt) => attempt?.is_correct === false).length;
  if (wrongCount === 0) return { text: "全部正确！", tone: "correct" };
  if (wrongCount === 1) return { text: "答错一题！", tone: "wrong" };
  return { text: `答错${wrongCount}题！`, tone: "wrong" };
}

function getLatestAttemptByQuestion(questions: GeneratedQuestion[], attempts: NotebookState["attempts"]) {
  const questionIds = new Set(questions.map((question) => question.id));
  const latestAttemptByQuestion = new Map<string, NotebookState["attempts"][number]>();
  attempts.forEach((attempt) => {
    if (questionIds.has(attempt.generated_question_id)) {
      latestAttemptByQuestion.set(attempt.generated_question_id, attempt);
    }
  });
  return latestAttemptByQuestion;
}

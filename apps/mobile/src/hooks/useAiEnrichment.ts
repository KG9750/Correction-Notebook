import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AIAnalysis, GeneratedQuestion, Mistake } from "@correction-notebook/shared";
import { analyzeMistakeWithServerAI, enrichMistakeWithServerAI, type EnrichMistakeResult } from "../api/enrich";
import { replaceMistakeAI } from "../notebook-state";
import type { NotebookState } from "../types";

export function useAiEnrichment(
  state: NotebookState,
  setState: (updater: (current: NotebookState) => NotebookState) => void
) {
  const [analysisRefreshStatus, setAnalysisRefreshStatus] = useState<Record<string, "generating" | "failed">>({});
  const [analysisRefreshError, setAnalysisRefreshError] = useState<Record<string, string>>({});
  const [practiceGenerationStatus, setPracticeGenerationStatus] = useState<Record<string, "generating" | "failed">>({});
  const [practiceGenerationError, setPracticeGenerationError] = useState<Record<string, string>>({});
  const enrichmentInFlightRef = useRef<Set<string>>(new Set());

  const refreshPractice = (mistake: Mistake) => {
    const existingQuestionTexts = state.generatedQuestions
      .filter((question) => question.mistake_id === mistake.id)
      .map((question) => question.question_text);
    setPracticeGenerating(mistake.id, setPracticeGenerationStatus, setPracticeGenerationError);
    enrichMistakeWithServerAI({
      studentId: state.profile.id,
      grade: state.profile.grade,
      ocrText: mistake.normalized_question_text || mistake.ocr_text,
      studentAnswer: mistake.student_answer,
      imageUri: mistake.cropped_image_uri ?? mistake.original_image_uri,
      avoidQuestionTexts: existingQuestionTexts,
      settings: state.settings
    }).then((result) => {
      applyPracticeResult(result, mistake.id, setState, setPracticeGenerationStatus, setPracticeGenerationError);
    }).catch((err: unknown) => {
      failPractice(mistake.id, err, setPracticeGenerationStatus, setPracticeGenerationError);
      console.error("[practice] Refresh practice failed:", err);
    });
  };

  const refreshAnalysis = (mistake: Mistake) => {
    setAnalysisRefreshStatus((status) => ({ ...status, [mistake.id]: "generating" }));
    setAnalysisRefreshError((errors) => {
      const nextErrors = { ...errors };
      delete nextErrors[mistake.id];
      return nextErrors;
    });
    analyzeMistakeWithServerAI({
      studentId: state.profile.id,
      grade: state.profile.grade,
      ocrText: mistake.normalized_question_text || mistake.ocr_text,
      studentAnswer: mistake.student_answer,
      imageUri: mistake.cropped_image_uri ?? mistake.original_image_uri,
      settings: state.settings
    }).then((analysisResponse) => {
      setAnalysisRefreshStatus((status) => {
        const nextStatus = { ...status };
        delete nextStatus[mistake.id];
        return nextStatus;
      });
      const analysis: AIAnalysis = {
        ...analysisResponse,
        id: analysisResponse.analysis_id,
        mistake_id: mistake.id
      };
      setState((current) => replaceMistakeAI(current, mistake.id, analysis, []));
    }).catch((err: unknown) => {
      setAnalysisRefreshStatus((status) => ({ ...status, [mistake.id]: "failed" }));
      setAnalysisRefreshError((errors) => ({ ...errors, [mistake.id]: err instanceof Error ? err.message : "刷新错因讲解失败。" }));
      console.error("[analysis] Refresh analysis failed:", err);
    });
  };

  const clearMistakeAiStatus = (mistakeId: string) => {
    setPracticeGenerationError((errors) => removeKey(errors, mistakeId));
    setAnalysisRefreshStatus((status) => removeKey(status, mistakeId));
    setAnalysisRefreshError((errors) => removeKey(errors, mistakeId));
  };

  useEffect(() => {
    const mistakeId = state.enrichingMistakeId;
    if (!mistakeId || enrichmentInFlightRef.current.has(mistakeId)) return;

    const mistake = state.mistakes.find((item) => item.id === mistakeId);
    if (!mistake) {
      setState((current) => current.enrichingMistakeId === mistakeId ? { ...current, enrichingMistakeId: null } : current);
      return;
    }

    enrichmentInFlightRef.current.add(mistakeId);
    setPracticeGenerating(mistakeId, setPracticeGenerationStatus, setPracticeGenerationError);

    enrichMistakeWithServerAI({
      studentId: state.profile.id,
      grade: state.profile.grade,
      ocrText: mistake.normalized_question_text || mistake.ocr_text,
      studentAnswer: mistake.student_answer,
      imageUri: mistake.cropped_image_uri ?? mistake.original_image_uri,
      settings: state.settings
    }).then((result) => {
      if (!result) {
        setState((prev) => prev.enrichingMistakeId === mistakeId ? { ...prev, enrichingMistakeId: null } : prev);
      }
      applyPracticeResult(result, mistakeId, (updater) => {
        setState((prev) => {
          const cleared = prev.enrichingMistakeId === mistakeId ? { ...prev, enrichingMistakeId: null } : prev;
          return updater(cleared);
        });
      }, setPracticeGenerationStatus, setPracticeGenerationError);
    }).catch((err: unknown) => {
      failPractice(mistakeId, err, setPracticeGenerationStatus, setPracticeGenerationError);
      setState((prev) => prev.enrichingMistakeId === mistakeId ? { ...prev, enrichingMistakeId: null } : prev);
      console.error("[enrich] Server AI enrichment failed:", err);
    }).finally(() => {
      enrichmentInFlightRef.current.delete(mistakeId);
    });
  }, [state.enrichingMistakeId, state.mistakes, state.profile.grade, state.profile.id, state.settings, setState]);

  return {
    analysisRefreshStatus,
    analysisRefreshError,
    practiceGenerationStatus,
    practiceGenerationError,
    refreshAnalysis,
    refreshPractice,
    clearMistakeAiStatus
  };
}

function applyEnrichmentResult(state: NotebookState, mistakeId: string, result: EnrichMistakeResult): NotebookState {
  const analysis: AIAnalysis = {
    ...result.analysis,
    id: result.analysis.analysis_id,
    mistake_id: mistakeId
  };
  const questions: GeneratedQuestion[] = result.questions.map((question) => ({
    ...question,
    mistake_id: mistakeId
  }));
  return replaceMistakeAI(state, mistakeId, analysis, questions);
}

function applyPracticeResult(
  result: EnrichMistakeResult | undefined,
  mistakeId: string,
  setState: (updater: (current: NotebookState) => NotebookState) => void,
  setPracticeGenerationStatus: Dispatch<SetStateAction<Record<string, "generating" | "failed">>>,
  setPracticeGenerationError: Dispatch<SetStateAction<Record<string, string>>>
) {
  if (!result) {
    setPracticeGenerationStatus((status) => ({ ...status, [mistakeId]: "failed" }));
    setPracticeGenerationError((errors) => ({ ...errors, [mistakeId]: "服务端没有返回生成结果。" }));
    return;
  }

  setPracticeGenerationStatus((status) => {
    const nextStatus = { ...status };
    if (result.questions.length > 0) {
      delete nextStatus[mistakeId];
    } else {
      nextStatus[mistakeId] = "failed";
    }
    return nextStatus;
  });
  if (result.questions.length === 0) {
    setPracticeGenerationError((errors) => ({ ...errors, [mistakeId]: result.practiceError ?? "模型没有返回可用题目。" }));
  }
  setState((prev) => applyEnrichmentResult(prev, mistakeId, result));
}

function setPracticeGenerating(
  mistakeId: string,
  setPracticeGenerationStatus: Dispatch<SetStateAction<Record<string, "generating" | "failed">>>,
  setPracticeGenerationError: Dispatch<SetStateAction<Record<string, string>>>
) {
  setPracticeGenerationStatus((status) => ({ ...status, [mistakeId]: "generating" }));
  setPracticeGenerationError((errors) => removeKey(errors, mistakeId));
}

function failPractice(
  mistakeId: string,
  error: unknown,
  setPracticeGenerationStatus: Dispatch<SetStateAction<Record<string, "generating" | "failed">>>,
  setPracticeGenerationError: Dispatch<SetStateAction<Record<string, string>>>
) {
  setPracticeGenerationStatus((status) => ({ ...status, [mistakeId]: "failed" }));
  setPracticeGenerationError((errors) => ({ ...errors, [mistakeId]: error instanceof Error ? error.message : "生成变式练习失败。" }));
}

function removeKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

import { useEffect, useState } from "react";
import { createFreshTestPaper, getTestPaperStatus } from "../api/enrich";
import {
  createPreviewTestPaper,
  recordTestPaper,
  replaceTestPaperLatexJob
} from "../notebook-state";
import type { NotebookState } from "../types";
import type { Mistake } from "@correction-notebook/shared";

export function useTestPaperJob(
  state: NotebookState,
  setState: (updater: (current: NotebookState) => NotebookState) => void
) {
  const [paperGenerationStatus, setPaperGenerationStatus] = useState<"idle" | "generating" | "failed">("idle");
  const [paperGenerationError, setPaperGenerationError] = useState("");
  const latestPaper = state.papers[0];

  const createPaper = () => {
    if (paperGenerationStatus === "generating") return;
    setState((current) => ({ ...current, activeSection: "paper" }));
    setPaperGenerationStatus("generating");
    setPaperGenerationError("");
    createFreshTestPaper({
      studentId: state.profile.id,
      questionCount: 10,
      difficultyMode: state.settings.practiceDifficulty,
      includeAnswerPdf: true,
      sourceMistakes: getTestPaperSourceMistakes(state)
    }).then((result) => {
      setState((current) => recordTestPaper(current, result.paper));
      setPaperGenerationStatus("idle");
    }).catch((error: unknown) => {
      setState((current) => {
        const preview = createPreviewTestPaper(current);
        return preview ? recordTestPaper(current, preview) : current;
      });
      setPaperGenerationStatus("failed");
      const reason = error instanceof Error ? error.message : "复测卷生成失败。";
      setPaperGenerationError(`${reason}。如页面出现非正式预览，可先用于检查题面；正式复测卷需等待 DeepSeek V4 和 Claude Code LaTeX 任务恢复。`);
    });
  };

  useEffect(() => {
    if (state.activeSection !== "paper") return;
    if (!latestPaper?.latex_job || latestPaper.student_pdf_url.startsWith("local-preview://")) return;
    if (latestPaper.latex_job.status === "completed" || latestPaper.latex_job.status === "failed") return;

    let cancelled = false;
    const refresh = () => {
      getTestPaperStatus(latestPaper.id)
        .then((result) => {
          if (cancelled) return;
          setState((current) => replaceTestPaperLatexJob(current, result.paper_id, result.latex_job));
          setPaperGenerationError("");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setPaperGenerationError(error instanceof Error ? error.message : "复测卷任务状态刷新失败。");
        });
    };

    refresh();
    const intervalId = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [latestPaper?.id, latestPaper?.latex_job?.status, latestPaper?.student_pdf_url, state.activeSection, setState]);

  return { createPaper, paperGenerationStatus, paperGenerationError };
}

function getTestPaperSourceMistakes(state: NotebookState): Mistake[] {
  const targetStatuses = new Set(["not_mastered", "partially_mastered", "relapsed"]);
  const active = state.mistakes.filter((mistake) => !state.archivedMistakeIds.includes(mistake.id));
  const focused = active.filter((mistake) => targetStatuses.has(mistake.mastery_status));
  return focused.length > 0 ? focused : active;
}

import type { NotebookState } from "../types";

export function serializeNotebookStateForArchive(state: NotebookState): string {
  return JSON.stringify({ ...state, enrichingMistakeId: null });
}

export function parseArchivedNotebookState(raw: string): NotebookState | undefined {
  try {
    return JSON.parse(raw) as NotebookState;
  } catch {
    return undefined;
  }
}

export type TextSelection = {
  start: number;
  end: number;
};

export function insertFillBlank(text: string, selection: TextSelection, blank = "____"): { text: string; selection: TextSelection } {
  const start = clampSelectionIndex(Math.min(selection.start, selection.end), text.length);
  const end = clampSelectionIndex(Math.max(selection.start, selection.end), text.length);
  const nextText = `${text.slice(0, start)}${blank}${text.slice(end)}`;
  const cursor = start + blank.length;

  return {
    text: nextText,
    selection: { start: cursor, end: cursor }
  };
}

function clampSelectionIndex(value: number, max: number): number {
  if (!Number.isFinite(value)) return max;
  return Math.max(0, Math.min(Math.trunc(value), max));
}

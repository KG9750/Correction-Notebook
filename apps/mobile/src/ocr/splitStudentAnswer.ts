export type SplitOcrResult = {
  questionText: string;
  studentAnswer: string;
};

export function splitStudentAnswerFromOcr(rawText: string): SplitOcrResult {
  const text = rawText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return { questionText: "", studentAnswer: "" };

  const labelSplit = splitByAnswerLabel(text);
  if (labelSplit) return labelSplit;

  const answerAboveLineSplit = splitByAnswerAboveLine(text);
  if (answerAboveLineSplit) return answerAboveLineSplit;

  const inlineBlankSplit = splitByInlineBlankAnswer(text);
  if (inlineBlankSplit) return inlineBlankSplit;

  const lineSplit = splitByLastAnswerLine(text);
  if (lineSplit) return lineSplit;

  const questionMarkSplit = splitAfterQuestionMark(text);
  if (questionMarkSplit) return questionMarkSplit;

  return { questionText: collapseWhitespace(text), studentAnswer: "" };
}

function splitByAnswerLabel(text: string): SplitOcrResult | undefined {
  const match = text.match(/([\s\S]*?)(?:学生(?:原)?答案|学生作答|作答|答案|答|解)\s*[:：]\s*([\s\S]+)$/);
  if (!match) return undefined;
  const questionText = collapseWhitespace(match[1] ?? "");
  const studentAnswer = collapseWhitespace(match[2] ?? "");
  if (!questionText || !isAnswerLike(studentAnswer)) return undefined;
  return { questionText, studentAnswer };
}

function splitByAnswerAboveLine(text: string): SplitOcrResult | undefined {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const ruleIndex = lines.findIndex(isHorizontalAnswerLine);
  if (ruleIndex < 1) return undefined;

  const answerLine = lines[ruleIndex - 1] ?? "";
  const questionLines = lines.slice(0, ruleIndex - 1);
  const suffixLines = lines.slice(ruleIndex + 1);
  const questionText = collapseWhitespace([
    ...questionLines,
    ...(suffixLines.length > 0 ? ["____", ...suffixLines] : [])
  ].join(" "));
  const studentAnswer = collapseWhitespace(answerLine);

  if (!questionText || !isAnswerLike(studentAnswer)) return undefined;
  return { questionText, studentAnswer };
}

function splitByInlineBlankAnswer(text: string): SplitOcrResult | undefined {
  const normalized = collapseWhitespace(text);
  const match = normalized.match(/([\s\S]*?(?:集合|子集)[\s\S]*?共有)\s*([+-]?\d+(?:\.\d+)?)\s*(个非空真子集[\s\S]*)/);
  if (!match) return undefined;

  const prefix = match[1] ?? "";
  const studentAnswer = match[2] ?? "";
  const suffix = match[3] ?? "";
  if (!prefix || !suffix || !isAnswerLike(studentAnswer)) return undefined;

  return {
    questionText: collapseWhitespace(`${prefix}____${suffix}`),
    studentAnswer
  };
}

function splitByLastAnswerLine(text: string): SplitOcrResult | undefined {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;

  const lastLine = lines.at(-1) ?? "";
  const questionText = collapseWhitespace(lines.slice(0, -1).join(" "));
  if (!questionText || !isAnswerLike(lastLine)) return undefined;
  if (!/[？?。；;]/.test(questionText)) return undefined;

  return { questionText, studentAnswer: collapseWhitespace(lastLine) };
}

function splitAfterQuestionMark(text: string): SplitOcrResult | undefined {
  const index = Math.max(text.lastIndexOf("？"), text.lastIndexOf("?"));
  if (index < 0 || index >= text.length - 1) return undefined;

  const questionText = collapseWhitespace(text.slice(0, index + 1));
  const studentAnswer = collapseWhitespace(text.slice(index + 1));
  if (!questionText || !isAnswerLike(studentAnswer)) return undefined;
  if (/^(请|要求|并|用|列)/.test(studentAnswer)) return undefined;

  return { questionText, studentAnswer };
}

function isHorizontalAnswerLine(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 3) return false;
  return /^[＿_—－\-─━―~～·.。]+$/.test(compact);
}

function isAnswerLike(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 120) return false;
  return /[=+\-*/÷×]|[0-9]|[xX]/.test(text);
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*____\s*/g, "____")
    .trim();
}

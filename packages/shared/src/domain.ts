import type { GeneratedQuestion, MasteryStatus, Mistake, PracticeAttempt } from "./schemas.js";
import { defaultKnowledgePoints, primaryErrorTypes } from "./taxonomy.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeErrorTags(input: {
  main?: string;
  secondary?: string[];
}): { main: (typeof primaryErrorTypes)[number]; secondary: string[] } {
  const main = primaryErrorTypes.includes(input.main as (typeof primaryErrorTypes)[number])
    ? (input.main as (typeof primaryErrorTypes)[number])
    : "方法性错误";

  const secondary = [...new Set((input.secondary ?? []).map(normalizeSecondaryErrorTag))]
    .filter((tag) => tag && tag !== main && !isSecondaryRedundantWithMain(main, tag))
    .slice(0, 2);

  return { main, secondary };
}

function normalizeSecondaryErrorTag(tag: string): string {
  const text = tag.trim();
  if (/审题|题意|读题|看错|没看清|不清|理解偏差/.test(text)) return "看错求什么";
  if (/漏.*条件|条件.*漏|少看|忽略/.test(text)) return "漏条件";
  if (/概念|定义/.test(text)) return "概念混淆";
  if (/计算|算错/.test(text)) return "计算错误";
  return text;
}

function isSecondaryRedundantWithMain(main: string, secondary: string): boolean {
  if (main === "审题性错误") return ["看错求什么", "漏条件", "关键词误解", "图表信息提取错误"].includes(secondary);
  if (main === "知识性错误") return ["概念混淆", "公式记错", "定理适用条件不清"].includes(secondary);
  return false;
}

export function initialMistakeStatus(_ocrText?: string): MasteryStatus {
  return "pending_analysis";
}

export function computeMasteryFromPractice(total: 3 | 5, correct: number): MasteryStatus {
  if (total === 3) {
    if (correct === 3) return "mastered";
    if (correct === 2) return "partially_mastered";
    return "not_mastered";
  }

  if (correct >= 4) return "mastered";
  if (correct === 3) return "partially_mastered";
  return "not_mastered";
}

export function gradedPracticeAttempts(attempts: PracticeAttempt[]): PracticeAttempt[] {
  return attempts.filter(
    (attempt) => attempt.grading_status === "graded" && attempt.graded_by === "ai" && attempt.is_correct !== null
  );
}

export function computeMasteryFromGradedAttempts(total: 3 | 5, attempts: PracticeAttempt[]): MasteryStatus {
  const recent = gradedPracticeAttempts(attempts).slice(-total);
  if (recent.length < total) return "practicing";
  return computeMasteryFromPractice(total, recent.filter((attempt) => attempt.is_correct).length);
}

export function hasMasteryConfirmationEvidence(total: 3 | 5, attempts: PracticeAttempt[]): boolean {
  return computeMasteryFromGradedAttempts(total, attempts) === "mastered";
}

export function nextReviewDueForMastery(status: MasteryStatus, from = new Date()): string | undefined {
  if (status === "mastered") return addDays(from, 7);
  if (status === "partially_mastered") return addDays(from, 3);
  if (status === "not_mastered") return addDays(from, 1);
  return undefined;
}

export function reviewPriorityScore(mistake: Mistake, asOf = new Date()): number {
  const statusWeights: Record<MasteryStatus, number> = {
    pending_analysis: 28,
    analyzed: 22,
    pending_practice: 34,
    practicing: 30,
    not_mastered: 55,
    partially_mastered: 35,
    mastered: 8,
    review_due: 40,
    consolidated: 0,
    relapsed: 65
  };

  const createdAgeDays = Math.max(
    0,
    Math.floor((asOf.getTime() - new Date(mistake.created_at).getTime()) / 86_400_000)
  );
  const dueBonus = mistake.review_due_at && new Date(mistake.review_due_at) <= asOf ? 20 : 0;
  const repeatedErrorHint = mistake.secondary_error_types.length > 0 ? 6 : 0;

  return statusWeights[mistake.mastery_status] + dueBonus + repeatedErrorHint + Math.min(createdAgeDays, 14);
}

export function dueReviewMistakes(mistakes: Mistake[], asOf = new Date()): Mistake[] {
  return mistakes
    .filter((mistake) => mistake.mastery_status !== "mastered")
    .filter((mistake) => {
      if (!mistake.review_due_at) return ["pending_analysis", "pending_practice", "practicing", "relapsed"].includes(mistake.mastery_status);
      return new Date(mistake.review_due_at) <= asOf;
    })
    .sort((left, right) => reviewPriorityScore(right, asOf) - reviewPriorityScore(left, asOf));
}

export function defaultKnowledgePointList(points?: string[]): string[] {
  const normalized = [...new Set(points?.filter(Boolean) ?? [])];
  return normalized.length > 0 ? normalized : [...defaultKnowledgePoints];
}

export function filterPassedQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  return questions.filter((question) => question.verification_status === "passed");
}

export function filterPassedChoiceQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  return filterPassedQuestions(questions).filter(isValidChoiceQuestion);
}

export function isValidChoiceQuestion(question: GeneratedQuestion): boolean {
  const options = question.choice_options ?? [];
  if (question.choice_answer_type !== "single" && question.choice_answer_type !== "multiple") return false;
  if (/_{3,}|＿{3,}|-{4,}/.test(question.question_text)) return false;
  if (options.length < 4) return false;
  const optionLabels = new Set(options.map((option) => option.label.trim().toUpperCase()).filter(Boolean));
  if (optionLabels.size !== options.length) return false;

  const answers = question.answer
    .toUpperCase()
    .split(/[,，、\s]+/)
    .map((label) => label.trim())
    .filter(Boolean);
  const uniqueAnswers = [...new Set(answers)];
  if (uniqueAnswers.length !== answers.length) return false;
  if (uniqueAnswers.some((label) => !optionLabels.has(label))) return false;
  if (!isChoiceSolutionConsistentWithAnswer(question, optionLabels, uniqueAnswers)) return false;
  const computedAnswer = computeSetCardinalityChoiceAnswer(question);
  if (computedAnswer && !sameLabelSet(computedAnswer, uniqueAnswers)) return false;
  return question.choice_answer_type === "single" ? uniqueAnswers.length === 1 : uniqueAnswers.length >= 2;
}

function computeSetCardinalityChoiceAnswer(question: GeneratedQuestion): string[] | undefined {
  const normalizedText = normalizeMathText(question.question_text);
  const setMatch = normalizedText.match(/集合\s*[{]\s*([+-]?\d+(?:\.\d+)?)\s*[,，]\s*([A-Z])\s*[,，]\s*\2\s*([+-])\s*([+-]?\d+(?:\.\d+)?)\s*[}]/i);
  const targetCount = parseTargetElementCount(normalizedText);
  const mode = parseSetCardinalityQuestionMode(normalizedText);
  if (!setMatch || !targetCount || !mode) return undefined;

  const fixedValue = Number(setMatch[1]);
  const sign = setMatch[3] === "-" ? -1 : 1;
  const offset = sign * Number(setMatch[4]);
  if (!Number.isFinite(fixedValue) || !Number.isFinite(offset)) return undefined;

  const labels: string[] = [];
  for (const option of question.choice_options ?? []) {
    const optionValue = parseNumericOption(option.text);
    if (optionValue === undefined) continue;

    const values = [fixedValue, optionValue, optionValue + offset].map((value) => normalizeNumberKey(value));
    const hasTargetCount = new Set(values).size === targetCount;
    if ((mode === "possible" && hasTargetCount) || (mode === "impossible" && !hasTargetCount)) {
      labels.push(option.label.trim().toUpperCase());
    }
  }

  return labels.length > 0 ? [...new Set(labels)] : undefined;
}

function parseTargetElementCount(text: string): number | undefined {
  const match = text.match(/恰有\s*([0-9一二两三四五六七八九十]+)\s*个元素/);
  if (!match) return undefined;
  return parseChineseSmallNumber(match[1] ?? "");
}

function parseSetCardinalityQuestionMode(text: string): "possible" | "impossible" | undefined {
  if (/(?:不能取|不可取|不可以取|不能为|不能是|不可能|不能等于)/.test(text)) return "impossible";
  if (/(?:可能是|可能为|可以取|可取|能取|可以为|可以是)/.test(text)) return "possible";
  return undefined;
}

function parseNumericOption(value: string): number | undefined {
  const normalized = normalizeMathText(value);
  const match = normalized.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeNumberKey(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

function parseChineseSmallNumber(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  return map[value];
}

function isChoiceSolutionConsistentWithAnswer(
  question: GeneratedQuestion,
  optionLabels: Set<string>,
  answers: string[]
): boolean {
  const statedAnswer = extractStatedChoiceAnswer(question.solution_steps.join("。"), optionLabels);
  if (!statedAnswer) return true;
  return sameLabelSet(statedAnswer, answers);
}

function extractStatedChoiceAnswer(text: string, optionLabels: Set<string>): string[] | undefined {
  const normalized = normalizeFullWidthLetters(text).toUpperCase();
  const patterns = [
    /(?:正确(?:答案|选项)?|标准答案|答案|应选|故选|所以选|因此选|故正确选项为|故正确答案为)[^A-Z]{0,16}([A-Z](?:\s*(?:,|，|、|和|及|与)\s*[A-Z])*)/g,
    /(?:正确(?:答案|选项)?|标准答案|答案)[^A-Z]{0,16}为[^A-Z]{0,8}([A-Z](?:\s*(?:,|，|、|和|及|与)\s*[A-Z])*)/g
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const labels = parseChoiceLabels(match[1] ?? "", optionLabels);
      if (labels.length > 0) return labels;
    }
  }
  return undefined;
}

function parseChoiceLabels(value: string, optionLabels: Set<string>): string[] {
  const labels = value
    .split(/[,，、\s和及与]+/)
    .map((label) => label.trim())
    .filter((label) => optionLabels.has(label));
  return [...new Set(labels)];
}

function sameLabelSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((label) => rightSet.has(label));
}

function normalizeMathText(value: string): string {
  return normalizeFullWidthLetters(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[｛]/g, "{")
    .replace(/[｝]/g, "}")
    .replace(/[＋]/g, "+")
    .replace(/[－]/g, "-");
}

function normalizeFullWidthLetters(value: string): string {
  return value.replace(/[Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

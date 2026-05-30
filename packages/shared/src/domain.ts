import type { GeneratedQuestion, MasteryStatus, Mistake } from "./schemas.js";
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

export function defaultKnowledgePointList(points?: string[]): string[] {
  const normalized = [...new Set(points?.filter(Boolean) ?? [])];
  return normalized.length > 0 ? normalized : [...defaultKnowledgePoints];
}

export function filterPassedQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  return questions.filter((question) => question.verification_status === "passed");
}

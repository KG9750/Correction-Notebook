import {
  createId,
  nowIso,
  type AIAnalysis,
  type GeneratedQuestion,
  type PracticeAttempt,
  type TestPaperQuestion
} from "@correction-notebook/shared";
import { ProxyAgent } from "undici";
import type { AnalyzeMistakeInput, GeneratePracticeInput, GenerateTestPaperInput, GradeAnswerInput, LLMProvider, VerifyMathInput, VerifyMathOutput } from "./provider.js";

type FetchLike = typeof fetch;

export type DeepSeekProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: FetchLike;
};

function fetchWithProxy(fallback: FetchLike): FetchLike {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxyUrl) return fallback;
  const agent = new ProxyAgent(proxyUrl);
  return (url, init) => fallback(url, { ...init, dispatcher: agent } as RequestInit);
}

const SYSTEM_MATH_TUTOR = `你是一位专业的小学/初中数学辅导老师，擅长分析学生错题并出题训练。

重要规则：
1. 所有回复必须是中文，除了数学公式和数字。
2. 你需要输出的所有 JSON 字段都必须提供，不能省略。
3. 分析要精准具体，不能泛泛而谈。
4. 变式练习题必须和原题是同一知识点、相近考法，但必须改写成选择题，不要生成填空题或解答题。
5. 题目和答案要适合 初一（七年级）左右难度。`;

export class DeepSeekProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.baseUrl = options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1/chat/completions";
    this.model = options.model ?? "deepseek-v4-pro";
    this.fetchImpl = options.fetchImpl ?? fetchWithProxy(fetch);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async analyzeMistake(input: AnalyzeMistakeInput): Promise<AIAnalysis> {
    const mistake = input.mistake;
    const question = mistake.normalized_question_text || mistake.ocr_text;
    const answer = mistake.student_answer || "未填写";

    const prompt = `请分析下面这道错题。

【原题】${question}
【学生答案】${answer}
【年级】${input.student_profile.grade}

请输出严格 JSON（不要带 markdown 代码块标记）：

{
  "main_error_type": "从以下选一个：知识性错误 / 审题性错误 / 方法性错误 / 过程性错误 / 表达性错误",
  "secondary_error_types": ["从以下副标签中选 0-2 个，不能和主错因语义重复：概念混淆 / 公式记错 / 定理适用条件不清 / 漏条件 / 看错求什么 / 关键词误解 / 计算错误 / 符号错误 / 移项变号错误 / 答案不完整"],
  "error_summary": "用 2-3 句话总结错误原因，要引述学生具体写了什么、为什么错了",
  "wrong_step_location": "一句话指出错误发生在哪一步",
  "correct_solution_steps": ["步骤1", "步骤2", "步骤3", "步骤4"],
  "avoidance_tip": "一句具体可操作的避错建议",
  "student_friendly_explanation": "用鼓励的语气告诉学生问题在哪、怎么改，不超过 2 句话",
  "confidence": 0.90
}`;

    const model = input.model ?? this.model;
    const raw = await this.chat(prompt, model);
    const parsed = this.parseJson<RawAnalysis>(raw);

    return {
      id: createId("analysis"),
      mistake_id: mistake.id,
      main_error_type: toErrorType(parsed.main_error_type),
      secondary_error_types: (parsed.secondary_error_types || ["审题性错误"]).slice(0, 2),
      error_summary: parsed.error_summary || `这道"${question.slice(0, 40)}"主要问题在于解题方法。`,
      wrong_step_location: parsed.wrong_step_location || "错误发生在解题前半段。",
      correct_solution_steps: parsed.correct_solution_steps?.length ? parsed.correct_solution_steps : ["审题，明确已知未知。", "选择正确方法。", "逐步计算。", "代回检查。"],
      avoidance_tip: parsed.avoidance_tip || "下次先花 20 秒理清条件再动笔。",
      student_friendly_explanation: parsed.student_friendly_explanation || "找到问题所在，下次一定能做对！",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.88,
      needs_human_review: false,
      model_provider: "deepseek",
      model_name: model,
      created_at: nowIso()
    };
  }

  async generatePractice(input: GeneratePracticeInput): Promise<GeneratedQuestion[]> {
    const mistake = input.mistake;
    const question = mistake.normalized_question_text || mistake.ocr_text;
    const analysis = `${mistake.main_error_type ?? "方法性错误"} — ${mistake.knowledge_points.join("、")}`;
    const avoidText = (input.avoid_question_texts ?? [])
      .filter(Boolean)
      .map((text, index) => `${index + 1}. ${text}`)
      .join("\n") || "无";

    const prompt = `请根据原错题生成 ${input.count} 道变式练习题。

【原题】${question}
【学生答案】${mistake.student_answer || "未填写"}
【错因标签】${analysis}
【难度模式】${input.difficulty_mode}
【题型分布】same_pattern 同型变数、condition_change 条件变更、trap 易错陷阱、number_change 数字变更、integrated 综合题
【本次刷新禁止复用的旧题题面】
${avoidText}

请输出严格 JSON 对象（不要带 markdown 代码块标记）：

{
  "questions": [
    {
      "question_text": "变式题题干，不要把选项写进题干",
      "choice_answer_type": "single / multiple",
      "choice_options": [
        { "label": "A", "text": "选项内容" },
        { "label": "B", "text": "选项内容" },
        { "label": "C", "text": "选项内容" },
        { "label": "D", "text": "选项内容" }
      ],
      "difficulty": "basic / standard / challenge",
      "question_type": "same_pattern / condition_change / trap / number_change / integrated",
      "estimated_time_seconds": 120,
      "answer": "正确选项标签；单选如 A，多选如 A,C",
      "solution_steps": ["步骤1", "步骤2", "步骤3"],
      "knowledge_points": ["知识点"],
      "target_error_type": "针对的错因类型",
      "why_related_to_original_mistake": "一句话说明这道题与原错题的关联"
    }
  ]
}

要求：
1. 每道变式练习必须是选择题，必须明确 choice_answer_type 是 single 或 multiple。
2. 单选题至少 4 个选项，且只有 1 个正确选项；多选题至少 4 个选项，且至少 2 个正确选项。
3. answer 只填写正确选项标签，不要填写完整解答；多选用英文逗号连接，例如 A,C。
4. solution_steps 最后一步必须明确写“故正确选项为 X”，且 X 必须与 answer 字段完全一致；不要出现解析结论与 answer 不一致的题。
5. 如果题目问“不能取 / 不可能 / 不正确 / 不成立”，必须逐个代入所有选项；若有多个选项符合，必须设为 multiple，不能伪装成单选。
6. question_text 里不要出现 ____、横线填空、括号填空；需要作答的内容必须放进 choice_options。
7. 题目必须和原题同一个知识点，但数字、情境、问法要有变化。
8. 如果“禁止复用的旧题题面”不是“无”，本次生成的 question_text 不能与其中任何一题相同或仅改标点、空格。`;

    const raw = await this.chat(prompt, input.model);
    const parsed = this.parseJson<RawQuestion[] | { questions?: RawQuestion[] }>(raw);
    const parsedQuestions = Array.isArray(parsed) ? parsed : parsed.questions;
    const questions = (Array.isArray(parsedQuestions) ? parsedQuestions : []).slice(0, input.count);

    return questions.map((q) => {
      const choiceAnswerType = toChoiceAnswerType(q.choice_answer_type);
      const choiceOptions = normalizeChoiceOptions(q.choice_options);
      const questionText = requireNonEmpty(q.question_text, "practice question_text");
      const solutionSteps = requireStringArray(q.solution_steps, "practice solution_steps");
      const knowledgePoints = requireStringArray(q.knowledge_points, "practice knowledge_points");
      return {
        id: createId("gq"),
        mistake_id: mistake.id,
        question_text: questionText,
        choice_answer_type: choiceAnswerType,
        choice_options: choiceOptions,
        difficulty: toDifficulty(q.difficulty),
        question_type: toQuestionType(q.question_type),
        estimated_time_seconds: typeof q.estimated_time_seconds === "number" ? q.estimated_time_seconds : 120,
        answer: normalizeChoiceAnswer(q.answer, choiceAnswerType, choiceOptions),
        solution_steps: solutionSteps,
        knowledge_points: knowledgePoints,
        target_error_type: requireNonEmpty(q.target_error_type, "practice target_error_type"),
        why_related_to_original_mistake: requireNonEmpty(q.why_related_to_original_mistake, "practice why_related_to_original_mistake"),
        verification_status: "pending",
        created_at: nowIso()
      };
    });
  }

  async gradeAnswer(input: GradeAnswerInput): Promise<Pick<PracticeAttempt, "is_correct" | "feedback" | "error_type_if_wrong" | "graded_by">> {
    const prompt = `请批改这道练习题。

【题目】${input.question.question_text}
【标准答案】${input.question.answer}
【学生答案】${input.answer_text}

请输出严格 JSON：
{
  "is_correct": true或false,
  "feedback": "一句话反馈，正确则鼓励，错误则指出问题",
  "error_type_if_wrong": "如果错误，标注错因类型，否则null"
}`;

    const raw = await this.chat(prompt, input.model);
    const parsed = this.parseJson<RawGrade>(raw);

    return {
      is_correct: Boolean(parsed.is_correct),
      feedback: parsed.feedback || (parsed.is_correct ? "答对了！" : "再看看这道题。"),
      error_type_if_wrong: parsed.is_correct ? null : (parsed.error_type_if_wrong || input.question.target_error_type),
      graded_by: "ai"
    };
  }

  async generateTestPaper(input: GenerateTestPaperInput): Promise<TestPaperQuestion[]> {
    const knowledge = input.knowledge_distribution.map((item) => `${item.knowledge_point}:${item.count}`).join("，") || "暂无";
    const errors = input.error_distribution.map((item) => `${item.error_type}:${item.count}`).join("，") || "暂无";
    const sourceSummary = input.source_mistakes.slice(0, 8).map((mistake, index) => {
      const question = mistake.normalized_question_text || mistake.ocr_text;
      return `${index + 1}. ${question.slice(0, 80)}；错因：${mistake.main_error_type ?? "待分析"}；知识点：${mistake.knowledge_points.join("、")}`;
    }).join("\n");

    const prompt = `请根据学生错题分布，重新生成一份数学复测卷内容。不要复用旧变式题原文。

【年级】${input.student_profile.grade}
【题量】${input.question_count}
【难度】${input.difficulty_mode}
【知识点分布】${knowledge}
【错因分布】${errors}
【来源错题摘要】
${sourceSummary}

请输出严格 JSON 对象（不要带 markdown 代码块标记）：
{
  "questions": [
    {
      "question_text": "新生成题目",
      "question_latex": "可选 LaTeX",
      "difficulty": "basic / standard / challenge",
      "answer": "标准答案",
      "solution_steps": ["步骤1", "步骤2", "步骤3"],
      "knowledge_points": ["知识点"],
      "target_error_type": "要复测的错因",
      "source_mistake_ids": ["关联错题ID"]
    }
  ]
}

要求：题目必须围绕错题知识点分布重新生成，答案和步骤必须可用于答案卷。`;

    const raw = await this.chat(prompt, input.model);
    const parsed = this.parseJson<{ questions?: RawTestPaperQuestion[] } | RawTestPaperQuestion[]>(raw);
    const rawQuestions = Array.isArray(parsed) ? parsed : parsed.questions;

    return (Array.isArray(rawQuestions) ? rawQuestions : []).slice(0, input.question_count).map((question) => ({
      id: createId("tpq"),
      question_text: requireNonEmpty(question.question_text, "test paper question_text"),
      ...(question.question_latex ? { question_latex: question.question_latex } : {}),
      difficulty: toDifficulty(question.difficulty),
      answer: requireNonEmpty(question.answer, "test paper answer"),
      solution_steps: requireStringArray(question.solution_steps, "test paper solution_steps"),
      knowledge_points: requireStringArray(question.knowledge_points, "test paper knowledge_points"),
      target_error_type: requireNonEmpty(question.target_error_type, "test paper target_error_type"),
      source_mistake_ids: question.source_mistake_ids?.length ? question.source_mistake_ids : input.source_mistakes.slice(0, 3).map((mistake) => mistake.id)
    }));
  }

  async verifyMath(input: VerifyMathInput): Promise<VerifyMathOutput> {
    const q = input.question;
    const prompt = `请验证下面这道数学题的正确性：

题文：${q.question_text}
答案：${q.answer}
解法：${(q.solution_steps || []).join(" → ")}

请输出严格 JSON：
{
  "verification_status": "passed 或 failed",
  "reason": "简述验证结果"
}`;

    const raw = await this.chat(prompt, input.model);
    const parsed = this.parseJson<VerifyMathOutput>(raw);

    return {
      verification_status: parsed.verification_status === "passed" || parsed.verification_status === "failed" ? parsed.verification_status : "failed",
      reason: parsed.reason || "AI verification completed"
    };
  }

  private async chat(userPrompt: string, model = this.model): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("DeepSeek API not configured. Set DEEPSEEK_API_KEY.");
    }

    const body = JSON.stringify({
      model: resolveDeepSeekApiModel(model),
      messages: [
        { role: "system", content: SYSTEM_MATH_TUTOR },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 4096
    });

    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`DeepSeek API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`DeepSeek API error: ${data.error.message}`);
    }

    return data.choices?.[0]?.message?.content ?? "";
  }

  private parseJson<T>(raw: string): T {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "");
    }
    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      throw new Error(`DeepSeek returned invalid JSON: ${error instanceof Error ? error.message : "parse_failed"}`);
    }
  }
}

const VALID_ERROR_TYPES = ["知识性错误", "审题性错误", "方法性错误", "过程性错误", "表达性错误", "习惯性错误"] as const;
const VALID_QUESTION_TYPES = ["same_pattern", "condition_change", "trap", "number_change", "integrated"] as const;
const VALID_DIFFICULTIES = ["basic", "standard", "challenge"] as const;

export function resolveDeepSeekApiModel(model: string): string {
  if (model === "deepseek-v4-pro") {
    return process.env.DEEPSEEK_V4_PRO_MODEL ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  }
  if (model === "deepseek-v4-flash") {
    return process.env.DEEPSEEK_V4_FLASH_MODEL ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  }
  return model;
}

type RawAnalysis = {
  main_error_type?: string;
  secondary_error_types?: string[];
  error_summary?: string;
  wrong_step_location?: string;
  correct_solution_steps?: string[];
  avoidance_tip?: string;
  student_friendly_explanation?: string;
  confidence?: number;
};

type RawQuestion = {
  question_text?: string;
  choice_answer_type?: string;
  choice_options?: Array<{ label?: string; text?: string }>;
  difficulty?: string;
  question_type?: string;
  estimated_time_seconds?: number;
  answer?: string;
  solution_steps?: string[];
  knowledge_points?: string[];
  target_error_type?: string;
  why_related_to_original_mistake?: string;
};

function toChoiceAnswerType(value: string | undefined): "single" | "multiple" {
  if (value === "single" || value === "multiple") return value;
  throw new Error("DeepSeek practice question is missing a valid choice_answer_type.");
}

function normalizeChoiceOptions(options: RawQuestion["choice_options"]): Array<{ label: string; text: string }> {
  const normalized = (options ?? [])
    .map((option) => ({
      label: (option.label ?? "").trim().toUpperCase(),
      text: (option.text ?? "").trim()
    }))
    .filter((option) => /^[A-Z]$/.test(option.label) && option.text.length > 0);
  if (normalized.length < 4) throw new Error("DeepSeek practice question has fewer than 4 choice options.");
  return normalized.slice(0, 6);
}

function normalizeChoiceAnswer(
  answer: string | undefined,
  type: "single" | "multiple",
  options: Array<{ label: string; text: string }>
): string {
  const optionLabels = new Set(options.map((option) => option.label));
  const labels = (answer ?? "")
    .toUpperCase()
    .split(/[,，、\s]+/)
    .map((label) => label.trim())
    .filter((label) => optionLabels.has(label));
  if (labels.length === 0) throw new Error("DeepSeek practice question is missing a valid choice answer.");
  const uniqueLabels = [...new Set(labels)];
  return type === "multiple" ? uniqueLabels.join(",") : uniqueLabels[0] ?? "A";
}

function requireNonEmpty(value: string | undefined, field: string): string {
  const text = value?.trim() ?? "";
  if (!text) throw new Error(`DeepSeek output missing ${field}.`);
  return text;
}

function requireStringArray(value: string[] | undefined, field: string): string[] {
  const items = (value ?? []).map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new Error(`DeepSeek output missing ${field}.`);
  return items;
}

type RawTestPaperQuestion = {
  question_text?: string;
  question_latex?: string;
  difficulty?: string;
  answer?: string;
  solution_steps?: string[];
  knowledge_points?: string[];
  target_error_type?: string;
  source_mistake_ids?: string[];
};

function toErrorType(value: string | undefined): typeof VALID_ERROR_TYPES[number] {
  return (VALID_ERROR_TYPES as readonly string[]).includes(value ?? "") ? (value as typeof VALID_ERROR_TYPES[number]) : "方法性错误";
}

function toQuestionType(value: string | undefined): typeof VALID_QUESTION_TYPES[number] {
  return (VALID_QUESTION_TYPES as readonly string[]).includes(value ?? "") ? (value as typeof VALID_QUESTION_TYPES[number]) : "same_pattern";
}

function toDifficulty(value: string | undefined): typeof VALID_DIFFICULTIES[number] {
  return (VALID_DIFFICULTIES as readonly string[]).includes(value ?? "") ? (value as typeof VALID_DIFFICULTIES[number]) : "standard";
}

type RawGrade = {
  is_correct?: boolean;
  feedback?: string;
  error_type_if_wrong?: string | null;
};

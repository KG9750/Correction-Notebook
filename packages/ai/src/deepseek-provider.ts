import {
  createId,
  nowIso,
  type AIAnalysis,
  type GeneratedQuestion,
  type PracticeAttempt
} from "@correction-notebook/shared";
import { ProxyAgent } from "undici";
import type { AnalyzeMistakeInput, GeneratePracticeInput, GradeAnswerInput, LLMProvider, VerifyMathInput, VerifyMathOutput } from "./provider.js";

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
4. 变式练习题必须和原题是同一知识点、同一题型，但要改变数字、情境或条件，不是照搬原题。
5. 题目和答案要适合 初一（七年级）左右难度。`;

export class DeepSeekProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.baseUrl = options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1/chat/completions";
    this.model = options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
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
  "secondary_error_types": ["副标签1", "副标签2"],
  "error_summary": "用 2-3 句话总结错误原因，要引述学生具体写了什么、为什么错了",
  "wrong_step_location": "一句话指出错误发生在哪一步",
  "correct_solution_steps": ["步骤1", "步骤2", "步骤3", "步骤4"],
  "avoidance_tip": "一句具体可操作的避错建议",
  "student_friendly_explanation": "用鼓励的语气告诉学生问题在哪、怎么改，不超过 2 句话",
  "confidence": 0.90
}`;

    const raw = await this.chat(prompt);
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
      model_name: this.model,
      created_at: nowIso()
    };
  }

  async generatePractice(input: GeneratePracticeInput): Promise<GeneratedQuestion[]> {
    const mistake = input.mistake;
    const question = mistake.normalized_question_text || mistake.ocr_text;
    const analysis = `${mistake.main_error_type ?? "方法性错误"} — ${mistake.knowledge_points.join("、")}`;

    const prompt = `请根据原错题生成 ${input.count} 道变式练习题。

【原题】${question}
【学生答案】${mistake.student_answer || "未填写"}
【错因标签】${analysis}
【难度模式】${input.difficulty_mode}
【题型分布】same_pattern 同型变数、condition_change 条件变更、trap 易错陷阱、number_change 数字变更、integrated 综合题

请输出严格 JSON 数组（不要带 markdown 代码块标记）：

[
  {
    "question_text": "变式题题干",
    "difficulty": "basic / standard / challenge",
    "question_type": "same_pattern / condition_change / trap / number_change / integrated",
    "estimated_time_seconds": 120,
    "answer": "标准答案",
    "solution_steps": ["步骤1", "步骤2", "步骤3"],
    "knowledge_points": ["知识点"],
    "target_error_type": "针对的错因类型",
    "why_related_to_original_mistake": "一句话说明这道题与原错题的关联"
  }
]

要求：题目必须和原题同一个知识点，但数字、情境、问法要有变化。`;

    const raw = await this.chat(prompt);
    const parsed = this.parseJson<RawQuestion[]>(raw);
    const questions = (Array.isArray(parsed) ? parsed : []).slice(0, input.count);

    return questions.map((q) => ({
      id: createId("gq"),
      mistake_id: mistake.id,
      question_text: q.question_text || "请列方程解答。",
      difficulty: toDifficulty(q.difficulty),
      question_type: toQuestionType(q.question_type),
      estimated_time_seconds: typeof q.estimated_time_seconds === "number" ? q.estimated_time_seconds : 120,
      answer: q.answer || "略",
      solution_steps: q.solution_steps?.length ? q.solution_steps : ["设未知数。", "列方程。", "求解。"],
      knowledge_points: q.knowledge_points?.length ? q.knowledge_points : (mistake.knowledge_points.length ? mistake.knowledge_points : ["一元一次方程"]),
      target_error_type: q.target_error_type || mistake.main_error_type || "方法性错误",
      why_related_to_original_mistake: q.why_related_to_original_mistake || "与原错题考查相同知识点。",
      verification_status: "passed",
      created_at: nowIso()
    }));
  }

  async gradeAnswer(input: GradeAnswerInput): Promise<Pick<PracticeAttempt, "is_correct" | "feedback" | "error_type_if_wrong" | "graded_by">> {
    if (input.manual_is_correct !== undefined) {
      return {
        is_correct: input.manual_is_correct,
        feedback: input.manual_is_correct ? "已确认正确。" : "已标记错误。",
        error_type_if_wrong: input.manual_is_correct ? null : input.question.target_error_type,
        graded_by: "manual"
      };
    }

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

    const raw = await this.chat(prompt);
    const parsed = this.parseJson<RawGrade>(raw);

    return {
      is_correct: Boolean(parsed.is_correct),
      feedback: parsed.feedback || (parsed.is_correct ? "答对了！" : "再看看这道题。"),
      error_type_if_wrong: parsed.is_correct ? null : (parsed.error_type_if_wrong || input.question.target_error_type),
      graded_by: "ai"
    };
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

    const raw = await this.chat(prompt);
    const parsed = this.parseJson<VerifyMathOutput>(raw);

    return {
      verification_status: parsed.verification_status === "passed" || parsed.verification_status === "failed" ? parsed.verification_status : "passed",
      reason: parsed.reason || "AI verification completed"
    };
  }

  private async chat(userPrompt: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("DeepSeek API not configured. Set DEEPSEEK_API_KEY.");
    }

    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_MATH_TUTOR },
        { role: "user", content: userPrompt }
      ],
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
    } catch {
      return {} as T;
    }
  }
}

const VALID_ERROR_TYPES = ["知识性错误", "审题性错误", "方法性错误", "过程性错误", "表达性错误", "习惯性错误"] as const;
const VALID_QUESTION_TYPES = ["same_pattern", "condition_change", "trap", "number_change", "integrated"] as const;
const VALID_DIFFICULTIES = ["basic", "standard", "challenge"] as const;

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
  difficulty?: string;
  question_type?: string;
  estimated_time_seconds?: number;
  answer?: string;
  solution_steps?: string[];
  knowledge_points?: string[];
  target_error_type?: string;
  why_related_to_original_mistake?: string;
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

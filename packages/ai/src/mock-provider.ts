import {
  type AIAnalysis,
  type GeneratedQuestion,
  type PracticeAttempt,
  createId,
  nowIso
} from "@correction-notebook/shared";
import type { GeneratePracticeInput, GradeAnswerInput, LLMProvider, VerifyMathInput, VerifyMathOutput, AnalyzeMistakeInput } from "./provider.js";

function inferMainError(text: string): AIAnalysis["main_error_type"] {
  if (/单位|格式|证明|答案/.test(text)) return "表达性错误";
  if (/看错|漏|题意|剩下|已经/.test(text)) return "审题性错误";
  if (/算错|符号|移项|变号|约分/.test(text)) return "过程性错误";
  if (/公式|概念|定理/.test(text)) return "知识性错误";
  return "方法性错误";
}

export class MockLLMProvider implements LLMProvider {
  async analyzeMistake(input: AnalyzeMistakeInput): Promise<AIAnalysis> {
    const text = `${input.mistake.normalized_question_text} ${input.mistake.ocr_text} ${input.mistake.student_answer}`;
    const main = inferMainError(text);
    const confidence = text.trim().length < 20 ? 0.52 : 0.84;
    const isEquation = /方程|等量|x|未知数/.test(text);

    return {
      id: createId("analysis"),
      mistake_id: input.mistake.id,
      main_error_type: main,
      secondary_error_types: main === "方法性错误" ? ["审题性错误"] : ["方法性错误"],
      error_summary: isEquation
        ? "这道题主要问题在于没有先找准等量关系，导致后面的方程方向错了。"
        : "这道题的关键不是把答案背下来，而是把条件、方法和易错步骤重新理清。",
      wrong_step_location: isEquation
        ? "你把题目里的数量关系直接代入计算，但没有先区分总量、部分量和问题要求。"
        : "错误集中在解题前半段的条件识别或方法选择上。",
      correct_solution_steps: isEquation
        ? ["设未知数 x。", "圈出题目中的总量和部分量。", "根据等量关系列方程。", "解方程并回代检查。"]
        : ["先读清题目求什么。", "写出已知条件。", "选择对应方法解题。", "把答案代回题目检查。"],
      avoidance_tip: isEquation
        ? "遇到应用题先写一句等量关系，再列方程，不要直接凑算式。"
        : "下次先用 20 秒标出条件和问题，再开始计算。",
      student_friendly_explanation: isEquation
        ? "不是你不会算，而是关系找反了。先把关系摆正，计算会简单很多。"
        : "这类题要先想清楚方法，再动笔，速度会更稳。",
      confidence,
      needs_human_review: confidence < 0.7,
      model_provider: "mock",
      model_name: "deterministic-math-mock",
      created_at: nowIso()
    };
  }

  async generatePractice(input: GeneratePracticeInput): Promise<GeneratedQuestion[]> {
    const base = input.mistake.knowledge_points[0] ?? "一元一次方程";
    const target = input.mistake.main_error_type ?? "方法性错误";
    const templates: Array<Pick<GeneratedQuestion, "question_type" | "difficulty" | "question_text" | "answer" | "solution_steps" | "why_related_to_original_mistake">> = [
      {
        question_type: "same_pattern",
        difficulty: "basic",
        question_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？请列方程解答。",
        answer: "x = 25",
        solution_steps: ["设原来长 x 米。", "根据原长 - 剪去 = 剩下，列 x - 8 = 17。", "解得 x = 25。"],
        why_related_to_original_mistake: "这道题检查是否能把总量、部分量和剩余量放进正确的等量关系。"
      },
      {
        question_type: "condition_change",
        difficulty: "standard",
        question_text: "一本书读了 35 页后，还剩全书的 3/5。全书一共有多少页？",
        answer: "87.5 页",
        solution_steps: ["设全书 x 页。", "已经读的页数是全书的 2/5。", "列 2x/5 = 35。", "解得 x = 87.5。"],
        why_related_to_original_mistake: "条件从具体数量变成分率，仍然考查能否找准等量关系。"
      },
      {
        question_type: "trap",
        difficulty: "standard",
        question_text: "甲数比乙数的 2 倍少 5，甲数是 19。乙数是多少？",
        answer: "x = 12",
        solution_steps: ["设乙数为 x。", "甲数 = 2x - 5。", "列 2x - 5 = 19。", "解得 x = 12。"],
        why_related_to_original_mistake: "这道题容易把“少 5”写反，专门检测原来的关系方向错误是否复发。"
      },
      {
        question_type: "number_change",
        difficulty: "standard",
        question_text: "某数的 3 倍加 4 等于 28，求这个数。",
        answer: "x = 8",
        solution_steps: ["设这个数为 x。", "列 3x + 4 = 28。", "解得 x = 8。"],
        why_related_to_original_mistake: "数字和情境改变，但仍然要求先把文字转成方程。"
      },
      {
        question_type: "integrated",
        difficulty: "challenge",
        question_text: "小明买 3 支笔和 2 本本子共 31 元，每本本子 5 元。每支笔多少钱？",
        answer: "7 元",
        solution_steps: ["设每支笔 x 元。", "列 3x + 2 × 5 = 31。", "解得 x = 7。"],
        why_related_to_original_mistake: "综合题要求先剥离已知单价，再建立总价等量关系。"
      }
    ];

    const selected = templates.slice(0, input.count);
    const questions: GeneratedQuestion[] = [];
    for (const template of selected) {
      const candidate = {
        id: createId("gq"),
        mistake_id: input.mistake.id,
        ...template,
        estimated_time_seconds: template.difficulty === "basic" ? 90 : 150,
        knowledge_points: [base],
        target_error_type: target,
        created_at: nowIso()
      };
      const verification = await this.verifyMath({ question: candidate });
      questions.push({ ...candidate, verification_status: verification.verification_status });
    }
    return questions;
  }

  async gradeAnswer(input: GradeAnswerInput): Promise<Pick<PracticeAttempt, "is_correct" | "feedback" | "error_type_if_wrong" | "graded_by">> {
    const normalizedExpected = input.question.answer.replace(/\s+/g, "").toLowerCase();
    const normalizedActual = input.answer_text.replace(/\s+/g, "").toLowerCase();
    const inferredCorrect = normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
    const isCorrect = input.manual_is_correct ?? inferredCorrect;

    return {
      is_correct: isCorrect,
      feedback: isCorrect
        ? "答对了。你已经能把等量关系列清楚。"
        : "这次仍然要先写等量关系，再代入数字；错误和原错因有关。",
      error_type_if_wrong: isCorrect ? null : input.question.target_error_type,
      graded_by: input.manual_is_correct === undefined ? "ai" : "manual"
    };
  }

  async verifyMath(input: VerifyMathInput): Promise<VerifyMathOutput> {
    const hasRequiredFields =
      input.question.question_text.trim().length > 0 &&
      input.question.answer.trim().length > 0 &&
      input.question.solution_steps.length > 0 &&
      input.question.why_related_to_original_mistake.trim().length > 0;

    return {
      verification_status: hasRequiredFields ? "passed" : "failed",
      reason: hasRequiredFields ? "mock verifier found question, answer, solution, and linkage" : "missing required generated-question fields"
    };
  }
}

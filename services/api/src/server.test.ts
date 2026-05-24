import { describe, expect, it } from "vitest";
import { createApp } from "./server.js";
import { BaiduOcrClient } from "./ocr/baidu.js";

async function createMistakeAndPractice() {
  const app = await createApp();
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/v1/mistakes",
    payload: {
      student_id: "student_1",
      grade: "初一",
      ocr_text: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？列方程。",
      student_answer: "17-8",
      source_name: "期中考试"
    }
  });
  const created = createResponse.json();
  return { app, mistakeId: created.mistake_id as string };
}

describe("Correction Notebook API", () => {
  it("returns a typed OCR result from the configured Baidu OCR client", async () => {
    const app = await createApp({
      ocrClient: {
        recognize: async () => ({
          raw_text: "一根绳子剪去 8 米",
          normalized_text: "一根绳子剪去 8 米",
          confidence: 0.91,
          needs_user_review: false,
          provider: "baidu-ocr",
          words: ["一根绳子剪去 8 米"],
          log_id: "log_1"
        })
      } as BaiduOcrClient
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ocr",
      payload: {
        image_base64: "abc",
        language_type: "CHN_ENG"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().provider).toBe("baidu-ocr");
    expect(response.json().normalized_text).toContain("绳子");
  });

  it("returns a clear OCR configuration error when Baidu credentials are absent", async () => {
    const app = await createApp({ ocrClient: new BaiduOcrClient({ apiKey: "", secretKey: "" }) });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ocr",
      payload: {
        image_base64: "abc"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("baidu_ocr_not_configured");
  });

  it("creates a mistake even when OCR text is too short and marks it for user review", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/mistakes",
      payload: {
        student_id: "student_1",
        grade: "初一",
        ocr_text: "x?",
        student_answer: ""
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().mistake.needs_user_review).toBe(true);
  });

  it("analyzes a low-information mistake with human review required", async () => {
    const app = await createApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/mistakes",
      payload: {
        student_id: "student_1",
        grade: "初一",
        ocr_text: "x?",
        student_answer: ""
      }
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${created.json().mistake_id}/analyze`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().needs_human_review).toBe(true);
    expect(response.json().mistake.mastery_status).toBe("pending_practice");
  });

  it("generates verified practice questions with answers and linkage", async () => {
    const { app, mistakeId } = await createMistakeAndPractice();
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: { count: 3, difficulty_mode: "adaptive" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().questions).toHaveLength(3);
    expect(response.json().questions.every((question: { answer: string }) => question.answer.length > 0)).toBe(true);
    expect(response.json().filtered_out).toBe(0);
  });

  it("updates mastery after three attempts and schedules a three-day review for 2/3 correct", async () => {
    const { app, mistakeId } = await createMistakeAndPractice();
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    const generated = await app.inject({
      method: "POST",
      url: `/api/v1/mistakes/${mistakeId}/generate-practice`,
      payload: { count: 3 }
    });
    const questionIds = generated.json().questions.map((question: { id: string }) => question.id);

    await app.inject({ method: "POST", url: "/api/v1/practice-attempts", payload: { student_id: "student_1", question_id: questionIds[0], answer_text: "x = 25" } });
    await app.inject({ method: "POST", url: "/api/v1/practice-attempts", payload: { student_id: "student_1", question_id: questionIds[1], answer_text: "wrong" } });
    const final = await app.inject({ method: "POST", url: "/api/v1/practice-attempts", payload: { student_id: "student_1", question_id: questionIds[2], answer_text: "x = 12" } });

    expect(final.json().updated_mastery_status).toBe("partially_mastered");
    expect(final.json().mistake.review_due_at).toBeTruthy();
  });

  it("returns separate student and answer PDF URLs and hides answer URL unless requested", async () => {
    const { app, mistakeId } = await createMistakeAndPractice();
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/analyze` });
    await app.inject({ method: "POST", url: `/api/v1/mistakes/${mistakeId}/generate-practice`, payload: { count: 3 } });

    const hiddenAnswer = await app.inject({
      method: "POST",
      url: "/api/v1/test-papers",
      payload: {
        student_id: "student_1",
        question_count: 10,
        include_answer_pdf: false,
        filters: {
          time_range_days: 30,
          knowledge_points: ["一元一次方程"],
          error_types: ["方法性错误"],
          mastery_statuses: ["not_mastered", "partially_mastered"]
        }
      }
    });
    const visibleAnswer = await app.inject({
      method: "POST",
      url: "/api/v1/test-papers",
      payload: {
        student_id: "student_1",
        question_count: 10,
        include_answer_pdf: true,
        filters: {
          time_range_days: 30,
          knowledge_points: ["一元一次方程"],
          error_types: ["方法性错误"],
          mastery_statuses: ["not_mastered", "partially_mastered"]
        }
      }
    });

    expect(hiddenAnswer.json().student_pdf_url).toContain("/student.pdf");
    expect(hiddenAnswer.json()).not.toHaveProperty("answer_pdf_url");
    expect(visibleAnswer.json().answer_pdf_url).toContain("/answer.pdf");
    expect(visibleAnswer.json().answer_pdf_url).not.toEqual(visibleAnswer.json().student_pdf_url);
  });
});

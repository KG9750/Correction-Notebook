import { describe, expect, it } from "vitest";
import { sampleGeneratedQuestions } from "../sample-data";
import { buildAnswerPaperHtml, buildStudentPaperHtml } from "./paperHtml";
import type { TestPaper } from "@correction-notebook/shared";

describe("paper HTML", () => {
  it("keeps student and answer papers separate", () => {
    const paper: TestPaper = {
      id: "paper_test",
      student_id: "student_001",
      title: "数学错因复测卷",
      filters: {
        time_range_days: 30,
        knowledge_points: ["一元一次方程"],
        error_types: ["方法性错误"],
        mastery_statuses: ["not_mastered", "partially_mastered"]
      },
      question_count: sampleGeneratedQuestions.length,
      student_pdf_url: "file:///tmp/student.pdf",
      answer_pdf_url: "file:///tmp/answer.pdf",
      questions: [],
      created_at: "2026-05-30T00:00:00.000Z"
    };
    const studentHtml = buildStudentPaperHtml(paper, sampleGeneratedQuestions);
    const answerHtml = buildAnswerPaperHtml(paper, sampleGeneratedQuestions);

    expect(studentHtml).toContain("学生卷");
    expect(studentHtml).not.toContain("答案：");
    expect(answerHtml).toContain("答案与解析");
    expect(answerHtml).toContain("答案：");
  });
});

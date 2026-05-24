import { describe, expect, it } from "vitest";
import { sampleGeneratedQuestions } from "../sample-data";
import { createInitialNotebookState, createTestPaper } from "../notebook-state";
import { buildAnswerPaperHtml, buildStudentPaperHtml } from "./paperHtml";

describe("paper HTML", () => {
  it("keeps student and answer papers separate", () => {
    const state = createTestPaper(createInitialNotebookState());
    const paper = state.papers[0];
    expect(paper).toBeDefined();
    if (!paper) throw new Error("expected paper");
    const studentHtml = buildStudentPaperHtml(paper, sampleGeneratedQuestions);
    const answerHtml = buildAnswerPaperHtml(paper, sampleGeneratedQuestions);

    expect(studentHtml).toContain("学生卷");
    expect(studentHtml).not.toContain("答案：");
    expect(answerHtml).toContain("答案与解析");
    expect(answerHtml).toContain("答案：");
  });
});

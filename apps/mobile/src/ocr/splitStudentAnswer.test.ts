import { describe, expect, it } from "vitest";
import { splitStudentAnswerFromOcr } from "./splitStudentAnswer";

describe("splitStudentAnswerFromOcr", () => {
  it("moves labeled answer text out of the OCR question", () => {
    expect(splitStudentAnswerFromOcr("一根绳子剪去 8 米后还剩 17 米，原来长多少米？ 学生答案：17 - 8 = 9")).toEqual({
      questionText: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
      studentAnswer: "17 - 8 = 9"
    });
  });

  it("uses the final answer-like line when OCR keeps line breaks", () => {
    expect(splitStudentAnswerFromOcr("解方程 3x - 7 = 11。\n3x = 4, x = 4/3")).toEqual({
      questionText: "解方程 3x - 7 = 11。",
      studentAnswer: "3x = 4, x = 4/3"
    });
  });

  it("uses the text above an answer underline as the student answer", () => {
    expect(splitStudentAnswerFromOcr("解方程 3x - 7 = 11。\n3x = 4, x = 4/3\n________")).toEqual({
      questionText: "解方程 3x - 7 = 11。",
      studentAnswer: "3x = 4, x = 4/3"
    });
  });

  it("handles OCR horizontal strokes below the written answer", () => {
    expect(splitStudentAnswerFromOcr("一根绳子剪去 8 米后还剩 17 米，原来长多少米？\n17 - 8 = 9\n────")).toEqual({
      questionText: "一根绳子剪去 8 米后还剩 17 米，原来长多少米？",
      studentAnswer: "17 - 8 = 9"
    });
  });

  it("keeps a fill-in underline in the question and moves the answer above it", () => {
    expect(splitStudentAnswerFromOcr("18. 含有5个元素的集合共有\n31\n________\n个非空真子集")).toEqual({
      questionText: "18. 含有5个元素的集合共有____个非空真子集",
      studentAnswer: "31"
    });
  });

  it("reconstructs a fill-in blank when OCR misses the underline but keeps the answer between question fragments", () => {
    expect(splitStudentAnswerFromOcr("18. 含有5个元素的集合共有\n31\n个非空真子集")).toEqual({
      questionText: "18. 含有5个元素的集合共有____个非空真子集",
      studentAnswer: "31"
    });
  });

  it("moves an inline handwritten blank answer into the student answer field", () => {
    expect(splitStudentAnswerFromOcr("18. 含有5个元素的集合共有31个非空真子集")).toEqual({
      questionText: "18. 含有5个元素的集合共有____个非空真子集",
      studentAnswer: "31"
    });
  });

  it("handles spaces around an inline handwritten blank answer", () => {
    expect(splitStudentAnswerFromOcr("含有5个元素的集合共有 31 个非空真子集")).toEqual({
      questionText: "含有5个元素的集合共有____个非空真子集",
      studentAnswer: "31"
    });
  });

  it("does not split question instructions after a question mark", () => {
    expect(splitStudentAnswerFromOcr("原来长多少米？请列方程解答。")).toEqual({
      questionText: "原来长多少米？请列方程解答。",
      studentAnswer: ""
    });
  });
});

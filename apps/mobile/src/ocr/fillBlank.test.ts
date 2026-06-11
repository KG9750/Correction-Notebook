import { describe, expect, it } from "vitest";
import { insertFillBlank } from "./fillBlank";

describe("insertFillBlank", () => {
  it("inserts a fill blank at the cursor", () => {
    expect(insertFillBlank("共有个非空真子集", { start: 2, end: 2 })).toEqual({
      text: "共有____个非空真子集",
      selection: { start: 6, end: 6 }
    });
  });

  it("replaces the selected text with a fill blank", () => {
    expect(insertFillBlank("共有31个非空真子集", { start: 2, end: 4 })).toEqual({
      text: "共有____个非空真子集",
      selection: { start: 6, end: 6 }
    });
  });

  it("clamps invalid selection indexes", () => {
    expect(insertFillBlank("题干", { start: 99, end: 99 })).toEqual({
      text: "题干____",
      selection: { start: 6, end: 6 }
    });
  });
});

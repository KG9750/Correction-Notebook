import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { latexToReadableMath, normalizeOcrText, postprocessMathOcrText, recognizeMistakeImage } from "./recognize";

vi.mock("./nativeVision", () => ({
  recognizeWithNativeVision: vi.fn(async () => undefined)
}));

vi.mock("./backendOcr", () => ({
  recognizeWithBackendOcr: vi.fn(async () => undefined)
}));

describe("OCR recognition adapter", () => {
  it("normalizes whitespace", () => {
    expect(normalizeOcrText("  解方程   3x - 7 = 11。 ")).toBe("解方程 3x - 7 = 11。");
  });

  it("fixes common OCR superscript loss", () => {
    expect(postprocessMathOcrText("计算 (3x-y+2z)2 的值")).toBe("计算 (3x-y+2z)² 的值");
    expect(postprocessMathOcrText("x2 + y3")).toBe("x² + y³");
  });

  it("converts simple LaTeX superscripts into readable superscripts", () => {
    expect(latexToReadableMath("a^{2}+b^3+\\left(3x-y+2z\\right)^2")).toBe("a²+b³+(3x-y+2z)²");
  });

  it("returns editable OCR text with confidence from fallback provider", async () => {
    const result = await recognizeMistakeImage("file:///tmp/mistake.jpg");

    expect(result.normalizedText.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.needsUserReview).toBe(true);
    expect(result.provider).toBe("deterministic-fallback");
  });
});

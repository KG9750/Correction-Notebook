import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { recognizeWithBackendOcr } from "./backendOcr";
import { recognizeWithNativeVision } from "./nativeVision";
import { latexToReadableMath, normalizeOcrText, postprocessMathOcrText, recognizeMistakeImage } from "./recognize";

vi.mock("./backendOcr", () => ({
  recognizeWithBackendOcr: vi.fn(async () => undefined)
}));

vi.mock("./nativeVision", () => ({
  recognizeWithNativeVision: vi.fn(async () => undefined)
}));

describe("OCR recognition adapter", () => {
  it("prefers backend OCR when the API returns a result", async () => {
    vi.mocked(recognizeWithBackendOcr).mockResolvedValueOnce({
      rawText: "后端题干",
      normalizedText: "后端题干",
      confidence: 0.92,
      needsUserReview: false,
      provider: "google-vision"
    });

    const result = await recognizeMistakeImage("file:///tmp/backend.jpg");

    expect(result.provider).toBe("google-vision");
    expect(result.normalizedText).toBe("后端题干");
    expect(recognizeWithNativeVision).not.toHaveBeenCalled();
  });

  it("falls back to native iOS OCR before deterministic samples", async () => {
    vi.mocked(recognizeWithBackendOcr).mockResolvedValueOnce(undefined);
    vi.mocked(recognizeWithNativeVision).mockResolvedValueOnce({
      rawText: "解方程 x2 = 9。",
      confidence: 0.91
    });

    const result = await recognizeMistakeImage("file:///tmp/native.jpg");

    expect(result.provider).toBe("vision-native");
    expect(result.normalizedText).toBe("解方程 x² = 9。");
    expect(result.needsUserReview).toBe(false);
  });

  it("normalizes whitespace", () => {
    expect(normalizeOcrText("  解方程   3x - 7 = 11。 ")).toBe("解方程 3x - 7 = 11。");
  });

  it("fixes common OCR superscript loss", () => {
    expect(postprocessMathOcrText("计算 (3x-y+2z)2 的值")).toBe("计算 (3x-y+2z)² 的值");
    expect(postprocessMathOcrText("x2 + y3")).toBe("x² + y³");
  });

  it("converts simple LaTeX superscripts into readable superscripts", () => {
    expect(latexToReadableMath("a^{2}+b^3+\\left(3x-y+2z\\right)^2")).toBe("a²+b³+(3x-y+2z)²");
    expect(latexToReadableMath("x^{-2}+y^{+3}")).toBe("x⁻²+y⁺³");
    expect(latexToReadableMath("a ^ { 2 } + b ^ 3")).toBe("a² + b³");
  });

  it("returns editable OCR text with confidence from fallback provider", async () => {
    const result = await recognizeMistakeImage("file:///tmp/mistake.jpg");

    expect(result.normalizedText.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.needsUserReview).toBe(true);
    expect(result.provider).toBe("deterministic-fallback");
  });
});

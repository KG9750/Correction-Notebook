import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { recognizeWithBackendOcr } from "./backendOcr";
import { recognizeWithNativeVision } from "./nativeVision";
import { latexToReadableMath, normalizeOcrText, postprocessMathOcrText, recognizeMistakeImage } from "./recognize";

vi.mock("./backendOcr", () => ({
  recognizeWithBackendOcr: vi.fn(async () => {
    throw new Error("backend unavailable");
  })
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
  });

  it("does not replace failed OCR with deterministic sample text", async () => {
    vi.mocked(recognizeWithBackendOcr).mockRejectedValueOnce(new Error("后端 OCR 失败"));
    vi.mocked(recognizeWithNativeVision).mockResolvedValueOnce(undefined);

    await expect(recognizeMistakeImage("file:///tmp/mistake.jpg")).rejects.toThrow("后端 OCR 失败");
  });

  it("falls back to native iOS Vision when backend OCR fails", async () => {
    vi.mocked(recognizeWithBackendOcr).mockRejectedValueOnce(new Error("后端 OCR 失败"));
    vi.mocked(recognizeWithNativeVision).mockResolvedValueOnce({
      rawText: "已知a=1,b=2,求a+b?",
      confidence: 0.9
    });

    const result = await recognizeMistakeImage("file:///tmp/native.jpg");

    expect(result.provider).toBe("ios-vision");
    expect(result.normalizedText).toBe("已知a=1，b=2，求a+b？");
  });

  it("normalizes whitespace", () => {
    expect(normalizeOcrText("  解方程   3x - 7 = 11。 ")).toBe("解方程 3x - 7 = 11。");
  });

  it("fixes common OCR superscript loss", () => {
    expect(postprocessMathOcrText("计算 (3x-y+2z)2 的值")).toBe("计算 (3x-y+2z)² 的值");
    expect(postprocessMathOcrText("x2 + y3")).toBe("x² + y³");
  });

  it("uses Chinese punctuation when OCR text contains Chinese", () => {
    expect(postprocessMathOcrText("已知a=1,b=2,求a+b?")).toBe("已知a=1，b=2，求a+b？");
    expect(postprocessMathOcrText("圆周率约为3.14, 不是3.15.")).toBe("圆周率约为3.14， 不是3.15。");
    expect(postprocessMathOcrText("18. 含有5个元素的集合共有____个非空真子集")).toBe("18. 含有5个元素的集合共有____个非空真子集");
  });

  it("converts simple LaTeX superscripts into readable superscripts", () => {
    expect(latexToReadableMath("a^{2}+b^3+\\left(3x-y+2z\\right)^2")).toBe("a²+b³+(3x-y+2z)²");
    expect(latexToReadableMath("x^{-2}+y^{+3}")).toBe("x⁻²+y⁺³");
    expect(latexToReadableMath("a ^ { 2 } + b ^ 3")).toBe("a² + b³");
  });

});

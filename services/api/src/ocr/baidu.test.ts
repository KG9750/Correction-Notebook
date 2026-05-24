import { describe, expect, it, vi } from "vitest";
import { BaiduOcrClient, latexToReadableMath, normalizeBaiduOcrResponse, postprocessMathOcrText, stripDataUriPrefix } from "./baidu.js";

describe("Baidu OCR client", () => {
  it("strips data URI prefixes before sending image data", () => {
    expect(stripDataUriPrefix("data:image/jpeg;base64,abc123")).toBe("abc123");
    expect(stripDataUriPrefix("abc123")).toBe("abc123");
  });

  it("normalizes words_result into the app OCR contract", () => {
    const result = normalizeBaiduOcrResponse({
      log_id: 123,
      words_result: [
        { words: "一根绳子剪去 8 米", location: { top: 20, left: 10 }, probability: { average: 0.91 } },
        { words: "还剩 17 米", location: { top: 40, left: 10 }, probability: { average: 0.87 } }
      ]
    });

    expect(result.provider).toBe("baidu-ocr");
    expect(result.raw_text).toContain("一根绳子");
    expect(result.normalized_text).toBe("一根绳子剪去 8 米 还剩 17 米");
    expect(result.confidence).toBeCloseTo(0.89);
    expect(result.needs_user_review).toBe(false);
  });

  it("keeps formula LaTeX from formula_result and orders blocks by location", () => {
    const result = normalizeBaiduOcrResponse({
      log_id: 123,
      words_result: [
        { words: "计算", location: { top: 10, left: 10 }, probability: { average: 0.9 } },
        { words: "的值", location: { top: 10, left: 300 }, probability: { average: 0.9 } }
      ],
      formula_result: [
        {
          words: "\\left(3x-y+2z\\right)^2",
          location: { top: 10, left: 90 }
        }
      ]
    });

    expect(result.math_latex).toEqual(["\\left(3x-y+2z\\right)^2"]);
    expect(result.normalized_text).toBe("计算 (3x-y+2z)² 的值");
  });

  it("postprocesses common superscript OCR loss", () => {
    expect(postprocessMathOcrText("计算(3x-y+2z)2的值")).toBe("计算(3x-y+2z)2的值");
    expect(postprocessMathOcrText("计算 (3x-y+2z)2 的值")).toBe("计算 (3x-y+2z)² 的值");
    expect(postprocessMathOcrText("x2 + y3")).toBe("x² + y³");
  });

  it("converts simple LaTeX superscripts into readable superscripts", () => {
    expect(latexToReadableMath("a^{2}+b^3+\\left(3x-y+2z\\right)^2")).toBe("a²+b³+(3x-y+2z)²");
  });

  it("requests a token and calls the configured OCR endpoint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token_1", expires_in: 300 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          log_id: "log_1",
          words_result: [{ words: "解方程 3x - 7 = 11。", probability: { average: 0.92 } }]
        })
      });

    const client = new BaiduOcrClient({
      apiKey: "api",
      secretKey: "secret",
      endpoint: "https://example.test/ocr",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 1_000
    });
    const result = await client.recognize("data:image/png;base64,abc", "CHN_ENG");

    expect(result.normalized_text).toBe("解方程 3x - 7 = 11。");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe("https://example.test/ocr?access_token=token_1");
    expect(String(fetchImpl.mock.calls[1]?.[1]?.body)).toContain("image=abc");
  });
});

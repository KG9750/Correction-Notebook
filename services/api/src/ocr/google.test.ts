import { describe, expect, it, vi } from "vitest";
import {
  GoogleVisionOcrClient,
  latexToReadableMath,
  normalizeGoogleVisionResponse,
  postprocessMathOcrText,
  stripDataUriPrefix
} from "./google.js";

describe("Google Vision OCR client", () => {
  it("strips data URI prefixes before sending image data", () => {
    expect(stripDataUriPrefix("data:image/jpeg;base64,abc123")).toBe("abc123");
    expect(stripDataUriPrefix("abc123")).toBe("abc123");
  });

  it("normalizes fullTextAnnotation into the app OCR contract", () => {
    const result = normalizeGoogleVisionResponse({
      fullTextAnnotation: {
        text: "一根绳子剪去 8 米后还剩 17 米\n原来长多少米？\n",
        pages: [
          {
            blocks: [
              {
                paragraphs: [
                  {
                    words: [
                      { symbols: [{ text: "一", confidence: 0.92 }, { text: "根", confidence: 0.91 }] },
                      { symbols: [{ text: "绳", confidence: 0.93 }, { text: "子", confidence: 0.94 }] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      textAnnotations: [
        { description: "一根绳子剪去 8 米后还剩 17 米\n原来长多少米？" },
        { description: "一根绳子" },
        { description: "剪去" },
        { description: "8" },
        { description: "米" }
      ]
    });

    expect(result.provider).toBe("google-vision");
    expect(result.raw_text).toBe("一根绳子剪去 8 米后还剩 17 米\n原来长多少米？");
    expect(result.normalized_text).toBe("一根绳子剪去 8 米后还剩 17 米 原来长多少米？");
    expect(result.math_latex).toEqual([]);
    expect(result.words.length).toBe(4);
    expect(result.confidence).toBeCloseTo(0.925);
    expect(result.needs_user_review).toBe(false);
  });

  it("handles empty response gracefully", () => {
    const result = normalizeGoogleVisionResponse({});
    expect(result.raw_text).toBe("");
    expect(result.normalized_text).toBe("");
    expect(result.confidence).toBe(0);
    expect(result.needs_user_review).toBe(true);
    expect(result.words).toEqual([]);
  });

  it("reconstructs a fill-in blank when Google Vision misses the underline but sees the answer above the gap", () => {
    const result = normalizeGoogleVisionResponse({
      fullTextAnnotation: {
        text: "31\n18. 含有5个元素的集合共有 个非空真子集\n"
      },
      textAnnotations: [
        { description: "31\n18. 含有5个元素的集合共有 个非空真子集" },
        { description: "31", boundingPoly: { vertices: [{ x: 230, y: 30 }, { x: 270, y: 30 }, { x: 270, y: 55 }, { x: 230, y: 55 }] } },
        { description: "18.", boundingPoly: { vertices: [{ x: 20, y: 80 }, { x: 55, y: 80 }, { x: 55, y: 105 }, { x: 20, y: 105 }] } },
        { description: "含有5个元素的集合共有", boundingPoly: { vertices: [{ x: 60, y: 80 }, { x: 210, y: 80 }, { x: 210, y: 105 }, { x: 60, y: 105 }] } },
        { description: "个非空真子集", boundingPoly: { vertices: [{ x: 300, y: 80 }, { x: 430, y: 80 }, { x: 430, y: 105 }, { x: 300, y: 105 }] } }
      ]
    });

    expect(result.raw_text).toBe("18. 含有5个元素的集合共有\n31\n____\n个非空真子集");
    expect(result.normalized_text).toBe("18. 含有5个元素的集合共有 31 ____ 个非空真子集");
  });

  it("keeps a fill-in blank when Google Vision misses both the underline and the handwritten answer", () => {
    const result = normalizeGoogleVisionResponse({
      fullTextAnnotation: {
        text: "18. 含有5个元素的集合共有 个非空真子集\n"
      },
      textAnnotations: [
        { description: "18. 含有5个元素的集合共有 个非空真子集" },
        { description: "18.", boundingPoly: { vertices: [{ x: 20, y: 80 }, { x: 55, y: 80 }, { x: 55, y: 105 }, { x: 20, y: 105 }] } },
        { description: "含有5个元素的集合共有", boundingPoly: { vertices: [{ x: 60, y: 80 }, { x: 210, y: 80 }, { x: 210, y: 105 }, { x: 60, y: 105 }] } },
        { description: "个非空真子集", boundingPoly: { vertices: [{ x: 300, y: 80 }, { x: 430, y: 80 }, { x: 430, y: 105 }, { x: 300, y: 105 }] } }
      ]
    });

    expect(result.raw_text).toBe("18. 含有5个元素的集合共有____个非空真子集");
    expect(result.normalized_text).toBe("18. 含有5个元素的集合共有____个非空真子集");
  });

  it("computes confidence from symbol-level confidences", () => {
    const result = normalizeGoogleVisionResponse({
      fullTextAnnotation: {
        text: "3x - 7 = 11",
        pages: [
          {
            blocks: [
              {
                paragraphs: [
                  {
                    words: [
                      { symbols: [{ text: "3", confidence: 0.8 }, { text: "x", confidence: 0.7 }] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    });

    expect(result.confidence).toBeCloseTo(0.75);
    expect(result.needs_user_review).toBe(true);
  });

  it("postprocesses common superscript OCR loss", () => {
    expect(postprocessMathOcrText("计算 (3x-y+2z)2 的值")).toBe("计算 (3x-y+2z)² 的值");
    expect(postprocessMathOcrText("x2 + y3")).toBe("x² + y³");
  });

  it("uses Chinese punctuation when OCR text contains Chinese", () => {
    expect(postprocessMathOcrText("已知a=1,b=2,求a+b?")).toBe("已知a=1，b=2，求a+b？");
    expect(postprocessMathOcrText("圆周率约为3.14, 不是3.15.")).toBe("圆周率约为3.14， 不是3.15。");
    expect(postprocessMathOcrText("18. 含有5个元素的集合共有____个非空真子集")).toBe("18. 含有5个元素的集合共有____个非空真子集");
    expect(postprocessMathOcrText("共有1,000个样本")).toBe("共有1,000个样本");
  });

  it("converts LaTeX superscripts into readable superscripts", () => {
    expect(latexToReadableMath("a^{2}+b^3+\\left(3x-y+2z\\right)^2")).toBe("a²+b³+(3x-y+2z)²");
    expect(latexToReadableMath("x^{-2}+y^{+3}")).toBe("x⁻²+y⁺³");
  });

  it("calls the Google Vision API with correct body and key", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        responses: [
          {
            fullTextAnnotation: {
              text: "解方程 3x - 7 = 11。",
              pages: [
                {
                  blocks: [
                    {
                      paragraphs: [
                        {
                          words: [
                            { symbols: [{ text: "解", confidence: 0.95 }] }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            textAnnotations: [{ description: "解方程 3x - 7 = 11。" }]
          }
        ]
      })
    });

    const client = new GoogleVisionOcrClient({
      apiKey: "test-api-key",
      endpoint: "https://vision.googleapis.com/v1/images:annotate",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const result = await client.recognize("data:image/png;base64,abc", "CHN_ENG");

    expect(result.normalized_text).toBe("解方程 3x - 7 = 11。");
    expect(result.provider).toBe("google-vision");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as [string, { body: string }];
    expect(url).toContain("key=test-api-key");
    const body = JSON.parse(init.body) as { requests: Array<{ image: { content: string }; features: Array<{ type: string }> }> };
    expect(body.requests[0].image.content).toBe("abc");
    expect(body.requests[0].features[0].type).toBe("DOCUMENT_TEXT_DETECTION");
  });
});

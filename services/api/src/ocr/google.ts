import type { OcrResult } from "@correction-notebook/shared";
import { ProxyAgent } from "undici";

type FetchLike = typeof fetch;

type Vertex = {
  x?: number;
  y?: number;
};

type TextAnnotation = {
  description?: string;
  boundingPoly?: {
    vertices?: Vertex[];
  };
};

type GoogleVisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
      pages?: Array<{
        blocks?: Array<{
          paragraphs?: Array<{
            words?: Array<{
              symbols?: Array<{
                text?: string;
                confidence?: number;
              }>;
            }>;
          }>;
        }>;
      }>;
    };
    textAnnotations?: TextAnnotation[];
    error?: {
      code?: number;
      message?: string;
    };
  }>;
};

export type GoogleVisionOcrClientOptions = {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
};

export class GoogleVisionConfigurationError extends Error {
  constructor() {
    super("Google Cloud Vision is not configured. Set GOOGLE_CLOUD_VISION_API_KEY on the API service.");
    this.name = "GoogleVisionConfigurationError";
  }
}

export class GoogleVisionOcrClient {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: GoogleVisionOcrClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GOOGLE_CLOUD_VISION_API_KEY;
    this.endpoint =
      options.endpoint ??
      process.env.GOOGLE_VISION_ENDPOINT ??
      "https://vision.googleapis.com/v1/images:annotate";
    if (options.fetchImpl) {
      this.fetchImpl = options.fetchImpl;
    } else {
      const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
      if (proxyUrl) {
        const proxyAgent = new ProxyAgent(proxyUrl);
        this.fetchImpl = (url, init) => fetch(url, { ...init, dispatcher: proxyAgent } as RequestInit);
      } else {
        this.fetchImpl = fetch;
      }
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async recognize(imageBase64: string, _languageType = "CHN_ENG"): Promise<OcrResult> {
    if (!this.isConfigured()) throw new GoogleVisionConfigurationError();

    const body = JSON.stringify({
      requests: [
        {
          image: { content: stripDataUriPrefix(imageBase64) },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        }
      ]
    });

    const url = `${this.endpoint}?key=${encodeURIComponent(this.apiKey!)}`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });

    const payload = (await response.json()) as GoogleVisionResponse;
    const visionResponse = payload.responses?.[0];

    if (!response.ok || visionResponse?.error) {
      throw new Error(
        `Google Vision request failed: ${visionResponse?.error?.message ?? response.statusText}`
      );
    }

    return normalizeGoogleVisionResponse(visionResponse ?? {});
  }
}

export function stripDataUriPrefix(value: string): string {
  const commaIndex = value.indexOf(",");
  if (value.startsWith("data:") && commaIndex >= 0) {
    return value.slice(commaIndex + 1);
  }
  return value;
}

export function normalizeGoogleVisionResponse(visionResponse: NonNullable<GoogleVisionResponse["responses"]>[number]): OcrResult {
  const fullText = visionResponse?.fullTextAnnotation?.text ?? "";
  const annotations = visionResponse?.textAnnotations ?? [];
  const reconstructedFillBlankText = reconstructFillBlankTextFromAnnotations(annotations);

  const words = annotations
    .slice(1)
    .map((a: { description?: string }) => a.description?.trim() ?? "")
    .filter(Boolean);

  const rawText = (reconstructedFillBlankText ?? fullText).trim();
  const normalizedText = postprocessMathOcrText(rawText.replace(/\s+/g, " ").trim());

  const confidenceValues = collectSymbolConfidences(visionResponse);
  const confidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
      : rawText.length > 0
        ? 0.85
        : 0;

  return {
    raw_text: rawText,
    normalized_text: normalizedText,
    math_latex: [],
    confidence,
    needs_user_review: confidence < 0.86 || rawText.length === 0,
    provider: "google-vision",
    words
  };
}

type OcrTextBox = {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
  height: number;
};

type OcrLine = {
  words: OcrTextBox[];
  centerY: number;
};

function reconstructFillBlankTextFromAnnotations(annotations: TextAnnotation[]): string | undefined {
  const boxes = annotations.slice(1).map(toTextBox).filter((box): box is OcrTextBox => Boolean(box));
  if (boxes.length < 2) return undefined;

  const medianHeight = median(boxes.map((box) => box.height).filter((height) => height > 0));
  if (!medianHeight) return undefined;

  const lines = groupBoxesIntoLines(boxes, medianHeight);
  for (const printedLine of lines) {
    const words = [...printedLine.words].sort((left, right) => left.left - right.left);
    if (words.length < 2) continue;

    for (let index = 0; index < words.length - 1; index += 1) {
      const leftWords = words.slice(0, index + 1);
      const rightWords = words.slice(index + 1);
      const gapLeft = words[index]?.right ?? 0;
      const gapRight = words[index + 1]?.left ?? 0;
      const gapWidth = gapRight - gapLeft;
      if (gapWidth < Math.max(24, medianHeight * 1.8)) continue;

      const answerText = findAnswerAboveGap(lines, printedLine, gapLeft, gapRight, medianHeight);
      const prefix = joinOcrTokens(leftWords.map((word) => word.text));
      const suffix = joinOcrTokens(rightWords.map((word) => word.text));
      if (!prefix || !suffix) continue;

      return answerText ? `${prefix}\n${answerText}\n____\n${suffix}` : `${prefix}____${suffix}`;
    }
  }

  return undefined;
}

function toTextBox(annotation: TextAnnotation): OcrTextBox | undefined {
  const text = annotation.description?.trim();
  const vertices = annotation.boundingPoly?.vertices ?? [];
  const xs = vertices.map((vertex) => vertex.x).filter((value): value is number => typeof value === "number");
  const ys = vertices.map((vertex) => vertex.y).filter((value): value is number => typeof value === "number");
  if (!text || xs.length === 0 || ys.length === 0) return undefined;

  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  if (right <= left || bottom <= top) return undefined;

  return {
    text,
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    height: bottom - top
  };
}

function groupBoxesIntoLines(boxes: OcrTextBox[], medianHeight: number): OcrLine[] {
  const threshold = Math.max(8, medianHeight * 0.7);
  const lines: OcrLine[] = [];
  for (const box of [...boxes].sort((left, right) => left.centerY - right.centerY)) {
    const line = lines.find((candidate) => Math.abs(candidate.centerY - box.centerY) <= threshold);
    if (line) {
      line.words.push(box);
      line.centerY = line.words.reduce((sum, word) => sum + word.centerY, 0) / line.words.length;
    } else {
      lines.push({ words: [box], centerY: box.centerY });
    }
  }
  return lines.map((line) => ({ ...line, words: [...line.words].sort((left, right) => left.left - right.left) }));
}

function findAnswerAboveGap(
  lines: OcrLine[],
  printedLine: OcrLine,
  gapLeft: number,
  gapRight: number,
  medianHeight: number
): string | undefined {
  const gapMargin = Math.max(8, medianHeight * 0.6);
  const candidateLines = lines.filter((line) => (
    line.centerY < printedLine.centerY &&
    printedLine.centerY - line.centerY <= medianHeight * 2.8
  ));

  for (const line of candidateLines.sort((left, right) => right.centerY - left.centerY)) {
    const answerWords = line.words.filter((word) => word.centerX >= gapLeft - gapMargin && word.centerX <= gapRight + gapMargin);
    const answerText = joinOcrTokens(answerWords.map((word) => word.text));
    if (isAnswerLike(answerText)) return answerText;
  }

  return undefined;
}

function isAnswerLike(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 40) return false;
  return /[=+\-*/÷×]|[0-9]|[xX]/.test(text);
}

function joinOcrTokens(tokens: string[]): string {
  return tokens.reduce((result, token) => {
    const text = token.trim();
    if (!text) return result;
    if (!result) return text;
    return shouldInsertSpace(result, text) ? `${result} ${text}` : `${result}${text}`;
  }, "");
}

function shouldInsertSpace(left: string, right: string): boolean {
  if (/^\p{P}/u.test(right)) return false;
  if (/\d[.)]$/.test(left) && /\p{Script=Han}/u.test(right)) return true;
  return /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function collectSymbolConfidences(visionResponse: NonNullable<GoogleVisionResponse["responses"]>[number]): number[] {
  const pages = visionResponse?.fullTextAnnotation?.pages ?? [];
  const values: number[] = [];
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          for (const symbol of word.symbols ?? []) {
            if (typeof symbol.confidence === "number" && Number.isFinite(symbol.confidence)) {
              values.push(symbol.confidence);
            }
          }
        }
      }
    }
  }
  return values;
}

export function postprocessMathOcrText(value: string): string {
  return normalizeChinesePunctuation(latexToReadableMath(value))
    .replace(
      /(\([^()\n]{1,80}\))([23456789])(?=($|[\s，。,.；;、?!？+\-*/=]))/g,
      (_, group: string, exponent: string) => `${group}${toSuperscript(exponent)}`
    )
    .replace(
      /([A-Za-z0-9])\^?([23])(?=($|[\s，。,.；;、?!？+\-*/=]))/g,
      (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`
    );
}

export function normalizeChinesePunctuation(value: string): string {
  if (!/[\u3400-\u9fff]/.test(value)) return value;

  return value
    .replace(/,/g, (match, offset: number, text: string) => {
      const previous = text[offset - 1] ?? "";
      const nextText = text.slice(offset + 1);
      if (/\d/.test(previous) && /^\d{3}(\D|$)/.test(nextText)) return match;
      return "，";
    })
    .replace(/\?/g, "？")
    .replace(/!/g, "！")
    .replace(/;/g, "；")
    .replace(/:/g, "：")
    .replace(/\./g, (match, offset: number, text: string) => {
      const previous = text[offset - 1] ?? "";
      const next = text[offset + 1] ?? "";
      if (/\d/.test(previous) && /\d/.test(next)) return match;
      if (/\d/.test(previous) && /\s/.test(next)) return match;
      return "。";
    });
}

export function latexToReadableMath(value: string): string {
  return value
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(
      /([A-Za-z0-9)\]}])\s*\^\s*\{\s*([0-9+-]+)\s*\}/g,
      (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`
    )
    .replace(
      /([A-Za-z0-9)\]}])\s*\^\s*([0-9+-])/g,
      (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`
    );
}

function toSuperscript(value: string): string {
  const map: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "+": "⁺",
    "-": "⁻"
  };
  return value
    .split("")
    .map((character) => map[character] ?? character)
    .join("");
}

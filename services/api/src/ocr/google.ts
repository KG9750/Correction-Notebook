import type { OcrResult } from "@correction-notebook/shared";

type FetchLike = typeof fetch;

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
    textAnnotations?: Array<{
      description?: string;
      boundingPoly?: unknown;
    }>;
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
    this.fetchImpl = options.fetchImpl ?? fetch;
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

  const words = annotations
    .slice(1)
    .map((a: { description?: string }) => a.description?.trim() ?? "")
    .filter(Boolean);

  const rawText = fullText.trim();
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
  return latexToReadableMath(value)
    .replace(
      /(\([^()\n]{1,80}\))([23456789])(?=($|[\s，。,.；;、?!？+\-*/=]))/g,
      (_, group: string, exponent: string) => `${group}${toSuperscript(exponent)}`
    )
    .replace(
      /([A-Za-z0-9])\^?([23])(?=($|[\s，。,.；;、?!？+\-*/=]))/g,
      (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`
    );
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

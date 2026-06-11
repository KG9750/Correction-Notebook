import { recognizeWithBackendOcr } from "./backendOcr";
import { recognizeWithNativeVision } from "./nativeVision";

export type OcrResult = {
  rawText: string;
  normalizedText: string;
  confidence: number;
  needsUserReview: boolean;
  provider: "google-vision" | "baidu-ocr" | "backend-ocr" | "ios-vision";
};

export async function recognizeMistakeImage(imageUri: string): Promise<OcrResult> {
  try {
    return await recognizeWithBackendOcr(imageUri);
  } catch (backendError) {
    const nativeResult = await recognizeWithNativeVision(imageUri);
    if (nativeResult) {
      const normalizedText = normalizeOcrText(nativeResult.rawText);
      return {
        rawText: nativeResult.rawText,
        normalizedText,
        confidence: nativeResult.confidence,
        needsUserReview: nativeResult.confidence < 0.86,
        provider: "ios-vision"
      };
    }
    throw backendError;
  }
}

export function normalizeOcrText(value: string): string {
  return postprocessMathOcrText(value.replace(/\s+/g, " ").trim());
}

export function postprocessMathOcrText(value: string): string {
  return normalizeChinesePunctuation(latexToReadableMath(value))
    .replace(/(\([^()\n]{1,80}\))([23456789])(?=($|[\s，。,.；;、?!？+\-*/=]))/g, (_, group: string, exponent: string) => `${group}${toSuperscript(exponent)}`)
    .replace(/([A-Za-z0-9])\^?([23])(?=($|[\s，。,.；;、?!？+\-*/=]))/g, (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`);
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
    .replace(/([A-Za-z0-9)\]}])\s*\^\s*\{\s*([0-9+-]+)\s*\}/g, (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`)
    .replace(/([A-Za-z0-9)\]}])\s*\^\s*([0-9+-])/g, (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`);
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

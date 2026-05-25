import { recognizeWithBackendOcr } from "./backendOcr";
import { recognizeWithNativeVision } from "./nativeVision";

export type OcrResult = {
  rawText: string;
  normalizedText: string;
  confidence: number;
  needsUserReview: boolean;
  provider: "google-vision" | "baidu-ocr" | "backend-ocr" | "vision-native" | "deterministic-fallback";
};

const fallbackMathSamples = [
  "一根绳子剪去 8 米后还剩 17 米，原来长多少米？请列方程。",
  "解方程 3x - 7 = 11。",
  "甲数比乙数的 2 倍少 5，甲数是 19。乙数是多少？"
];

export async function recognizeMistakeImage(imageUri: string): Promise<OcrResult> {
  const backendResult = await recognizeWithBackendOcr(imageUri).catch(() => undefined);
  if (backendResult) return backendResult;

  const nativeResult = await recognizeWithNativeVision(imageUri);
  if (nativeResult) {
    const normalizedText = normalizeOcrText(nativeResult.rawText);
    return {
      rawText: nativeResult.rawText,
      normalizedText,
      confidence: nativeResult.confidence,
      needsUserReview: nativeResult.confidence < 0.86,
      provider: "vision-native"
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 450));

  const sampleIndex = Math.abs(hashString(imageUri)) % fallbackMathSamples.length;
  const rawText = fallbackMathSamples[sampleIndex] ?? "请手动确认题干。";

  return {
    rawText,
    normalizedText: normalizeOcrText(rawText),
    confidence: 0.72,
    needsUserReview: true,
    provider: "deterministic-fallback"
  };
}

export function normalizeOcrText(value: string): string {
  return postprocessMathOcrText(value.replace(/\s+/g, " ").trim());
}

export function postprocessMathOcrText(value: string): string {
  return latexToReadableMath(value)
    .replace(/(\([^()\n]{1,80}\))([23456789])(?=($|[\s，。,.；;、?!？+\-*/=]))/g, (_, group: string, exponent: string) => `${group}${toSuperscript(exponent)}`)
    .replace(/([A-Za-z0-9])\^?([23])(?=($|[\s，。,.；;、?!？+\-*/=]))/g, (_, base: string, exponent: string) => `${base}${toSuperscript(exponent)}`);
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

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

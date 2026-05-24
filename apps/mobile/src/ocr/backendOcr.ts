import { getApiBaseUrl } from "../api/client";
import { dataUriToBase64, uriToDataUri } from "../files/dataUri";
import type { OcrResult } from "./recognize";

type BackendOcrResponse = {
  raw_text: string;
  normalized_text: string;
  math_latex?: string[];
  confidence: number;
  needs_user_review: boolean;
  provider: string;
  words: string[];
  log_id?: string;
};

export async function recognizeWithBackendOcr(imageUri: string): Promise<OcrResult | undefined> {
  const dataUri = await uriToDataUri(imageUri);
  const response = await fetch(`${getApiBaseUrl()}/api/v1/ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image_base64: dataUriToBase64(dataUri),
      language_type: "CHN_ENG"
    })
  });

  if (!response.ok) return undefined;

  const payload = (await response.json()) as BackendOcrResponse;
  return {
    rawText: payload.raw_text,
    normalizedText: payload.normalized_text,
    confidence: payload.confidence,
    needsUserReview: payload.needs_user_review,
    provider: payload.provider === "baidu-ocr" ? "baidu-ocr" : "backend-ocr"
  };
}

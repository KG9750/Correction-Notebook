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

export async function recognizeWithBackendOcr(imageUri: string): Promise<OcrResult> {
  const dataUri = await uriToDataUri(imageUri);
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/v1/ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image_base64: dataUriToBase64(dataUri),
      language_type: "CHN_ENG"
    })
  }).catch((error: unknown) => {
    throw new Error(`无法连接后端 OCR 服务 ${apiBaseUrl}。请确认一键启动器里的 API 窗口仍在运行。原始错误：${formatError(error)}`);
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new Error(`后端 OCR 失败（${response.status}）：${payload?.message ?? payload?.error ?? "后端没有返回错误详情。"}`);
  }

  const payload = (await response.json()) as BackendOcrResponse;
  const rawText = payload.raw_text.trim();
  const normalizedText = payload.normalized_text.trim();
  if (!rawText && !normalizedText) {
    throw new Error("后端 OCR 没有识别出文字。请重新调整裁剪框，或手动录入题干。");
  }

  return {
    rawText: payload.raw_text,
    normalizedText: payload.normalized_text,
    confidence: payload.confidence,
    needsUserReview: payload.needs_user_review,
    provider: payload.provider === "google-vision" ? "google-vision" : payload.provider === "baidu-ocr" ? "baidu-ocr" : "backend-ocr"
  };
}

async function readErrorPayload(response: Response): Promise<{ error?: string; message?: string } | undefined> {
  return response.json().catch(() => undefined) as Promise<{ error?: string; message?: string } | undefined>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

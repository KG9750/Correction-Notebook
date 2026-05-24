import type { OcrResult } from "@correction-notebook/shared";

type FetchLike = typeof fetch;

type BaiduTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type BaiduOcrResponse = {
  log_id?: number | string;
  words_result?: Array<{
    words?: string;
    location?: BaiduLocation;
    probability?: {
      average?: number;
      min?: number;
      variance?: number;
    };
  }>;
  formula_result?: Array<{
    words?: string;
    location?: BaiduLocation;
  }>;
  formula_result_num?: number;
  words_result_num?: number;
  error_code?: number;
  error_msg?: string;
};

type BaiduLocation = {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

export type BaiduOcrClientOptions = {
  apiKey?: string;
  secretKey?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
};

export class BaiduOcrConfigurationError extends Error {
  constructor() {
    super("Baidu OCR is not configured. Set BAIDU_OCR_API_KEY and BAIDU_OCR_SECRET_KEY on the API service.");
    this.name = "BaiduOcrConfigurationError";
  }
}

export class BaiduOcrClient {
  private readonly apiKey: string | undefined;
  private readonly secretKey: string | undefined;
  private readonly endpoint: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private tokenCache?: { accessToken: string; expiresAt: number };

  constructor(options: BaiduOcrClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.BAIDU_OCR_API_KEY;
    this.secretKey = options.secretKey ?? process.env.BAIDU_OCR_SECRET_KEY;
    this.endpoint =
      options.endpoint ??
      process.env.BAIDU_OCR_ENDPOINT ??
      "https://aip.baidubce.com/rest/2.0/ocr/v1/formula";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.secretKey);
  }

  async recognize(imageBase64: string, languageType = "CHN_ENG"): Promise<OcrResult> {
    if (!this.isConfigured()) throw new BaiduOcrConfigurationError();

    const accessToken = await this.getAccessToken();
    const body = new URLSearchParams({
      image: stripDataUriPrefix(imageBase64),
      language_type: languageType,
      detect_direction: "true",
      disp_formula: "true"
    });

    const response = await this.fetchImpl(`${this.endpoint}?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const payload = (await response.json()) as BaiduOcrResponse;
    if (!response.ok || payload.error_code) {
      throw new Error(`Baidu OCR request failed: ${payload.error_msg ?? response.statusText}`);
    }

    return normalizeBaiduOcrResponse(payload);
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > this.now() + 60_000) {
      return this.tokenCache.accessToken;
    }

    if (!this.apiKey || !this.secretKey) throw new BaiduOcrConfigurationError();

    const tokenUrl = new URL("https://aip.baidubce.com/oauth/2.0/token");
    tokenUrl.searchParams.set("grant_type", "client_credentials");
    tokenUrl.searchParams.set("client_id", this.apiKey);
    tokenUrl.searchParams.set("client_secret", this.secretKey);

    const response = await this.fetchImpl(tokenUrl);
    const payload = (await response.json()) as BaiduTokenResponse;
    if (!response.ok || !payload.access_token) {
      throw new Error(`Baidu OCR token request failed: ${payload.error_description ?? payload.error ?? response.statusText}`);
    }

    const expiresInMs = Math.max(60, payload.expires_in ?? 2_592_000) * 1000;
    this.tokenCache = {
      accessToken: payload.access_token,
      expiresAt: this.now() + expiresInMs
    };
    return payload.access_token;
  }
}

export function stripDataUriPrefix(value: string): string {
  const commaIndex = value.indexOf(",");
  if (value.startsWith("data:") && commaIndex >= 0) {
    return value.slice(commaIndex + 1);
  }
  return value;
}

export function normalizeBaiduOcrResponse(payload: BaiduOcrResponse): OcrResult {
  const wordsBlocks = (payload.words_result ?? []).map((item) => ({
    text: postprocessMathOcrText(item.words?.trim() ?? ""),
    kind: "text" as const,
    location: item.location
  }));
  const formulaBlocks = (payload.formula_result ?? []).map((item) => ({
    text: latexToReadableMath(item.words?.trim() ?? ""),
    latex: item.words?.trim() ?? "",
    kind: "formula" as const,
    location: item.location
  }));
  const blocks = [...wordsBlocks, ...formulaBlocks]
    .filter((item) => item.text)
    .sort(compareBaiduBlocks);
  const words = blocks
    .map((item) => item.text)
    .filter(Boolean);
  const rawText = postprocessMathOcrText(words.join("\n"));
  const confidenceValues = (payload.words_result ?? [])
    .map((item) => item.probability?.average)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const confidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : rawText.length > 0
        ? 0.78
        : 0;

  return {
    raw_text: rawText,
    normalized_text: postprocessMathOcrText(rawText.replace(/\s+/g, " ").trim()),
    math_latex: formulaBlocks.map((item) => item.latex).filter(Boolean),
    confidence,
    needs_user_review: confidence < 0.86 || rawText.length === 0,
    provider: "baidu-ocr",
    words,
    ...(payload.log_id === undefined ? {} : { log_id: String(payload.log_id) })
  };
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

function compareBaiduBlocks(
  a: { location: BaiduLocation | undefined; kind: "text" | "formula" },
  b: { location: BaiduLocation | undefined; kind: "text" | "formula" }
): number {
  const aTop = a.location?.top ?? Number.MAX_SAFE_INTEGER;
  const bTop = b.location?.top ?? Number.MAX_SAFE_INTEGER;
  if (Math.abs(aTop - bTop) > 16) return aTop - bTop;
  const aLeft = a.location?.left ?? Number.MAX_SAFE_INTEGER;
  const bLeft = b.location?.left ?? Number.MAX_SAFE_INTEGER;
  if (aLeft !== bLeft) return aLeft - bLeft;
  return a.kind === b.kind ? 0 : a.kind === "text" ? -1 : 1;
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

import { describe, expect, it } from "vitest";
import { resolveDeepSeekApiModel } from "./deepseek-provider.js";

describe("DeepSeekProvider model routing", () => {
  it("maps product-facing V4 labels to configured API model names", () => {
    expect(resolveDeepSeekApiModel("deepseek-v4-pro")).toBe("deepseek-chat");
    expect(resolveDeepSeekApiModel("deepseek-v4-flash")).toBe("deepseek-chat");
    expect(resolveDeepSeekApiModel("custom-model")).toBe("custom-model");
  });
});

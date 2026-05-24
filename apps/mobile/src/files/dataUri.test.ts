import { describe, expect, it } from "vitest";
import { dataUriToBase64 } from "./dataUri";

describe("data URI helpers", () => {
  it("extracts base64 content from a data URI", () => {
    expect(dataUriToBase64("data:image/jpeg;base64,abc123")).toBe("abc123");
    expect(dataUriToBase64("abc123")).toBe("abc123");
  });
});

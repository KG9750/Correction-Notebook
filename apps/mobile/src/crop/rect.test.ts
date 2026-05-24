import { describe, expect, it } from "vitest";
import { adjustCropRect, clampCropPercent, percentRectToPixelCrop } from "./rect";

describe("crop rectangle helpers", () => {
  it("converts percent crop rectangles into pixel crop rectangles", () => {
    expect(percentRectToPixelCrop({ left: 10, top: 20, width: 50, height: 40 }, { width: 1000, height: 500 })).toEqual({
      originX: 100,
      originY: 100,
      width: 500,
      height: 200
    });
  });

  it("keeps crop rectangles inside the image", () => {
    expect(clampCropPercent({ left: 90, top: 90, width: 30, height: 30 })).toEqual({
      left: 90,
      top: 90,
      width: 10,
      height: 10
    });
  });

  it("adjusts one crop dimension at a time", () => {
    expect(adjustCropRect({ left: 10, top: 10, width: 80, height: 70 }, "left", -20).left).toBe(0);
  });
});

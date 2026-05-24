export type CropPercentRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ImageSize = {
  width: number;
  height: number;
};

export function clampCropPercent(rect: CropPercentRect): CropPercentRect {
  const left = clamp(rect.left, 0, 95);
  const top = clamp(rect.top, 0, 95);
  const width = clamp(rect.width, 5, 100 - left);
  const height = clamp(rect.height, 5, 100 - top);
  return { left, top, width, height };
}

export function percentRectToPixelCrop(rect: CropPercentRect, imageSize: ImageSize) {
  const clamped = clampCropPercent(rect);
  return {
    originX: Math.round((clamped.left / 100) * imageSize.width),
    originY: Math.round((clamped.top / 100) * imageSize.height),
    width: Math.max(1, Math.round((clamped.width / 100) * imageSize.width)),
    height: Math.max(1, Math.round((clamped.height / 100) * imageSize.height))
  };
}

export function adjustCropRect(rect: CropPercentRect, key: keyof CropPercentRect, delta: number): CropPercentRect {
  return clampCropPercent({
    ...rect,
    [key]: rect[key] + delta
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

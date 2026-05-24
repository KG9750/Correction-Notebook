import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type NativeVisionOcrModule = {
  recognizeText(imageUri: string): Promise<{
    rawText: string;
    confidence: number;
  }>;
};

export async function recognizeWithNativeVision(imageUri: string): Promise<{ rawText: string; confidence: number } | undefined> {
  if (Platform.OS !== "ios") return undefined;

  try {
    const module = requireNativeModule<NativeVisionOcrModule>("CorrectionVisionOcr");
    const result = await module.recognizeText(imageUri);
    if (!result.rawText.trim()) return undefined;
    return result;
  } catch {
    return undefined;
  }
}

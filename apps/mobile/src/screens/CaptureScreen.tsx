import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CropOverlay } from "../crop/CropOverlay";
import { percentRectToPixelCrop, type CropPercentRect, type ImageSize } from "../crop/rect";
import { recognizeMistakeImage, type OcrResult } from "../ocr/recognize";
import { splitStudentAnswerFromOcr } from "../ocr/splitStudentAnswer";
import { SecondaryButton } from "../ui/components";
import { palette, styles } from "../ui/styles";

export function CaptureScreen({ onCaptured }: { onCaptured: (input: { imageUri?: string; ocrText: string; studentAnswer: string }) => void }) {
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [originalImageUri, setOriginalImageUri] = useState<string | undefined>();
  const [originalImageSize, setOriginalImageSize] = useState<ImageSize | undefined>();
  const [imageSize, setImageSize] = useState<ImageSize | undefined>();
  const [cropRect, setCropRect] = useState<CropPercentRect>({ left: 8, top: 8, width: 84, height: 64 });
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [isCropping, setIsCropping] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");
  const [ocrState, setOcrState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [ocrResult, setOcrResult] = useState<OcrResult | undefined>();

  const runOcr = async (uri: string) => {
    setOcrState("running");
    setOcrResult(undefined);
    setOcrText("");
    setStudentAnswer("");
    try {
      const result = await recognizeMistakeImage(uri);
      const split = splitStudentAnswerFromOcr(result.rawText || result.normalizedText);
      setOcrText(split.questionText || result.normalizedText);
      setStudentAnswer(split.studentAnswer);
      setOcrResult(result);
      setOcrState("done");
    } catch {
      setOcrState("failed");
      setOcrText("");
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      const sourceSize = asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined;
      setOriginalImageUri(asset.uri);
      setOriginalImageSize(sourceSize);
      setImageUri(asset.uri);
      setImageSize(sourceSize);
      setCropRect({ left: 8, top: 8, width: 84, height: 64 });
      await runOcr(asset.uri);
    }
  };

  const captureWithCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert("需要相机权限才能拍照，请在系统设置中开启。");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      const sourceSize = asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined;
      setOriginalImageUri(asset.uri);
      setOriginalImageSize(sourceSize);
      setImageUri(asset.uri);
      setImageSize(sourceSize);
      setCropRect({ left: 8, top: 8, width: 84, height: 64 });
      await runOcr(asset.uri);
    }
  };

  const applyCrop = async () => {
    if (!originalImageUri || !imageSize) return;
    setIsCropping(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        originalImageUri,
        [{ crop: percentRectToPixelCrop(cropRect, imageSize) }],
        { compress: 0.94, format: ImageManipulator.SaveFormat.JPEG }
      );
      setImageUri(result.uri);
      setImageSize({ width: result.width, height: result.height });
      setCropRect({ left: 0, top: 0, width: 100, height: 100 });
      await runOcr(result.uri);
    } finally {
      setIsCropping(false);
    }
  };

  const resetCrop = async () => {
    if (!originalImageUri) return;
    setImageUri(originalImageUri);
    setImageSize(originalImageSize);
    setCropRect({ left: 8, top: 8, width: 84, height: 64 });
    await runOcr(originalImageUri);
  };

  const imageAspect = imageSize ? imageSize.width / imageSize.height : undefined;
  const previewHeight = imageAspect && containerSize.width > 0 ? containerSize.width / imageAspect : undefined;

  return (
    <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>拍题并确认 OCR</Text>
      </View>
      <View style={styles.captureLayout}>
        <View style={styles.captureMediaColumn}>
          <View
            style={[styles.capturePreview, previewHeight ? { height: previewHeight, flexGrow: 0 } : undefined]}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setContainerSize({ width, height });
            }}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <View style={styles.previewEmpty}>
                <Ionicons name="scan-outline" size={34} color={palette.primary} />
                <Text style={styles.previewEmptyTitle}>等待拍题</Text>
                <Text style={styles.previewText}>相机或相册导入后，在这里框出真正的错题区域。</Text>
              </View>
            )}
            {imageUri && originalImageUri === imageUri ? (
              <CropOverlay
                rect={cropRect}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                imageSize={imageSize}
                onRectChange={setCropRect}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
              />
            ) : null}
          </View>
          <View style={styles.previewActions}>
            <SecondaryButton icon="camera-outline" label="拍照" onPress={captureWithCamera} />
            <SecondaryButton icon="image-outline" label="相册导入" onPress={pickFromLibrary} />
          </View>
          {imageUri ? (
            <View style={styles.cropPanel}>
              <Text style={styles.inputLabel}>框出错题区域 — 拖拽橙色框和四角圆点来调整</Text>
              <View style={styles.previewActions}>
                <SecondaryButton icon="crop-outline" label={isCropping ? "裁剪中" : "应用裁剪并重新 OCR"} onPress={applyCrop} />
                <SecondaryButton icon="refresh-outline" label="重置原图" onPress={resetCrop} />
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.formPanel}>
          <View style={[styles.ocrStatus, ocrState === "failed" && styles.ocrStatusFailed]}>
            <Ionicons
              name={ocrState === "running" ? "sync-outline" : ocrState === "done" ? "checkmark-circle-outline" : ocrState === "failed" ? "alert-circle-outline" : "scan-outline"}
              size={18}
              color={ocrState === "failed" ? palette.primary : palette.teal}
            />
            <Text style={[styles.ocrStatusText, ocrState === "failed" && styles.ocrStatusTextFailed]}>
              {ocrState === "idle" ? "拍照或导入后会自动执行 OCR" : null}
              {ocrState === "running" ? "OCR 识别中，完成后会自动填入题干" : null}
              {ocrState === "done" ? `OCR 已完成，置信度 ${Math.round((ocrResult?.confidence ?? 0) * 100)}%，请核对` : null}
              {ocrState === "failed" ? "OCR 失败，可先手动录入题干并保存" : null}
            </Text>
          </View>
          <Text style={styles.inputLabel}>OCR 题干，可手动修改</Text>
          <TextInput multiline value={ocrText} onChangeText={setOcrText} placeholder="拍照或导入图片后自动识别，也可手动输入" style={styles.textArea} />
          <Text style={styles.inputLabel}>学生原答案</Text>
          <TextInput value={studentAnswer} onChangeText={setStudentAnswer} style={styles.input} />
          <Pressable
            style={styles.saveButton}
            onPress={() => onCaptured({ ...(imageUri ? { imageUri } : {}), ocrText, studentAnswer })}
          >
            <Ionicons name="save-outline" size={20} color={palette.canvas} />
            <Text style={styles.saveButtonText}>保存到错题本</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

import { useRef } from "react";
import { PanResponder, View, type PanResponderGestureState } from "react-native";
import { clampCropPercent, type CropPercentRect, type ImageSize } from "./rect";

type Props = {
  rect: CropPercentRect;
  containerWidth: number;
  containerHeight: number;
  imageSize: ImageSize | undefined;
  onRectChange: (rect: CropPercentRect) => void;
};

type DisplayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function getImageDisplayRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): DisplayRect {
  const imageAspect = imageWidth / imageHeight;
  const containerAspect = containerWidth / containerHeight;

  if (imageAspect > containerAspect) {
    const displayHeight = containerWidth / imageAspect;
    return {
      left: 0,
      top: (containerHeight - displayHeight) / 2,
      width: containerWidth,
      height: displayHeight
    };
  }
  const displayWidth = containerHeight * imageAspect;
  return {
    left: (containerWidth - displayWidth) / 2,
    top: 0,
    width: displayWidth,
    height: containerHeight
  };
}

export function CropOverlay({ rect, containerWidth, containerHeight, imageSize, onRectChange }: Props) {
  const sizeRef = useRef({ containerWidth, containerHeight, imageSize });
  sizeRef.current = { containerWidth, containerHeight, imageSize };

  const callbackRef = useRef(onRectChange);
  callbackRef.current = onRectChange;

  const rectRef = useRef(rect);
  rectRef.current = rect;

  function pxToPct(dx: number, dy: number) {
    const { containerWidth: cw, containerHeight: ch, imageSize: is } = sizeRef.current;
    const disp = is && cw > 0 && ch > 0 ? getImageDisplayRect(cw, ch, is.width, is.height) : { left: 0, top: 0, width: cw, height: ch };
    return {
      dxPct: disp.width > 0 ? (dx / disp.width) * 100 : 0,
      dyPct: disp.height > 0 ? (dy / disp.height) * 100 : 0
    };
  }

  const initialRects = useRef<{
    move?: CropPercentRect;
    tl?: CropPercentRect;
    tr?: CropPercentRect;
    bl?: CropPercentRect;
    br?: CropPercentRect;
  }>({});

  const movePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        initialRects.current.move = rectRef.current;
      },
      onPanResponderMove: (_e, gesture: PanResponderGestureState) => {
        const initial = initialRects.current.move ?? rectRef.current;
        const { dxPct, dyPct } = pxToPct(gesture.dx, gesture.dy);
        callbackRef.current(
          clampCropPercent({
            ...initial,
            left: initial.left + dxPct,
            top: initial.top + dyPct
          })
        );
      }
    })
  ).current;

  const tlPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        initialRects.current.tl = rectRef.current;
      },
      onPanResponderMove: (_e, gesture: PanResponderGestureState) => {
        const initial = initialRects.current.tl ?? rectRef.current;
        const { dxPct, dyPct } = pxToPct(gesture.dx, gesture.dy);
        callbackRef.current(
          clampCropPercent({
            left: initial.left + dxPct,
            top: initial.top + dyPct,
            width: initial.width - dxPct,
            height: initial.height - dyPct
          })
        );
      }
    })
  ).current;

  const trPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        initialRects.current.tr = rectRef.current;
      },
      onPanResponderMove: (_e, gesture: PanResponderGestureState) => {
        const initial = initialRects.current.tr ?? rectRef.current;
        const { dxPct, dyPct } = pxToPct(gesture.dx, gesture.dy);
        callbackRef.current(
          clampCropPercent({
            left: initial.left,
            top: initial.top + dyPct,
            width: initial.width + dxPct,
            height: initial.height - dyPct
          })
        );
      }
    })
  ).current;

  const blPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        initialRects.current.bl = rectRef.current;
      },
      onPanResponderMove: (_e, gesture: PanResponderGestureState) => {
        const initial = initialRects.current.bl ?? rectRef.current;
        const { dxPct, dyPct } = pxToPct(gesture.dx, gesture.dy);
        callbackRef.current(
          clampCropPercent({
            left: initial.left + dxPct,
            top: initial.top,
            width: initial.width - dxPct,
            height: initial.height + dyPct
          })
        );
      }
    })
  ).current;

  const brPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        initialRects.current.br = rectRef.current;
      },
      onPanResponderMove: (_e, gesture: PanResponderGestureState) => {
        const initial = initialRects.current.br ?? rectRef.current;
        const { dxPct, dyPct } = pxToPct(gesture.dx, gesture.dy);
        callbackRef.current(
          clampCropPercent({
            left: initial.left,
            top: initial.top,
            width: initial.width + dxPct,
            height: initial.height + dyPct
          })
        );
      }
    })
  ).current;

  if (containerWidth <= 0 || containerHeight <= 0) {
    return null;
  }

  // Position overlay within the actual image display area (letterboxing-aware)
  const disp = imageSize
    ? getImageDisplayRect(containerWidth, containerHeight, imageSize.width, imageSize.height)
    : { left: 0, top: 0, width: containerWidth, height: containerHeight };

  const overlayLeft = disp.left + (rect.left / 100) * disp.width;
  const overlayTop = disp.top + (rect.top / 100) * disp.height;
  const overlayWidth = (rect.width / 100) * disp.width;
  const overlayHeight = (rect.height / 100) * disp.height;

  return (
    <View
      style={{
        position: "absolute",
        left: overlayLeft,
        top: overlayTop,
        width: overlayWidth,
        height: overlayHeight
      }}
    >
      <View
        {...movePR.panHandlers}
        style={{
          flex: 1,
          borderWidth: 3,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.08)",
          borderRadius: 4
        }}
      />
      <CornerHandle panHandlers={tlPR.panHandlers} anchor="topLeft" />
      <CornerHandle panHandlers={trPR.panHandlers} anchor="topRight" />
      <CornerHandle panHandlers={blPR.panHandlers} anchor="bottomLeft" />
      <CornerHandle panHandlers={brPR.panHandlers} anchor="bottomRight" />
    </View>
  );
}

function CornerHandle({
  panHandlers,
  anchor
}: {
  panHandlers: ReturnType<typeof PanResponder.create>["panHandlers"];
  anchor: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
}) {
  const style: Record<string, number | string> = {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f59e0b",
    borderWidth: 2,
    borderColor: "#ffffff"
  };

  if (anchor === "topLeft") {
    style.top = -12;
    style.left = -12;
  } else if (anchor === "topRight") {
    style.top = -12;
    style.right = -12;
  } else if (anchor === "bottomLeft") {
    style.bottom = -12;
    style.left = -12;
  } else {
    style.bottom = -12;
    style.right = -12;
  }

  return <View {...panHandlers} style={style} />;
}

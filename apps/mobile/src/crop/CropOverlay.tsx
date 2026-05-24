import { useRef } from "react";
import { PanResponder, View, type PanResponderGestureState } from "react-native";
import { clampCropPercent, type CropPercentRect } from "./rect";

type Props = {
  rect: CropPercentRect;
  containerWidth: number;
  containerHeight: number;
  onRectChange: (rect: CropPercentRect) => void;
};

export function CropOverlay({ rect, containerWidth, containerHeight, onRectChange }: Props) {
  const sizeRef = useRef({ containerWidth, containerHeight });
  sizeRef.current = { containerWidth, containerHeight };

  const callbackRef = useRef(onRectChange);
  callbackRef.current = onRectChange;

  const rectRef = useRef(rect);
  rectRef.current = rect;

  const pxToPct = (dx: number, dy: number) => {
    const { containerWidth: cw, containerHeight: ch } = sizeRef.current;
    return {
      dxPct: cw > 0 ? (dx / cw) * 100 : 0,
      dyPct: ch > 0 ? (dy / ch) * 100 : 0
    };
  };

  const initialRects = useRef<{
    move?: CropPercentRect;
    tl?: CropPercentRect;
    tr?: CropPercentRect;
    bl?: CropPercentRect;
    br?: CropPercentRect;
  }>({});

  // Created once, reads from refs in callbacks to avoid stale closures
  const movePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
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
      onStartShouldSetPanResponder: () => true,
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
      onStartShouldSetPanResponder: () => true,
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
      onStartShouldSetPanResponder: () => true,
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
      onStartShouldSetPanResponder: () => true,
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

  return (
    <View
      style={{
        position: "absolute",
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`
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
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f59e0b",
    borderWidth: 2,
    borderColor: "#ffffff"
  };

  if (anchor === "topLeft") {
    style.top = -10;
    style.left = -10;
  } else if (anchor === "topRight") {
    style.top = -10;
    style.right = -10;
  } else if (anchor === "bottomLeft") {
    style.bottom = -10;
    style.left = -10;
  } else {
    style.bottom = -10;
    style.right = -10;
  }

  return <View {...panHandlers} style={style} />;
}

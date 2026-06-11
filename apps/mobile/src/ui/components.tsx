import { Ionicons } from "@expo/vector-icons";
import type { Mistake } from "@correction-notebook/shared";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import type { AppSection } from "../types";
import { palette, styles } from "./styles";

export type IconName = keyof typeof Ionicons.glyphMap;

const navItems: Array<{ key: AppSection; label: string; icon: IconName }> = [
  { key: "home", label: "首页", icon: "home-outline" },
  { key: "capture", label: "拍题", icon: "camera-outline" },
  { key: "notebook", label: "错题本", icon: "albums-outline" },
  { key: "collection", label: "错题集", icon: "file-tray-full-outline" },
  { key: "paper", label: "测试卷", icon: "print-outline" },
  { key: "report", label: "报告", icon: "bar-chart-outline" },
  { key: "settings", label: "设置", icon: "settings-outline" }
];

export function Sidebar({ activeSection, compact, onNavigate }: { activeSection: AppSection; compact: boolean; onNavigate: (section: AppSection) => void }) {
  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View style={styles.brandBlock}>
        <View style={styles.brandMark}>
          <Ionicons name="checkmark-done" size={20} color={palette.canvas} />
        </View>
        {!compact ? (
          <View>
            <Text style={styles.brandTitle}>Correction</Text>
            <Text style={styles.brandSubtitle}>Notebook</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.navList}>
        {navItems.map((item) => {
          const active = activeSection === item.key;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              key={item.key}
              style={[styles.navItem, active && styles.navItemActive, compact && styles.navItemCompact]}
              onPress={() => onNavigate(item.key)}
            >
              <Ionicons name={item.icon} size={21} color={active ? palette.ink : palette.muted} />
              {!compact ? <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PrimaryAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.primaryAction} onPress={onPress}>
      <Ionicons name={icon} size={24} color={palette.primary} />
      <Text style={styles.primaryActionText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ icon, label, onPress, disabled = false }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.secondaryButton, disabled && styles.secondaryButtonDisabled]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={18} color={disabled ? palette.muted : palette.ink} />
      <Text style={[styles.secondaryButtonText, disabled && styles.secondaryButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  spinning = false
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spinning) {
      spinValue.stopAnimation();
      spinValue.setValue(0);
      return;
    }

    spinValue.setValue(0);
    const animation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spinning, spinValue]);

  const rotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.iconButton, disabled && styles.iconButtonDisabled]}
      onPress={onPress}
    >
      <Animated.View style={spinning ? { transform: [{ rotate: rotation }] } : undefined}>
        <Ionicons name={icon} size={19} color={disabled ? palette.muted : palette.ink} />
      </Animated.View>
    </Pressable>
  );
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
        {action ? <View style={styles.panelHeaderAction}>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

export function MistakeRow({ mistake, active = false, archived = false, onPress }: { mistake: Mistake; active?: boolean; archived?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.mistakeRow, active && styles.mistakeRowActive]} onPress={onPress}>
      <View style={styles.thumbnail}>
        <Ionicons name="document-text-outline" size={20} color={palette.primary} />
      </View>
      <View style={styles.mistakeRowText}>
        <View style={styles.mistakeTitleRow}>
          <Text numberOfLines={4} style={styles.mistakeTitle}>{mistake.normalized_question_text || mistake.ocr_text || "未识别题干"}</Text>
          {archived ? <Ionicons name="archive" size={16} color={palette.teal} /> : null}
        </View>
        <Text style={styles.mistakeMeta}>{mistake.knowledge_points.join(" / ")} · {masteryLabel(mistake.mastery_status)}</Text>
      </View>
    </Pressable>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function TagRow({ tags }: { tags: string[] }) {
  return (
    <View style={styles.tagRow}>
      {tags.slice(0, 3).map((tag) => (
        <Text key={tag} style={styles.tag}>{tag}</Text>
      ))}
    </View>
  );
}

export function groupMistakesForArchive(mistakes: Mistake[]) {
  const pending = mistakes.filter(isPendingClassification);
  const classified = mistakes.filter((mistake) => !isPendingClassification(mistake));
  const groups: Array<{ title: string; mistakes: Mistake[] }> = [];

  if (pending.length > 0) groups.push({ title: "待分类", mistakes: pending });

  const byKnowledgePoint = new Map<string, Mistake[]>();
  classified.forEach((mistake) => {
    const title = firstLevelKnowledgeCategory(mistake.knowledge_points);
    byKnowledgePoint.set(title, [...(byKnowledgePoint.get(title) ?? []), mistake]);
  });

  Array.from(byKnowledgePoint.entries()).forEach(([title, groupMistakes]) => {
    groups.push({ title, mistakes: groupMistakes });
  });

  return groups;
}

function isPendingClassification(mistake: Mistake) {
  return !mistake.main_error_type || mistake.knowledge_points.includes("待识别知识点");
}

function firstLevelKnowledgeCategory(points: string[]) {
  const text = points.join("、");
  if (text.includes("集合")) return "集合";
  if (text.includes("二项式")) return "二项式";
  if (text.includes("方程")) return "方程";
  if (text.includes("不等式")) return "不等式";
  if (text.includes("函数")) return "函数";
  if (text.includes("数列")) return "数列";
  if (text.includes("三角")) return "三角函数";
  if (text.includes("向量")) return "平面向量";
  if (text.includes("几何") || text.includes("圆") || text.includes("三角形") || text.includes("四边形")) return "几何";
  if (text.includes("概率") || text.includes("统计")) return "概率统计";
  if (text.includes("导数")) return "导数";
  if (text.includes("复数")) return "复数";
  return points.find((point) => point !== "待识别知识点") ?? "其他";
}

function masteryLabel(status: Mistake["mastery_status"]) {
  if (status === "mastered") return "已掌握";
  if (status === "partially_mastered") return "部分掌握";
  return "未掌握";
}

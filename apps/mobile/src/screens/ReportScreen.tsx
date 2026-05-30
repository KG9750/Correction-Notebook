import { Ionicons } from "@expo/vector-icons";
import type { Mistake } from "@correction-notebook/shared";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, type ViewStyle, View } from "react-native";
import type { NotebookState } from "../types";
import { Panel } from "../ui/components";
import { palette, styles } from "../ui/styles";

export function ReportScreen({ state, onCreatePaper }: { state: NotebookState; onCreatePaper: () => void }) {
  const report = useMemo(() => buildWeeklyReport(state), [state]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>本周报告</Text>
        <Text style={styles.pageSubtitle}>根据本周错题和变式练习自动汇总。</Text>
      </View>
      <Panel title="总结">
        <Text style={styles.summaryText}>{report.summary}</Text>
        <Pressable style={styles.saveButton} onPress={onCreatePaper}>
          <Ionicons name="print-outline" size={20} color={palette.canvas} />
          <Text style={styles.saveButtonText}>从报告生成复测卷</Text>
        </Pressable>
      </Panel>
      <View style={styles.reportChartGrid}>
        <ReportBarChart title="高频错因" entries={report.errorEntries} emptyLabel="本周暂无已分析错因" />
        <ReportBarChart title="薄弱知识点" entries={report.knowledgeEntries} emptyLabel="本周暂无可用知识点" />
        <PassRateChart correct={report.correctAttempts} total={report.totalAttempts} />
      </View>
    </ScrollView>
  );
}

type ReportEntry = {
  label: string;
  count: number;
  barWidth: ViewStyle["width"];
};

function buildWeeklyReport(state: NotebookState) {
  const weekMistakes = state.mistakes.filter((mistake) => isWithinLastDays(mistake.created_at, 7));
  const weekAttempts = state.attempts.filter((attempt) => isWithinLastDays(attempt.created_at, 7));
  const errorEntries = topReportEntries(weekMistakes.map((mistake) => mistake.main_error_type ?? "待分析"), 4);
  const knowledgeEntries = topReportEntries(
    weekMistakes.flatMap((mistake) =>
      mistake.knowledge_points.filter((point) => point.trim() && point !== "待识别知识点")
    ),
    5
  );
  const correctAttempts = weekAttempts.filter((attempt) => attempt.is_correct).length;
  const totalAttempts = weekAttempts.length;
  const summary = formatWeeklySummary({
    weekMistakes,
    errorEntries,
    knowledgeEntries,
    correctAttempts,
    totalAttempts,
    totalMistakes: state.mistakes.length
  });

  return { summary, errorEntries, knowledgeEntries, correctAttempts, totalAttempts };
}

function formatWeeklySummary(input: {
  weekMistakes: Mistake[];
  errorEntries: ReportEntry[];
  knowledgeEntries: ReportEntry[];
  correctAttempts: number;
  totalAttempts: number;
  totalMistakes: number;
}) {
  const { weekMistakes, errorEntries, knowledgeEntries, correctAttempts, totalAttempts, totalMistakes } = input;
  if (weekMistakes.length === 0) {
    const practiceText = totalAttempts > 0
      ? `本周变式练习判定 ${totalAttempts} 次，通过 ${correctAttempts} 次，通过率 ${Math.round((correctAttempts / totalAttempts) * 100)}%。`
      : "本周还没有变式练习判定记录。";
    return `本周还没有新增错题。当前错题本共 ${totalMistakes} 道。${practiceText}`;
  }

  const errorText = errorEntries[0]?.label ?? "待分析";
  const knowledgeText = knowledgeEntries[0]?.label ?? "知识点待补充";
  const practiceText = totalAttempts > 0
    ? `本周变式练习判定 ${totalAttempts} 次，通过 ${correctAttempts} 次，通过率 ${Math.round((correctAttempts / totalAttempts) * 100)}%。`
    : "本周还没有变式练习判定记录。";

  return `本周新增数学错题 ${weekMistakes.length} 道，高频错因是${errorText}，薄弱知识点集中在${knowledgeText}。${practiceText}`;
}

function isWithinLastDays(isoDate: string, days: number) {
  const time = new Date(isoDate).getTime();
  if (Number.isNaN(time)) return false;
  return time >= Date.now() - days * 86_400_000;
}

function topReportEntries(values: string[], limit: number): ReportEntry[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const label = value.trim();
    if (!label) return;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  const sorted = Array.from(counts.entries())
    .sort(([leftLabel, leftCount], [rightLabel, rightCount]) => rightCount - leftCount || leftLabel.localeCompare(rightLabel))
    .slice(0, limit);
  const maxCount = sorted[0]?.[1] ?? 0;

  return sorted.map(([label, count]) => ({
    label,
    count,
    barWidth: `${Math.max(Math.round((count / maxCount) * 100), 8)}%` as ViewStyle["width"]
  }));
}

function ReportBarChart({ title, entries, emptyLabel }: { title: string; entries: ReportEntry[]; emptyLabel: string }) {
  return (
    <View style={styles.reportChartBlock}>
      <Text style={styles.reportChartTitle}>{title}</Text>
      {entries.length > 0 ? (
        <View style={styles.reportBars}>
          {entries.map((entry) => (
            <View key={entry.label} style={styles.reportBarRow}>
              <View style={styles.reportBarMeta}>
                <Text numberOfLines={1} style={styles.reportBarLabel}>{entry.label}</Text>
                <Text style={styles.reportBarCount}>{entry.count} 次</Text>
              </View>
              <View style={styles.reportBarTrack}>
                <View style={[styles.reportBarFill, { width: entry.barWidth }]} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.reportEmptyText}>{emptyLabel}</Text>
      )}
    </View>
  );
}

function PassRateChart({ correct, total }: { correct: number; total: number }) {
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const fillWidth = `${percent}%` as ViewStyle["width"];

  return (
    <View style={styles.reportChartBlock}>
      <Text style={styles.reportChartTitle}>通过率</Text>
      <View style={styles.passRateHeader}>
        <Text style={styles.passRateValue}>{total > 0 ? `${percent}%` : "暂无"}</Text>
        <Text style={styles.reportBarCount}>{total > 0 ? `${correct}/${total} 次通过` : "还没有判定记录"}</Text>
      </View>
      <View style={styles.passRateTrack}>
        <View style={[styles.passRateFill, { width: fillWidth }]} />
      </View>
    </View>
  );
}

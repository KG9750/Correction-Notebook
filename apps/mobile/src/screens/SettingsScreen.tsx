import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { AppSettings } from "../types";
import { Panel } from "../ui/components";
import { palette, styles } from "../ui/styles";

export function SettingsScreen({
  settings,
  onChange,
  backupStatus,
  onExportBackup,
  onImportBackup
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  backupStatus: string;
  onExportBackup: () => void;
  onImportBackup: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.pageTitle}>设置</Text>
        <Text style={styles.pageSubtitle}>调整练习生成和大模型调用方式。</Text>
      </View>
      <Panel title="大模型">
        <View style={styles.settingChoiceGrid}>
          <SettingChoice
            active={settings.deepseekModel === "deepseek-v4-pro"}
            icon="sparkles-outline"
            title="DeepSeek V4 Pro"
            description="质量优先，适合错因讲解和复杂题。"
            onPress={() => onChange({ deepseekModel: "deepseek-v4-pro" })}
          />
          <SettingChoice
            active={settings.deepseekModel === "deepseek-v4-flash"}
            icon="flash-outline"
            title="DeepSeek V4 Flash"
            description="速度优先，适合快速生成变式练习。"
            onPress={() => onChange({ deepseekModel: "deepseek-v4-flash" })}
          />
        </View>
      </Panel>
      <Panel title="基础设置">
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>每次生成变式题</Text>
            <Text style={styles.settingDescription}>用于拍题后自动生成和手动刷新。</Text>
          </View>
          <View style={styles.segmentedControl}>
            <SegmentButton label="3 题" active={settings.practiceCount === 3} onPress={() => onChange({ practiceCount: 3 })} />
            <SegmentButton label="5 题" active={settings.practiceCount === 5} onPress={() => onChange({ practiceCount: 5 })} />
          </View>
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>练习难度</Text>
            <Text style={styles.settingDescription}>默认自适应会根据原题和错因调整。</Text>
          </View>
          <View style={styles.segmentedControl}>
            <SegmentButton label="自适应" active={settings.practiceDifficulty === "adaptive"} onPress={() => onChange({ practiceDifficulty: "adaptive" })} />
            <SegmentButton label="基础" active={settings.practiceDifficulty === "basic"} onPress={() => onChange({ practiceDifficulty: "basic" })} />
            <SegmentButton label="标准" active={settings.practiceDifficulty === "standard"} onPress={() => onChange({ practiceDifficulty: "standard" })} />
            <SegmentButton label="挑战" active={settings.practiceDifficulty === "challenge"} onPress={() => onChange({ practiceDifficulty: "challenge" })} />
          </View>
        </View>
      </Panel>
      <Panel title="iCloud Drive 备份">
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>本地可恢复备份</Text>
            <Text style={styles.settingDescription}>导出结构化错题数据、图片资产引用、正式复测卷 PDF 和生成 manifest。</Text>
          </View>
          <View style={styles.formActions}>
            <Pressable style={styles.segmentButton} onPress={onExportBackup}>
              <Ionicons name="cloud-upload-outline" size={18} color={palette.primary} />
              <Text style={styles.segmentButtonText}>导出</Text>
            </Pressable>
            <Pressable style={styles.segmentButton} onPress={onImportBackup}>
              <Ionicons name="cloud-download-outline" size={18} color={palette.primary} />
              <Text style={styles.segmentButtonText}>恢复</Text>
            </Pressable>
          </View>
        </View>
        {backupStatus ? <Text style={styles.bodyText}>{backupStatus}</Text> : null}
      </Panel>
    </ScrollView>
  );
}

function SettingChoice({
  active,
  icon,
  title,
  description,
  onPress
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.settingChoice, active && styles.settingChoiceActive]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={active ? palette.primary : palette.muted} />
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      {active ? <Ionicons name="checkmark-circle" size={20} color={palette.teal} /> : null}
    </Pressable>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

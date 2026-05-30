import { Platform, StyleSheet } from "react-native";

export const palette = {
  canvas: "#f7efe4",
  surface: "#efe3d3",
  panel: "#fff9f0",
  paper: "#fffdf8",
  ink: "#2b2520",
  body: "#51463d",
  muted: "#7a6b5f",
  hairline: "#dfcdb7",
  hairlineStrong: "#c8ad91",
  heroPanel: "#f3e5d2",
  heroBorder: "#d6b58f",
  primary: "#b95634",
  primarySoft: "#d78360",
  primaryTint: "#f4dacd",
  amber: "#9a6a23",
  amberTint: "#f6ead0",
  teal: "#266b61",
  tealTint: "#deece6",
  tealBorder: "#adcdc2",
  dangerTint: "#fff0e6"
};

const displayFont = Platform.select({
  ios: "Songti SC",
  web: "Songti SC, STSong, Noto Serif CJK SC, Source Han Serif SC, serif",
  default: "serif"
});

const bodyFont = Platform.select({
  ios: "PingFang SC",
  web: "PingFang SC, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, sans-serif",
  default: "sans-serif"
});

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.canvas
  },
  shell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: palette.canvas
  },
  shellCompact: {
    flexDirection: "row"
  },
  sidebar: {
    width: 204,
    padding: 18,
    borderRightWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.panel
  },
  sidebarCompact: {
    width: 76,
    paddingHorizontal: 10
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 28
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary
  },
  brandTitle: {
    fontSize: 18,
    fontFamily: displayFont,
    fontWeight: "600",
    letterSpacing: 0,
    color: palette.ink
  },
  brandSubtitle: {
    fontSize: 12,
    fontFamily: bodyFont,
    lineHeight: 16,
    color: palette.muted
  },
  navList: {
    gap: 7
  },
  navItem: {
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  navItemCompact: {
    justifyContent: "center",
    paddingHorizontal: 0
  },
  navItemActive: {
    backgroundColor: palette.surface
  },
  navText: {
    fontSize: 15,
    fontFamily: bodyFont,
    color: palette.muted,
    fontWeight: "600"
  },
  navTextActive: {
    color: palette.ink
  },
  content: {
    flex: 1
  },
  screen: {
    padding: 24,
    gap: 18
  },
  homeHero: {
    borderRadius: 8,
    padding: 24,
    backgroundColor: palette.heroPanel,
    borderWidth: 1,
    borderColor: palette.heroBorder,
    gap: 18
  },
  screenHeader: {
    gap: 8,
    maxWidth: 790
  },
  heroKicker: {
    color: palette.primary,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: "700"
  },
  heroTitle: {
    fontSize: 35,
    lineHeight: 44,
    fontFamily: displayFont,
    fontWeight: "600",
    letterSpacing: 0,
    color: palette.ink
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 25,
    fontFamily: bodyFont,
    color: palette.body
  },
  pageTitle: {
    fontSize: 32,
    lineHeight: 40,
    fontFamily: displayFont,
    fontWeight: "600",
    letterSpacing: 0,
    color: palette.ink
  },
  pageSubtitle: {
    fontSize: 16,
    lineHeight: 25,
    fontFamily: bodyFont,
    color: palette.muted
  },
  heroNote: {
    alignSelf: "flex-start",
    maxWidth: 420,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: "#deb199",
    gap: 3
  },
  heroNoteLabel: {
    color: palette.primary,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: "700"
  },
  heroNoteText: {
    color: palette.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600"
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  primaryAction: {
    minWidth: 184,
    minHeight: 76,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.hairlineStrong
  },
  primaryActionText: {
    fontSize: 16,
    fontFamily: bodyFont,
    fontWeight: "700",
    color: palette.ink
  },
  gridTwo: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  panel: {
    flexGrow: 1,
    flexBasis: 320,
    borderRadius: 8,
    padding: 18,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 12
  },
  panelHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  panelTitle: {
    flexShrink: 1,
    fontSize: 20,
    fontFamily: displayFont,
    fontWeight: "600",
    letterSpacing: 0,
    color: palette.ink
  },
  panelHeaderAction: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0
  },
  settingChoiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  settingChoice: {
    flexGrow: 1,
    flexBasis: 250,
    minHeight: 96,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.hairline
  },
  settingChoiceActive: {
    borderColor: palette.primary,
    backgroundColor: "#fff4e8"
  },
  settingRow: {
    minHeight: 64,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4
  },
  settingText: {
    flex: 1,
    minWidth: 180,
    gap: 4
  },
  settingTitle: {
    color: palette.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700"
  },
  settingDescription: {
    color: palette.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19
  },
  segmentedControl: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  segmentButton: {
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.hairline
  },
  segmentButtonActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary
  },
  segmentButtonText: {
    color: palette.body,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: "700"
  },
  segmentButtonTextActive: {
    color: palette.canvas
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 26,
    fontFamily: bodyFont,
    color: palette.body
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  metric: {
    minWidth: 112,
    borderRadius: 8,
    padding: 12,
    backgroundColor: palette.amberTint,
    borderWidth: 1,
    borderColor: "#e2cda4"
  },
  metricValue: {
    fontSize: 22,
    fontFamily: displayFont,
    fontWeight: "600",
    letterSpacing: 0,
    color: palette.ink
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: bodyFont,
    color: palette.muted,
    marginTop: 4
  },
  reportChartGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14
  },
  reportChartBlock: {
    flexGrow: 1,
    flexBasis: 250,
    minHeight: 174,
    borderRadius: 8,
    padding: 16,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 12
  },
  reportChartTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontFamily: displayFont,
    fontWeight: "600",
    color: palette.ink,
    letterSpacing: 0
  },
  reportBars: {
    gap: 12
  },
  reportBarRow: {
    gap: 7
  },
  reportBarMeta: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  reportBarLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: bodyFont,
    fontWeight: "700",
    color: palette.ink
  },
  reportBarCount: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: bodyFont,
    color: palette.muted
  },
  reportBarTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.surface
  },
  reportBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.primary
  },
  reportEmptyText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: bodyFont,
    color: palette.muted
  },
  collectionCount: {
    color: palette.teal,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: "700"
  },
  collectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  collectionCard: {
    flexGrow: 1,
    flexBasis: 260,
    minHeight: 136,
    borderRadius: 8,
    padding: 14,
    gap: 9,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.hairline
  },
  collectionCardHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  collectionCategory: {
    color: palette.teal,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: "700"
  },
  collectionTitle: {
    color: palette.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "700"
  },
  passRateHeader: {
    minHeight: 50,
    gap: 4
  },
  passRateValue: {
    fontSize: 34,
    lineHeight: 38,
    fontFamily: displayFont,
    fontWeight: "600",
    color: palette.teal,
    letterSpacing: 0
  },
  passRateTrack: {
    height: 14,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.surface
  },
  passRateFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.teal
  },
  mistakeRow: {
    minHeight: 84,
    borderRadius: 8,
    flexDirection: "row",
    gap: 12,
    padding: 12,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.hairline
  },
  mistakeRowActive: {
    borderColor: palette.primary,
    backgroundColor: "#fff4e8"
  },
  thumbnail: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primaryTint
  },
  mistakeRowText: {
    flex: 1,
    gap: 5
  },
  mistakeTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6
  },
  mistakeTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: bodyFont,
    fontWeight: "700",
    color: palette.ink,
    flexShrink: 1
  },
  mistakeMeta: {
    fontSize: 12,
    fontFamily: bodyFont,
    color: palette.muted
  },
  captureLayout: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18
  },
  captureMediaColumn: {
    flexGrow: 1,
    flexBasis: 320,
    gap: 12
  },
  capturePreview: {
    flexGrow: 1,
    minHeight: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    backgroundColor: "#fffbf4",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative"
  },
  previewImage: {
    width: "100%",
    height: "100%"
  },
  previewEmpty: {
    maxWidth: 260,
    alignItems: "center",
    gap: 9,
    padding: 20
  },
  previewEmptyTitle: {
    color: palette.ink,
    fontFamily: displayFont,
    fontSize: 22,
    fontWeight: "600"
  },
  previewText: {
    color: palette.muted,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  previewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10
  },
  cropPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.panel,
    padding: 12,
    gap: 10
  },
  formPanel: {
    flexGrow: 1,
    flexBasis: 340,
    borderRadius: 8,
    padding: 18,
    gap: 12,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.hairline
  },
  formActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8efe4"
  },
  secondaryButtonDisabled: {
    opacity: 0.58
  },
  secondaryButtonText: {
    color: palette.ink,
    fontFamily: bodyFont,
    fontWeight: "700"
  },
  secondaryButtonTextDisabled: {
    color: palette.muted
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: bodyFont,
    fontWeight: "700",
    color: palette.body
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    paddingHorizontal: 12,
    backgroundColor: palette.paper,
    color: palette.ink,
    fontFamily: bodyFont,
    fontSize: 15
  },
  answerInputRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8
  },
  answerInput: {
    flex: 1
  },
  answerJudgeButton: {
    width: 46,
    minHeight: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary
  },
  textArea: {
    minHeight: 126,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    padding: 12,
    backgroundColor: palette.paper,
    color: palette.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    textAlignVertical: "top"
  },
  ocrStatus: {
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: palette.tealTint,
    borderWidth: 1,
    borderColor: palette.tealBorder
  },
  ocrStatusFailed: {
    backgroundColor: palette.dangerTint,
    borderColor: palette.primarySoft
  },
  ocrStatusText: {
    flex: 1,
    color: palette.teal,
    fontSize: 13,
    fontFamily: bodyFont,
    fontWeight: "700",
    lineHeight: 18
  },
  ocrStatusTextFailed: {
    color: palette.primary
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: palette.primary
  },
  saveButtonText: {
    color: palette.canvas,
    fontFamily: bodyFont,
    fontWeight: "700",
    fontSize: 15
  },
  notebookLayout: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: palette.canvas
  },
  mistakeList: {
    width: 292,
    maxWidth: 310,
    borderRightWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: palette.surface
  },
  mistakeListCompact: {
    width: 238
  },
  mistakeListContent: {
    padding: 14,
    gap: 10
  },
  listHeader: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 3
  },
  listKicker: {
    color: palette.primarySoft,
    fontSize: 12,
    fontFamily: bodyFont,
    fontWeight: "700"
  },
  listTitle: {
    color: palette.ink,
    fontFamily: displayFont,
    fontSize: 20,
    fontWeight: "600"
  },
  mistakeGroup: {
    gap: 8
  },
  mistakeGroupHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4
  },
  mistakeGroupTitle: {
    color: palette.body,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: "700"
  },
  mistakeGroupCount: {
    minWidth: 24,
    textAlign: "center",
    color: palette.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: "700"
  },
  detailPane: {
    flex: 1
  },
  enrichingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: palette.tealTint,
    borderWidth: 1,
    borderColor: palette.tealBorder
  },
  enrichingText: {
    color: palette.teal,
    fontFamily: bodyFont,
    fontWeight: "700",
    fontSize: 14
  },
  detailContent: {
    padding: 22,
    gap: 16
  },
  detailHero: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 16
  },
  problemImage: {
    flexGrow: 1,
    flexBasis: 340,
    minHeight: 150,
    maxHeight: 360,
    borderRadius: 8,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  detailImage: {
    width: "100%",
    height: "100%"
  },
  problemImageText: {
    color: palette.muted,
    fontFamily: bodyFont,
    fontSize: 15
  },
  problemText: {
    flexGrow: 1,
    flexBasis: 360,
    borderRadius: 8,
    padding: 18,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 12
  },
  detailTitle: {
    fontSize: 20,
    lineHeight: 30,
    fontFamily: displayFont,
    fontWeight: "600",
    letterSpacing: 0,
    color: palette.ink
  },
  detailLabel: {
    color: palette.primary,
    fontFamily: bodyFont,
    fontSize: 20,
    fontWeight: "700"
  },
  editForm: {
    gap: 9
  },
  editActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 2
  },
  wrongAnswer: {
    fontSize: 20,
    lineHeight: 30,
    fontFamily: bodyFont,
    color: palette.primary
  },
  answerLabel: {
    fontFamily: bodyFont,
    fontWeight: "700",
    fontSize: 20,
    color: palette.primary
  },
  answerValue: {
    fontFamily: bodyFont,
    fontSize: 20,
    color: palette.ink
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
    gap: 8
  },
  metaActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  iconActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto"
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.paper
  },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: palette.primaryTint,
    color: palette.primary,
    fontFamily: bodyFont,
    fontWeight: "700",
    fontSize: 12
  },
  explainLead: {
    fontSize: 18,
    lineHeight: 27,
    color: palette.teal,
    fontFamily: bodyFont,
    fontWeight: "700"
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 25,
    fontFamily: bodyFont,
    color: palette.body
  },
  solutionStepText: {
    fontSize: 15,
    lineHeight: 25,
    fontFamily: bodyFont,
    color: palette.body
  },
  tipText: {
    fontSize: 15,
    lineHeight: 25,
    color: palette.teal,
    fontFamily: bodyFont,
    fontWeight: "700"
  },
  practiceBox: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#f9f0e5",
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 10
  },
  practiceStatusBox: {
    minHeight: 52,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.hairline
  },
  masteryConfirmBox: {
    minHeight: 70,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.tealTint,
    borderWidth: 1,
    borderColor: palette.tealBorder
  },
  masteryWaitingBox: {
    minHeight: 70,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.dangerTint,
    borderWidth: 1,
    borderColor: palette.primarySoft
  },
  masteryConfirmText: {
    flex: 1,
    minWidth: 210,
    gap: 3
  },
  practiceTitle: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: bodyFont,
    fontWeight: "700",
    color: palette.ink
  },
  practiceReason: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: bodyFont,
    color: palette.muted
  },
  correctText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: bodyFont,
    fontWeight: "700",
    color: palette.teal
  },
  wrongText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: bodyFont,
    fontWeight: "700",
    color: palette.primary
  },
  paperPreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  paperPreviewCard: {
    flexGrow: 1,
    flexBasis: 210,
    minHeight: 118,
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#fffaf2",
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 8
  },
  paperPreviewTitle: {
    color: palette.ink,
    fontSize: 16,
    fontFamily: bodyFont,
    fontWeight: "700"
  },
  paperPreviewText: {
    color: palette.muted,
    fontSize: 13,
    fontFamily: bodyFont,
    lineHeight: 19
  },
  paperOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
});

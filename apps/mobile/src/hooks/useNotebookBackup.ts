import { useState } from "react";
import { withDefaultSettings } from "../notebook-state";
import { exportNotebookBackupToICloudDrive, importNotebookBackupFromICloudDrive } from "../storage/icloud-backup";
import type { NotebookState } from "../types";

export function useNotebookBackup(
  state: NotebookState,
  setState: (updater: (current: NotebookState) => NotebookState) => void
) {
  const [backupStatus, setBackupStatus] = useState("");

  const exportBackup = () => {
    setBackupStatus("正在导出备份…");
    exportNotebookBackupToICloudDrive(state)
      .then((uri) => setBackupStatus(`备份已写入：${uri}`))
      .catch((error: unknown) => setBackupStatus(error instanceof Error ? error.message : "备份导出失败。"));
  };

  const importBackup = () => {
    setBackupStatus("正在读取备份…");
    importNotebookBackupFromICloudDrive()
      .then((restored) => {
        if (!restored) {
          setBackupStatus("未读取到有效备份。");
          return;
        }
        setState(() => withDefaultSettings(restored));
        setBackupStatus("备份已恢复。");
      })
      .catch((error: unknown) => setBackupStatus(error instanceof Error ? error.message : "备份恢复失败。"));
  };

  return { backupStatus, exportBackup, importBackup };
}

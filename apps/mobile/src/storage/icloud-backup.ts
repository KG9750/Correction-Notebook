import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import type { NotebookState } from "../types";
import {
  createNotebookBackupManifest,
  restoreNotebookStateFromBackup,
  serializeNotebookBackupManifest
} from "./backup-package";

export async function exportNotebookBackupToICloudDrive(state: NotebookState): Promise<string> {
  const manifest = createNotebookBackupManifest(state);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem("correction-notebook.icloud-backup-preview.v1", serializeNotebookBackupManifest(manifest));
    return "web-localStorage://correction-notebook.icloud-backup-preview.v1";
  }

  const picked = await Directory.pickDirectoryAsync();
  const backupDir = new Directory(picked.uri, `Correction Notebook Backup ${manifest.exported_at.replace(/[:.]/g, "-")}`);
  backupDir.create({ intermediates: true, idempotent: true });

  const manifestFile = new File(backupDir, "manifest.json");
  manifestFile.create({ overwrite: true, intermediates: true });
  manifestFile.write(serializeNotebookBackupManifest(manifest));

  for (const asset of manifest.assets) {
    copyAsset(asset.source_uri, backupDir, asset.backup_path);
  }

  return backupDir.uri;
}

export async function importNotebookBackupFromICloudDrive(): Promise<NotebookState | undefined> {
  if (Platform.OS === "web") {
    const raw = globalThis.localStorage?.getItem("correction-notebook.icloud-backup-preview.v1");
    return raw ? restoreNotebookStateFromBackup(raw) : undefined;
  }

  const file = await File.pickFileAsync(undefined, "application/json");
  const selectedFile = Array.isArray(file) ? file[0] : file;
  if (!selectedFile) return undefined;
  const raw = await selectedFile.text();
  const restoreDir = new Directory(
    Paths.document,
    "Correction Notebook Restores",
    `Restore ${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  restoreDir.create({ intermediates: true, idempotent: true });
  return restoreNotebookStateFromBackup(raw, (backupPath) => restoreAsset(new Directory(Paths.dirname(selectedFile.uri)), restoreDir, backupPath));
}

function copyAsset(sourceUri: string, backupDir: Directory, backupPath: string): void {
  if (!sourceUri.startsWith("file://")) return;
  const parts = backupPath.split("/");
  const filename = parts.pop();
  if (!filename) return;

  let directory = backupDir;
  for (const part of parts) {
    directory = new Directory(directory.uri, part);
    directory.create({ intermediates: true, idempotent: true });
  }

  const destination = new File(directory, filename);
  if (destination.exists) destination.delete();
  new File(sourceUri).copy(destination);
}

function restoreAsset(backupDir: Directory, restoreDir: Directory, backupPath: string): string | undefined {
  const parts = backupPath.split("/");
  const filename = parts.pop();
  if (!filename) return undefined;

  let sourceDirectory = backupDir;
  let destinationDirectory = restoreDir;
  for (const part of parts) {
    sourceDirectory = new Directory(sourceDirectory, part);
    destinationDirectory = new Directory(destinationDirectory, part);
    destinationDirectory.create({ intermediates: true, idempotent: true });
  }

  const source = new File(sourceDirectory, filename);
  if (!source.exists) return undefined;
  const destination = new File(destinationDirectory, filename);
  if (destination.exists) destination.delete();
  source.copy(destination);
  return destination.uri;
}

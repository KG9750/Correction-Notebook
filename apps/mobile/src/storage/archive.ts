import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import type { NotebookState } from "../types";
import { parseArchivedNotebookState, serializeNotebookStateForArchive } from "./codec";

const archiveKey = "correction-notebook.archived-state.v1";
const archiveFileName = "correction-notebook-state.json";

export async function loadArchivedNotebookState(): Promise<NotebookState | undefined> {
  try {
    const raw = Platform.OS === "web" ? readWebArchive() : await readNativeArchive();
    if (!raw) return undefined;
    return parseArchivedNotebookState(raw);
  } catch {
    return undefined;
  }
}

export async function saveArchivedNotebookState(state: NotebookState): Promise<void> {
  const payload = serializeNotebookStateForArchive(state);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(archiveKey, payload);
    return;
  }

  const file = new File(Paths.document, archiveFileName);
  if (!file.exists) file.create({ intermediates: true });
  file.write(payload);
}

async function readNativeArchive(): Promise<string | undefined> {
  const file = new File(Paths.document, archiveFileName);
  if (!file.exists) return undefined;
  return file.text();
}

function readWebArchive(): string | undefined {
  return globalThis.localStorage?.getItem(archiveKey) ?? undefined;
}

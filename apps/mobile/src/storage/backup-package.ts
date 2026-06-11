import { NotebookBackupManifestSchema, nowIso, type NotebookBackupAsset, type NotebookBackupManifest, type TestPaper } from "@correction-notebook/shared";
import type { NotebookState } from "../types";

export function createNotebookBackupManifest(state: NotebookState, exportedAt = nowIso()): NotebookBackupManifest {
  const assets: NotebookBackupAsset[] = [];
  const notebookState: NotebookState = {
    ...state,
    enrichingMistakeId: null,
    mistakes: state.mistakes.map((mistake) => {
      const original = mistake.original_image_uri
        ? addAsset(assets, "original_image", mistake.original_image_uri, mistake.id)
        : undefined;
      const cropped = mistake.cropped_image_uri
        ? addAsset(assets, "cropped_image", mistake.cropped_image_uri, mistake.id)
        : undefined;

      return {
        ...mistake,
        ...(original ? { original_image_uri: toBackupUri(original.backup_path) } : {}),
        ...(cropped ? { cropped_image_uri: toBackupUri(cropped.backup_path) } : {})
      };
    }),
    papers: state.papers.map((paper) => rewritePaperAssets(paper, assets))
  };

  return NotebookBackupManifestSchema.parse({
    version: 1,
    exported_at: exportedAt,
    notebook_state: notebookState,
    assets
  });
}

export function serializeNotebookBackupManifest(manifest: NotebookBackupManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function restoreNotebookStateFromBackup(
  raw: string,
  resolveBackupUri?: (backupPath: string) => string | undefined
): NotebookState | undefined {
  try {
    const parsed = NotebookBackupManifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;
    const state = parsed.data.notebook_state as NotebookState;
    return resolveBackupUri ? rewriteBackupUris(state, resolveBackupUri) : state;
  } catch {
    return undefined;
  }
}

function rewriteBackupUris(state: NotebookState, resolveBackupUri: (backupPath: string) => string | undefined): NotebookState {
  const resolve = (uri: string | undefined) => {
    if (!uri?.startsWith("backup://")) return uri;
    return resolveBackupUri(uri.slice("backup://".length)) ?? uri;
  };

  return {
    ...state,
    mistakes: state.mistakes.map((mistake) => ({
      ...mistake,
      ...(mistake.original_image_uri ? { original_image_uri: resolve(mistake.original_image_uri) } : {}),
      ...(mistake.cropped_image_uri ? { cropped_image_uri: resolve(mistake.cropped_image_uri) } : {})
    })),
    papers: state.papers.map((paper) => ({
      ...paper,
      student_pdf_url: resolve(paper.student_pdf_url) ?? paper.student_pdf_url,
      answer_pdf_url: resolve(paper.answer_pdf_url) ?? paper.answer_pdf_url,
      ...(paper.generation_manifest_url ? { generation_manifest_url: resolve(paper.generation_manifest_url) } : {}),
      ...(paper.latex_job ? {
        latex_job: {
          ...paper.latex_job,
          manifest_path: resolve(paper.latex_job.manifest_path) ?? paper.latex_job.manifest_path,
          expected_outputs: {
            student_pdf_path: resolve(paper.latex_job.expected_outputs.student_pdf_path) ?? paper.latex_job.expected_outputs.student_pdf_path,
            answer_pdf_path: resolve(paper.latex_job.expected_outputs.answer_pdf_path) ?? paper.latex_job.expected_outputs.answer_pdf_path
          },
          output_paths: {
            ...(paper.latex_job.output_paths.student_pdf_path ? { student_pdf_path: resolve(paper.latex_job.output_paths.student_pdf_path) } : {}),
            ...(paper.latex_job.output_paths.answer_pdf_path ? { answer_pdf_path: resolve(paper.latex_job.output_paths.answer_pdf_path) } : {})
          }
        }
      } : {})
    }))
  };
}

function rewritePaperAssets(paper: TestPaper, assets: NotebookBackupAsset[]): TestPaper {
  const studentPdf = addAsset(assets, "student_pdf", paper.student_pdf_url, paper.id);
  const answerPdf = addAsset(assets, "answer_pdf", paper.answer_pdf_url, paper.id);
  const manifest = paper.generation_manifest_url
    ? addAsset(assets, "test_paper_manifest", paper.generation_manifest_url, paper.id)
    : undefined;

  return {
    ...paper,
    student_pdf_url: toBackupUri(studentPdf.backup_path),
    answer_pdf_url: toBackupUri(answerPdf.backup_path),
    ...(manifest ? { generation_manifest_url: toBackupUri(manifest.backup_path) } : {})
  };
}

function addAsset(
  assets: NotebookBackupAsset[],
  type: NotebookBackupAsset["type"],
  sourceUri: string,
  ownerId: string
): NotebookBackupAsset {
  const existing = assets.find((asset) => asset.type === type && asset.source_uri === sourceUri && asset.owner_id === ownerId);
  if (existing) return existing;

  const asset: NotebookBackupAsset = {
    id: `${ownerId}_${type}_${assets.length + 1}`,
    type,
    source_uri: sourceUri,
    backup_path: `${type}/${ownerId}-${assets.length + 1}${extensionFor(sourceUri)}`,
    owner_id: ownerId
  };
  assets.push(asset);
  return asset;
}

function extensionFor(uri: string): string {
  const match = uri.match(/\.[a-zA-Z0-9]+(?:\?|#|$)/);
  return match ? match[0].replace(/[?#]/g, "") : ".bin";
}

function toBackupUri(path: string): string {
  return `backup://${path}`;
}

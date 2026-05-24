import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { uriToDataUri } from "../files/dataUri";

export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

export async function sharePdf(html: string): Promise<string> {
  const result = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: "application/pdf",
      dialogTitle: "分享复习测试卷"
    });
  }
  return result.uri;
}

export async function imageUriToDataUri(uri: string): Promise<string> {
  return uriToDataUri(uri);
}

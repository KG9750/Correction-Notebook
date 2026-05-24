export async function uriToDataUri(uri: string): Promise<string> {
  if (uri.startsWith("data:")) return uri;
  const response = await fetch(uri);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("failed to read URI as data URI"));
    reader.onloadend = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export function dataUriToBase64(dataUri: string): string {
  const commaIndex = dataUri.indexOf(",");
  if (dataUri.startsWith("data:") && commaIndex >= 0) return dataUri.slice(commaIndex + 1);
  return dataUri;
}

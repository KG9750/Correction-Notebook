export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const locationLike = globalThis as typeof globalThis & {
    location?: {
      protocol: string;
      hostname: string;
    };
  };
  if (locationLike.location?.hostname) {
    return `${locationLike.location.protocol}//${locationLike.location.hostname}:8787`;
  }

  return "http://127.0.0.1:8787";
}

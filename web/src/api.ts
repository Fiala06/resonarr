import type { AppSettings, HealthResponse, LidarrOptions } from "@resonarr/shared";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return asJson(await fetch("/api/health"));
}

export async function getSettings(): Promise<AppSettings> {
  return asJson(await fetch("/api/settings"));
}

export async function putSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  return asJson(
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function getLidarrOptions(): Promise<LidarrOptions> {
  return asJson(await fetch("/api/lidarr/options"));
}

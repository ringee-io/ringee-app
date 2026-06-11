import { getWorkspaceSetting } from "attio/server";

const DEFAULT_RINGEE_API_URL = "https://api.ringee.io/api";

export async function getRingeeApiUrl(): Promise<string> {
  const url = await getWorkspaceSetting("ringee_api_url");
  return (
    typeof url === "string" && url.length > 0 ? url : DEFAULT_RINGEE_API_URL
  ).replace(/\/$/, "");
}

export async function getRingeeToken(): Promise<string> {
  const token = await getWorkspaceSetting("ringee_token");
  if (typeof token !== "string" || token.length === 0) {
    throw new Error(
      "Ringee integration token is not configured. Go to Workspace Settings to set it up.",
    );
  }
  return token;
}

export async function ringeeRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): Promise<T> {
  const [apiUrl, token] = await Promise.all([
    getRingeeApiUrl(),
    getRingeeToken(),
  ]);

  let url = `${apiUrl}/integrations/attio${path}`;
  if (options.query) {
    const qs = new URLSearchParams(options.query);
    url += `?${qs.toString()}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(
      `[Ringee API] ${options.method ?? "GET"} ${path} failed: ${response.status}`,
    );

    if (response.status === 401) {
      throw new Error(
        "Authentication failed. Please check your Ringee integration token.",
      );
    }
    if (response.status === 403) {
      throw new Error(
        "Access denied. Your token may not have the required permissions.",
      );
    }
    throw new Error(`Ringee API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data as T;
}

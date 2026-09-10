const configuredApiBase =
  typeof import.meta !== "undefined"
    ? ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)
    : undefined;

const API_BASE_URL = (
  configuredApiBase || ((import.meta as any).env?.DEV ? "http://localhost:10000" : "")
).replace(/\/$/, "");

export type BulkKind = "faq" | "guide";
export type BulkStatusMode = "draft" | "preserve";

function token() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("admin_token") || localStorage.getItem("bdg_token") || "";
}

function platformRoute() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.match(/(?:^|\/)p\/([a-z0-9-]+)(?:\/admin)?(?:\/|$)/i)?.[1] || "";
}

function headers() {
  const auth = token();
  const route = platformRoute();
  return {
    ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    ...(route ? { "X-BDG-Platform-Route": route } : {}),
  } as Record<string, string>;
}

async function parseResponse(res: Response) {
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) throw new Error(payload?.error || payload?.message || `Request failed (${res.status})`);
  return payload;
}

async function workbookRequest(path: string, filename: string) {
  if (!API_BASE_URL) throw new Error("Admin API is not configured.");
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: headers(),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || `Workbook download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function uploadWorkbook(path: string, file: File) {
  if (!API_BASE_URL) throw new Error("Admin API is not configured.");
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body,
    signal: AbortSignal.timeout(120000),
  });
  return parseResponse(res);
}

export const bulkContentApi = {
  downloadTemplate: (kind: BulkKind) => workbookRequest(
    `/admin/content-bulk/${kind}/template`,
    kind === "faq" ? "FAQ_Import_Template.xlsx" : "Guide_Import_Template.xlsx",
  ),
  exportCurrent: (kind: BulkKind) => workbookRequest(
    `/admin/content-bulk/${kind}/export`,
    kind === "faq" ? "FAQ_Export.xlsx" : "Guide_Export.xlsx",
  ),
  preview: (kind: BulkKind, file: File) => uploadWorkbook(`/admin/content-bulk/${kind}/preview`, file),
  apply: (kind: BulkKind, file: File, statusMode: BulkStatusMode) => uploadWorkbook(
    `/admin/content-bulk/${kind}/import?status_mode=${encodeURIComponent(statusMode)}`,
    file,
  ),
  history: async (kind: BulkKind) => {
    if (!API_BASE_URL) throw new Error("Admin API is not configured.");
    const res = await fetch(`${API_BASE_URL}/admin/content-bulk/history?kind=${encodeURIComponent(kind)}`, {
      headers: headers(),
      signal: AbortSignal.timeout(30000),
    });
    return parseResponse(res);
  },
};

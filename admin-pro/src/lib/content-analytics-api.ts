import { API_BASE_URL, getActiveAdminPlatformRoute } from "@/lib/api";

function token() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("admin_token") || window.sessionStorage.getItem("admin_token") || window.localStorage.getItem("bdg_token") || window.sessionStorage.getItem("bdg_token") || "";
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE_URL) throw new Error("Admin API is not configured");
  const auth = token();
  const route = getActiveAdminPlatformRoute();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (route) headers["X-BDG-Platform-Route"] = route;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) throw new Error(payload?.error || payload?.message || `API ${res.status}`);
  return payload as T;
}

export const contentAnalyticsApi = {
  getCategoryLocalePolicy: () => request("/admin/categories/locales"),
  getCategoryTranslations: (categoryId: string | number) => request(`/admin/categories/${categoryId}/translations`),
  saveCategoryTranslation: (categoryId: string | number, data: any) => request(`/admin/categories/${categoryId}/translations`, { method: "POST", body: JSON.stringify(data) }),
  deleteCategoryTranslation: (categoryId: string | number, locale: string) => request(`/admin/categories/${categoryId}/translations/${encodeURIComponent(locale)}`, { method: "DELETE" }),
  getTrafficAnalytics: (range: "24h" | "7d" | "30d" = "7d") => request(`/admin/analytics/summary?range=${encodeURIComponent(range)}`),
};

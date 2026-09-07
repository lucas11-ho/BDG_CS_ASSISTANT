// Live API client for BDG Help Center Business Admin.
// This file wires the Lovable admin UI to the existing Cloudflare Worker API.

import { mock } from "@/mock/data";

const configuredApiBase =
  typeof import.meta !== "undefined"
    ? ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)
    : undefined;
export const API_BASE_URL = (
  configuredApiBase || ((import.meta as any).env?.DEV ? "http://localhost:10000" : "")
).replace(/\/$/, "");

export const MOCK_MODE =
  ((typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_MOCK_MODE) || "false") ===
  "true";

const TOKEN_KEY = "admin_token";
const USER_KEY = "admin_user";

function getToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("bdg_token") || "";
}

export function logout() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("bdg_token");
  localStorage.removeItem(USER_KEY);
}

export function getCurrentUser() {
  if (typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

// A platform URL is the security context, not merely a visual route. Every
// scoped admin request carries this route key so the API can enforce the
// tenant/platform boundary on the server.
export function getActiveAdminPlatformRoute() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/(?:^|\/)p\/([a-z0-9-]+)(?:\/admin)?(?:\/|$)/i);
  return match?.[1] || "";
}

function platformHeaders(): Record<string, string> {
  const route = getActiveAdminPlatformRoute();
  return route ? { "X-BDG-Platform-Route": route } : {};
}

async function request<T = any>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (path.startsWith("/admin/")) Object.assign(headers, platformHeaders());

  if (!API_BASE_URL)
    throw new Error(
      "Admin API is not configured. Set VITE_API_BASE_URL during the Cloudflare Pages build.",
    );
  const timeoutSignal = AbortSignal.timeout(20000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    signal,
  });

  if (res.status === 401) {
    logout();
    throw new Error("Unauthorized. Please login again.");
  }

  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const msg = payload?.error || payload?.message || res.statusText || "API request failed";
    throw new Error(`API ${res.status}: ${msg}`);
  }

  return payload as T;
}

function delay<T>(v: T, ms = 350): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms));
}

const resourcePath: Record<string, string> = {
  "site-content": "/admin/site-content",
  "help-cards": "/admin/popular-help",
  "popular-help": "/admin/popular-help",
  categories: "/admin/categories",
  "guide-images": "/admin/guides",
  guides: "/admin/guides",
  faq: "/admin/faqs",
  faqs: "/admin/faqs",
  "ai-knowledge": "/admin/knowledge",
  knowledge: "/admin/knowledge",
  "prompt-history": "/admin/ai/prompt-versions",
  "chat-quick-replies": "/admin/chat-quick-replies",
  "ai-content": "/admin/ai-content",
  "ai-qa": "/admin/ai-qa",
  "locale-studio": "/admin/locale-studio",
  "action-buttons": "/admin/action-buttons",
  "content-versions": "/admin/content-versions",
  "chat-logs": "/admin/chat-logs",
  "unmatched-questions": "/admin/unmatched-questions",
  "audit-logs": "/admin/audit-logs",
  "admin-users": "/admin/admin-users",
  "foundation-diagnostics": "/admin/foundation-diagnostics",
  "ai-prompts": "/admin/ai/prompts",
};

function normalizeResourcePayload(resource: string, payload: any): any[] {
  if (resource === "admin-users") {
    const arr = Array.isArray(payload) ? payload : [];
    return arr.map((u: any) => ({
      id: u.id,
      name: u.name || (u.email || "").split("@")[0],
      email: u.email,
      role: String(u.role || "admin").toLowerCase(),
      status: u.status || (u.is_active === false ? "inactive" : "active"),
      twofa_enabled: u.twofa_enabled === true,
      session_version: u.session_version || 0,
      lastLogin: u.lastLogin || u.last_login_at || "",
      created_at: u.created_at || "",
    }));
  }

  if (resource === "prompt-history") {
    const arr = Array.isArray(payload) ? payload : [];
    return arr.map((version: any) => ({
      ...version,
      section: version.title || version.section_key,
      version: version.id,
      editor: version.actor_email || "admin",
      changedAt: version.created_at || "",
    }));
  }

  if (resource === "site-content") {
    return (payload?.blocks || []).map((b: any) => ({
      // The API updates content by immutable block_key, never by the numeric DB id.
      id: b.block_key,
      database_id: b.id,
      key: b.block_key || b.key,
      block_key: b.block_key || b.key,
      label: b.label || b.block_key,
      value: b.value || "",
      input_type: b.input_type || "text",
      sort_order: b.sort_order ?? 100,
      updatedAt: b.updated_at || "",
      status: "active",
    }));
  }

  if (resource === "chat-logs") {
    const arr = Array.isArray(payload) ? payload : [];
    return arr.map((log: any) => ({
      ...log,
      customer_message: log.customer_message || "",
      assistant_reply: log.assistant_reply || "",
      matched_sources: Array.isArray(log.matched_sources) ? log.matched_sources : [],
      matched_images: Array.isArray(log.matched_images) ? log.matched_images : [],
      uploaded_images: Array.isArray(log.uploaded_images) ? log.uploaded_images : [],
      provider_status: log.provider_status || (log.used_deepseek ? "success" : "fallback"),
      error_type: log.error_type || "",
      latency_ms: Number(log.latency_ms || 0),
      request_id: log.request_id || "",
      response_blocks: Array.isArray(log.response_blocks) ? log.response_blocks : [],
      response_format: log.response_format || "text",
      resolution_state: log.resolution_state || "open",
    }));
  }

  if (Array.isArray(payload)) return payload;

  return [];
}

function normalizeForCreate(resource: string, data: any): any {
    if (resource === "admin-users") {
      return {
      name: data.name || "Admin",
      email: data.email,
      password: data.password || data.new_password || undefined,
        role: String(data.role || "admin")
          .replace(/^admin$/, getActiveAdminPlatformRoute() ? "platform_admin" : "admin")
          .toLowerCase()
        .includes("owner")
        ? "admin"
        : String(data.role || "admin").toLowerCase(),
      status: data.status || "active",
      is_active: data.status !== "inactive",
    };
  }
  if (resource === "site-content") {
    return {
      block_key: data.block_key || data.key,
      label: data.label || data.key || data.block_key,
      value: data.value || "",
      input_type: data.input_type || "text",
      sort_order: Number(data.sort_order || 100),
    };
  }
  if (resource === "help-cards") {
    return {
      title: data.title,
      subtitle: data.subtitle || "",
      icon: data.icon || "✨",
      query: data.query || data.title || "",
      linked_category_slug: data.linked_category_slug || "",
      sort_order: Number(data.sort_order || data.order || 100),
      status: data.status || "active",
    };
  }
  if (resource === "guide-images" || resource === "guides") {
    return {
      title: data.title || data.title_en || data.filename || "Guide",
      title_hi: data.title_hi || "",
      slug: data.slug,
      summary: data.summary || data.summary_en || "",
      summary_hi: data.summary_hi || "",
      body: data.body || data.body_en || data.summary || "",
      body_hi: data.body_hi || "",
      body_html: data.body_html || "",
      body_blocks_json: data.body_blocks_json || "",
      body_blocks_json_hi: data.body_blocks_json_hi || "",
      body_html_hi: data.body_html_hi || "",
      cover_image_url: data.cover_image_url || data.cover || data.image_url || "",
      cover_image_url_hi: data.cover_image_url_hi || "",
      image_urls: Array.isArray(data.image_urls)
        ? data.image_urls
        : String(data.image_urls || data.image_url || data.cover_image_url || "")
            .split(/\r?\n|,/)
            .map((x) => x.trim())
            .filter(Boolean),
      image_urls_hi: Array.isArray(data.image_urls_hi)
        ? data.image_urls_hi
        : String(data.image_urls_hi || data.cover_image_url_hi || "")
            .split(/\r?\n|,/)
            .map((x) => x.trim())
            .filter(Boolean),
      keywords: data.keywords || "",
      language: data.language || "en",
      priority: Number(data.priority || 100),
      status: data.status || "published",
      category_id: data.category_id || null,
      category_slug: data.category_slug || data.category || "",
      button_ids: Array.isArray(data.button_ids) ? data.button_ids : String(data.button_ids || "").split(/\r?\n|,/).map((x) => Number(x.trim())).filter(Boolean),
    };
  }
  if (resource === "faq") {
    return {
      question: data.question,
      answer: data.answer || data.value || "",
      answer_html: data.answer_html || "",
      answer_json: data.answer_json || "",
      image_urls: Array.isArray(data.image_urls) ? data.image_urls : String(data.image_urls || "").split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean),
      locale: data.locale || "en",
      keywords: data.keywords || "",
      priority: Number(data.priority || 100),
      status: data.status || "published",
    };
  }
  if (resource === "ai-knowledge") {
    return {
      title: data.title,
      content: data.content || data.description || "",
      keywords: data.keywords || "",
      priority: Number(data.priority || 100),
      status: data.status || "active",
    };
  }
  if (resource === "chat-quick-replies") {
    return {
      text: data.text || data.label,
      query: data.query || data.text || data.label,
      sort_order: Number(data.sort_order || data.order || 100),
      status: data.status || "active",
    };
  }
  if (resource === "categories") {
    return {
      name: data.name,
      slug: data.slug,
      description: data.description || "",
      icon: data.icon || "target",
      icon_url: data.icon_url || "",
      sort_order: Number(data.sort_order || 100),
    };
  }
  if (resource === "ai-content") {
    return {
      content_name: data.content_name || data.name || data.title,
      title: data.title,
      intent_key: data.intent_key,
      locale: data.locale || "en",
      status: data.status || "draft",
      priority: Number(data.priority || 100),
      confidence_threshold: Number(data.confidence_threshold || 86),
      keywords: data.keywords || "",
      positive_examples: data.positive_examples || "",
      negative_examples: data.negative_examples || "",
      required_fields: data.required_fields || "",
      faq_content: data.faq_content || "",
      knowledge_content: data.knowledge_content || "",
      example_answers: data.example_answers || "",
      example_answers_hi: data.example_answers_hi || "",
      ai_instruction: data.ai_instruction || "",
      ai_instruction_hi: data.ai_instruction_hi || "",
      rich_json: data.rich_json || "",
      rich_html: data.rich_html || "",
      rich_json_hi: data.rich_json_hi || "",
      rich_html_hi: data.rich_html_hi || "",
      image_urls: Array.isArray(data.image_urls)
        ? data.image_urls
        : String(data.image_urls || "")
            .split(/\r?\n|,/)
            .map((x) => x.trim())
            .filter(Boolean),
      image_delivery: data.image_delivery || "after_answer",
      button_ids: Array.isArray(data.button_ids) ? data.button_ids : String(data.button_ids || "").split(/\r?\n|,/).map((x) => Number(x.trim())).filter(Boolean),
      approval_status: data.approval_status || (data.status === "published" ? "approved" : "draft"),
      version_label: data.version_label || "v1",
      platform_scope: data.platform_scope || "all",
      route_policy: data.route_policy || "answer_only",
    };
  }
  if (resource === "ai-qa") {
    return {
      ...normalizeForCreate("ai-content", data),
      source_type: "qa",
      qa_answer_html: data.qa_answer_html || data.answer_html || "",
      qa_answer_json: data.qa_answer_json || data.answer_json || "",
      qa_steps: data.qa_steps || [],
      localized_fields: data.localized_fields || {},
    };
  }
  if (resource === "action-buttons") {
    return {
      button_key: data.button_key,
      label: data.label,
      label_hi: data.label_hi || "",
      subtitle: data.subtitle || "",
      subtitle_hi: data.subtitle_hi || "",
      icon_url: data.icon_url || "",
      action_type: data.action_type || "url",
      url: data.url || "",
      fallback_url: data.fallback_url || "",
      target: data.target || "same_window",
      allowed_hosts: data.allowed_hosts || "",
      status: data.status || "active",
      sort_order: Number(data.sort_order || 100),
      platform_scope: data.platform_scope || "all",
      capability: data.capability || "general",
      ticket_type: data.ticket_type || "",
    };
  }
  return data;
}

function pathFor(resource: string, id?: string | number) {
  const base = resource === "admin-users" && getActiveAdminPlatformRoute()
    ? "/admin/platform-admin-users"
    : (resourcePath[resource] || `/admin/${resource}`);
  if (resource === "site-content" && id)
    return `/admin/site-content/blocks/${encodeURIComponent(String(id))}`;
  if (id) return `${base}/${id}`;
  return base;
}

function diagnosticsOut(d: any) {
  return {
    ...d,
    deepSeekKeyPresent: !!(d.deepSeekKeyPresent ?? d.deepseek_key_present),
    aiEnabled: !!(d.aiEnabled ?? d.ai_enabled_in_db),
    deepSeekEnabled: !!(d.deepSeekEnabled ?? d.ai_enabled_in_db),
    promptCount: d.promptCount ?? d.counts?.prompts ?? 0,
    menuImageCount: d.menuImageCount ?? d.counts?.menu_images ?? 0,
    publishedMenuImageCount: d.publishedMenuImageCount ?? d.counts?.published_menu_images ?? 0,
    lastApiError: d.lastApiError || (d.recent_errors?.[0]?.error_detail ?? "No recent AI error recorded"),
    responseTimeMs: d.responseTimeMs ?? 0,
    recentErrors: d.recentErrors ?? d.recent_errors ?? [],
    providerSummary: d.providerSummary ?? d.provider_summary ?? [],
  };
}

async function uploadAdminFile(file: File, path: string) {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...platformHeaders() },
    body: fd,
  });
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    const requestId = payload?.request_id || res.headers.get("x-request-id");
    const reason = payload?.error || payload?.message || res.statusText || "Upload failed";
    const code = payload?.code ? ` [${payload.code}]` : "";
    const trace = requestId ? ` (Request ID: ${requestId})` : "";
    throw new Error(`Upload failed: ${reason}${code}${trace}`);
  }
  return payload as { url: string; filename?: string; content_type?: string; size_bytes?: number; media_id?: number };
}


async function uploadSupportFile(file: File, path: string, caption = "") {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  if (caption) fd.append("caption", caption);
  fd.append("client_message_id", crypto.randomUUID());
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...platformHeaders() },
    body: fd,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || payload?.message || `Upload failed (${res.status})`);
  return payload;
}

export const api = {
  login: async (email: string, password: string, twofa_code?: string) => {
    if (MOCK_MODE)
      return delay({ token: "mock-token", user: { email, name: "Admin", role: "owner" } });
    const res: any = await request(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password, twofa_code }) },
      false,
    );
    if (res?.twofa_required) return { twofa_required: true };
    const token = res.access_token || res.token;
    if (!token) throw new Error("Login succeeded but no token was returned");
    const user = res.user || { email, name: email.split("@")[0], role: "admin" };
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem("bdg_token", token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return { token, user };
  },

  getDashboardStats: async () => {
    if (MOCK_MODE) return delay(mock.dashboardStats);
    const [categories, guides, faqs, prompts, aiContent, sessions, audits, health] = await Promise.allSettled([
      api.list("categories"),
      api.list("guide-images"),
      api.list("faq"),
      api.list("ai-prompts"),
      api.list("ai-content"),
      api.list("chat-sessions"),
      api.list("audit-logs"),
      api.getSystemHealth(),
    ]);
    const count = (x: PromiseSettledResult<any>) =>
      x.status === "fulfilled" && Array.isArray(x.value) ? x.value.length : 0;
    return {
      totalGuides: count(guides),
      totalFAQ: count(faqs),
      totalCategories: count(categories),
      aiContentItems: count(aiContent),
      aiPromptSections: count(prompts),
      chatSessions: count(sessions),
      deepSeekStatus:
        health.status === "fulfilled"
          ? health.value?.checks?.find((x: any) => x.name === "deepseek")?.status || "unknown"
          : "unavailable",
      databaseStatus:
        health.status === "fulfilled"
          ? health.value?.checks?.find((x: any) => x.name === "database")?.status || "unknown"
          : "unavailable",
      r2StorageStatus:
        health.status === "fulfilled"
          ? health.value?.checks?.find((x: any) => x.name === "r2")?.status || "unknown"
          : "unavailable",
      recentActivity: (audits.status === "fulfilled" && Array.isArray(audits.value)
        ? audits.value
        : []
      )
        .slice(0, 6)
        .map((a: any) => ({
          id: a.id,
          actor: a.actor || "system",
          action: a.action || a.message || JSON.stringify(a).slice(0, 80),
          time: a.created_at || a.time || "recently",
        })),
    };
  },

  list: async (resource: string) => {
    if (MOCK_MODE) return delay(mock.collections[resource] ?? []);
    if (resource === "ai-prompts") return request("/admin/ai/prompts");
    if (resource === "chat-sessions") return request("/admin/chat-sessions");
    const payload = await request(pathFor(resource));
    if (resource === "locale-studio") return payload;
    return normalizeResourcePayload(resource, payload);
  },
  listAiQa: async (filters: Record<string, string> = {}) => {
    if (MOCK_MODE) return delay([]);
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => String(value || '').trim()).map(([key, value]) => [key, String(value)]));
    return request(`/admin/ai-qa${params.size ? `?${params.toString()}` : ''}`);
  },

  create: async (resource: string, data: any) => {
    if (MOCK_MODE) return delay({ ...data, id: Date.now() });
    if (resource === "admin-users" && getActiveAdminPlatformRoute()) {
      return request(pathFor(resource), {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          role: data.role || "viewer",
          temporary_password: data.temporary_password || data.password || data.new_password,
        }),
      });
    }
    if (resource === "site-content")
      return request(pathFor(resource, data.block_key || data.key), {
        method: "PUT",
        body: JSON.stringify(normalizeForCreate(resource, data)),
      });
    return request(pathFor(resource), {
      method: "POST",
      body: JSON.stringify(normalizeForCreate(resource, data)),
    });
  },

  update: async (resource: string, id: string | number, data: any) => {
    if (MOCK_MODE) return delay({ ...data, id });
    return request(pathFor(resource, id), {
      method: "PUT",
      body: JSON.stringify(normalizeForCreate(resource, data)),
    });
  },

  getGuideLocaleStudio: async () => {
    if (MOCK_MODE) return delay({ ok: true, locales: [{ code: "en", label: "English", is_default: true }], guides: [] });
    return request("/admin/guide-locale-studio");
  },
  listGuideTranslations: async (guideId: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, translations: [] });
    return request(`/admin/guides/${guideId}/translations`);
  },
  saveGuideTranslation: async (guideId: string | number, data: any) => {
    if (MOCK_MODE) return delay({ ok: true, translation: { ...data, id: Date.now(), guide_id: guideId } });
    return request(`/admin/guides/${guideId}/translations`, { method: "POST", body: JSON.stringify(data) });
  },
  updateGuideTranslation: async (id: string | number, data: any) => {
    if (MOCK_MODE) return delay({ ok: true, translation: { ...data, id } });
    return request(`/admin/guide-translations/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  publishGuideTranslation: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, translation: { id, status: "published" } });
    return request(`/admin/guide-translations/${id}/publish`, { method: "POST", body: JSON.stringify({}) });
  },
  batchPublishGuideTranslations: async (ids: Array<string | number>) => {
    if (MOCK_MODE) return delay({ ok: true, published: ids.length });
    return request("/admin/guide-translations/batch-publish", { method: "POST", body: JSON.stringify({ ids }) });
  },

  remove: async (resource: string, id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true });
    if (
      resource === "prompt-history" ||
      resource === "chat-logs" ||
      resource === "audit-logs"
    ) {
      return { ok: true, skipped: true };
    }
    return request(pathFor(resource, id), { method: "DELETE" });
  },

  bulkRemove: async (resource: string, ids: Array<string | number>) => {
    if (MOCK_MODE) return delay({ ok: true, deleted: ids.length });
    const base = resourcePath[resource] || `/admin/${resource}`;
    return request(`${base}/batch-delete`, { method: "POST", body: JSON.stringify({ ids }) });
  },

  deleteAllQuickReplies: async () => {
    if (MOCK_MODE) return delay({ ok: true, deleted: 0 });
    return request("/admin/chat-quick-replies/all", { method: "DELETE" });
  },

  cleanupQuickReplyDuplicates: async () => {
    if (MOCK_MODE) return delay({ ok: true, deleted: 0 });
    return request("/admin/chat-quick-replies/cleanup-duplicates", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  changeAdminPassword: async (id: string | number, password: string) => {
    if (MOCK_MODE) return delay({ ok: true });
    const base = getActiveAdminPlatformRoute() ? "/admin/platform-admin-users" : "/admin/admin-users";
    return request(`${base}/${id}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  getMe: async () => {
    if (MOCK_MODE) return delay({ ok: true, user: getCurrentUser() });
    return request("/admin/me");
  },

  getPlatformContext: async () => {
    if (MOCK_MODE) return delay({ ok: true, platform: null, access: { role: "operator", can_write: true } });
    return request("/admin/platform-context");
  },

  // v1.0 SaaS tenant core. The Control Center is intentionally explicit: it
  // never guesses a tenant from a browser query parameter.
  getTenantControlCenter: async () => {
    if (MOCK_MODE) return delay({ ok: true, operator: true, tenants: [], platforms: [], platform_feature_catalog: [] });
    return request("/admin/tenant-control-center");
  },
  listTenantPlatforms: async (tenantId: string | number) => request(`/admin/tenants/${tenantId}/platforms`),
  createTenant: async (data: any) => request("/admin/tenants", { method: "POST", body: JSON.stringify(data) }),
  updateTenant: async (id: string | number, data: any) => request(`/admin/tenants/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  archiveTenant: async (id: string | number) => request(`/admin/tenants/${id}`, { method: "DELETE" }),
  createTenantPlatform: async (tenantId: string | number, data: any) => request(`/admin/tenants/${tenantId}/platforms`, { method: "POST", body: JSON.stringify(data) }),
  getTenantPlatform: async (platformId: string | number) => request(`/admin/platforms/${platformId}`),
  getPlatformBrand: async (platformId: string | number) => request(`/admin/platforms/${platformId}/brand`),
  updatePlatformBrand: async (platformId: string | number, data: any) => request(`/admin/platforms/${platformId}/brand`, { method: "PUT", body: JSON.stringify(data) }),
  getPlatformConnector: async (platformId: string | number) => request(`/admin/platforms/${platformId}/connector`),
  updatePlatformConnector: async (platformId: string | number, data: any) => request(`/admin/platforms/${platformId}/connector`, { method: "PUT", body: JSON.stringify(data) }),
  testPlatformConnector: async (platformId: string | number, data: any) => request(`/admin/platforms/${platformId}/connector/test`, { method: "POST", body: JSON.stringify(data) }),
  listConnectorAudit: async (platformId: string | number) => request(`/admin/platforms/${platformId}/connector/audit`),
  getCommerceConnector: async (platformId: string | number) => request(`/admin/platforms/${platformId}/commerce-connector`),
  updateCommerceConnector: async (platformId: string | number, data: any) => request(`/admin/platforms/${platformId}/commerce-connector`, { method: "PUT", body: JSON.stringify(data) }),
  testCommerceConnector: async (platformId: string | number) => request(`/admin/platforms/${platformId}/commerce-connector/test`, { method: "POST", body: JSON.stringify({}) }),
  listCommerceConnectorAudit: async (platformId: string | number) => request(`/admin/platforms/${platformId}/commerce-connector/audit`),
  updateTenantPlatform: async (platformId: string | number, data: any) => request(`/admin/platforms/${platformId}`, { method: "PUT", body: JSON.stringify(data) }),
  archiveTenantPlatform: async (platformId: string | number) => request(`/admin/platforms/${platformId}`, { method: "DELETE" }),
  createPlatformDomain: async (platformId: string | number, data: any) => request(`/admin/platforms/${platformId}/domains`, { method: "POST", body: JSON.stringify(data) }),
  updatePlatformDomain: async (domainId: string | number, data: any) => request(`/admin/platform-domains/${domainId}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePlatformDomain: async (domainId: string | number) => request(`/admin/platform-domains/${domainId}`, { method: "DELETE" }),
  createPlatformMember: async (platformId: string | number, data: any) => request(`/admin/platforms/${platformId}/members`, { method: "POST", body: JSON.stringify(data) }),
  removePlatformMember: async (membershipId: string | number) => request(`/admin/platform-memberships/${membershipId}`, { method: "DELETE" }),
  updatePlatformFeature: async (platformId: string | number, featureKey: string, data: any) => request(`/admin/platforms/${platformId}/features/${encodeURIComponent(featureKey)}`, { method: "PUT", body: JSON.stringify(data) }),

  setup2FA: async () => {
    if (MOCK_MODE) return delay({ ok: true, secret: "MOCKSECRET", otpauth_url: "" });
    return request("/admin/me/2fa/setup", { method: "POST", body: JSON.stringify({}) });
  },

  enable2FA: async (code: string) => {
    if (MOCK_MODE) return delay({ ok: true });
    return request("/admin/me/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
  },

  disable2FA: async (code: string) => {
    if (MOCK_MODE) return delay({ ok: true });
    return request("/admin/me/2fa/disable", { method: "POST", body: JSON.stringify({ code }) });
  },

  forceLogoutAdmin: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true });
    return request(`/admin/admin-users/${id}/force-logout`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  resetAdmin2FA: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true });
    return request(`/admin/admin-users/${id}/reset-2fa`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },


  getChatTheme: async () => request('/admin/themes/chat'),
  updateChatTheme: async (data: any) => request('/admin/themes/chat', { method:'PUT', body:JSON.stringify(data) }),
  getGuideTheme: async () => request('/admin/themes/guide'),
  updateGuideTheme: async (data: any) => request('/admin/themes/guide', { method:'PUT', body:JSON.stringify(data) }),

  getSettings: async () => {
    if (MOCK_MODE)
      return delay({
        app_name: "Luke Platform",
        logo_text: "Luke",
        support_link: "",
        primary_color: "#3b82f6",
        favicon_url: "",
      });
    const route = getActiveAdminPlatformRoute();
    return request(`/settings${route ? `?platform=${encodeURIComponent(route)}` : ""}`, undefined, false);
  },

  updateSettings: async (data: any) => {
    if (MOCK_MODE) return delay(data);
    return request("/admin/settings", { method: "PUT", body: JSON.stringify(data) });
  },

  getSystemHealth: async () => {
    if (MOCK_MODE) return delay({ ok: true, status: "healthy", checks: [] });
    return request("/admin/system-health");
  },

  upload: async (file: File) => {
    if (MOCK_MODE) return delay({ url: URL.createObjectURL(file) });
    return uploadAdminFile(file, "/admin/uploads");
  },

  uploadGuide: async (file: File) => {
    if (MOCK_MODE) return delay({ url: URL.createObjectURL(file), media_id: Date.now() });
    return uploadAdminFile(file, "/admin/guide-uploads");
  },

  uploadGuideMotion: async (file: File) => {
    if (MOCK_MODE) {
      const media_kind = file.type.startsWith("video/") ? "video" : file.type === "image/gif" ? "gif" : "image";
      return delay({ url: URL.createObjectURL(file), media_id: Date.now(), media_kind, content_type: file.type, size_bytes: file.size });
    }
    return uploadAdminFile(file, "/admin/guide-motion-uploads");
  },

  testAiContent: async (message: string, language = "en", platform_key = getActiveAdminPlatformRoute() || "default") => {
    if (MOCK_MODE)
      return delay({ ok: true, selected_content: null, candidates: [], greeting_bypass: false });
    return request("/admin/ai-content/test", {
      method: "POST",
      body: JSON.stringify({ message, language, platform_key }),
    });
  },

  listContentVersions: async (entityType?: string, entityId?: string | number) => {
    const params = new URLSearchParams();
    if (entityType) params.set("entity_type", entityType);
    if (entityId != null) params.set("entity_id", String(entityId));
    return request(`/admin/content-versions${params.size ? `?${params.toString()}` : ""}`);
  },

  restoreContentVersion: async (versionId: number | string) => {
    return request(`/admin/content-versions/${versionId}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  restorePromptVersion: async (promptId: number | string, versionId: number | string) => {
    return request(`/admin/ai/prompts/${promptId}/restore/${versionId}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  getPromptRuntime: async () => {
    if (MOCK_MODE) return delay({ ok: true, platform: { name: "Mock Platform", public_route_key: "mock" }, runtime: { version_number: 1, compiled_prompt_hash: "mock", compiled_prompt: "", section_ids: [], section_hashes: {}, warnings: [], prompt_characters: 0 }, versions: [] });
    return request("/admin/ai/prompt-runtime");
  },

  rebuildPromptRuntime: async () => {
    if (MOCK_MODE) return delay({ ok: true, runtime: { version_number: Date.now(), compiled_prompt_hash: "mock", compiled_prompt: "", warnings: [] } });
    return request("/admin/ai/prompt-runtime/rebuild", { method: "POST", body: JSON.stringify({}) });
  },

  restoreSiteContent: async (blockKey: string) => {
    return request(`/admin/site-content/blocks/${encodeURIComponent(blockKey)}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  listSupportPlatforms: async () => {
    if (MOCK_MODE) return delay([{ id: 1, platform_key: "default", name: "Default Help Center", support_mode: "none", status: "active" }]);
    return request("/admin/support-platforms");
  },
  getLocaleStudio: async (locale?: string) => {
    if (MOCK_MODE) return delay({ ok: true, platform: { default_locale: "en", supported_languages: ["en"] }, locales: [{ code: "en", label: "English" }], coverage: [], summary: {} });
    return request(`/admin/locale-studio${locale ? `?locale=${encodeURIComponent(locale)}` : ""}`);
  },
  getLocaleRegistry: async () => {
    if (MOCK_MODE) return delay({ ok: true, default_locale: "en", supported_languages: ["en"], locales: [{ code: "en", label: "EN — English", native_name: "English", direction: "ltr", is_default: true }] });
    return request("/admin/locale-registry");
  },
  updateLocaleRegistry: async (data: { default_locale: string; supported_languages: string[]; locales?: Array<{ code: string; label?: string }> }) => {
    if (MOCK_MODE) return delay({ ok: true, ...data, locales: (data.locales || []).map((locale) => ({ code: locale.code, label: locale.label || locale.code })) });
    return request("/admin/locale-registry", { method: "PUT", body: JSON.stringify(data) });
  },
  createLocaleTranslation: async (source_id: string | number, target_locale: string) => {
    if (MOCK_MODE) return delay({ ok: true, translation_status: "draft", source_id, target_locale });
    return request("/admin/locale-studio/translations", { method: "POST", body: JSON.stringify({ source_id, target_locale }) });
  },
  getAiSourceRouter: async () => {
    if (MOCK_MODE) return delay({ ok: true, enabled: true, prompt_manager_enabled: true, source_order: ["prompt_image"], enabled_sources: ["prompt_image"], locale_strategy: "exact_then_default", max_candidates: 32, source_counts: {} });
    return request("/admin/ai-source-router");
  },
  updateAiSourceRouter: async (data: { enabled: boolean; prompt_manager_enabled: boolean; source_order: string[]; enabled_sources?: string[]; locale_strategy: string; max_candidates: number }) => {
    if (MOCK_MODE) return delay({ ok: true, ...data });
    return request("/admin/ai-source-router", { method: "PUT", body: JSON.stringify(data) });
  },
  previewAiSourceRouter: async (message: string, locale?: string) => {
    if (MOCK_MODE) return delay({ ok: true, message, locale: locale || "en", candidate_catalog_size: 0, source_counts: {}, candidates: [] });
    return request("/admin/ai-source-router/preview", { method: "POST", body: JSON.stringify({ message, locale }) });
  },
  getDomainMapping: async () => {
    if (MOCK_MODE) return delay({ ok: true, generated: {}, custom_domains: [], dns_instructions: [] });
    return request("/admin/domain-mapping");
  },
  createDomainMappingDomain: async (data: { hostname: string; site_kind: "chat" | "guide" | "admin" | "staff" }) => {
    if (MOCK_MODE) return delay({ ok: true, domain: { id: Date.now(), ...data, provisioning_status: "planned" } });
    return request("/admin/domain-mapping/domains", { method: "POST", body: JSON.stringify(data) });
  },
  provisionMappedDomain: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, synced: false, domain: { id, provisioning_status: "pending_dns" } });
    return request(`/admin/domain-mapping/domains/${id}/provision`, { method: "POST", body: JSON.stringify({}) });
  },
  syncMappedDomain: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, synced: true, domain: { id, provisioning_status: "pending_dns" } });
    return request(`/admin/domain-mapping/domains/${id}/sync`, { method: "POST", body: JSON.stringify({}) });
  },
  generateDomainMapping: async () => {
    if (MOCK_MODE) return delay({ ok: true, generated: {} });
    return request("/admin/domain-mapping/generate", { method: "POST", body: JSON.stringify({}) });
  },
  updateHostingMode: async (hosting_mode: "luke_shared" | "custom_domain") => {
    if (MOCK_MODE) return delay({ ok: true, hosting_mode });
    return request("/admin/domain-mapping/hosting-mode", { method: "PUT", body: JSON.stringify({ hosting_mode }) });
  },
  verifyMappedDomain: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, domain: { id, status: "pending_dns" } });
    return request(`/admin/domain-mapping/domains/${id}/verify`, { method: "POST", body: JSON.stringify({}) });
  },
  updateMappedDomainCors: async (id: string | number, enabled: boolean) => {
    if (MOCK_MODE) return delay({ ok: true, domain: { id, cors_allowed: enabled, cors_effective: false } });
    return request(`/admin/domain-mapping/domains/${id}/cors`, { method: "PUT", body: JSON.stringify({ enabled }) });
  },
  deleteMappedDomain: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, id });
    return request(`/admin/domain-mapping/domains/${id}`, { method: "DELETE", body: JSON.stringify({}) });
  },
  getAiReliability: async () => {
    if (MOCK_MODE) return delay({ ok: true, settings: { enabled: true, confidence_floor: 70, max_retries: 2, timeout_ms: 12000, fallback_mode: "neutral", unknown_reply: "I could not find a verified answer yet.", provider_error_reply: "Support is temporarily unavailable.", handoff_url: "" } });
    return request("/admin/ai/reliability");
  },
  updateAiReliability: async (data: any) => {
    if (MOCK_MODE) return delay({ ok: true, settings: data });
    return request("/admin/ai/reliability", { method: "PUT", body: JSON.stringify(data) });
  },
  testAiReliability: async (data: any = {}) => {
    if (MOCK_MODE) return delay({ ok: true, test: { status: "pass", checks: [] } });
    return request("/admin/ai/reliability/test", { method: "POST", body: JSON.stringify(data) });
  },
  getAiSettings: async () => {
    if (MOCK_MODE) return delay({ enabled: true, provider: "deepseek", model: "deepseek-v4-flash", api_base: "https://api.deepseek.com", temperature: 0.2, max_tokens: 1200, require_approved_context: false, memory_enabled: true, memory_max_messages: 12, memory_ttl_days: 30, has_api_key: true });
    return request("/admin/ai/settings");
  },
  updateAiSettings: async (data: any) => {
    if (MOCK_MODE) return delay({ ...data, provider: "deepseek", has_api_key: true });
    return request("/admin/ai/settings", { method: "PUT", body: JSON.stringify(data) });
  },

  previewKnowledgeImport: async (file: File, platform_key: string) => {
    if (MOCK_MODE) return delay({ id: Date.now(), filename: file.name, platform_key, status: "review", total_rows: 1, valid_rows: 1, error_rows: 0, preview_rows: [] });
    if (!API_BASE_URL) throw new Error("Admin API is not configured. Set VITE_API_BASE_URL during the Cloudflare Pages build.");
    const token = getToken();
    const body = new FormData();
    body.append("file", file);
    body.append("platform_key", platform_key);
    const res = await fetch(`${API_BASE_URL}/admin/knowledge/import-preview`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...platformHeaders() }, body });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (!res.ok) throw new Error(`Import preview failed: ${payload?.error || payload?.message || res.statusText}`);
    return payload;
  },

  importAiKnowledgeWorkbook: async (file: File) => {
    if (MOCK_MODE) return delay({ ok: true, created: 1, updated: 0, skipped: 0 });
    return uploadAdminFile(file, "/admin/knowledge/import") as Promise<any>;
  },

  listKnowledgeImports: async () => {
    if (MOCK_MODE) return delay([]);
    return request("/admin/knowledge-imports");
  },

  getKnowledgeImportStatus: async (id: string | number) => {
    if (MOCK_MODE) return delay({ id, progress_percent: 100, current_stage: "complete", processed_rows: 0 });
    return request(`/admin/knowledge-imports/${id}/status`);
  },

  downloadKnowledgeImportTemplate: async () => {
    if (MOCK_MODE || !API_BASE_URL) return;
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/admin/knowledge/template`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...platformHeaders() },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Template download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "AI_Knowledge_Import_Template.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  },

  getKnowledgeImport: async (id: string | number) => {
    if (MOCK_MODE) return delay({ id, preview_rows: [] });
    return request(`/admin/knowledge-imports/${id}`);
  },

  approveKnowledgeImportRow: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, row_id: id });
    return request(`/admin/knowledge-import-rows/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
  },

  approveKnowledgeImportBatch: async (id: string | number) => request(`/admin/knowledge-imports/${id}/approve`, { method: "POST", body: JSON.stringify({}) }),
  publishKnowledgeImportBatch: async (id: string | number) => request(`/admin/knowledge-imports/${id}/publish`, { method: "POST", body: JSON.stringify({}) }),

  requestAiQaPublish: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, id, status: "published", approval_status: "approved" });
    return request(`/admin/ai-qa/${id}/publish`, { method: "POST", body: JSON.stringify({}) });
  },
  batchApproveAiQa: async (ids: Array<string | number>) => request("/admin/ai-qa/batch-approve", { method: "POST", body: JSON.stringify({ ids }) }),
  batchPublishAiQa: async (ids: Array<string | number>) => request("/admin/ai-qa/batch-publish", { method: "POST", body: JSON.stringify({ ids }) }),
  batchDeleteAiQa: async (ids: Array<string | number>) => request("/admin/ai-qa/batch-delete", { method: "POST", body: JSON.stringify({ ids }) }),

  createKnowledgeImportDrafts: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, created: 0, updated: 0, conflicts: 0 });
    return request(`/admin/knowledge-imports/${id}/create-drafts`, { method: "POST", body: JSON.stringify({}) });
  },

  rollbackKnowledgeImport: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, archived_drafts: 0 });
    return request(`/admin/knowledge-imports/${id}/rollback`, { method: "POST", body: JSON.stringify({}) });
  },

  generateGuideLayout: async (data: { raw_text: string; language?: string; template?: string }) => {
    if (MOCK_MODE) {
      const lines = data.raw_text
        .split(/\n+/)
        .map((x) => x.trim())
        .filter(Boolean);
      return delay({
        ok: true,
        title: lines[0] || "AI Generated Guide",
        summary: lines.slice(1, 3).join(" ") || "Professional guide draft.",
        slug: (lines[0] || "ai-generated-guide")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        keywords: "guide, support, help",
        blocks: [
          { type: "heading", level: 2, text: lines[0] || "AI Generated Guide" },
          { type: "paragraph", text: lines.slice(1).join("\n") || data.raw_text },
          {
            type: "image",
            url: "",
            alt: "Guide screenshot",
            caption: "Upload related screenshot here",
          },
        ],
      });
    }
    return request("/admin/guides/ai-layout", { method: "POST", body: JSON.stringify(data) });
  },

  copyGuideLayout: async (blocks: any[], target_language = "hi") => {
    if (MOCK_MODE)
      return delay({ ok: true, target_language, blocks: blocks.map((b) => ({ ...b })) });
    return request("/admin/guides/ai-copy-layout", {
      method: "POST",
      body: JSON.stringify({ blocks, target_language }),
    });
  },

  getDiagnostics: async () => {
    if (MOCK_MODE) return delay(mock.diagnostics);
    return diagnosticsOut(await request("/admin/ai/diagnostics"));
  },

  getAdminApiDiagnostics: async () => {
    if (MOCK_MODE) return delay({ ok: true, checks: [] });
    return request("/admin/api-diagnostics");
  },

  getFoundationDiagnostics: async () => {
    if (MOCK_MODE) return delay({ ok: true, checks: [] });
    return request("/admin/foundation-diagnostics");
  },

  getAiQualityOverview: async () => {
    if (MOCK_MODE) return delay({ ok: true, summary: { findings: [], tests: { total: 0, passed: 0, failed: 0 } } });
    return request("/admin/ai-quality/overview");
  },

  scanAiQuality: async (data: { include_drafts?: boolean } = {}) => {
    if (MOCK_MODE) return delay({ ok: true, scan: { finding_count: 0 }, findings: [] });
    return request("/admin/ai-quality/scan", { method: "POST", body: JSON.stringify(data) });
  },

  listAiQualityFindings: async () => {
    if (MOCK_MODE) return delay({ ok: true, findings: [] });
    return request("/admin/ai-quality/findings");
  },

  resolveAiQualityFinding: async (id: string | number, data: { status: string }) => {
    if (MOCK_MODE) return delay({ ok: true, finding: { id, ...data } });
    return request(`/admin/ai-quality/findings/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },

  listAiQualityTestCases: async () => {
    if (MOCK_MODE) return delay({ ok: true, test_cases: [] });
    return request("/admin/ai-quality/test-cases");
  },

  createAiQualityTestCase: async (data: any) => {
    if (MOCK_MODE) return delay({ ok: true, test_case: { id: Date.now(), ...data } });
    return request("/admin/ai-quality/test-cases", { method: "POST", body: JSON.stringify(data) });
  },

  runAiQualityTest: async (id: string | number) => {
    if (MOCK_MODE) return delay({ ok: true, run: { id: Date.now(), test_case_id: id, status: "pass" } });
    return request(`/admin/ai-quality/test-cases/${id}/run`, { method: "POST", body: JSON.stringify({}) });
  },

  runAiQualitySuite: async () => {
    if (MOCK_MODE) return delay({ ok: true, summary: { total: 0, passed: 0, failed: 0 }, runs: [] });
    return request("/admin/ai-quality/test-suite/run", { method: "POST", body: JSON.stringify({}) });
  },

  getSupportOverview: async () => request("/admin/support/overview"),
  listSupportAiJobs: async (status = "") => request(`/admin/support/ai-jobs${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  getSupportSettings: async () => request("/admin/support/settings"),
  updateSupportSettings: async (data: any) => request("/admin/support/settings", { method: "PUT", body: JSON.stringify(data) }),
  listSupportStaff: async () => request("/admin/support/staff"),
  createSupportStaff: async (data: any) => request("/admin/support/staff", { method: "POST", body: JSON.stringify(data) }),
  updateSupportStaff: async (id: string | number, data: any) => request(`/admin/support/staff/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  resetSupportStaffPassword: async (id: string | number, temporary_password: string) => request(`/admin/support/staff/${id}/password`, { method: "POST", body: JSON.stringify({ temporary_password }) }),
  forceLogoutSupportStaff: async (id: string | number) => request(`/admin/support/staff/${id}/force-logout`, { method: "POST", body: JSON.stringify({}) }),
  listSupportConversations: async (status = "") => request(`/admin/support/conversations${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  getSupportConversation: async (id: string | number) => request(`/admin/support/conversations/${id}`),
  assignSupportConversation: async (id: string | number, staff_id: number) => request(`/admin/support/conversations/${id}/assign`, { method: "POST", body: JSON.stringify({ staff_id }) }),
  resolveSupportConversation: async (id: string | number, action: "resolve" | "reopen") => request(`/admin/support/conversations/${id}/${action}`, { method: "POST", body: JSON.stringify({}) }),
  getSupportPerformance: async () => request("/admin/support/performance"),
  getSupportAudit: async () => request("/admin/support/audit"),
  getSupportCustomerContext: async (id: string | number) => request(`/admin/support/conversations/${id}/context`),
  uploadSupportAttachment: async (id: string | number, file: File, caption = "") => uploadSupportFile(file, `/admin/support/conversations/${id}/attachments`, caption),
  sendAdminSupportMessage: async (id: string | number, message: string, client_message_id = crypto.randomUUID()) => request(`/admin/support/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ message, client_message_id }) }),
  listSupportQuickReplies: async () => request("/admin/support/quick-replies"),
  createSupportQuickReply: async (data: any) => request("/admin/support/quick-replies", { method: "POST", body: JSON.stringify(data) }),
  updateSupportQuickReply: async (id: string | number, data: any) => request(`/admin/support/quick-replies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSupportQuickReply: async (id: string | number) => request(`/admin/support/quick-replies/${id}`, { method: "DELETE" }),
  listChatPromotions: async () => request("/admin/support/promotions"),
  createChatPromotion: async (data: any) => request("/admin/support/promotions", { method: "POST", body: JSON.stringify(data) }),
  updateChatPromotion: async (id: string | number, data: any) => request(`/admin/support/promotions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteChatPromotion: async (id: string | number) => request(`/admin/support/promotions/${id}`, { method: "DELETE" }),

  testAI: async (message: string) => {
    if (MOCK_MODE)
      return delay({
        reply:
          "Mock reply: this is where the DeepSeek response would appear. Message received: " +
          message,
        latencyMs: 812,
      });
    const started = Date.now();
    const res: any = await request("/admin/ai/test", {
      method: "POST",
      body: JSON.stringify({ message, session_id: "admin-pro-test", image_urls: [] }),
    });
    return { ...res, latencyMs: Date.now() - started };
  },
};

export type AdminSupportStreamPacket = { id?: string; event: string; data: Record<string, any> };
export async function openAdminSupportConversationStream(conversationId: number, afterSequence = 0, signal?: AbortSignal) {
  if (!API_BASE_URL) throw new Error("Admin API is not configured. Set VITE_API_BASE_URL during the production build.");
  const headers: Record<string,string> = { Accept: "text/event-stream", ...platformHeaders() };
  const auth = getToken(); if (auth) headers.Authorization = `Bearer ${auth}`;
  const response = await fetch(`${API_BASE_URL}/admin/support/conversations/${conversationId}/stream?after_sequence=${Math.max(0,Number(afterSequence||0))}`, { headers, cache:"no-store", signal });
  if (!response.ok || !response.body) throw new Error(`Admin conversation stream failed (${response.status})`);
  return response;
}
export async function consumeAdminSupportEventStream(response: Response, onPacket: (packet: AdminSupportStreamPacket)=>void, signal?: AbortSignal) {
  if (!response.body) throw new Error("Stream body is unavailable");
  const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer="";
  try { while(!signal?.aborted) { const {done,value}=await reader.read(); if(done) break; buffer+=decoder.decode(value,{stream:true}); while(true){const match=buffer.match(/\r?\n\r?\n/);if(!match||match.index===undefined)break;const boundary=match.index;const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+match[0].length);let id="",event="message";const data:string[]=[];for(const line of block.split(/\r?\n/)){if(!line||line.startsWith(":"))continue;if(line.startsWith("id:"))id=line.slice(3).trim();else if(line.startsWith("event:"))event=line.slice(6).trim()||"message";else if(line.startsWith("data:"))data.push(line.slice(5).trimStart());}if(!data.length)continue;try{onPacket({id,event,data:JSON.parse(data.join("\n"))});}catch{onPacket({id,event,data:{text:data.join("\n")}});}} } } finally { try{await reader.cancel();}catch{} try{reader.releaseLock();}catch{} }
}

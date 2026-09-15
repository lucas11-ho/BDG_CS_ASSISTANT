import { API_BASE, getPublicLanguage, getPublicPlatformKey } from "@/lib/api";

const VISITOR_KEY = "bdg_guide_visitor_id";
const SESSION_KEY = "bdg_guide_session_id";

function randomId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id}`.slice(0, 80);
}

function storedId(storage: Storage, key: string, prefix: string) {
  try {
    const existing = storage.getItem(key) || "";
    if (/^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;
    const next = randomId(prefix);
    storage.setItem(key, next);
    return next;
  } catch {
    return randomId(prefix);
  }
}

function deviceType() {
  if (typeof window === "undefined") return "unknown";
  const width = window.innerWidth || 0;
  const ua = navigator.userAgent || "";
  if (/tablet|ipad/i.test(ua) || (width >= 700 && width <= 1100 && /android/i.test(ua))) return "tablet";
  if (/mobile|iphone|android/i.test(ua) || width < 700) return "mobile";
  return "desktop";
}

function safeReferrer() {
  try {
    if (!document.referrer) return "";
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return "";
  }
}

function payload() {
  if (typeof window === "undefined") return null;
  const platform = getPublicPlatformKey();
  if (!platform) return null;
  return {
    visitor_id: storedId(window.localStorage, VISITOR_KEY, "v"),
    session_id: storedId(window.sessionStorage, SESSION_KEY, "s"),
    platform,
    path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
    locale: getPublicLanguage(),
    referrer: safeReferrer(),
    device_type: deviceType(),
  };
}

async function send(kind: "pageview" | "heartbeat") {
  const body = payload();
  if (!body || !API_BASE) return;
  try {
    await fetch(`${API_BASE}/public/analytics/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Analytics is intentionally best-effort and must never block the Guide Center.
  }
}

export function trackPublicPageView() {
  void send("pageview");
}

export function startPublicTrafficHeartbeat() {
  if (typeof window === "undefined") return () => undefined;
  let stopped = false;
  const heartbeat = () => {
    if (!stopped && document.visibilityState === "visible") void send("heartbeat");
  };
  heartbeat();
  const timer = window.setInterval(heartbeat, 30_000);
  const onVisibility = () => { if (document.visibilityState === "visible") heartbeat(); };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export type WebIdentity = {
  browserTitle: string;
  description: string;
  previewTitle: string;
  previewDescription: string;
  previewImageUrl?: string;
  faviconUrl?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function currentPlatformReference(): string {
  if (typeof window === "undefined") return "";
  const query = new URLSearchParams(window.location.search).get("platform") || "";
  const path = window.location.pathname.match(/(?:^|\/)p\/([a-z0-9-]+)(?:\/|$)/i)?.[1] || "";
  return text(query || path);
}

function metaContent(selector: string): string {
  return text(document.querySelector<HTMLMetaElement>(selector)?.content);
}

function initialIdentityFromHead(): WebIdentity | null {
  if (typeof document === "undefined") return null;
  if (!document.querySelector('meta[name="x-platform-web-identity"][content="1"]')) return null;
  const browserTitle = text(document.title);
  const description = metaContent('meta[name="description"]');
  const previewTitle = metaContent('meta[property="og:title"]') || browserTitle;
  const previewDescription = metaContent('meta[property="og:description"]') || description;
  if (!browserTitle && !description) return null;
  return {
    browserTitle,
    description,
    previewTitle,
    previewDescription,
    previewImageUrl: metaContent('meta[property="og:image"]'),
    faviconUrl: text(document.querySelector<HTMLLinkElement>('link[data-platform-meta="favicon"]')?.href),
  };
}

function normalizeIdentity(value: any): WebIdentity | null {
  if (!value || typeof value !== "object") return null;
  const browserTitle = text(value.browserTitle);
  const description = text(value.description);
  if (!browserTitle && !description) return null;
  return {
    browserTitle,
    description,
    previewTitle: text(value.previewTitle) || browserTitle,
    previewDescription: text(value.previewDescription) || description,
    previewImageUrl: text(value.previewImageUrl),
    faviconUrl: text(value.faviconUrl),
  };
}

function upsertMeta(selector: string, attrs: Record<string, string>, content: string) {
  let node = document.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement("meta");
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.setAttribute("data-platform-runtime-meta", "true");
    document.head.appendChild(node);
  }
  if (node.content !== content) node.content = content;
}

function upsertLink(selector: string, rel: string, href: string) {
  let node = document.querySelector<HTMLLinkElement>(selector);
  if (!node) {
    node = document.createElement("link");
    node.rel = rel;
    node.setAttribute("data-platform-runtime-link", "true");
    document.head.appendChild(node);
  }
  if (node.rel !== rel) node.rel = rel;
  if (node.href !== href) node.href = href;
  return node;
}

function applyIdentity(identity: WebIdentity) {
  if (identity.browserTitle && document.title !== identity.browserTitle) document.title = identity.browserTitle;
  if (identity.description) upsertMeta('meta[name="description"]', { name: "description" }, identity.description);
  if (identity.previewTitle) upsertMeta('meta[property="og:title"]', { property: "og:title" }, identity.previewTitle);
  if (identity.previewDescription) upsertMeta('meta[property="og:description"]', { property: "og:description" }, identity.previewDescription);
  upsertMeta('meta[property="og:type"]', { property: "og:type" }, "website");
  upsertMeta('meta[property="og:url"]', { property: "og:url" }, window.location.href);
  upsertMeta('meta[name="twitter:card"]', { name: "twitter:card" }, "summary_large_image");
  if (identity.previewTitle) upsertMeta('meta[name="twitter:title"]', { name: "twitter:title" }, identity.previewTitle);
  if (identity.previewDescription) upsertMeta('meta[name="twitter:description"]', { name: "twitter:description" }, identity.previewDescription);
  if (identity.previewImageUrl) {
    upsertMeta('meta[property="og:image"]', { property: "og:image" }, identity.previewImageUrl);
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image" }, identity.previewImageUrl);
  }
  if (identity.faviconUrl) {
    const favicon = upsertLink('link[data-platform-runtime-favicon="true"]', "icon", identity.faviconUrl);
    favicon.setAttribute("data-platform-runtime-favicon", "true");
    favicon.setAttribute("data-platform-favicon", "true");
    document.querySelectorAll<HTMLLinkElement>('link[data-platform-favicon="true"]').forEach((link) => {
      if (link !== favicon) link.remove();
    });
    const apple = upsertLink('link[data-platform-runtime-apple-icon="true"]', "apple-touch-icon", identity.faviconUrl);
    apple.setAttribute("data-platform-runtime-apple-icon", "true");
  }
}

async function loadIdentity(): Promise<WebIdentity | null> {
  const url = new URL("/__platform/identity", window.location.origin);
  const platform = currentPlatformReference();
  if (platform) url.searchParams.set("platform", platform);
  const response = await fetch(url.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return normalizeIdentity(payload?.identity);
}

export function installWebIdentityRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.head) return () => {};
  let active = initialIdentityFromHead();
  let applying = false;
  let queued = false;

  const enforce = () => {
    if (!active || applying) return;
    applying = true;
    try { applyIdentity(active); }
    finally { applying = false; }
  };

  if (active) enforce();
  const observer = new MutationObserver(() => {
    if (!active || applying || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enforce();
    });
  });
  observer.observe(document.head, { childList: true, subtree: true, attributes: true, characterData: true });

  void loadIdentity().then((identity) => {
    if (!identity) return;
    active = identity;
    enforce();
  }).catch(() => undefined);

  return () => observer.disconnect();
}

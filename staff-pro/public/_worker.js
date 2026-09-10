const SITE_KIND = "staff";
const API_BASE = "https://bdg-ai-help-api-render.onrender.com";
const SITE_LABELS = { guide: "Help Center", chat: "Support Chat", admin: "Admin", staff: "Staff Console" };

function platformReference(url) {
  const fromPath = url.pathname.match(/^\/p\/([a-z0-9-]+)(?:\/|$)/i)?.[1];
  return String(url.searchParams.get("platform") || fromPath || "").trim();
}
function safeText(value) { return typeof value === "string" ? value.trim() : ""; }
function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

async function loadManifest(incomingUrl) {
  const reference = platformReference(incomingUrl);
  const apiUrl = new URL("/guide/content", API_BASE);
  if (reference) apiUrl.searchParams.set("platform", reference);
  const headers = { Accept: "application/json" };
  if (!reference) { headers["X-Forwarded-Host"] = incomingUrl.hostname; headers["X-Forwarded-Proto"] = "https"; }
  const response = await fetch(apiUrl.toString(), { headers });
  if (!response.ok) return null;
  return response.json();
}

function identityFrom(manifest) {
  if (!manifest) return null;
  const content = manifest.content || {};
  const settings = manifest.settings || {};
  const prefix = `web.${SITE_KIND}.`;
  const brandName = safeText(settings.brand_name || settings.app_name) || "Support";
  const browserTitle = safeText(content[`${prefix}browser_title`]) || `${brandName} — ${SITE_LABELS[SITE_KIND]}`;
  const description = safeText(content[`${prefix}description`]) || safeText(settings.brand_tagline) || `${brandName} ${SITE_LABELS[SITE_KIND]}`;
  return {
    browserTitle,
    description,
    previewTitle: safeText(content[`${prefix}preview_title`]) || browserTitle,
    previewDescription: safeText(content[`${prefix}preview_description`]) || description,
    previewImageUrl: safeText(content[`${prefix}preview_image_url`]),
    faviconUrl: safeText(content[`${prefix}favicon_url`]),
  };
}

function rewriteHtml(html, identity, requestUrl) {
  if (!identity) return html;
  html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title data-platform-meta="title">${escapeHtml(identity.browserTitle)}</title>`);
  html = html.replace(/<(?:meta|link)\b[^>]*data-platform-meta(?:=(?:"[^"]*"|'[^']*'))?[^>]*>\s*/gi, "");
  const tags = [
    `<meta data-platform-meta="description" name="description" content="${escapeHtml(identity.description)}" />`,
    `<meta data-platform-meta="og-title" property="og:title" content="${escapeHtml(identity.previewTitle)}" />`,
    `<meta data-platform-meta="og-description" property="og:description" content="${escapeHtml(identity.previewDescription)}" />`,
    `<meta data-platform-meta="og-type" property="og:type" content="website" />`,
    `<meta data-platform-meta="og-url" property="og:url" content="${escapeHtml(requestUrl)}" />`,
    `<meta data-platform-meta="twitter-card" name="twitter:card" content="summary_large_image" />`,
    `<meta data-platform-meta="twitter-title" name="twitter:title" content="${escapeHtml(identity.previewTitle)}" />`,
    `<meta data-platform-meta="twitter-description" name="twitter:description" content="${escapeHtml(identity.previewDescription)}" />`,
  ];
  if (identity.previewImageUrl) {
    tags.push(`<meta data-platform-meta="og-image" property="og:image" content="${escapeHtml(identity.previewImageUrl)}" />`);
    tags.push(`<meta data-platform-meta="twitter-image" name="twitter:image" content="${escapeHtml(identity.previewImageUrl)}" />`);
  }
  if (identity.faviconUrl) {
    tags.push(`<link data-platform-meta="favicon" data-platform-favicon="true" rel="icon" href="${escapeHtml(identity.faviconUrl)}" />`);
    tags.push(`<link data-platform-meta="apple-icon" rel="apple-touch-icon" href="${escapeHtml(identity.faviconUrl)}" />`);
  }
  return html.replace(/<\/head>/i, `${tags.join("\n    ")}\n  </head>`);
}

export default {
  async fetch(request, env) {
    let response = await env.ASSETS.fetch(request);
    const accept = request.headers.get("accept") || "";
    if (response.status === 404 && accept.includes("text/html")) response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
    try {
      const incomingUrl = new URL(request.url);
      const identity = identityFrom(await loadManifest(incomingUrl));
      const html = rewriteHtml(await response.text(), identity, incomingUrl.toString());
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=UTF-8");
      headers.set("cache-control", "no-store");
      return new Response(html, { status: response.status, headers });
    } catch (error) {
      console.warn("platform web identity unavailable", error);
      return response;
    }
  },
};

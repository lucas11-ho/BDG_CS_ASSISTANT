import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote",
  "pre", "code", "h1", "h2", "h3", "h4", "a", "img", "iframe", "table", "thead", "tbody",
  "tr", "th", "td", "hr", "span", "div",
];

const ALLOWED_ATTR = [
  "href", "title", "target", "rel", "src", "alt", "width", "height", "colspan", "rowspan",
  "class", "aria-label", "loading", "allow", "allowfullscreen", "referrerpolicy",
  "data-bdg-media-embed", "data-bdg-link-card", "data-provider", "data-source-url",
];

function safeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "www.youtube-nocookie.com"
      || host === "youtube-nocookie.com"
      || host === "platform.twitter.com"
      || host === "www.tiktok.com"
    );
  } catch {
    return false;
  }
}

function removeUnsafeIframes(value: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return value.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "");
  const doc = new DOMParser().parseFromString(`<div id="bdg-root">${value}</div>`, "text/html");
  doc.querySelectorAll("iframe").forEach((frame) => {
    if (!safeEmbedUrl(frame.getAttribute("src") || "")) frame.remove();
  });
  return doc.querySelector("#bdg-root")?.innerHTML || "";
}

/**
 * Last-mile browser sanitization for administrator-authored rich content.
 * The API also sanitizes on write and read; this protects old rows and cached
 * responses while they are being migrated.
 */
export function sanitizeRichHtml(value: string | null | undefined): string {
  const prefiltered = removeUnsafeIframes(String(value || ""));
  return DOMPurify.sanitize(prefiltered, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ["script", "style", "object", "embed", "form", "input", "button", "svg", "math"],
    FORBID_ATTR: ["srcset"],
  });
}

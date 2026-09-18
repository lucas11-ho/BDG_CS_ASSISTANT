export type MediaTarget = {
  kind: "embed" | "link";
  provider: "youtube" | "x" | "tiktok" | "external";
  url: string;
  embedUrl?: string;
  label: string;
};

function stripWrappingPunctuation(value: string) {
  return value.trim().replace(/^[<([{"']+/, "").replace(/[>)]}"',.]+$/, "");
}

export function normalizeUserUrl(raw: string) {
  let value = stripWrappingPunctuation(String(raw || ""));
  if (!value) return "";
  if (/^(javascript|data|vbscript):/i.test(value)) return "";
  if (/^(mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return "";
  }
}

function youtubeId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")) {
    const byQuery = url.searchParams.get("v");
    if (byQuery) return byQuery;
    return url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] || "";
  }
  return "";
}

function xStatusId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!(host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com"))) return "";
  return url.pathname.match(/\/status\/(\d+)/)?.[1] || "";
}

function tiktokVideoId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!(host === "tiktok.com" || host.endsWith(".tiktok.com"))) return "";
  return url.pathname.match(/\/(?:video|v|player\/v1)\/(\d+)/)?.[1] || "";
}

export function mediaTargetFromUrl(raw: string): MediaTarget | null {
  const normalized = normalizeUserUrl(raw);
  if (!normalized) return null;
  let url: URL;
  try { url = new URL(normalized); } catch { return null; }

  const yt = youtubeId(url);
  if (yt && /^[\w-]{6,32}$/.test(yt)) {
    return {
      kind:"embed",
      provider:"youtube",
      url:normalized,
      embedUrl:`https://www.youtube.com/embed/${yt}?rel=0&playsinline=1`,
      label:"YouTube video",
    };
  }

  const tweet = xStatusId(url);
  if (tweet) {
    return {
      kind:"embed",
      provider:"x",
      url:normalized,
      embedUrl:`https://platform.twitter.com/embed/Tweet.html?id=${tweet}&theme=light`,
      label:"X post",
    };
  }

  const tiktok = tiktokVideoId(url);
  if (tiktok) {
    return {
      kind:"embed",
      provider:"tiktok",
      url:normalized,
      embedUrl:`https://www.tiktok.com/player/v1/${tiktok}?autoplay=0&loop=0&music_info=1&description=1`,
      label:"TikTok video",
    };
  }

  const host = url.hostname.toLowerCase();
  const provider =
    host === "youtu.be" || host.includes("youtube") ? "youtube"
    : host === "x.com" || host.endsWith(".x.com") || host.includes("twitter") ? "x"
    : host.includes("tiktok") ? "tiktok"
    : "external";

  return {
    kind:"link",
    provider,
    url:normalized,
    label:provider === "youtube" ? "Open YouTube video" : provider === "x" ? "Open X post" : provider === "tiktok" ? "Open TikTok video" : "Open link",
  };
}

function loadImageFromObjectUrl(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not preview image"));
    };
    img.src = url;
  });
}

export async function createSmallBlurPreview(file: File, maxDimension = 64) {
  if (!file.type.startsWith("image/")) throw new Error("Only image files can be previewed");
  const image = await loadImageFromObjectUrl(file);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { alpha:false });
  if (!ctx) throw new Error("Image preview is unavailable in this browser");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.48);
}

export function isPermanentHttpsUrl(value: unknown) {
  return /^https:\/\//i.test(String(value || ""));
}

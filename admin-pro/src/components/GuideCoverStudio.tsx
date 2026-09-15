import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Input,
  InputNumber,
  Row,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  PictureOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";

const { Text } = Typography;

export type GuideCoverTemplate = "professional" | "screenshot-focus" | "security-notice" | "minimal";
export type GuideCoverPreset =
  | "brand-dark"
  | "blue-professional"
  | "purple-premium"
  | "green-success"
  | "orange-warning"
  | "red-alert"
  | "neutral-dark";
type CoverFont = "ios" | "system" | "inter" | "roboto" | "noto";
type LogoShape = "original" | "square" | "rounded-square" | "circle";
type BannerShape = "rectangle" | "rounded" | "pill" | "ribbon" | "glass" | "outline";
type Anchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
type TextAlign = "left" | "center" | "right";

type Props = {
  locale: string;
  direction?: string;
  title: string;
  summary?: string;
  category?: string;
  currentCoverUrl?: string;
  canUpload?: boolean;
  onGenerated: (url: string) => void;
};

type CoverDesign = {
  template: GuideCoverTemplate;
  preset: GuideCoverPreset;
  gradientStart: string;
  gradientEnd: string;
  accentColor: string;
  overlay: number;
  showLocale: boolean;
  textTop: number;
  maxTextWidth: number;
  logo: {
    enabled: boolean;
    source: "platform" | "custom";
    customUrl: string;
    shape: LogoShape;
    position: Anchor;
    size: number;
    marginX: number;
    marginY: number;
    opacity: number;
  };
  banner: {
    enabled: boolean;
    shape: BannerShape;
    position: Anchor;
    width: number;
    height: number;
    marginX: number;
    marginY: number;
    color: string;
    opacity: number;
    borderColor: string;
    borderWidth: number;
    textEnabled: boolean;
    textColor: string;
    font: CoverFont;
    fontSize: number;
    fontWeight: number;
    textAlign: TextAlign;
    shadow: boolean;
  };
  titleStyle: { color: string; font: CoverFont; fontSize: number; fontWeight: number; align: TextAlign };
  subtitleStyle: { color: string; font: CoverFont; fontSize: number; fontWeight: number; align: TextAlign };
};

type SavedPreset = { name: string; design: CoverDesign };
type Palette = { start: string; end: string; accent: string; text: string; muted: string };

const DEFAULT_DESIGN_KEY = "guide.cover.default_design.v2";
const PRESETS_KEY = "guide.cover.design_presets.v2";

const PALETTES: Record<GuideCoverPreset, Palette> = {
  "brand-dark": { start: "#071426", end: "#16294a", accent: "#62a8ff", text: "#ffffff", muted: "#d8e6f7" },
  "blue-professional": { start: "#06295a", end: "#0d68d8", accent: "#67c8ff", text: "#ffffff", muted: "#ddecff" },
  "purple-premium": { start: "#241141", end: "#6a2bbf", accent: "#d693ff", text: "#ffffff", muted: "#eee0ff" },
  "green-success": { start: "#093d34", end: "#0d8a69", accent: "#7ff0ca", text: "#ffffff", muted: "#d8fff3" },
  "orange-warning": { start: "#54220b", end: "#c46215", accent: "#ffd486", text: "#ffffff", muted: "#fff0d6" },
  "red-alert": { start: "#4b1018", end: "#b3263d", accent: "#ff9dac", text: "#ffffff", muted: "#ffe0e5" },
  "neutral-dark": { start: "#111827", end: "#303744", accent: "#b9c3d4", text: "#ffffff", muted: "#d8dee8" },
};

const TEMPLATE_OPTIONS = [
  { value: "professional", label: "Professional · recommended" },
  { value: "screenshot-focus", label: "Screenshot Focus" },
  { value: "security-notice", label: "Security Notice" },
  { value: "minimal", label: "Minimal" },
];
const PRESET_OPTIONS = Object.keys(PALETTES).map((value) => ({
  value,
  label: value.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
}));
const FONT_OPTIONS = [
  { value: "ios", label: "iOS / Apple System" },
  { value: "system", label: "System Default" },
  { value: "inter", label: "Inter" },
  { value: "roboto", label: "Roboto" },
  { value: "noto", label: "Noto Sans" },
];
const ANCHOR_OPTIONS: { value: Anchor; label: string }[] = [
  { value: "top-left", label: "Top left" }, { value: "top-center", label: "Top center" }, { value: "top-right", label: "Top right" },
  { value: "middle-left", label: "Middle left" }, { value: "middle-center", label: "Middle center" }, { value: "middle-right", label: "Middle right" },
  { value: "bottom-left", label: "Bottom left" }, { value: "bottom-center", label: "Bottom center" }, { value: "bottom-right", label: "Bottom right" },
];
const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" },
];
const WEIGHTS = [400, 500, 600, 700, 800, 900].map((value) => ({ value, label: String(value) }));

const DEFAULT_DESIGN: CoverDesign = {
  template: "professional",
  preset: "brand-dark",
  gradientStart: PALETTES["brand-dark"].start,
  gradientEnd: PALETTES["brand-dark"].end,
  accentColor: PALETTES["brand-dark"].accent,
  overlay: 34,
  showLocale: false,
  textTop: 250,
  maxTextWidth: 620,
  logo: { enabled: true, source: "platform", customUrl: "", shape: "rounded-square", position: "top-left", size: 92, marginX: 48, marginY: 38, opacity: 100 },
  banner: { enabled: true, shape: "pill", position: "top-left", width: 290, height: 54, marginX: 48, marginY: 150, color: "#ffffff", opacity: 16, borderColor: "#ffffff", borderWidth: 0, textEnabled: true, textColor: "#ffffff", font: "ios", fontSize: 23, fontWeight: 700, textAlign: "center", shadow: false },
  titleStyle: { color: "#ffffff", font: "ios", fontSize: 68, fontWeight: 800, align: "left" },
  subtitleStyle: { color: "#d8e6f7", font: "ios", fontSize: 30, fontWeight: 500, align: "left" },
};

const cloneDesign = (value: CoverDesign): CoverDesign => JSON.parse(JSON.stringify(value));
function mergeDesign(raw: any): CoverDesign {
  const base = cloneDesign(DEFAULT_DESIGN);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    logo: { ...base.logo, ...(raw.logo || {}) },
    banner: { ...base.banner, ...(raw.banner || {}) },
    titleStyle: { ...base.titleStyle, ...(raw.titleStyle || {}) },
    subtitleStyle: { ...base.subtitleStyle, ...(raw.subtitleStyle || {}) },
  };
}

function resolveFont(font: CoverFont, locale: string) {
  const ios = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  const base = font === "ios" ? ios : font === "inter" ? 'Inter, "Segoe UI", Arial, sans-serif' : font === "roboto" ? 'Roboto, "Segoe UI", Arial, sans-serif' : font === "noto" ? '"Noto Sans", "Segoe UI", Arial, sans-serif' : 'system-ui, "Segoe UI", Arial, sans-serif';
  const code = String(locale || "").toLowerCase();
  if (code.startsWith("my")) return `${base}, "Noto Sans Myanmar", "Myanmar Text", sans-serif`;
  if (/^(hi|mr|ne)/.test(code)) return `${base}, "Noto Sans Devanagari", "Nirmala UI", sans-serif`;
  if (code.startsWith("th")) return `${base}, "Noto Sans Thai", Tahoma, sans-serif`;
  if (code.startsWith("zh")) return `${base}, "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif`;
  if (code.startsWith("ja")) return `${base}, "Noto Sans JP", "Yu Gothic", sans-serif`;
  if (code.startsWith("ko")) return `${base}, "Noto Sans KR", "Malgun Gothic", sans-serif`;
  if (/^(ar|fa|ur)/.test(code)) return `${base}, "Noto Sans Arabic", Tahoma, sans-serif`;
  return base;
}
const isRtlLocale = (locale: string, direction?: string) => String(direction || "").toLowerCase() === "rtl" || /^(ar|fa|he|ur)(-|$)/i.test(locale || "");

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function anchorRect(anchor: Anchor, width: number, height: number, marginX: number, marginY: number) {
  let x = marginX;
  let y = marginY;
  if (anchor.endsWith("center")) x = (1280 - width) / 2;
  else if (anchor.endsWith("right")) x = 1280 - width - marginX;
  if (anchor.startsWith("middle")) y = (720 - height) / 2;
  else if (anchor.startsWith("bottom")) y = 720 - height - marginY;
  return { x, y, width, height };
}
function fitLines(ctx: CanvasRenderingContext2D, textValue: string, maxWidth: number, maxLines: number, startSize: number, minSize: number, family: string, weight: number) {
  const text = String(textValue || "").trim();
  if (!text) return { lines: [""], size: startSize };
  for (let size = startSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || ctx.measureText(candidate).width <= maxWidth) current = candidate;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) return { lines, size };
  }
  ctx.font = `${weight} ${minSize}px ${family}`;
  const lines: string[] = [];
  let current = "";
  for (const char of Array.from(text)) {
    const candidate = current + char;
    if (!current || ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else { lines.push(current); current = char; if (lines.length >= maxLines - 1) break; }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return { lines: lines.slice(0, maxLines), size: minSize };
}
function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not load logo image")); image.src = url;
  });
}
function drawLogo(ctx: CanvasRenderingContext2D, image: HTMLImageElement, logo: CoverDesign["logo"]) {
  const size = Math.max(36, logo.size);
  let width = size;
  let height = size;
  if (logo.shape === "original" && image.naturalWidth && image.naturalHeight) {
    const ratio = image.naturalWidth / image.naturalHeight;
    if (ratio >= 1) height = size / ratio; else width = size * ratio;
  }
  const rect = anchorRect(logo.position, width, height, logo.marginX, logo.marginY);
  ctx.save(); ctx.globalAlpha = logo.opacity / 100;
  if (logo.shape === "circle") { ctx.beginPath(); ctx.arc(rect.x + width / 2, rect.y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2); ctx.clip(); }
  else if (logo.shape === "rounded-square") { roundedRect(ctx, rect.x, rect.y, width, height, size * 0.2); ctx.clip(); }
  else if (logo.shape === "square") { roundedRect(ctx, rect.x, rect.y, width, height, 0); ctx.clip(); }
  if (logo.shape === "original") ctx.drawImage(image, rect.x, rect.y, width, height);
  else {
    const s = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, (image.naturalWidth - s) / 2, (image.naturalHeight - s) / 2, s, s, rect.x, rect.y, width, height);
  }
  ctx.restore();
}
function drawBanner(ctx: CanvasRenderingContext2D, banner: CoverDesign["banner"], text: string, family: string) {
  const rect = anchorRect(banner.position, banner.width, banner.height, banner.marginX, banner.marginY);
  ctx.save();
  if (banner.shadow) { ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; }
  ctx.globalAlpha = banner.opacity / 100; ctx.fillStyle = banner.color; ctx.strokeStyle = banner.borderColor; ctx.lineWidth = banner.borderWidth;
  if (banner.shape === "ribbon") { ctx.beginPath(); ctx.moveTo(rect.x, rect.y); ctx.lineTo(rect.x + rect.width - 24, rect.y); ctx.lineTo(rect.x + rect.width, rect.y + rect.height / 2); ctx.lineTo(rect.x + rect.width - 24, rect.y + rect.height); ctx.lineTo(rect.x, rect.y + rect.height); ctx.closePath(); }
  else roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, banner.shape === "pill" ? rect.height / 2 : banner.shape === "rounded" || banner.shape === "glass" ? Math.min(20, rect.height / 2) : 0);
  if (banner.shape === "outline") { ctx.globalAlpha = 1; ctx.lineWidth = Math.max(2, banner.borderWidth || 2); ctx.stroke(); }
  else { ctx.fill(); if (banner.borderWidth > 0) { ctx.globalAlpha = 1; ctx.stroke(); } }
  ctx.restore();
  if (banner.textEnabled && text.trim()) {
    ctx.save(); ctx.font = `${banner.fontWeight} ${banner.fontSize}px ${family}`; ctx.fillStyle = banner.textColor; ctx.textBaseline = "middle"; ctx.textAlign = banner.textAlign;
    const x = banner.textAlign === "left" ? rect.x + 22 : banner.textAlign === "right" ? rect.x + rect.width - 22 : rect.x + rect.width / 2;
    ctx.fillText(text.trim(), x, rect.y + rect.height / 2, rect.width - 36); ctx.restore();
  }
}
function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render cover image")), "image/png", 0.94));
}
function alphaHex(hex: string, opacity: number) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const alpha = Math.round(Math.max(0, Math.min(100, opacity)) * 2.55).toString(16).padStart(2, "0");
  return `#${value}${alpha}`;
}

export default function GuideCoverStudio({ locale, direction, title, summary = "", category = "", currentCoverUrl = "", canUpload = false, onGenerated }: Props) {
  const [design, setDesign] = useState<CoverDesign>(() => cloneDesign(DEFAULT_DESIGN));
  const [platformDefault, setPlatformDefault] = useState<CoverDesign>(() => cloneDesign(DEFAULT_DESIGN));
  const [platformLogoUrl, setPlatformLogoUrl] = useState("");
  const [coverTitle, setCoverTitle] = useState(title || "");
  const [subtitle, setSubtitle] = useState(summary || "");
  const [bannerText, setBannerText] = useState(category || "Guide");
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [loadingDesigner, setLoadingDesigner] = useState(true);
  const [savingDesigner, setSavingDesigner] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { setCoverTitle(title || ""); }, [locale, title]);
  useEffect(() => { setSubtitle(summary || ""); }, [locale, summary]);
  useEffect(() => { setBannerText(category || "Guide"); }, [locale, category]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [settingsResult, contentResult] = await Promise.allSettled([api.getSettings(), api.list("site-content")]);
        if (!active) return;
        const settings: any = settingsResult.status === "fulfilled" ? settingsResult.value : {};
        const rows: any[] = contentResult.status === "fulfilled" && Array.isArray(contentResult.value) ? contentResult.value : [];
        setPlatformLogoUrl(String(settings?.guide_logo_url || settings?.logo_url || "").trim());
        const map = Object.fromEntries(rows.map((row: any) => [String(row.key || row.block_key || ""), String(row.value || "")]));
        let next = cloneDesign(DEFAULT_DESIGN);
        try { if (map[DEFAULT_DESIGN_KEY]) next = mergeDesign(JSON.parse(map[DEFAULT_DESIGN_KEY])); } catch { /* invalid old setting falls back safely */ }
        let saved: SavedPreset[] = [];
        try { const parsed = map[PRESETS_KEY] ? JSON.parse(map[PRESETS_KEY]) : []; if (Array.isArray(parsed)) saved = parsed.filter((item) => item?.name && item?.design).map((item) => ({ name: String(item.name), design: mergeDesign(item.design) })); } catch { /* ignore malformed preset data */ }
        setPlatformDefault(next); setDesign(next); setPresets(saved);
      } finally { if (active) setLoadingDesigner(false); }
    })();
    return () => { active = false; };
  }, []);

  const rtl = isRtlLocale(locale, direction);
  const logoUrl = design.logo.source === "platform" ? platformLogoUrl : design.logo.customUrl;
  const titleFont = resolveFont(design.titleStyle.font, locale);
  const subtitleFont = resolveFont(design.subtitleStyle.font, locale);
  const bannerFont = resolveFont(design.banner.font, locale);
  const patch = (value: Partial<CoverDesign>) => setDesign((current) => ({ ...current, ...value }));
  const patchLogo = (value: Partial<CoverDesign["logo"]>) => setDesign((current) => ({ ...current, logo: { ...current.logo, ...value } }));
  const patchBanner = (value: Partial<CoverDesign["banner"]>) => setDesign((current) => ({ ...current, banner: { ...current.banner, ...value } }));
  const patchTitle = (value: Partial<CoverDesign["titleStyle"]>) => setDesign((current) => ({ ...current, titleStyle: { ...current.titleStyle, ...value } }));
  const patchSubtitle = (value: Partial<CoverDesign["subtitleStyle"]>) => setDesign((current) => ({ ...current, subtitleStyle: { ...current.subtitleStyle, ...value } }));
  const colour = (value: string, onChange: (value: string) => void) => <Input type="color" value={value} onChange={(event) => onChange(event.target.value)} style={{ height: 36, padding: 4 }} />;

  const applyPalette = (preset: GuideCoverPreset) => {
    const p = PALETTES[preset];
    setDesign((current) => ({ ...current, preset, gradientStart: p.start, gradientEnd: p.end, accentColor: p.accent, titleStyle: { ...current.titleStyle, color: p.text }, subtitleStyle: { ...current.subtitleStyle, color: p.muted } }));
  };
  const writeSetting = (key: string, label: string, value: string, sortOrder: number) => api.update("site-content", key, { key, block_key: key, label, value, input_type: "text", sort_order: sortOrder });
  const saveDefault = async () => {
    setSavingDesigner(true);
    try { await writeSetting(DEFAULT_DESIGN_KEY, "Guide cover default design", JSON.stringify(design), 720); setPlatformDefault(cloneDesign(design)); message.success("Platform default cover design saved"); }
    catch (error: any) { message.error(error?.message || "Could not save platform cover design"); }
    finally { setSavingDesigner(false); }
  };
  const savePreset = async () => {
    const name = presetName.trim(); if (!name) { message.info("Enter a preset name first"); return; }
    setSavingDesigner(true);
    try {
      const next = [...presets.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), { name, design: cloneDesign(design) }].sort((a, b) => a.name.localeCompare(b.name));
      await writeSetting(PRESETS_KEY, "Guide cover design presets", JSON.stringify(next), 721); setPresets(next); setSelectedPreset(name); setPresetName(""); message.success(`Preset “${name}” saved`);
    } catch (error: any) { message.error(error?.message || "Could not save preset"); }
    finally { setSavingDesigner(false); }
  };
  const removePreset = async () => {
    if (!selectedPreset) return;
    setSavingDesigner(true);
    try { const next = presets.filter((item) => item.name !== selectedPreset); await writeSetting(PRESETS_KEY, "Guide cover design presets", JSON.stringify(next), 721); setPresets(next); setSelectedPreset(""); message.success("Preset deleted"); }
    catch (error: any) { message.error(error?.message || "Could not delete preset"); }
    finally { setSavingDesigner(false); }
  };
  const uploadLogo = async (file: File) => {
    try {
      if (!canUpload) throw new Error("Guide upload permission is required to upload a cover logo");
      if (!file.type.startsWith("image/")) throw new Error("Logo must be an image file");
      const uploaded: any = await api.uploadGuide(file); if (!uploaded?.url) throw new Error("Logo upload did not return a URL");
      patchLogo({ source: "custom", customUrl: uploaded.url, enabled: true }); message.success("Cover logo uploaded");
    } catch (error: any) { message.error(error?.message || "Logo upload failed"); }
    return false;
  };

  const generate = async () => {
    if (!canUpload) { message.error("Guide upload permission is required to generate a cover"); return; }
    if (!coverTitle.trim()) { message.error("Cover title is required"); return; }
    setGenerating(true);
    try {
      const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas rendering is not available in this browser");
      const gradient = ctx.createLinearGradient(0, 0, 1280, 720); gradient.addColorStop(0, design.gradientStart); gradient.addColorStop(1, design.gradientEnd); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 720);
      ctx.globalAlpha = design.overlay / 100; ctx.fillStyle = design.accentColor; ctx.beginPath(); ctx.arc(1120, 105, 240, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(1170, 630, 280, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      if (design.template !== "minimal") { ctx.fillStyle = "rgba(255,255,255,.10)"; roundedRect(ctx, rtl ? 70 : 760, 95, 430, 530, 44); ctx.fill(); }
      if (design.template === "security-notice") { const cx = rtl ? 285 : 975; ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.beginPath(); ctx.moveTo(cx, 190); ctx.lineTo(cx + 150, 265); ctx.lineTo(cx + 112, 470); ctx.lineTo(cx, 555); ctx.lineTo(cx - 112, 470); ctx.lineTo(cx - 150, 265); ctx.closePath(); ctx.fill(); ctx.fillStyle = design.accentColor; ctx.font = `900 118px ${resolveFont("ios", locale)}`; ctx.textAlign = "center"; ctx.fillText("!", cx, 425); }
      if (design.banner.enabled) drawBanner(ctx, design.banner, bannerText, bannerFont);
      if (design.logo.enabled && logoUrl) { try { drawLogo(ctx, await loadImage(logoUrl), design.logo); } catch { message.warning("Logo could not be embedded; the cover was generated without it"); } }

      const titleAlign = design.titleStyle.align || (rtl ? "right" : "left");
      ctx.textAlign = titleAlign; ctx.textBaseline = "alphabetic";
      const titleX = titleAlign === "center" ? 640 : titleAlign === "right" ? 1190 : 90;
      let y = design.textTop;
      const fittedTitle = fitLines(ctx, coverTitle, design.maxTextWidth, 3, design.titleStyle.fontSize, Math.max(30, design.titleStyle.fontSize - 28), titleFont, design.titleStyle.fontWeight);
      ctx.font = `${design.titleStyle.fontWeight} ${fittedTitle.size}px ${titleFont}`; ctx.fillStyle = design.titleStyle.color;
      for (const line of fittedTitle.lines) { ctx.fillText(line, titleX, y, design.maxTextWidth); y += Math.round(fittedTitle.size * 1.14); }
      if (subtitle.trim()) {
        y += 20; const align = design.subtitleStyle.align; ctx.textAlign = align; const x = align === "center" ? 640 : align === "right" ? 1190 : 90;
        const fitted = fitLines(ctx, subtitle, design.maxTextWidth, 3, design.subtitleStyle.fontSize, Math.max(18, design.subtitleStyle.fontSize - 10), subtitleFont, design.subtitleStyle.fontWeight);
        ctx.font = `${design.subtitleStyle.fontWeight} ${fitted.size}px ${subtitleFont}`; ctx.fillStyle = design.subtitleStyle.color;
        for (const line of fitted.lines) { ctx.fillText(line, x, y, design.maxTextWidth); y += Math.round(fitted.size * 1.42); }
      }
      ctx.fillStyle = design.accentColor; roundedRect(ctx, rtl ? 920 : 90, 645, 270, 8, 4); ctx.fill();
      if (design.showLocale) { ctx.font = `700 22px ${resolveFont("ios", locale)}`; ctx.fillStyle = design.subtitleStyle.color; ctx.textAlign = rtl ? "right" : "left"; ctx.fillText(locale.toUpperCase(), rtl ? 1190 : 90, 675); }
      const file = new File([await canvasBlob(canvas)], `guide-cover-${String(locale || "default").replace(/[^a-z0-9-]/gi, "-")}-${Date.now()}.png`, { type: "image/png" });
      const uploaded: any = await api.uploadGuideMotion(file); if (!uploaded?.url) throw new Error("Cover upload did not return a URL"); onGenerated(uploaded.url); message.success("Advanced cover generated. Click Save locale to store it with this Guide language.");
    } catch (error: any) { message.error(error?.message || "Cover generation failed"); }
    finally { setGenerating(false); }
  };

  const previewAnchor = (anchor: Anchor, width: number, height: number, mx: number, my: number) => {
    const r = anchorRect(anchor, width, height, mx, my);
    return { left: `${r.x / 12.8}%`, top: `${r.y / 7.2}%`, width: `${r.width / 12.8}%`, height: `${r.height / 7.2}%` };
  };
  const bannerPreview = useMemo(() => ({
    ...previewAnchor(design.banner.position, design.banner.width, design.banner.height, design.banner.marginX, design.banner.marginY),
    position: "absolute" as const,
    display: design.banner.enabled ? "flex" : "none",
    alignItems: "center",
    justifyContent: design.banner.textAlign === "left" ? "flex-start" : design.banner.textAlign === "right" ? "flex-end" : "center",
    padding: "0 2%",
    boxSizing: "border-box" as const,
    background: design.banner.shape === "outline" ? "transparent" : alphaHex(design.banner.color, design.banner.opacity),
    border: design.banner.shape === "outline" || design.banner.borderWidth > 0 ? `${Math.max(1, design.banner.borderWidth || 2)}px solid ${design.banner.borderColor}` : "none",
    borderRadius: design.banner.shape === "pill" ? 999 : design.banner.shape === "rounded" || design.banner.shape === "glass" ? 14 : 2,
    clipPath: design.banner.shape === "ribbon" ? "polygon(0 0,92% 0,100% 50%,92% 100%,0 100%)" : undefined,
    boxShadow: design.banner.shadow ? "0 12px 30px rgba(0,0,0,.28)" : undefined,
    color: design.banner.textColor,
    fontFamily: bannerFont,
    fontSize: `clamp(8px, ${(design.banner.fontSize / 1280) * 100}vw, ${design.banner.fontSize}px)`,
    fontWeight: design.banner.fontWeight,
    textAlign: design.banner.textAlign,
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
  }), [design.banner, bannerFont]);
  const logoPreview = useMemo(() => ({
    ...previewAnchor(design.logo.position, design.logo.size, design.logo.size, design.logo.marginX, design.logo.marginY),
    position: "absolute" as const,
    objectFit: design.logo.shape === "original" ? "contain" as const : "cover" as const,
    borderRadius: design.logo.shape === "circle" ? "50%" : design.logo.shape === "rounded-square" ? "20%" : design.logo.shape === "square" ? 0 : "8%",
    opacity: design.logo.opacity / 100,
    zIndex: 4,
  }), [design.logo]);

  return <Card size="small" style={{ marginBottom: 16 }} loading={loadingDesigner}>
    <Alert showIcon type="info" style={{ marginBottom: 14 }} message="Advanced multilingual Guide Cover Designer" description="Platform logo, banners, iOS / Apple System typography, multilingual fallbacks, reusable presets and a shared platform default are available here." />
    <Row gutter={16} align="top">
      <Col xs={24} xl={13}>
        <Card size="small" title="Design presets" style={{ marginBottom: 12 }}>
          <Row gutter={10}>
            <Col xs={24} md={8}><Text strong>Template</Text><Select value={design.template} onChange={(value) => patch({ template: value })} options={TEMPLATE_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={24} md={8}><Text strong>Colour preset</Text><Select value={design.preset} onChange={(value) => applyPalette(value as GuideCoverPreset)} options={PRESET_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={24} md={8}><Text strong>Decorative strength</Text><Slider min={0} max={70} value={design.overlay} onChange={(overlay) => patch({ overlay })} /></Col>
          </Row>
          <Divider style={{ margin: "12px 0" }} />
          <Space wrap>
            <Select placeholder="Saved platform preset" value={selectedPreset || undefined} onChange={setSelectedPreset} options={presets.map((item) => ({ value: item.name, label: item.name }))} style={{ minWidth: 190 }} />
            <Button disabled={!selectedPreset} onClick={() => { const found = presets.find((item) => item.name === selectedPreset); if (found) setDesign(cloneDesign(found.design)); }}>Apply preset</Button>
            <Button danger disabled={!selectedPreset} icon={<DeleteOutlined />} loading={savingDesigner} onClick={() => void removePreset()}>Delete</Button>
            <Input placeholder="New preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} style={{ width: 190 }} />
            <Button icon={<SaveOutlined />} loading={savingDesigner} onClick={() => void savePreset()}>Save preset</Button>
          </Space>
          <Space wrap style={{ marginTop: 10 }}><Button type="primary" icon={<SaveOutlined />} loading={savingDesigner} onClick={() => void saveDefault()}>Save as platform default</Button><Button icon={<ReloadOutlined />} onClick={() => setDesign(cloneDesign(platformDefault))}>Reset to platform default</Button></Space>
        </Card>

        <Card size="small" title="Platform / cover logo" style={{ marginBottom: 12 }}>
          <Row gutter={10}>
            <Col xs={24} md={6}><Text strong>Show logo</Text><div><Switch checked={design.logo.enabled} onChange={(enabled) => patchLogo({ enabled })} /></div></Col>
            <Col xs={24} md={6}><Text strong>Logo source</Text><Select value={design.logo.source} onChange={(source) => patchLogo({ source })} options={[{ value: "platform", label: "Platform logo" }, { value: "custom", label: "Custom logo" }]} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={24} md={6}><Text strong>Logo shape</Text><Select value={design.logo.shape} onChange={(shape) => patchLogo({ shape })} options={[{ value: "original", label: "Original" }, { value: "square", label: "Square" }, { value: "rounded-square", label: "Rounded square" }, { value: "circle", label: "Circle" }]} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={24} md={6}><Text strong>Alignment / position</Text><Select value={design.logo.position} onChange={(position) => patchLogo({ position })} options={ANCHOR_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col>
          </Row>
          <Row gutter={10} style={{ marginTop: 12 }}>
            <Col xs={8}><Text strong>Size</Text><InputNumber min={36} max={260} value={design.logo.size} onChange={(value) => patchLogo({ size: Number(value || 36) })} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={8}><Text strong>Margin X</Text><InputNumber min={0} max={320} value={design.logo.marginX} onChange={(value) => patchLogo({ marginX: Number(value || 0) })} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={8}><Text strong>Margin Y</Text><InputNumber min={0} max={240} value={design.logo.marginY} onChange={(value) => patchLogo({ marginY: Number(value || 0) })} style={{ width: "100%", marginTop: 6 }} /></Col>
          </Row>
          <Row gutter={10} style={{ marginTop: 12 }}><Col xs={24} md={12}><Text strong>Opacity</Text><Slider min={10} max={100} value={design.logo.opacity} onChange={(opacity) => patchLogo({ opacity })} /></Col><Col xs={24} md={12}><Text strong>Upload logo</Text><div style={{ marginTop: 6 }}><Upload accept="image/*" showUploadList={false} beforeUpload={uploadLogo}><Button icon={<UploadOutlined />}>Upload custom logo</Button></Upload></div></Col></Row>
          {design.logo.source === "platform" && !platformLogoUrl && <Alert style={{ marginTop: 12 }} type="warning" showIcon message="No platform Guide logo is configured" description="Upload a custom logo here, or add the platform Guide logo in Platform Control Center / branding settings." />}
        </Card>

        <Card size="small" title="Banner" style={{ marginBottom: 12 }}>
          <Row gutter={10}>
            <Col xs={24} md={6}><Text strong>Add banner</Text><div><Switch checked={design.banner.enabled} onChange={(enabled) => patchBanner({ enabled })} /></div></Col>
            <Col xs={24} md={6}><Text strong>Shape</Text><Select value={design.banner.shape} onChange={(shape) => patchBanner({ shape })} options={["rectangle","rounded","pill","ribbon","glass","outline"].map((value) => ({ value, label: value }))} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={24} md={6}><Text strong>Position</Text><Select value={design.banner.position} onChange={(position) => patchBanner({ position })} options={ANCHOR_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={24} md={6}><Text strong>Banner contains text</Text><div><Switch checked={design.banner.textEnabled} onChange={(textEnabled) => patchBanner({ textEnabled })} /></div></Col>
          </Row>
          <Row gutter={10} style={{ marginTop: 12 }}>
            <Col xs={12} md={4}><Text strong>Width</Text><InputNumber min={120} max={1000} value={design.banner.width} onChange={(value) => patchBanner({ width: Number(value || 120) })} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={12} md={4}><Text strong>Height</Text><InputNumber min={32} max={220} value={design.banner.height} onChange={(value) => patchBanner({ height: Number(value || 32) })} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={12} md={4}><Text strong>Margin X</Text><InputNumber min={0} max={400} value={design.banner.marginX} onChange={(value) => patchBanner({ marginX: Number(value || 0) })} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={12} md={4}><Text strong>Margin Y</Text><InputNumber min={0} max={400} value={design.banner.marginY} onChange={(value) => patchBanner({ marginY: Number(value || 0) })} style={{ width: "100%", marginTop: 6 }} /></Col>
            <Col xs={12} md={4}><Text strong>Colour</Text>{colour(design.banner.color, (color) => patchBanner({ color }))}</Col>
            <Col xs={12} md={4}><Text strong>Opacity</Text><InputNumber min={0} max={100} value={design.banner.opacity} onChange={(value) => patchBanner({ opacity: Number(value || 0) })} style={{ width: "100%", marginTop: 6 }} /></Col>
          </Row>
          <Row gutter={10} style={{ marginTop: 12 }}><Col xs={24} md={12}><Text strong>Banner text</Text><Input value={bannerText} onChange={(event) => setBannerText(event.target.value)} style={{ marginTop: 6 }} /></Col><Col xs={12} md={4}><Text strong>Text colour</Text>{colour(design.banner.textColor, (textColor) => patchBanner({ textColor }))}</Col><Col xs={12} md={4}><Text strong>Border colour</Text>{colour(design.banner.borderColor, (borderColor) => patchBanner({ borderColor }))}</Col><Col xs={12} md={4}><Text strong>Border</Text><InputNumber min={0} max={12} value={design.banner.borderWidth} onChange={(value) => patchBanner({ borderWidth: Number(value || 0) })} style={{ width: "100%", marginTop: 6 }} /></Col></Row>
          <Row gutter={10} style={{ marginTop: 12 }}><Col xs={24} md={7}><Text strong>Banner font</Text><Select value={design.banner.font} onChange={(font) => patchBanner({ font })} options={FONT_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col><Col xs={12} md={4}><Text strong>Font size</Text><InputNumber min={12} max={72} value={design.banner.fontSize} onChange={(value) => patchBanner({ fontSize: Number(value || 12) })} style={{ width: "100%", marginTop: 6 }} /></Col><Col xs={12} md={4}><Text strong>Weight</Text><Select value={design.banner.fontWeight} onChange={(fontWeight) => patchBanner({ fontWeight })} options={WEIGHTS} style={{ width: "100%", marginTop: 6 }} /></Col><Col xs={24} md={5}><Text strong>Text alignment</Text><Select value={design.banner.textAlign} onChange={(textAlign) => patchBanner({ textAlign })} options={ALIGN_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col><Col xs={24} md={4}><Text strong>Shadow</Text><div><Switch checked={design.banner.shadow} onChange={(shadow) => patchBanner({ shadow })} /></div></Col></Row>
        </Card>

        <Card size="small" title="Typography & background">
          <Row gutter={10}><Col xs={8}><Text strong>Gradient start</Text>{colour(design.gradientStart, (gradientStart) => patch({ gradientStart }))}</Col><Col xs={8}><Text strong>Gradient end</Text>{colour(design.gradientEnd, (gradientEnd) => patch({ gradientEnd }))}</Col><Col xs={8}><Text strong>Accent</Text>{colour(design.accentColor, (accentColor) => patch({ accentColor }))}</Col></Row>
          <Divider style={{ margin: "14px 0" }}>Title</Divider>
          <Row gutter={10}><Col xs={24} md={7}><Input value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} placeholder="Cover title" /></Col><Col xs={24} md={5}><Select value={design.titleStyle.font} onChange={(font) => patchTitle({ font })} options={FONT_OPTIONS} style={{ width: "100%" }} /></Col><Col xs={8} md={4}><InputNumber min={30} max={120} value={design.titleStyle.fontSize} onChange={(value) => patchTitle({ fontSize: Number(value || 30) })} style={{ width: "100%" }} /></Col><Col xs={8} md={4}><Select value={design.titleStyle.fontWeight} onChange={(fontWeight) => patchTitle({ fontWeight })} options={WEIGHTS} style={{ width: "100%" }} /></Col><Col xs={8} md={4}>{colour(design.titleStyle.color, (color) => patchTitle({ color }))}</Col></Row>
          <Row gutter={10} style={{ marginTop: 10 }}><Col xs={12}><Text strong>Title alignment</Text><Select value={design.titleStyle.align} onChange={(align) => patchTitle({ align })} options={ALIGN_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col><Col xs={12}><Text strong>Text top position</Text><InputNumber min={120} max={560} value={design.textTop} onChange={(value) => patch({ textTop: Number(value || 120) })} style={{ width: "100%", marginTop: 6 }} /></Col></Row>
          <Divider style={{ margin: "14px 0" }}>Subtitle</Divider>
          <Row gutter={10}><Col xs={24} md={7}><Input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Subtitle" /></Col><Col xs={24} md={5}><Select value={design.subtitleStyle.font} onChange={(font) => patchSubtitle({ font })} options={FONT_OPTIONS} style={{ width: "100%" }} /></Col><Col xs={8} md={4}><InputNumber min={16} max={72} value={design.subtitleStyle.fontSize} onChange={(value) => patchSubtitle({ fontSize: Number(value || 16) })} style={{ width: "100%" }} /></Col><Col xs={8} md={4}><Select value={design.subtitleStyle.fontWeight} onChange={(fontWeight) => patchSubtitle({ fontWeight })} options={WEIGHTS} style={{ width: "100%" }} /></Col><Col xs={8} md={4}>{colour(design.subtitleStyle.color, (color) => patchSubtitle({ color }))}</Col></Row>
          <Row gutter={10} style={{ marginTop: 10 }}><Col xs={8}><Text strong>Subtitle alignment</Text><Select value={design.subtitleStyle.align} onChange={(align) => patchSubtitle({ align })} options={ALIGN_OPTIONS} style={{ width: "100%", marginTop: 6 }} /></Col><Col xs={8}><Text strong>Text max width</Text><InputNumber min={360} max={1100} value={design.maxTextWidth} onChange={(value) => patch({ maxTextWidth: Number(value || 360) })} style={{ width: "100%", marginTop: 6 }} /></Col><Col xs={8}><Text strong>Show locale</Text><div><Switch checked={design.showLocale} onChange={(showLocale) => patch({ showLocale })} /></div></Col></Row>
        </Card>
      </Col>

      <Col xs={24} xl={11}>
        <div style={{ position: "sticky", top: 12 }}>
          <Text strong>Live 16:9 preview</Text>
          <div style={{ position: "relative", overflow: "hidden", aspectRatio: "16 / 9", borderRadius: 16, marginTop: 8, background: `linear-gradient(135deg, ${design.gradientStart}, ${design.gradientEnd})`, boxShadow: "0 18px 50px rgba(0,0,0,.25)", direction: rtl ? "rtl" : "ltr" }}>
            <div style={{ position: "absolute", width: "36%", aspectRatio: "1", right: "-12%", top: "-18%", borderRadius: "50%", background: design.accentColor, opacity: design.overlay / 100 }} />
            <div style={{ position: "absolute", width: "44%", aspectRatio: "1", right: "-15%", bottom: "-34%", borderRadius: "50%", background: design.accentColor, opacity: design.overlay / 100 }} />
            {design.logo.enabled && logoUrl && <img src={logoUrl} alt="Cover logo preview" style={logoPreview} />}
            {design.banner.enabled && <div style={bannerPreview}>{design.banner.textEnabled ? bannerText : ""}</div>}
            <div style={{ position: "absolute", top: `${design.textTop / 7.2}%`, left: design.titleStyle.align === "center" ? "50%" : design.titleStyle.align === "right" ? "auto" : "7%", right: design.titleStyle.align === "right" ? "7%" : "auto", transform: design.titleStyle.align === "center" ? "translateX(-50%)" : undefined, width: `${Math.min(86, design.maxTextWidth / 12.8)}%`, textAlign: design.titleStyle.align, zIndex: 3 }}>
              <div style={{ color: design.titleStyle.color, fontFamily: titleFont, fontWeight: design.titleStyle.fontWeight, fontSize: `clamp(18px, ${design.titleStyle.fontSize / 16}px, ${design.titleStyle.fontSize}px)`, lineHeight: 1.12 }}>{coverTitle || "Guide cover title"}</div>
              {subtitle && <div style={{ color: design.subtitleStyle.color, fontFamily: subtitleFont, fontWeight: design.subtitleStyle.fontWeight, fontSize: `clamp(10px, ${design.subtitleStyle.fontSize / 16}px, ${design.subtitleStyle.fontSize}px)`, lineHeight: 1.35, marginTop: "3%", textAlign: design.subtitleStyle.align }}>{subtitle}</div>}
            </div>
            {design.showLocale && <div style={{ position: "absolute", left: "7%", bottom: "5%", color: design.subtitleStyle.color, fontFamily: resolveFont("ios", locale), fontWeight: 700, fontSize: 12 }}>{locale.toUpperCase()}</div>}
          </div>
          <div style={{ color: "#8ea0bd", fontSize: 12, marginTop: 8 }}>Preview is responsive. Export is always 1280 × 720 (16:9). Long localized titles are automatically resized and wrapped during export.</div>
          {currentCoverUrl && <div style={{ marginTop: 8, color: "#8ea0bd", fontSize: 12 }}>This locale already has a cover. It changes only after you generate a new cover and click <b>Save locale</b>.</div>}
          <Space wrap style={{ marginTop: 14 }}><Button type="primary" icon={<PictureOutlined />} loading={generating} disabled={!canUpload} onClick={() => void generate()}>Generate & use cover</Button><Button icon={<ReloadOutlined />} onClick={() => setDesign(cloneDesign(platformDefault))}>Reset design</Button></Space>
          <div style={{ marginTop: 10 }}><Tag color="blue">1280 × 720</Tag><Tag color="purple">16:9</Tag><Tag color="green">{locale}</Tag><Tag color="gold">iOS font ready</Tag></div>
        </div>
      </Col>
    </Row>
  </Card>;
}

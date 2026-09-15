import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Drawer,
  Input,
  InputNumber,
  Row,
  Select,
  Slider,
  Space,
  Switch,
  Typography,
  Upload,
  message,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  PictureOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  UnlockOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";

const { Text } = Typography;

export type GuideCoverTemplate =
  | "professional"
  | "screenshot-focus"
  | "security-notice"
  | "minimal"
  | "app-tutorial"
  | "split-panel"
  | "glass-card"
  | "bold-promo"
  | "step-guide"
  | "centered-modern";

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
type LayerKind = "screenshot" | "custom-icon" | "builtin-icon";

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

type CanvasLayer = {
  id: string;
  kind: LayerKind;
  name: string;
  url: string;
  iconKey: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  radius: number;
  shadow: boolean;
  visible: boolean;
  locked: boolean;
  zIndex: number;
};

type SavedPreset = { name: string; design: CoverDesign };
type Palette = { start: string; end: string; accent: string; text: string; muted: string };
type Workspace = { design: CoverDesign; layers: CanvasLayer[]; coverTitle: string; subtitle: string; bannerText: string };
type TemplateRecipe = {
  textTop: number;
  maxTextWidth: number;
  logo: Partial<CoverDesign["logo"]>;
  banner: Partial<CoverDesign["banner"]>;
  titleStyle: Partial<CoverDesign["titleStyle"]>;
  subtitleStyle: Partial<CoverDesign["subtitleStyle"]>;
  screenshot: { x: number; y: number; width: number; height: number; radius: number; rotation?: number };
};

const DEFAULT_DESIGN_KEY = "guide.cover.default_design.v2";
const PRESETS_KEY = "guide.cover.design_presets.v2";
const WORKSPACE_PREFIX = "guide.cover.workspace.v2";

const PALETTES: Record<GuideCoverPreset, Palette> = {
  "brand-dark": { start: "#071426", end: "#16294a", accent: "#62a8ff", text: "#ffffff", muted: "#d8e6f7" },
  "blue-professional": { start: "#06295a", end: "#0d68d8", accent: "#67c8ff", text: "#ffffff", muted: "#ddecff" },
  "purple-premium": { start: "#241141", end: "#6a2bbf", accent: "#d693ff", text: "#ffffff", muted: "#eee0ff" },
  "green-success": { start: "#093d34", end: "#0d8a69", accent: "#7ff0ca", text: "#ffffff", muted: "#d8fff3" },
  "orange-warning": { start: "#54220b", end: "#c46215", accent: "#ffd486", text: "#ffffff", muted: "#fff0d6" },
  "red-alert": { start: "#4b1018", end: "#b3263d", accent: "#ff9dac", text: "#ffffff", muted: "#ffe0e5" },
  "neutral-dark": { start: "#111827", end: "#303744", accent: "#b9c3d4", text: "#ffffff", muted: "#d8dee8" },
};

const TEMPLATE_OPTIONS: { value: GuideCoverTemplate; label: string }[] = [
  { value: "professional", label: "Professional · recommended" },
  { value: "screenshot-focus", label: "Screenshot Focus" },
  { value: "security-notice", label: "Security Notice" },
  { value: "minimal", label: "Minimal" },
  { value: "app-tutorial", label: "App Tutorial" },
  { value: "split-panel", label: "Split Panel" },
  { value: "glass-card", label: "Glass Card" },
  { value: "bold-promo", label: "Bold Promo" },
  { value: "step-guide", label: "Step Guide" },
  { value: "centered-modern", label: "Centered Modern" },
];

const TEMPLATE_RECIPES: Record<GuideCoverTemplate, TemplateRecipe> = {
  professional: {
    textTop: 250, maxTextWidth: 620,
    logo: { position: "top-left", size: 92, marginX: 48, marginY: 38 },
    banner: { enabled: true, shape: "pill", position: "top-left", width: 290, height: 54, marginX: 48, marginY: 150, textAlign: "center" },
    titleStyle: { fontSize: 68, fontWeight: 800, align: "left" },
    subtitleStyle: { fontSize: 30, fontWeight: 500, align: "left" },
    screenshot: { x: 760, y: 115, width: 420, height: 500, radius: 28 },
  },
  "screenshot-focus": {
    textTop: 220, maxTextWidth: 500,
    logo: { position: "top-left", size: 84, marginX: 42, marginY: 34 },
    banner: { enabled: true, shape: "outline", position: "top-left", width: 250, height: 48, marginX: 42, marginY: 135, textAlign: "center", opacity: 100, borderWidth: 2 },
    titleStyle: { fontSize: 62, fontWeight: 800, align: "left" },
    subtitleStyle: { fontSize: 26, fontWeight: 500, align: "left" },
    screenshot: { x: 720, y: 70, width: 500, height: 580, radius: 34 },
  },
  "security-notice": {
    textTop: 240, maxTextWidth: 600,
    logo: { position: "top-left", size: 88, marginX: 52, marginY: 40 },
    banner: { enabled: true, shape: "ribbon", position: "top-left", width: 340, height: 58, marginX: 52, marginY: 150, textAlign: "center", opacity: 28 },
    titleStyle: { fontSize: 66, fontWeight: 900, align: "left" },
    subtitleStyle: { fontSize: 27, fontWeight: 600, align: "left" },
    screenshot: { x: 800, y: 130, width: 360, height: 470, radius: 24, rotation: 2 },
  },
  minimal: {
    textTop: 255, maxTextWidth: 820,
    logo: { position: "top-left", size: 72, marginX: 64, marginY: 52 },
    banner: { enabled: false },
    titleStyle: { fontSize: 64, fontWeight: 700, align: "left" },
    subtitleStyle: { fontSize: 27, fontWeight: 400, align: "left" },
    screenshot: { x: 830, y: 155, width: 310, height: 400, radius: 22 },
  },
  "app-tutorial": {
    textTop: 230, maxTextWidth: 520,
    logo: { position: "top-left", size: 82, marginX: 46, marginY: 38 },
    banner: { enabled: true, shape: "glass", position: "top-left", width: 280, height: 50, marginX: 46, marginY: 142, textAlign: "center", opacity: 20 },
    titleStyle: { fontSize: 62, fontWeight: 800, align: "left" },
    subtitleStyle: { fontSize: 26, fontWeight: 500, align: "left" },
    screenshot: { x: 830, y: 70, width: 300, height: 580, radius: 48 },
  },
  "split-panel": {
    textTop: 235, maxTextWidth: 510,
    logo: { position: "top-left", size: 84, marginX: 50, marginY: 38 },
    banner: { enabled: true, shape: "rounded", position: "top-left", width: 270, height: 50, marginX: 50, marginY: 145, textAlign: "center", opacity: 20 },
    titleStyle: { fontSize: 64, fontWeight: 850, align: "left" },
    subtitleStyle: { fontSize: 26, fontWeight: 500, align: "left" },
    screenshot: { x: 700, y: 95, width: 500, height: 530, radius: 24 },
  },
  "glass-card": {
    textTop: 255, maxTextWidth: 650,
    logo: { position: "top-center", size: 80, marginX: 0, marginY: 38 },
    banner: { enabled: true, shape: "glass", position: "top-center", width: 310, height: 52, marginX: 0, marginY: 145, textAlign: "center", opacity: 18 },
    titleStyle: { fontSize: 62, fontWeight: 800, align: "center" },
    subtitleStyle: { fontSize: 25, fontWeight: 500, align: "center" },
    screenshot: { x: 850, y: 145, width: 300, height: 410, radius: 28 },
  },
  "bold-promo": {
    textTop: 225, maxTextWidth: 700,
    logo: { position: "top-left", size: 96, marginX: 52, marginY: 36 },
    banner: { enabled: true, shape: "ribbon", position: "top-right", width: 320, height: 58, marginX: 48, marginY: 48, textAlign: "center", opacity: 32 },
    titleStyle: { fontSize: 78, fontWeight: 900, align: "left" },
    subtitleStyle: { fontSize: 29, fontWeight: 600, align: "left" },
    screenshot: { x: 835, y: 170, width: 310, height: 405, radius: 26, rotation: -4 },
  },
  "step-guide": {
    textTop: 245, maxTextWidth: 560,
    logo: { position: "top-left", size: 82, marginX: 48, marginY: 38 },
    banner: { enabled: true, shape: "pill", position: "top-left", width: 250, height: 48, marginX: 48, marginY: 142, textAlign: "center", opacity: 18 },
    titleStyle: { fontSize: 62, fontWeight: 800, align: "left" },
    subtitleStyle: { fontSize: 26, fontWeight: 500, align: "left" },
    screenshot: { x: 780, y: 125, width: 390, height: 480, radius: 30 },
  },
  "centered-modern": {
    textTop: 260, maxTextWidth: 850,
    logo: { position: "top-center", size: 88, marginX: 0, marginY: 38 },
    banner: { enabled: true, shape: "outline", position: "top-center", width: 290, height: 50, marginX: 0, marginY: 150, textAlign: "center", opacity: 100, borderWidth: 2 },
    titleStyle: { fontSize: 68, fontWeight: 800, align: "center" },
    subtitleStyle: { fontSize: 27, fontWeight: 500, align: "center" },
    screenshot: { x: 860, y: 160, width: 280, height: 380, radius: 28 },
  },
};

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

const BUILTIN_ICONS = [
  { key: "shield", label: "Security shield", keywords: "security safe protect" },
  { key: "warning", label: "Warning", keywords: "warning alert danger" },
  { key: "check", label: "Check", keywords: "check success verified" },
  { key: "wallet", label: "Wallet", keywords: "wallet withdrawal deposit money" },
  { key: "card", label: "Payment card", keywords: "payment card bank" },
  { key: "bank", label: "Bank", keywords: "bank account finance" },
  { key: "phone", label: "Mobile phone", keywords: "phone mobile app" },
  { key: "support", label: "Support", keywords: "support customer service headset" },
  { key: "lock", label: "Lock", keywords: "lock password security" },
  { key: "arrow", label: "Arrow", keywords: "arrow next direction" },
  { key: "info", label: "Information", keywords: "information info guide" },
  { key: "star", label: "Star", keywords: "star premium feature" },
  { key: "download", label: "Download", keywords: "download install app arrow" },
  { key: "upload", label: "Upload", keywords: "upload submit file document" },
  { key: "gift", label: "Gift", keywords: "gift reward promotion bonus" },
  { key: "clock", label: "Clock", keywords: "clock time pending wait" },
];

const cloneDesign = (value: CoverDesign): CoverDesign => JSON.parse(JSON.stringify(value));
const cloneLayers = (value: CanvasLayer[]): CanvasLayer[] => JSON.parse(JSON.stringify(value));
const uid = () => `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function mergeDesign(raw: any): CoverDesign {
  const base = cloneDesign(DEFAULT_DESIGN);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    template: TEMPLATE_OPTIONS.some((item) => item.value === raw.template) ? raw.template : base.template,
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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
    const image = new Image();
    if (/^https?:/i.test(url)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = url;
  });
}
function drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sx = 0; let sy = 0; let sw = image.naturalWidth; let sh = image.naturalHeight;
  if (sourceRatio > targetRatio) { sw = image.naturalHeight * targetRatio; sx = (image.naturalWidth - sw) / 2; }
  else { sh = image.naturalWidth / targetRatio; sy = (image.naturalHeight - sh) / 2; }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}
function drawLogo(ctx: CanvasRenderingContext2D, image: HTMLImageElement, logo: CoverDesign["logo"]) {
  const size = Math.max(36, logo.size);
  let width = size; let height = size;
  if (logo.shape === "original" && image.naturalWidth && image.naturalHeight) {
    const ratio = image.naturalWidth / image.naturalHeight;
    if (ratio >= 1) height = size / ratio; else width = size * ratio;
  }
  const rect = anchorRect(logo.position, width, height, logo.marginX, logo.marginY);
  ctx.save();
  ctx.globalAlpha = logo.opacity / 100;
  if (logo.shape === "circle") { ctx.beginPath(); ctx.arc(rect.x + width / 2, rect.y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2); ctx.clip(); }
  else if (logo.shape === "rounded-square") { roundedRect(ctx, rect.x, rect.y, width, height, size * 0.2); ctx.clip(); }
  else if (logo.shape === "square") { roundedRect(ctx, rect.x, rect.y, width, height, 0); ctx.clip(); }
  if (logo.shape === "original") ctx.drawImage(image, rect.x, rect.y, width, height);
  else drawImageCover(ctx, image, rect.x, rect.y, width, height);
  ctx.restore();
}
function drawBanner(ctx: CanvasRenderingContext2D, banner: CoverDesign["banner"], text: string, family: string) {
  const rect = anchorRect(banner.position, banner.width, banner.height, banner.marginX, banner.marginY);
  ctx.save();
  if (banner.shadow) { ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; }
  ctx.globalAlpha = banner.opacity / 100;
  ctx.fillStyle = banner.color;
  ctx.strokeStyle = banner.borderColor;
  ctx.lineWidth = banner.borderWidth;
  if (banner.shape === "ribbon") {
    ctx.beginPath(); ctx.moveTo(rect.x, rect.y); ctx.lineTo(rect.x + rect.width - 24, rect.y); ctx.lineTo(rect.x + rect.width, rect.y + rect.height / 2); ctx.lineTo(rect.x + rect.width - 24, rect.y + rect.height); ctx.lineTo(rect.x, rect.y + rect.height); ctx.closePath();
  } else {
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, banner.shape === "pill" ? rect.height / 2 : (banner.shape === "rounded" || banner.shape === "glass") ? Math.min(20, rect.height / 2) : 2);
  }
  if (banner.shape === "outline") { ctx.globalAlpha = 1; ctx.lineWidth = Math.max(2, banner.borderWidth || 2); ctx.stroke(); }
  else { ctx.fill(); if (banner.borderWidth > 0) { ctx.globalAlpha = 1; ctx.stroke(); } }
  ctx.restore();
  if (banner.textEnabled && text.trim()) {
    ctx.save();
    ctx.font = `${banner.fontWeight} ${banner.fontSize}px ${family}`;
    ctx.fillStyle = banner.textColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = banner.textAlign;
    const tx = banner.textAlign === "left" ? rect.x + 22 : banner.textAlign === "right" ? rect.x + rect.width - 22 : rect.x + rect.width / 2;
    ctx.fillText(text.trim(), tx, rect.y + rect.height / 2, rect.width - 36);
    ctx.restore();
  }
}
function svgData(body: string) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`; }
function builtinIconSrc(key: string, color: string) {
  const c = color || "#ffffff";
  const common = `viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  const map: Record<string, string> = {
    shield: `<svg ${common}><path d="M32 5l22 8v16c0 15-9 24-22 30C19 53 10 44 10 29V13l22-8z"/><path d="M22 32l7 7 14-16"/></svg>`,
    warning: `<svg ${common}><path d="M32 7L59 55H5L32 7z"/><path d="M32 23v14"/><path d="M32 47h.01"/></svg>`,
    check: `<svg ${common}><circle cx="32" cy="32" r="25"/><path d="M19 33l9 9 18-21"/></svg>`,
    wallet: `<svg ${common}><rect x="7" y="16" width="50" height="35" rx="8"/><path d="M10 22l34-11"/><path d="M43 30h14v13H43a6 6 0 010-13z"/></svg>`,
    card: `<svg ${common}><rect x="6" y="13" width="52" height="38" rx="7"/><path d="M6 25h52"/><path d="M14 42h14"/></svg>`,
    bank: `<svg ${common}><path d="M6 25L32 8l26 17"/><path d="M10 27h44"/><path d="M14 27v24M26 27v24M38 27v24M50 27v24"/><path d="M8 53h48"/></svg>`,
    phone: `<svg ${common}><rect x="18" y="5" width="28" height="54" rx="6"/><path d="M27 12h10"/><path d="M31 51h2"/></svg>`,
    support: `<svg ${common}><path d="M12 35v-5a20 20 0 0140 0v5"/><rect x="7" y="33" width="10" height="17" rx="4"/><rect x="47" y="33" width="10" height="17" rx="4"/><path d="M48 50c-3 6-8 8-16 8"/></svg>`,
    lock: `<svg ${common}><rect x="11" y="27" width="42" height="31" rx="7"/><path d="M20 27V18a12 12 0 0124 0v9"/><path d="M32 39v8"/></svg>`,
    arrow: `<svg ${common}><path d="M8 32h45"/><path d="M39 18l14 14-14 14"/></svg>`,
    info: `<svg ${common}><circle cx="32" cy="32" r="25"/><path d="M32 28v18"/><path d="M32 18h.01"/></svg>`,
    star: `<svg ${common}><path d="M32 7l8 16 18 3-13 13 3 18-16-9-16 9 3-18L6 26l18-3 8-16z"/></svg>`,
    download: `<svg ${common}><path d="M32 8v34"/><path d="M19 30l13 13 13-13"/><path d="M9 53h46"/></svg>`,
    upload: `<svg ${common}><path d="M32 56V22"/><path d="M19 34l13-13 13 13"/><path d="M9 11h46"/></svg>`,
    gift: `<svg ${common}><rect x="7" y="25" width="50" height="31" rx="4"/><path d="M32 25v31M5 25h54v-10H5v10z"/><path d="M32 15c-5-12-18-8-14 0h14zm0 0c5-12 18-8 14 0H32z"/></svg>`,
    clock: `<svg ${common}><circle cx="32" cy="32" r="25"/><path d="M32 17v17l11 7"/></svg>`,
  };
  return svgData(map[key] || map.info);
}
function layerSource(layer: CanvasLayer) { return layer.kind === "builtin-icon" ? builtinIconSrc(layer.iconKey, layer.color) : layer.url; }
function safeSlug(value: string) { return String(value || "guide").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "guide"; }
function workspaceKey(locale: string, title: string) { return `${WORKSPACE_PREFIX}.${safeSlug(locale)}.${safeSlug(title)}`; }
function canvasBlob(canvas: HTMLCanvasElement) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render cover image")), "image/png", 0.94)); }

function drawTemplateDecorations(ctx: CanvasRenderingContext2D, design: CoverDesign, rtl: boolean) {
  const accent = design.accentColor;
  const alpha = Math.max(0, Math.min(0.7, design.overlay / 100));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  switch (design.template) {
    case "screenshot-focus":
      ctx.globalAlpha = Math.max(0.08, alpha * 0.7);
      roundedRect(ctx, rtl ? 55 : 690, 42, 545, 636, 44); ctx.fill();
      ctx.globalAlpha = Math.max(0.18, alpha); roundedRect(ctx, rtl ? 78 : 713, 66, 499, 588, 34); ctx.stroke();
      break;
    case "security-notice":
      ctx.globalAlpha = Math.max(0.08, alpha * 0.55);
      roundedRect(ctx, rtl ? 65 : 735, 82, 470, 550, 50); ctx.fill();
      ctx.globalAlpha = Math.max(0.14, alpha * 0.75);
      for (let x = -120; x < 1500; x += 110) { ctx.save(); ctx.translate(x, 0); ctx.rotate(-0.55); ctx.fillRect(0, 650, 46, 220); ctx.restore(); }
      break;
    case "minimal":
      ctx.globalAlpha = Math.max(0.18, alpha);
      ctx.fillRect(rtl ? 965 : 75, 640, 240, 6);
      break;
    case "app-tutorial":
      ctx.globalAlpha = Math.max(0.08, alpha * 0.65);
      roundedRect(ctx, rtl ? 80 : 805, 45, 365, 635, 58); ctx.fill();
      ctx.globalAlpha = Math.max(0.16, alpha); roundedRect(ctx, rtl ? 102 : 827, 68, 321, 588, 45); ctx.stroke();
      break;
    case "split-panel":
      ctx.globalAlpha = Math.max(0.1, alpha * 0.8);
      ctx.fillRect(rtl ? 0 : 690, 0, 590, 720);
      ctx.globalAlpha = Math.max(0.22, alpha); ctx.fillRect(rtl ? 585 : 685, 0, 6, 720);
      break;
    case "glass-card":
      ctx.globalAlpha = Math.max(0.1, alpha * 0.55);
      roundedRect(ctx, 105, 105, 1070, 510, 52); ctx.fill();
      ctx.globalAlpha = Math.max(0.15, alpha); roundedRect(ctx, 125, 125, 1030, 470, 44); ctx.stroke();
      break;
    case "bold-promo":
      ctx.globalAlpha = Math.max(0.13, alpha);
      ctx.save(); ctx.translate(880, -70); ctx.rotate(0.28); ctx.fillRect(0, 0, 380, 900); ctx.restore();
      ctx.globalAlpha = Math.max(0.2, alpha); ctx.beginPath(); ctx.arc(rtl ? 130 : 1160, 620, 225, 0, Math.PI * 2); ctx.fill();
      break;
    case "step-guide":
      ctx.globalAlpha = Math.max(0.16, alpha);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(rtl ? 1125 - i * 92 : 840 + i * 92, 620, 27 - i * 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = Math.max(0.12, alpha); ctx.fillRect(rtl ? 725 : 830, 617, 360, 6);
      break;
    case "centered-modern":
      ctx.globalAlpha = Math.max(0.08, alpha * 0.6);
      for (const radius of [150, 230, 315]) { ctx.beginPath(); ctx.arc(640, 360, radius, 0, Math.PI * 2); ctx.stroke(); }
      break;
    default:
      ctx.beginPath(); ctx.arc(rtl ? 165 : 1120, 105, 240, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rtl ? 110 : 1170, 630, 280, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function TemplatePreviewDecorations({ design, rtl }: { design: CoverDesign; rtl: boolean }) {
  const accent = design.accentColor;
  const opacity = design.overlay / 100;
  const common = { position: "absolute" as const, pointerEvents: "none" as const };
  if (design.template === "screenshot-focus") return <><div style={{ ...common, left: rtl ? "4%" : "54%", top: "6%", width: "42%", height: "88%", borderRadius: 28, background: accent, opacity: Math.max(.08, opacity * .7) }} /><div style={{ ...common, left: rtl ? "6%" : "56%", top: "9%", width: "38%", height: "82%", borderRadius: 22, border: `2px solid ${accent}`, opacity: Math.max(.18, opacity) }} /></>;
  if (design.template === "security-notice") return <><div style={{ ...common, left: rtl ? "5%" : "58%", top: "11%", width: "37%", height: "76%", borderRadius: 30, background: accent, opacity: Math.max(.08, opacity * .55) }} /><div style={{ ...common, right: "-8%", bottom: "-18%", width: "52%", height: "32%", transform: "rotate(-18deg)", background: accent, opacity: Math.max(.12, opacity * .7) }} /></>;
  if (design.template === "minimal") return <div style={{ ...common, left: rtl ? "75%" : "6%", bottom: "10%", width: "19%", height: 4, borderRadius: 4, background: accent, opacity: Math.max(.2, opacity) }} />;
  if (design.template === "app-tutorial") return <><div style={{ ...common, left: rtl ? "6%" : "64%", top: "5%", width: "29%", height: "90%", borderRadius: 38, background: accent, opacity: Math.max(.08, opacity * .65) }} /><div style={{ ...common, left: rtl ? "8%" : "66%", top: "9%", width: "25%", height: "82%", borderRadius: 30, border: `2px solid ${accent}`, opacity: Math.max(.17, opacity) }} /></>;
  if (design.template === "split-panel") return <><div style={{ ...common, left: rtl ? 0 : "54%", right: rtl ? "54%" : 0, top: 0, bottom: 0, background: accent, opacity: Math.max(.1, opacity * .8) }} /><div style={{ ...common, left: "53.5%", top: 0, bottom: 0, width: 3, background: accent, opacity: Math.max(.22, opacity) }} /></>;
  if (design.template === "glass-card") return <><div style={{ ...common, left: "8%", right: "8%", top: "14%", bottom: "14%", borderRadius: 34, background: accent, opacity: Math.max(.1, opacity * .55) }} /><div style={{ ...common, left: "10%", right: "10%", top: "17%", bottom: "17%", borderRadius: 28, border: `2px solid ${accent}`, opacity: Math.max(.15, opacity) }} /></>;
  if (design.template === "bold-promo") return <><div style={{ ...common, right: "-8%", top: "-14%", width: "34%", height: "130%", transform: "rotate(16deg)", background: accent, opacity: Math.max(.13, opacity) }} /><div style={{ ...common, right: "-9%", bottom: "-30%", width: "36%", aspectRatio: "1", borderRadius: "50%", background: accent, opacity: Math.max(.2, opacity) }} /></>;
  if (design.template === "step-guide") return <><div style={{ ...common, right: rtl ? undefined : "8%", left: rtl ? "8%" : undefined, bottom: "10%", width: "29%", height: 4, background: accent, opacity: Math.max(.14, opacity) }} />{[0,1,2,3].map((i) => <div key={i} style={{ ...common, right: rtl ? undefined : `${8 + i * 7}%`, left: rtl ? `${8 + i * 7}%` : undefined, bottom: `${8 - i * .1}%`, width: 20 - i, height: 20 - i, borderRadius: "50%", background: accent, opacity: Math.max(.18, opacity) }} />)}</>;
  if (design.template === "centered-modern") return <>{[24,38,52].map((size) => <div key={size} style={{ ...common, left: `${50 - size/2}%`, top: `${50 - size/2}%`, width: `${size}%`, aspectRatio: "1", borderRadius: "50%", border: `2px solid ${accent}`, opacity: Math.max(.08, opacity * .6) }} />)}</>;
  return <><div style={{ ...common, width: "36%", aspectRatio: "1", right: rtl ? undefined : "-12%", left: rtl ? "-12%" : undefined, top: "-18%", borderRadius: "50%", background: accent, opacity }} /><div style={{ ...common, width: "44%", aspectRatio: "1", right: rtl ? undefined : "-15%", left: rtl ? "-15%" : undefined, bottom: "-34%", borderRadius: "50%", background: accent, opacity }} /></>;
}

export default function GuideCoverStudioV3({ locale, direction, title, summary = "", category = "", currentCoverUrl = "", canUpload = false, onGenerated }: Props) {
  const [design, setDesign] = useState<CoverDesign>(() => cloneDesign(DEFAULT_DESIGN));
  const [platformDefault, setPlatformDefault] = useState<CoverDesign>(() => cloneDesign(DEFAULT_DESIGN));
  const [platformLogoUrl, setPlatformLogoUrl] = useState("");
  const [coverTitle, setCoverTitle] = useState(title || "");
  const [subtitle, setSubtitle] = useState(summary || "");
  const [bannerText, setBannerText] = useState(category || "Guide");
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [iconDrawerOpen, setIconDrawerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [loadingDesigner, setLoadingDesigner] = useState(true);
  const [savingDesigner, setSavingDesigner] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [snapGuide, setSnapGuide] = useState({ x: false, y: false });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<any>(null);

  useEffect(() => { setCoverTitle(title || ""); }, [locale, title]);
  useEffect(() => { setSubtitle(summary || ""); }, [locale, summary]);
  useEffect(() => { setBannerText(category || "Guide"); }, [locale, category]);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoadingDesigner(true);
      try {
        const [settingsResult, contentResult] = await Promise.allSettled([api.getSettings(), api.list("site-content")]);
        if (!live) return;
        const settings: any = settingsResult.status === "fulfilled" ? settingsResult.value : {};
        const rows: any[] = contentResult.status === "fulfilled" && Array.isArray(contentResult.value) ? contentResult.value : [];
        setPlatformLogoUrl(String(settings?.guide_logo_url || settings?.logo_url || "").trim());
        const map = Object.fromEntries(rows.map((row: any) => [String(row.key || row.block_key || ""), String(row.value || "")]));
        let next = cloneDesign(DEFAULT_DESIGN);
        try { if (map[DEFAULT_DESIGN_KEY]) next = mergeDesign(JSON.parse(map[DEFAULT_DESIGN_KEY])); } catch (_) { /* defaults */ }
        let savedPresets: SavedPreset[] = [];
        try {
          const parsed = map[PRESETS_KEY] ? JSON.parse(map[PRESETS_KEY]) : [];
          if (Array.isArray(parsed)) savedPresets = parsed.filter((item) => item?.name && item?.design).map((item) => ({ name: String(item.name), design: mergeDesign(item.design) }));
        } catch (_) { /* empty */ }
        setPlatformDefault(next);
        setDesign(next);
        setPresets(savedPresets);
      } finally { if (live) setLoadingDesigner(false); }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (event.clientX - drag.startClientX) * drag.scaleX;
      const dy = (event.clientY - drag.startClientY) * drag.scaleY;
      setLayers((current) => current.map((layer) => {
        if (layer.id !== drag.id) return layer;
        if (drag.mode === "resize") {
          return { ...layer, width: Math.max(48, Math.min(1280 - layer.x, drag.start.width + dx)), height: Math.max(48, Math.min(720 - layer.y, drag.start.height + dy)) };
        }
        let x = Math.max(0, Math.min(1280 - layer.width, drag.start.x + dx));
        let y = Math.max(0, Math.min(720 - layer.height, drag.start.y + dy));
        let snapX = false; let snapY = false;
        if (Math.abs(x + layer.width / 2 - 640) <= 12) { x = 640 - layer.width / 2; snapX = true; }
        if (Math.abs(y + layer.height / 2 - 360) <= 12) { y = 360 - layer.height / 2; snapY = true; }
        setSnapGuide({ x: snapX, y: snapY });
        return { ...layer, x, y };
      }));
    };
    const onUp = () => { dragRef.current = null; setSnapGuide({ x: false, y: false }); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!selectedLayerId || target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Delete" || event.key === "Backspace") {
        setLayers((current) => current.filter((layer) => layer.id !== selectedLayerId));
        setSelectedLayerId("");
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      setLayers((current) => current.map((layer) => {
        if (layer.id !== selectedLayerId || layer.locked) return layer;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        return { ...layer, x: Math.max(0, Math.min(1280 - layer.width, layer.x + dx)), y: Math.max(0, Math.min(720 - layer.height, layer.y + dy)) };
      }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedLayerId]);

  const rtl = isRtlLocale(locale, direction);
  const effectiveLogoUrl = design.logo.source === "platform" ? platformLogoUrl : design.logo.customUrl;
  const titleFamily = resolveFont(design.titleStyle.font, locale);
  const subtitleFamily = resolveFont(design.subtitleStyle.font, locale);
  const bannerFamily = resolveFont(design.banner.font, locale);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || null;
  const filteredIcons = useMemo(() => {
    const needle = iconSearch.trim().toLowerCase();
    return BUILTIN_ICONS.filter((item) => !needle || `${item.label} ${item.keywords}`.toLowerCase().includes(needle));
  }, [iconSearch]);

  const patchDesign = (patch: Partial<CoverDesign>) => setDesign((current) => ({ ...current, ...patch }));
  const patchLogo = (patch: Partial<CoverDesign["logo"]>) => setDesign((current) => ({ ...current, logo: { ...current.logo, ...patch } }));
  const patchBanner = (patch: Partial<CoverDesign["banner"]>) => setDesign((current) => ({ ...current, banner: { ...current.banner, ...patch } }));
  const patchTitleStyle = (patch: Partial<CoverDesign["titleStyle"]>) => setDesign((current) => ({ ...current, titleStyle: { ...current.titleStyle, ...patch } }));
  const patchSubtitleStyle = (patch: Partial<CoverDesign["subtitleStyle"]>) => setDesign((current) => ({ ...current, subtitleStyle: { ...current.subtitleStyle, ...patch } }));
  const patchLayer = (id: string, patch: Partial<CanvasLayer>) => setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));

  const applyPalette = (value: GuideCoverPreset) => {
    const next = PALETTES[value];
    setDesign((current) => ({ ...current, preset: value, gradientStart: next.start, gradientEnd: next.end, accentColor: next.accent, titleStyle: { ...current.titleStyle, color: next.text }, subtitleStyle: { ...current.subtitleStyle, color: next.muted } }));
  };

  const applyTemplate = (value: GuideCoverTemplate) => {
    const recipe = TEMPLATE_RECIPES[value];
    setDesign((current) => ({
      ...current,
      template: value,
      textTop: recipe.textTop,
      maxTextWidth: recipe.maxTextWidth,
      logo: { ...current.logo, ...recipe.logo },
      banner: { ...current.banner, ...recipe.banner },
      titleStyle: { ...current.titleStyle, ...recipe.titleStyle },
      subtitleStyle: { ...current.subtitleStyle, ...recipe.subtitleStyle },
    }));
    setLayers((current) => {
      const screenshots = current.filter((layer) => layer.kind === "screenshot");
      if (!screenshots.length) return current;
      let applied = false;
      return current.map((layer) => {
        if (applied || layer.kind !== "screenshot" || layer.locked) return layer;
        applied = true;
        return { ...layer, ...recipe.screenshot, rotation: recipe.screenshot.rotation ?? 0 };
      });
    });
    message.success(`${TEMPLATE_OPTIONS.find((item) => item.value === value)?.label || value} layout applied`);
  };

  const writeSiteContent = async (key: string, label: string, value: string, sortOrder: number) => api.update("site-content", key, { key, block_key: key, label, value, input_type: "text", sort_order: sortOrder });

  const uploadLogo = async (file: File) => {
    try {
      if (!canUpload) throw new Error("Guide upload permission is required to upload a cover logo");
      if (!file.type.startsWith("image/")) throw new Error("Logo must be an image file");
      const uploaded: any = await api.uploadGuide(file);
      if (!uploaded?.url) throw new Error("Logo upload did not return a URL");
      patchLogo({ source: "custom", customUrl: uploaded.url, enabled: true });
      message.success("Cover logo uploaded");
    } catch (error: any) { message.error(error?.message || "Logo upload failed"); }
    return false;
  };

  const addScreenshot = async (file: File) => {
    try {
      if (!canUpload) throw new Error("Guide upload permission is required to add screenshots");
      if (!file.type.startsWith("image/")) throw new Error("Screenshot must be an image");
      const uploaded: any = await api.uploadGuide(file);
      if (!uploaded?.url) throw new Error("Screenshot upload did not return a URL");
      const r = TEMPLATE_RECIPES[design.template].screenshot;
      const z = Math.max(10, ...layers.map((layer) => layer.zIndex + 1));
      const layer: CanvasLayer = { id: uid(), kind: "screenshot", name: file.name || "Screenshot", url: uploaded.url, iconKey: "", color: "#ffffff", x: r.x, y: r.y, width: r.width, height: r.height, rotation: r.rotation || 0, opacity: 100, radius: r.radius, shadow: true, visible: true, locked: false, zIndex: z };
      setLayers((current) => [...current, layer]);
      setSelectedLayerId(layer.id);
      message.success("Screenshot added. Drag it directly on the cover to position it.");
    } catch (error: any) { message.error(error?.message || "Screenshot upload failed"); }
    return false;
  };

  const addCustomIcon = async (file: File) => {
    try {
      if (!canUpload) throw new Error("Guide upload permission is required to upload custom icons");
      if (!file.type.startsWith("image/")) throw new Error("Custom icon must be an image");
      const uploaded: any = await api.uploadGuide(file);
      if (!uploaded?.url) throw new Error("Icon upload did not return a URL");
      const z = Math.max(20, ...layers.map((layer) => layer.zIndex + 1));
      const layer: CanvasLayer = { id: uid(), kind: "custom-icon", name: file.name || "Custom icon", url: uploaded.url, iconKey: "", color: "#ffffff", x: 1040, y: 500, width: 120, height: 120, rotation: 0, opacity: 100, radius: 0, shadow: false, visible: true, locked: false, zIndex: z };
      setLayers((current) => [...current, layer]); setSelectedLayerId(layer.id); setIconDrawerOpen(false); message.success("Custom icon added");
    } catch (error: any) { message.error(error?.message || "Custom icon upload failed"); }
    return false;
  };

  const addBuiltinIcon = (key: string, label: string) => {
    const z = Math.max(20, ...layers.map((layer) => layer.zIndex + 1));
    const layer: CanvasLayer = { id: uid(), kind: "builtin-icon", name: label, url: "", iconKey: key, color: "#ffffff", x: 1040, y: 500, width: 120, height: 120, rotation: 0, opacity: 100, radius: 0, shadow: false, visible: true, locked: false, zIndex: z };
    setLayers((current) => [...current, layer]); setSelectedLayerId(layer.id); setIconDrawerOpen(false);
  };

  const beginLayerDrag = (event: any, layer: CanvasLayer, mode: "move" | "resize") => {
    event.stopPropagation(); event.preventDefault();
    if (layer.locked) { setSelectedLayerId(layer.id); return; }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelectedLayerId(layer.id);
    dragRef.current = { id: layer.id, mode, startClientX: event.clientX, startClientY: event.clientY, scaleX: 1280 / rect.width, scaleY: 720 / rect.height, start: { ...layer } };
  };

  const duplicateSelected = () => {
    if (!selectedLayer) return;
    const copy: CanvasLayer = { ...selectedLayer, id: uid(), name: `${selectedLayer.name} copy`, x: Math.min(1280 - selectedLayer.width, selectedLayer.x + 24), y: Math.min(720 - selectedLayer.height, selectedLayer.y + 24), zIndex: Math.max(...layers.map((layer) => layer.zIndex), 0) + 1 };
    setLayers((current) => [...current, copy]); setSelectedLayerId(copy.id);
  };
  const deleteSelected = () => { if (!selectedLayer) return; setLayers((current) => current.filter((layer) => layer.id !== selectedLayer.id)); setSelectedLayerId(""); };
  const moveLayerOrder = (directionValue: 1 | -1) => { if (selectedLayer) patchLayer(selectedLayer.id, { zIndex: selectedLayer.zIndex + directionValue }); };

  const savePlatformDefault = async () => {
    setSavingDesigner(true);
    try { await writeSiteContent(DEFAULT_DESIGN_KEY, "Guide cover default design", JSON.stringify(design), 720); setPlatformDefault(cloneDesign(design)); message.success("Platform default cover design saved"); }
    catch (error: any) { message.error(error?.message || "Could not save platform cover design"); }
    finally { setSavingDesigner(false); }
  };
  const savePreset = async () => {
    const name = presetName.trim(); if (!name) { message.info("Enter a preset name first"); return; }
    setSavingDesigner(true);
    try {
      const next = [...presets.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), { name, design: cloneDesign(design) }].sort((a, b) => a.name.localeCompare(b.name));
      await writeSiteContent(PRESETS_KEY, "Guide cover design presets", JSON.stringify(next), 721); setPresets(next); setSelectedPreset(name); setPresetName(""); message.success(`Preset “${name}” saved`);
    } catch (error: any) { message.error(error?.message || "Could not save preset"); }
    finally { setSavingDesigner(false); }
  };
  const deletePreset = async () => {
    if (!selectedPreset) return; setSavingDesigner(true);
    try { const next = presets.filter((item) => item.name !== selectedPreset); await writeSiteContent(PRESETS_KEY, "Guide cover design presets", JSON.stringify(next), 721); setPresets(next); setSelectedPreset(""); message.success("Preset deleted"); }
    catch (error: any) { message.error(error?.message || "Could not delete preset"); }
    finally { setSavingDesigner(false); }
  };
  const applySavedPreset = () => { const found = presets.find((item) => item.name === selectedPreset); if (found) setDesign(cloneDesign(found.design)); };

  const saveWorkspace = async () => {
    setSavingDesigner(true);
    try {
      const key = workspaceKey(locale, title || coverTitle || category || "guide");
      const workspace: Workspace = { design: cloneDesign(design), layers: cloneLayers(layers), coverTitle, subtitle, bannerText };
      await writeSiteContent(key, `Editable Guide cover layout · ${locale} · ${title || coverTitle || "Guide"}`, JSON.stringify(workspace), 730);
      message.success("Editable cover layout saved");
    } catch (error: any) { message.error(error?.message || "Could not save editable layout"); }
    finally { setSavingDesigner(false); }
  };
  const loadWorkspace = async () => {
    setSavingDesigner(true);
    try {
      const key = workspaceKey(locale, title || coverTitle || category || "guide");
      const rows: any[] = await api.list("site-content") as any[];
      const row = rows.find((item: any) => String(item.key || item.block_key || "") === key);
      if (!row?.value) { message.info("No saved editable layout exists for this Guide language yet"); return; }
      const parsed: Workspace = JSON.parse(String(row.value));
      setDesign(mergeDesign(parsed.design)); setLayers(Array.isArray(parsed.layers) ? parsed.layers : []); setCoverTitle(parsed.coverTitle || title || ""); setSubtitle(parsed.subtitle || summary || ""); setBannerText(parsed.bannerText || category || "Guide"); setSelectedLayerId("");
      message.success("Saved editable layout loaded");
    } catch (error: any) { message.error(error?.message || "Could not load editable layout"); }
    finally { setSavingDesigner(false); }
  };

  const generate = async () => {
    if (!canUpload) { message.error("Guide upload permission is required to generate a cover"); return; }
    if (!coverTitle.trim()) { message.error("Cover title is required"); return; }
    setGenerating(true);
    try {
      const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas rendering is not available in this browser");
      const gradient = ctx.createLinearGradient(0, 0, 1280, 720); gradient.addColorStop(0, design.gradientStart); gradient.addColorStop(1, design.gradientEnd); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 720);
      drawTemplateDecorations(ctx, design, rtl);
      drawBanner(ctx, design.banner, bannerText, bannerFamily);
      if (design.logo.enabled && effectiveLogoUrl) { try { drawLogo(ctx, await loadImage(effectiveLogoUrl), design.logo); } catch (_) { message.warning("The logo could not be embedded in the exported cover"); } }

      for (const layer of [...layers].filter((item) => item.visible).sort((a, b) => a.zIndex - b.zIndex)) {
        try {
          const image = await loadImage(layerSource(layer));
          ctx.save(); ctx.globalAlpha = layer.opacity / 100; ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2); ctx.rotate(layer.rotation * Math.PI / 180); ctx.translate(-layer.width / 2, -layer.height / 2);
          if (layer.shadow) { ctx.shadowColor = "rgba(0,0,0,.36)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12; }
          if (layer.radius > 0) { roundedRect(ctx, 0, 0, layer.width, layer.height, layer.radius); ctx.clip(); }
          if (layer.kind === "screenshot") drawImageCover(ctx, image, 0, 0, layer.width, layer.height); else ctx.drawImage(image, 0, 0, layer.width, layer.height);
          ctx.restore();
        } catch (_) { message.warning(`${layer.name} could not be embedded in the exported cover`); }
      }

      const titleAlign = design.titleStyle.align || (rtl ? "right" : "left");
      ctx.textAlign = titleAlign; ctx.textBaseline = "alphabetic";
      const textX = titleAlign === "center" ? 640 : titleAlign === "right" ? 1190 : 90;
      let cursorY = design.textTop;
      const fitted = fitLines(ctx, coverTitle, design.maxTextWidth, 3, design.titleStyle.fontSize, Math.max(30, design.titleStyle.fontSize - 28), titleFamily, design.titleStyle.fontWeight);
      ctx.font = `${design.titleStyle.fontWeight} ${fitted.size}px ${titleFamily}`; ctx.fillStyle = design.titleStyle.color;
      const lineHeight = Math.round(fitted.size * 1.14);
      for (const line of fitted.lines) { ctx.fillText(line, textX, cursorY, design.maxTextWidth); cursorY += lineHeight; }
      if (subtitle.trim()) {
        cursorY += 20;
        const summaryAlign = design.subtitleStyle.align || titleAlign;
        ctx.textAlign = summaryAlign;
        const summaryX = summaryAlign === "center" ? 640 : summaryAlign === "right" ? 1190 : 90;
        const fittedSummary = fitLines(ctx, subtitle, design.maxTextWidth, 3, design.subtitleStyle.fontSize, Math.max(18, design.subtitleStyle.fontSize - 10), subtitleFamily, design.subtitleStyle.fontWeight);
        ctx.font = `${design.subtitleStyle.fontWeight} ${fittedSummary.size}px ${subtitleFamily}`; ctx.fillStyle = design.subtitleStyle.color;
        const summaryHeight = Math.round(fittedSummary.size * 1.42);
        for (const line of fittedSummary.lines) { ctx.fillText(line, summaryX, cursorY, design.maxTextWidth); cursorY += summaryHeight; }
      }
      if (design.showLocale) { ctx.font = `700 22px ${resolveFont("ios", locale)}`; ctx.fillStyle = design.subtitleStyle.color; ctx.textAlign = rtl ? "right" : "left"; ctx.fillText(locale.toUpperCase(), rtl ? 1190 : 90, 675); }
      const blob = await canvasBlob(canvas);
      const file = new File([blob], `guide-cover-${safeSlug(locale)}-${Date.now()}.png`, { type: "image/png" });
      const uploaded: any = await api.uploadGuideMotion(file);
      if (!uploaded?.url) throw new Error("Cover upload did not return a URL");
      onGenerated(uploaded.url);
      message.success("Cover generated. Click Save locale to store it with this Guide language.");
    } catch (error: any) { message.error(error?.message || "Cover generation failed"); }
    finally { setGenerating(false); }
  };

  const colorInput = (value: string, onChange: (value: string) => void) => <Input type="color" value={value} onChange={(event) => onChange(event.target.value)} style={{ height: 36, padding: 4 }} />;
  const previewLayerStyle = (layer: CanvasLayer): any => ({ position: "absolute", left: `${layer.x / 12.8}%`, top: `${layer.y / 7.2}%`, width: `${layer.width / 12.8}%`, height: `${layer.height / 7.2}%`, opacity: layer.opacity / 100, transform: `rotate(${layer.rotation}deg)`, transformOrigin: "center", zIndex: layer.zIndex, display: layer.visible ? "block" : "none", borderRadius: `${Math.min(50, (layer.radius / Math.max(1, Math.min(layer.width, layer.height))) * 100)}%`, boxShadow: layer.shadow ? "0 14px 34px rgba(0,0,0,.34)" : undefined, outline: selectedLayerId === layer.id ? `3px solid ${design.accentColor}` : "1px solid transparent", cursor: layer.locked ? "not-allowed" : "move", userSelect: "none", touchAction: "none" });

  return <Card size="small" style={{ marginBottom: 16 }} loading={loadingDesigner}>
    <Alert showIcon type="success" style={{ marginBottom: 14 }} message="Guide Cover Builder v3 · live template engine" description="Templates now apply a real layout immediately: text, logo, banner, screenshot placement and template-specific decoration all change in the live canvas and the exported 1280×720 cover." />

    <Space wrap style={{ width: "100%", marginBottom: 14 }}>
      <Select value={design.template} onChange={(value) => applyTemplate(value)} options={TEMPLATE_OPTIONS} style={{ minWidth: 220 }} />
      <Select value={design.preset} onChange={(value) => applyPalette(value)} options={PRESET_OPTIONS} style={{ minWidth: 180 }} />
      <Upload accept="image/png,image/jpeg,image/webp,image/gif" showUploadList={false} beforeUpload={addScreenshot}><Button type="primary" icon={<PictureOutlined />}>Add screenshot</Button></Upload>
      <Button icon={<SearchOutlined />} onClick={() => setIconDrawerOpen(true)}>Add icon</Button>
      <Button icon={<SaveOutlined />} loading={savingDesigner} onClick={() => void saveWorkspace()}>Save editable layout</Button>
      <Button loading={savingDesigner} onClick={() => void loadWorkspace()}>Load saved layout</Button>
      <Button icon={<SaveOutlined />} loading={savingDesigner} onClick={() => void savePlatformDefault()}>Save as platform default</Button>
      <Button type="primary" icon={<PictureOutlined />} loading={generating} disabled={!canUpload} onClick={() => void generate()}>Generate & use cover</Button>
    </Space>

    <Row gutter={14} align="top">
      <Col xs={24} xl={6}>
        <Card size="small" title={`Layers (${layers.length})`} style={{ marginBottom: 12 }}>
          {!layers.length && <Alert type="warning" showIcon message="No screenshot or icon layers yet" description="Use Add screenshot or Add icon above. Each added item can be dragged and resized directly on the cover." />}
          <Space direction="vertical" style={{ width: "100%" }}>
            {[...layers].sort((a, b) => b.zIndex - a.zIndex).map((layer) => <Button key={layer.id} block type={selectedLayerId === layer.id ? "primary" : "default"} onClick={() => setSelectedLayerId(layer.id)} style={{ textAlign: "left", height: "auto", minHeight: 38 }}>
              <Space style={{ width: "100%", justifyContent: "space-between" }}><span>{layer.kind === "screenshot" ? "Screenshot" : "Icon"} · {layer.name}</span><span>{layer.locked ? <LockOutlined /> : null}{!layer.visible ? <EyeInvisibleOutlined /> : null}</span></Space>
            </Button>)}
          </Space>
        </Card>

        <Collapse size="small" defaultActiveKey={["logo"]} items={[
          { key: "logo", label: "Platform / cover logo", children: <Space direction="vertical" style={{ width: "100%" }}>
            <Space><Text>Show logo</Text><Switch checked={design.logo.enabled} onChange={(enabled) => patchLogo({ enabled })} /></Space>
            <Text strong>Logo source</Text><Select value={design.logo.source} onChange={(source) => patchLogo({ source })} options={[{ value: "platform", label: "Platform logo" }, { value: "custom", label: "Custom logo" }]} />
            <Text strong>Logo shape</Text><Select value={design.logo.shape} onChange={(shape) => patchLogo({ shape })} options={[{ value: "original", label: "Original" }, { value: "square", label: "Square" }, { value: "rounded-square", label: "Rounded square" }, { value: "circle", label: "Circle" }]} />
            <Text strong>Alignment / position</Text><Select value={design.logo.position} onChange={(position) => patchLogo({ position })} options={ANCHOR_OPTIONS} />
            <Row gutter={8}><Col span={12}><Text>Size</Text><InputNumber min={36} max={260} value={design.logo.size} onChange={(value) => patchLogo({ size: Number(value || 36) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Opacity</Text><InputNumber min={10} max={100} value={design.logo.opacity} onChange={(value) => patchLogo({ opacity: Number(value || 10) })} style={{ width: "100%" }} /></Col></Row>
            <Row gutter={8}><Col span={12}><Text>Margin X</Text><InputNumber min={0} max={400} value={design.logo.marginX} onChange={(value) => patchLogo({ marginX: Number(value || 0) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Margin Y</Text><InputNumber min={0} max={400} value={design.logo.marginY} onChange={(value) => patchLogo({ marginY: Number(value || 0) })} style={{ width: "100%" }} /></Col></Row>
            <Upload accept="image/*" showUploadList={false} beforeUpload={uploadLogo}><Button icon={<UploadOutlined />}>Upload custom logo</Button></Upload>
            {design.logo.source === "platform" && !platformLogoUrl && <Alert type="warning" showIcon message="No platform logo configured" />}
          </Space> },
          { key: "banner", label: "Banner", children: <Space direction="vertical" style={{ width: "100%" }}>
            <Space><Text>Add banner</Text><Switch checked={design.banner.enabled} onChange={(enabled) => patchBanner({ enabled })} /></Space>
            <Text strong>Shape</Text><Select value={design.banner.shape} onChange={(shape) => patchBanner({ shape })} options={["rectangle","rounded","pill","ribbon","glass","outline"].map((value) => ({ value, label: value }))} />
            <Text strong>Position</Text><Select value={design.banner.position} onChange={(position) => patchBanner({ position })} options={ANCHOR_OPTIONS} />
            <Space><Text>Banner contains text</Text><Switch checked={design.banner.textEnabled} onChange={(textEnabled) => patchBanner({ textEnabled })} /></Space>
            <Text strong>Banner text</Text><Input value={bannerText} onChange={(event) => setBannerText(event.target.value)} />
            <Text strong>Banner font</Text><Select value={design.banner.font} onChange={(font) => patchBanner({ font })} options={FONT_OPTIONS} />
            <Row gutter={8}><Col span={12}><Text>Width</Text><InputNumber min={120} max={1100} value={design.banner.width} onChange={(value) => patchBanner({ width: Number(value || 120) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Height</Text><InputNumber min={30} max={220} value={design.banner.height} onChange={(value) => patchBanner({ height: Number(value || 30) })} style={{ width: "100%" }} /></Col></Row>
            <Row gutter={8}><Col span={12}><Text>Colour</Text>{colorInput(design.banner.color, (color) => patchBanner({ color }))}</Col><Col span={12}><Text>Text colour</Text>{colorInput(design.banner.textColor, (textColor) => patchBanner({ textColor }))}</Col></Row>
            <Row gutter={8}><Col span={12}><Text>Font size</Text><InputNumber min={12} max={72} value={design.banner.fontSize} onChange={(value) => patchBanner({ fontSize: Number(value || 12) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Opacity</Text><InputNumber min={0} max={100} value={design.banner.opacity} onChange={(value) => patchBanner({ opacity: Number(value || 0) })} style={{ width: "100%" }} /></Col></Row>
          </Space> },
          { key: "preset", label: "Preset management", children: <Space direction="vertical" style={{ width: "100%" }}>
            <Select placeholder="Saved platform preset" value={selectedPreset || undefined} onChange={setSelectedPreset} options={presets.map((item) => ({ value: item.name, label: item.name }))} />
            <Space><Button disabled={!selectedPreset} onClick={applySavedPreset}>Apply preset</Button><Button danger disabled={!selectedPreset} loading={savingDesigner} onClick={() => void deletePreset()}>Delete</Button></Space>
            <Input placeholder="New preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} />
            <Button icon={<SaveOutlined />} loading={savingDesigner} onClick={() => void savePreset()}>Save preset</Button>
            <Button icon={<ReloadOutlined />} onClick={() => setDesign(cloneDesign(platformDefault))}>Reset to platform default</Button>
          </Space> },
        ]} />
      </Col>

      <Col xs={24} xl={11}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}><Text strong>Live 16:9 canvas · template changes apply immediately</Text><Text type="secondary">{TEMPLATE_OPTIONS.find((item) => item.value === design.template)?.label}</Text></Space>
        <div ref={canvasRef} onPointerDown={() => setSelectedLayerId("")} style={{ position: "relative", overflow: "hidden", aspectRatio: "16 / 9", borderRadius: 16, marginTop: 8, background: `linear-gradient(135deg, ${design.gradientStart}, ${design.gradientEnd})`, boxShadow: "0 18px 50px rgba(0,0,0,.25)", direction: rtl ? "rtl" : "ltr", touchAction: "none" }}>
          <TemplatePreviewDecorations design={design} rtl={rtl} />
          {snapGuide.x && <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: design.accentColor, zIndex: 999 }} />}
          {snapGuide.y && <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: design.accentColor, zIndex: 999 }} />}
          {effectiveLogoUrl && design.logo.enabled && <img src={effectiveLogoUrl} alt="Cover logo preview" style={{ position: "absolute", objectFit: design.logo.shape === "original" ? "contain" : "cover", width: `${design.logo.size / 12.8}%`, height: `${design.logo.size / 7.2}%`, left: design.logo.position.endsWith("right") ? undefined : design.logo.position.endsWith("center") ? `${50 - design.logo.size / 25.6}%` : `${design.logo.marginX / 12.8}%`, right: design.logo.position.endsWith("right") ? `${design.logo.marginX / 12.8}%` : undefined, top: design.logo.position.startsWith("bottom") ? undefined : design.logo.position.startsWith("middle") ? `${50 - design.logo.size / 14.4}%` : `${design.logo.marginY / 7.2}%`, bottom: design.logo.position.startsWith("bottom") ? `${design.logo.marginY / 7.2}%` : undefined, borderRadius: design.logo.shape === "circle" ? "50%" : design.logo.shape === "rounded-square" ? "20%" : 0, opacity: design.logo.opacity / 100, zIndex: 5 }} />}
          {design.banner.enabled && <div style={{ position: "absolute", left: `${anchorRect(design.banner.position, design.banner.width, design.banner.height, design.banner.marginX, design.banner.marginY).x / 12.8}%`, top: `${anchorRect(design.banner.position, design.banner.width, design.banner.height, design.banner.marginX, design.banner.marginY).y / 7.2}%`, width: `${design.banner.width / 12.8}%`, height: `${design.banner.height / 7.2}%`, display: "flex", alignItems: "center", justifyContent: design.banner.textAlign === "left" ? "flex-start" : design.banner.textAlign === "right" ? "flex-end" : "center", padding: "0 1.5%", boxSizing: "border-box", background: design.banner.shape === "outline" ? "transparent" : design.banner.color, opacity: design.banner.shape === "outline" ? 1 : Math.max(0.08, design.banner.opacity / 100), border: design.banner.shape === "outline" || design.banner.borderWidth > 0 ? `${Math.max(1, design.banner.borderWidth || 2)}px solid ${design.banner.borderColor}` : "none", borderRadius: design.banner.shape === "pill" ? 999 : (design.banner.shape === "rounded" || design.banner.shape === "glass") ? 14 : 2, color: design.banner.textColor, fontFamily: bannerFamily, fontWeight: design.banner.fontWeight, fontSize: `${Math.max(9, design.banner.fontSize / 3)}px`, zIndex: 4 }}>{design.banner.textEnabled ? bannerText : ""}</div>}

          {layers.map((layer) => <div key={layer.id} style={previewLayerStyle(layer)} onPointerDown={(event) => beginLayerDrag(event, layer, "move")}>
            <img draggable={false} src={layerSource(layer)} alt={layer.name} style={{ width: "100%", height: "100%", objectFit: layer.kind === "screenshot" ? "cover" : "contain", borderRadius: "inherit", pointerEvents: "none" }} />
            {selectedLayerId === layer.id && !layer.locked && <div onPointerDown={(event) => beginLayerDrag(event, layer, "resize")} style={{ position: "absolute", right: -7, bottom: -7, width: 15, height: 15, borderRadius: 4, background: design.accentColor, border: "2px solid #fff", cursor: "nwse-resize", zIndex: 1000 }} />}
          </div>)}

          <div style={{ position: "absolute", top: `${design.textTop / 7.2}%`, left: design.titleStyle.align === "center" ? "50%" : design.titleStyle.align === "right" ? "auto" : "7%", right: design.titleStyle.align === "right" ? "7%" : "auto", transform: design.titleStyle.align === "center" ? "translateX(-50%)" : undefined, width: `${Math.min(90, design.maxTextWidth / 12.8)}%`, textAlign: design.titleStyle.align, zIndex: 200 }}>
            <div style={{ color: design.titleStyle.color, fontFamily: titleFamily, fontWeight: design.titleStyle.fontWeight, fontSize: `${Math.max(18, design.titleStyle.fontSize / 3)}px`, lineHeight: 1.12 }}>{coverTitle || "Guide cover title"}</div>
            {subtitle && <div style={{ color: design.subtitleStyle.color, fontFamily: subtitleFamily, fontWeight: design.subtitleStyle.fontWeight, fontSize: `${Math.max(10, design.subtitleStyle.fontSize / 3)}px`, lineHeight: 1.35, marginTop: "3%", textAlign: design.subtitleStyle.align }}>{subtitle}</div>}
          </div>
          {design.showLocale && <div style={{ position: "absolute", left: "7%", bottom: "5%", color: design.subtitleStyle.color, fontFamily: resolveFont("ios", locale), fontWeight: 700, fontSize: 12, zIndex: 220 }}>{locale.toUpperCase()}</div>}
        </div>
        <div style={{ color: "#8ea0bd", fontSize: 12, marginTop: 8 }}>Switching template now changes the live layout immediately. Export is always 1280 × 720 and uses the same template engine.</div>
        {currentCoverUrl && <div style={{ color: "#8ea0bd", fontSize: 12, marginTop: 4 }}>This locale already has a cover. Generating a new one replaces it only after you click <b>Save locale</b>.</div>}
      </Col>

      <Col xs={24} xl={7}>
        <Card size="small" title="Selected layer" style={{ marginBottom: 12 }}>
          {!selectedLayer && <Alert type="info" showIcon message="Select a screenshot or icon" description="Click a layer on the canvas or in the layer list to edit its position, size, rotation, opacity, border radius and ordering." />}
          {selectedLayer && <Space direction="vertical" style={{ width: "100%" }}>
            <Input value={selectedLayer.name} onChange={(event) => patchLayer(selectedLayer.id, { name: event.target.value })} />
            <Row gutter={8}><Col span={12}><Text>X</Text><InputNumber value={Math.round(selectedLayer.x)} min={0} max={1280} onChange={(value) => patchLayer(selectedLayer.id, { x: Number(value || 0) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Y</Text><InputNumber value={Math.round(selectedLayer.y)} min={0} max={720} onChange={(value) => patchLayer(selectedLayer.id, { y: Number(value || 0) })} style={{ width: "100%" }} /></Col></Row>
            <Row gutter={8}><Col span={12}><Text>Width</Text><InputNumber value={Math.round(selectedLayer.width)} min={48} max={1280} onChange={(value) => patchLayer(selectedLayer.id, { width: Number(value || 48) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Height</Text><InputNumber value={Math.round(selectedLayer.height)} min={48} max={720} onChange={(value) => patchLayer(selectedLayer.id, { height: Number(value || 48) })} style={{ width: "100%" }} /></Col></Row>
            <Row gutter={8}><Col span={12}><Text>Rotation</Text><InputNumber value={selectedLayer.rotation} min={-180} max={180} onChange={(value) => patchLayer(selectedLayer.id, { rotation: Number(value || 0) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Corner radius</Text><InputNumber value={selectedLayer.radius} min={0} max={120} onChange={(value) => patchLayer(selectedLayer.id, { radius: Number(value || 0) })} style={{ width: "100%" }} /></Col></Row>
            <Text>Opacity</Text><Slider min={10} max={100} value={selectedLayer.opacity} onChange={(opacity) => patchLayer(selectedLayer.id, { opacity })} />
            {selectedLayer.kind === "builtin-icon" && <><Text>Icon colour</Text>{colorInput(selectedLayer.color, (color) => patchLayer(selectedLayer.id, { color }))}</>}
            <Space wrap>
              <Button icon={selectedLayer.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={() => patchLayer(selectedLayer.id, { visible: !selectedLayer.visible })}>{selectedLayer.visible ? "Hide" : "Show"}</Button>
              <Button icon={selectedLayer.locked ? <UnlockOutlined /> : <LockOutlined />} onClick={() => patchLayer(selectedLayer.id, { locked: !selectedLayer.locked })}>{selectedLayer.locked ? "Unlock" : "Lock"}</Button>
              <Button onClick={() => patchLayer(selectedLayer.id, { shadow: !selectedLayer.shadow })}>Shadow {selectedLayer.shadow ? "on" : "off"}</Button>
            </Space>
            <Space wrap><Button icon={<ArrowUpOutlined />} onClick={() => moveLayerOrder(1)}>Forward</Button><Button icon={<ArrowDownOutlined />} onClick={() => moveLayerOrder(-1)}>Backward</Button><Button icon={<CopyOutlined />} onClick={duplicateSelected}>Duplicate</Button><Button danger icon={<DeleteOutlined />} onClick={deleteSelected}>Delete</Button></Space>
          </Space>}
        </Card>

        <Collapse size="small" defaultActiveKey={["text"]} items={[
          { key: "text", label: "Typography", children: <Space direction="vertical" style={{ width: "100%" }}>
            <Text strong>Cover title</Text><Input value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} />
            <Text strong>Title font</Text><Select value={design.titleStyle.font} onChange={(font) => patchTitleStyle({ font })} options={FONT_OPTIONS} />
            <Row gutter={8}><Col span={8}><Text>Size</Text><InputNumber min={30} max={120} value={design.titleStyle.fontSize} onChange={(value) => patchTitleStyle({ fontSize: Number(value || 30) })} style={{ width: "100%" }} /></Col><Col span={8}><Text>Weight</Text><Select value={design.titleStyle.fontWeight} onChange={(fontWeight) => patchTitleStyle({ fontWeight })} options={WEIGHTS} style={{ width: "100%" }} /></Col><Col span={8}><Text>Align</Text><Select value={design.titleStyle.align} onChange={(align) => patchTitleStyle({ align })} options={ALIGN_OPTIONS} style={{ width: "100%" }} /></Col></Row>
            <Text>Title colour</Text>{colorInput(design.titleStyle.color, (color) => patchTitleStyle({ color }))}
            <Divider style={{ margin: "8px 0" }} />
            <Text strong>Subtitle</Text><Input.TextArea rows={2} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
            <Text strong>Subtitle font</Text><Select value={design.subtitleStyle.font} onChange={(font) => patchSubtitleStyle({ font })} options={FONT_OPTIONS} />
            <Row gutter={8}><Col span={8}><Text>Size</Text><InputNumber min={16} max={72} value={design.subtitleStyle.fontSize} onChange={(value) => patchSubtitleStyle({ fontSize: Number(value || 16) })} style={{ width: "100%" }} /></Col><Col span={8}><Text>Weight</Text><Select value={design.subtitleStyle.fontWeight} onChange={(fontWeight) => patchSubtitleStyle({ fontWeight })} options={WEIGHTS} style={{ width: "100%" }} /></Col><Col span={8}><Text>Align</Text><Select value={design.subtitleStyle.align} onChange={(align) => patchSubtitleStyle({ align })} options={ALIGN_OPTIONS} style={{ width: "100%" }} /></Col></Row>
            <Row gutter={8}><Col span={12}><Text>Text top</Text><InputNumber min={100} max={600} value={design.textTop} onChange={(value) => patchDesign({ textTop: Number(value || 100) })} style={{ width: "100%" }} /></Col><Col span={12}><Text>Text max width</Text><InputNumber min={300} max={1150} value={design.maxTextWidth} onChange={(value) => patchDesign({ maxTextWidth: Number(value || 300) })} style={{ width: "100%" }} /></Col></Row>
            <Space><Text>Show locale</Text><Switch checked={design.showLocale} onChange={(showLocale) => patchDesign({ showLocale })} /></Space>
          </Space> },
          { key: "background", label: "Background", children: <Space direction="vertical" style={{ width: "100%" }}>
            <Text>Gradient start</Text>{colorInput(design.gradientStart, (gradientStart) => patchDesign({ gradientStart }))}
            <Text>Gradient end</Text>{colorInput(design.gradientEnd, (gradientEnd) => patchDesign({ gradientEnd }))}
            <Text>Accent</Text>{colorInput(design.accentColor, (accentColor) => patchDesign({ accentColor }))}
            <Text>Decorative strength</Text><Slider min={0} max={70} value={design.overlay} onChange={(overlay) => patchDesign({ overlay })} />
          </Space> },
        ]} />
      </Col>
    </Row>

    <Drawer open={iconDrawerOpen} onClose={() => setIconDrawerOpen(false)} width="min(520px, 94vw)" title="Icon library">
      <Input allowClear prefix={<SearchOutlined />} value={iconSearch} onChange={(event) => setIconSearch(event.target.value)} placeholder="Search security, payment, bank, support…" style={{ marginBottom: 14 }} />
      <Alert type="info" showIcon message="Built-in icons are vector and recolorable" description="Choose a built-in icon or upload your own image icon. After adding it, drag, resize, rotate, recolor, duplicate, lock or reorder it from the canvas inspector." style={{ marginBottom: 14 }} />
      <Row gutter={[10, 10]}>{filteredIcons.map((icon) => <Col span={12} key={icon.key}><Button block style={{ height: 72 }} onClick={() => addBuiltinIcon(icon.key, icon.label)}><Space><img src={builtinIconSrc(icon.key, "#5b8cff")} alt="" style={{ width: 30, height: 30 }} /><span>{icon.label}</span></Space></Button></Col>)}</Row>
      <Divider>Custom icon</Divider>
      <Upload accept="image/png,image/jpeg,image/webp,image/gif" showUploadList={false} beforeUpload={addCustomIcon}><Button type="primary" icon={<UploadOutlined />}>Upload custom icon</Button></Upload>
    </Drawer>
  </Card>;
}

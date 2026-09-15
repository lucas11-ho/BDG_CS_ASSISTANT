import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Input, Row, Select, Slider, Space, Switch, Tag, Typography, message } from "antd";
import { PictureOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

const { Text, Title } = Typography;

export type GuideCoverTemplate = "professional" | "screenshot-focus" | "security-notice" | "minimal";
export type GuideCoverPreset = "brand-dark" | "blue-professional" | "purple-premium" | "green-success" | "orange-warning" | "red-alert" | "neutral-dark";

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

type Palette = {
  start: string;
  end: string;
  accent: string;
  text: string;
  muted: string;
};

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

const PRESET_OPTIONS = [
  { value: "brand-dark", label: "Brand Dark" },
  { value: "blue-professional", label: "Blue Professional" },
  { value: "purple-premium", label: "Purple Premium" },
  { value: "green-success", label: "Green Success" },
  { value: "orange-warning", label: "Orange Warning" },
  { value: "red-alert", label: "Red Alert" },
  { value: "neutral-dark", label: "Neutral Dark" },
];

function fontStack(locale: string) {
  const code = String(locale || "").toLowerCase();
  if (code.startsWith("my")) return '"Noto Sans Myanmar", "Myanmar Text", sans-serif';
  if (code.startsWith("hi") || code.startsWith("mr") || code.startsWith("ne")) return '"Noto Sans Devanagari", "Nirmala UI", sans-serif';
  if (code.startsWith("th")) return '"Noto Sans Thai", Tahoma, sans-serif';
  if (code.startsWith("zh")) return '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif';
  if (code.startsWith("ja")) return '"Noto Sans JP", "Yu Gothic", sans-serif';
  if (code.startsWith("ko")) return '"Noto Sans KR", "Malgun Gothic", sans-serif';
  if (code.startsWith("ar") || code.startsWith("fa") || code.startsWith("ur")) return '"Noto Sans Arabic", Tahoma, sans-serif';
  return 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
}

function isRtlLocale(locale: string, direction?: string) {
  if (String(direction || "").toLowerCase() === "rtl") return true;
  return /^(ar|fa|he|ur)(-|$)/i.test(locale || "");
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitLines(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
  initialSize: number,
  minSize: number,
  family: string,
  weight = 800,
) {
  const text = String(value || "").trim();
  if (!text) return { lines: [""], size: initialSize };
  for (let size = initialSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) return { lines, size };
  }
  ctx.font = `${weight} ${minSize}px ${family}`;
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  for (const char of chars) {
    const candidate = `${current}${char}`;
    if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return { lines: lines.slice(0, maxLines), size: minSize };
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not render cover image"))), "image/png", 0.94);
  });
}

export default function GuideCoverStudio({
  locale,
  direction,
  title,
  summary = "",
  category = "",
  currentCoverUrl = "",
  canUpload = false,
  onGenerated,
}: Props) {
  const [template, setTemplate] = useState<GuideCoverTemplate>("professional");
  const [preset, setPreset] = useState<GuideCoverPreset>("brand-dark");
  const [coverTitle, setCoverTitle] = useState(title || "");
  const [subtitle, setSubtitle] = useState(summary || "");
  const [badge, setBadge] = useState(category || "Guide");
  const [showBadge, setShowBadge] = useState(true);
  const [showLocale, setShowLocale] = useState(false);
  const [overlay, setOverlay] = useState(34);
  const [generating, setGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setCoverTitle(title || ""); }, [locale, title]);
  useEffect(() => { setSubtitle(summary || ""); }, [locale, summary]);
  useEffect(() => { setBadge(category || "Guide"); }, [locale, category]);

  const palette = PALETTES[preset];
  const rtl = isRtlLocale(locale, direction);
  const family = fontStack(locale);
  const previewStyle = useMemo(() => ({
    background: `linear-gradient(135deg, ${palette.start}, ${palette.end})`,
    fontFamily: family,
    direction: rtl ? "rtl" as const : "ltr" as const,
  }), [palette, family, rtl]);

  const reset = () => {
    setTemplate("professional");
    setPreset("brand-dark");
    setCoverTitle(title || "");
    setSubtitle(summary || "");
    setBadge(category || "Guide");
    setShowBadge(true);
    setShowLocale(false);
    setOverlay(34);
  };

  const generate = async () => {
    if (!canUpload) { message.error("Guide upload permission is required to generate a cover"); return; }
    if (!coverTitle.trim()) { message.error("Cover title is required"); return; }
    setGenerating(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas rendering is not available in this browser");

      const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
      gradient.addColorStop(0, palette.start);
      gradient.addColorStop(1, palette.end);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1280, 720);

      ctx.globalAlpha = overlay / 100;
      ctx.fillStyle = palette.accent;
      ctx.beginPath(); ctx.arc(template === "screenshot-focus" ? 1070 : 1120, 105, 240, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(1170, 630, template === "minimal" ? 150 : 280, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      if (template !== "minimal") {
        ctx.globalAlpha = template === "security-notice" ? 0.22 : 0.13;
        ctx.fillStyle = "#ffffff";
        roundedRect(ctx, rtl ? 70 : 760, 95, 430, 530, 44);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.24)";
        ctx.lineWidth = 2;
        roundedRect(ctx, rtl ? 70 : 760, 95, 430, 530, 44);
        ctx.stroke();
        if (template === "screenshot-focus") {
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          roundedRect(ctx, rtl ? 115 : 805, 142, 340, 435, 28);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.28)";
          roundedRect(ctx, rtl ? 115 : 805, 142, 340, 435, 28);
          ctx.stroke();
        }
        if (template === "security-notice") {
          ctx.fillStyle = "rgba(255,255,255,0.13)";
          ctx.beginPath();
          const cx = rtl ? 285 : 975;
          ctx.moveTo(cx, 190); ctx.lineTo(cx + 150, 265); ctx.lineTo(cx + 112, 470); ctx.lineTo(cx, 555); ctx.lineTo(cx - 112, 470); ctx.lineTo(cx - 150, 265); ctx.closePath(); ctx.fill();
          ctx.fillStyle = palette.accent;
          ctx.font = `900 118px ${family}`;
          ctx.textAlign = "center";
          ctx.fillText("!", cx, 425);
        }
      }

      const textX = rtl ? 1190 : 90;
      const maxTextWidth = template === "minimal" ? 1090 : 610;
      ctx.textAlign = rtl ? "right" : "left";
      ctx.textBaseline = "alphabetic";

      let cursorY = 145;
      if (showBadge && badge.trim()) {
        ctx.font = `700 25px ${family}`;
        const badgeWidth = Math.min(maxTextWidth, ctx.measureText(badge.trim()).width + 54);
        const badgeX = rtl ? textX - badgeWidth : textX;
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        roundedRect(ctx, badgeX, 90, badgeWidth, 52, 26);
        ctx.fill();
        ctx.fillStyle = palette.text;
        ctx.fillText(badge.trim(), rtl ? textX - 27 : textX + 27, 125);
        cursorY = 215;
      }

      const fitted = fitLines(ctx, coverTitle, maxTextWidth, 3, template === "minimal" ? 76 : 68, 42, family, 800);
      ctx.font = `800 ${fitted.size}px ${family}`;
      ctx.fillStyle = palette.text;
      const lineHeight = Math.round(fitted.size * 1.15);
      for (const line of fitted.lines) {
        ctx.fillText(line, textX, cursorY);
        cursorY += lineHeight;
      }

      if (subtitle.trim()) {
        cursorY += 22;
        const fittedSummary = fitLines(ctx, subtitle, maxTextWidth, 3, 31, 23, family, 500);
        ctx.font = `500 ${fittedSummary.size}px ${family}`;
        ctx.fillStyle = palette.muted;
        const summaryHeight = Math.round(fittedSummary.size * 1.45);
        for (const line of fittedSummary.lines) {
          ctx.fillText(line, textX, cursorY);
          cursorY += summaryHeight;
        }
      }

      ctx.fillStyle = palette.accent;
      const accentX = rtl ? 920 : 90;
      roundedRect(ctx, accentX, 645, 270, 8, 4);
      ctx.fill();

      if (showLocale) {
        ctx.font = `700 22px ${family}`;
        ctx.fillStyle = palette.muted;
        ctx.fillText(locale.toUpperCase(), textX, 675);
      }

      const blob = await canvasBlob(canvas);
      const file = new File([blob], `guide-cover-${String(locale || "default").replace(/[^a-z0-9-]/gi, "-")}-${Date.now()}.png`, { type: "image/png" });
      const uploaded: any = await api.uploadGuideMotion(file);
      if (!uploaded?.url) throw new Error("Cover upload did not return a URL");
      onGenerated(uploaded.url);
      message.success("Professional cover generated. Click Save locale to store it with this Guide language.");
    } catch (error: any) {
      message.error(error?.message || "Cover generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return <Card size="small" style={{ marginBottom: 16 }}>
    <Alert
      showIcon
      type="info"
      style={{ marginBottom: 14 }}
      message="Professional multilingual cover builder"
      description="Titles and subtitles are rendered using language-aware font fallbacks. The generated 1280×720 PNG is assigned only to the currently selected Guide locale, so every language can have correct text while keeping a consistent visual style."
    />
    <Row gutter={16} align="top">
      <Col xs={24} xl={11}>
        <Row gutter={10}>
          <Col xs={24} md={12}><Text strong>Template</Text><Select value={template} onChange={setTemplate} options={TEMPLATE_OPTIONS} style={{ width: "100%", marginTop: 6, marginBottom: 12 }} /></Col>
          <Col xs={24} md={12}><Text strong>Background preset</Text><Select value={preset} onChange={setPreset} options={PRESET_OPTIONS} style={{ width: "100%", marginTop: 6, marginBottom: 12 }} /></Col>
        </Row>
        <Text strong>Cover title</Text>
        <Input value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} maxLength={180} style={{ marginTop: 6, marginBottom: 12 }} />
        <Text strong>Subtitle</Text>
        <Input.TextArea value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={400} autoSize={{ minRows: 2, maxRows: 4 }} style={{ marginTop: 6, marginBottom: 12 }} />
        <Text strong>Badge / category</Text>
        <Input value={badge} onChange={(event) => setBadge(event.target.value)} maxLength={80} style={{ marginTop: 6, marginBottom: 12 }} />
        <Row gutter={12}>
          <Col span={12}><Space><Switch checked={showBadge} onChange={setShowBadge} /><Text>Show badge</Text></Space></Col>
          <Col span={12}><Space><Switch checked={showLocale} onChange={setShowLocale} /><Text>Show locale</Text></Space></Col>
        </Row>
        <div style={{ marginTop: 14 }}><Text strong>Decorative accent strength</Text><Slider min={12} max={55} value={overlay} onChange={setOverlay} /></div>
        <Space wrap style={{ marginTop: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={reset}>Reset</Button>
          <Button type="primary" icon={<PictureOutlined />} loading={generating} disabled={!canUpload} onClick={() => void generate()}>Generate & use cover</Button>
        </Space>
        {!canUpload && <div style={{ marginTop: 10 }}><Tag color="gold">Read-only account</Tag></div>}
      </Col>
      <Col xs={24} xl={13}>
        <div ref={previewRef} style={{ ...previewStyle, aspectRatio: "16 / 9", width: "100%", borderRadius: 18, overflow: "hidden", position: "relative", color: palette.text, boxShadow: "0 18px 50px rgba(0,0,0,.28)", minHeight: 250 }}>
          <div style={{ position: "absolute", width: template === "minimal" ? "27%" : "38%", aspectRatio: "1", borderRadius: "50%", right: rtl ? "auto" : "-8%", left: rtl ? "-8%" : "auto", top: "-18%", background: palette.accent, opacity: overlay / 100 }} />
          <div style={{ position: "absolute", width: template === "minimal" ? "22%" : "42%", aspectRatio: "1", borderRadius: "50%", right: rtl ? "auto" : "-15%", left: rtl ? "-15%" : "auto", bottom: "-28%", background: palette.accent, opacity: overlay / 100 }} />
          {template !== "minimal" && <div style={{ position: "absolute", width: "34%", height: "74%", right: rtl ? "5%" : "auto", left: rtl ? "auto" : "61%", top: "13%", border: "1px solid rgba(255,255,255,.25)", borderRadius: 24, background: "rgba(255,255,255,.10)", display: "grid", placeItems: "center", fontSize: 50, fontWeight: 900, color: palette.accent }}>{template === "security-notice" ? "!" : template === "screenshot-focus" ? "▣" : "◆"}</div>}
          <div style={{ position: "absolute", inset: "11% 7%", width: template === "minimal" ? "86%" : "48%", textAlign: rtl ? "right" : "left", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: rtl ? "flex-end" : "flex-start" }}>
            {showBadge && badge && <div style={{ padding: "6px 13px", borderRadius: 999, background: "rgba(255,255,255,.15)", fontSize: 12, fontWeight: 700, marginBottom: 14 }}>{badge}</div>}
            <Title level={2} style={{ color: palette.text, margin: 0, fontFamily: family, fontSize: "clamp(24px, 3.4vw, 48px)", lineHeight: 1.08, maxWidth: "100%" }}>{coverTitle || "Guide title"}</Title>
            {subtitle && <div style={{ marginTop: 14, color: palette.muted, fontSize: "clamp(13px, 1.5vw, 20px)", lineHeight: 1.45, maxWidth: "100%" }}>{subtitle}</div>}
            <div style={{ width: 110, height: 4, borderRadius: 999, background: palette.accent, marginTop: 24 }} />
            {showLocale && <div style={{ marginTop: 12, color: palette.muted, fontSize: 11, fontWeight: 700 }}>{locale.toUpperCase()}</div>}
          </div>
        </div>
        <div style={{ color: "#8ea0bd", fontSize: 12, marginTop: 8 }}>Preview is responsive. Export is always 1280 × 720 (16:9).</div>
        {currentCoverUrl && <div style={{ marginTop: 10, color: "#8ea0bd", fontSize: 12 }}>A cover already exists for this locale. Generating a new one replaces it only after you click <b>Save locale</b>.</div>}
      </Col>
    </Row>
  </Card>;
}

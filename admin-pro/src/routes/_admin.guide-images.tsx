import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import RichKnowledgeEditor from "@/components/RichKnowledgeEditor";
import LocalizedHelp from "@/components/LocalizedHelp";
import GuideCoverStudio from "@/components/GuideCoverStudio";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/guide-images")({ component: VisualGuideStudio });

const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
const ANIMATION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "typewriter", label: "Typewriter" },
  { value: "fade_blur", label: "Fade & blur" },
  { value: "slide_bounce", label: "Slide & bounce" },
  { value: "glitch_flicker", label: "Glitch & flicker" },
  { value: "scribble_draw", label: "Scribble & draw" },
];

function plainText(html: string) {
  if (typeof document === "undefined") return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const node = document.createElement("div");
  node.innerHTML = html || "";
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

function editorValue(json: unknown, html: unknown, text: unknown) {
  if (typeof json === "string" && json.trim()) {
    try {
      if (JSON.parse(json)?.type === "doc") return json;
    } catch (_) {
      // Use the HTML/text fallback below when an older guide has invalid JSON.
    }
  }
  return String(html || text || "") || EMPTY_DOC;
}

type Locale = { code: string; label?: string; native_name?: string; direction?: string; is_default?: boolean };

function localeName(locale: Locale) {
  return locale.native_name && locale.native_name !== locale.label
    ? `${locale.label || locale.code} · ${locale.native_name}`
    : locale.label || locale.code;
}

function emptyTranslation(locale: Locale) {
  return {
    id: undefined,
    locale: locale.code,
    title: "",
    summary: "",
    body: "",
    rich_json: EMPTY_DOC,
    rich_html: "",
    image_urls: [],
    cover_image_url: "",
    cover_media_type: "image",
    cover_video_url: "",
    cover_video_poster_url: "",
    video_autoplay: false,
    video_loop: false,
    video_muted: true,
    video_controls: true,
    motion_enabled: true,
    title_animation: "none",
    summary_animation: "none",
    content_animation: "none",
    motion_intensity: "subtle",
    keywords: "",
    seo_title: "",
    seo_description: "",
    alt_text: "",
    status: "draft",
  };
}

function rowToTranslation(row: any, locale: Locale) {
  return {
    ...emptyTranslation(locale),
    ...row,
    locale: row?.locale || locale.code,
    rich_json: editorValue(row?.rich_json, row?.rich_html, row?.body),
    rich_html: row?.rich_html || "",
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : [],
  };
}

function VisualGuideStudio() {
  const [rows, setRows] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [buttons, setButtons] = useState<any[]>([]);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [access, setAccess] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [activeLocale, setActiveLocale] = useState("");
  const [editorJson, setEditorJson] = useState(EMPTY_DOC);
  const [editorHtml, setEditorHtml] = useState("");
  const [form] = Form.useForm();
  const selectedCategoryId = Form.useWatch("category_id", form);

  const defaultLocale = useMemo(
    () => locales.find((locale) => locale.is_default)?.code || locales[0]?.code || "en",
    [locales],
  );
  const activeDocument = translations[activeLocale] || emptyTranslation({ code: activeLocale || defaultLocale });
  const activeLocaleMeta = locales.find((locale) => locale.code === activeLocale) || { code: activeLocale || defaultLocale };
  const selectedCategoryName = useMemo(
    () => categories.find((category) => Number(category.id) === Number(selectedCategoryId))?.name || editing?.category_name || "Guide",
    [categories, selectedCategoryId, editing?.category_name],
  );
  const canUploadGuides = access?.can_upload_guides === true;
  const canPublishGuides = access?.can_publish_guides === true;

  const load = async () => {
    setLoading(true);
    try {
      const [guides, categoryRows, actionRows, registry, context] = await Promise.all([
        api.list("guide-images"),
        api.list("categories"),
        api.list("action-buttons"),
        api.getGuideLocaleStudio(),
        api.getPlatformContext(),
      ]);
      setRows(guides as any[]);
      setCategories(categoryRows as any[]);
      setButtons(actionRows as any[]);
      setAccess((context as any)?.access || {});
      const registryLocales = Array.isArray((registry as any)?.locales) ? (registry as any).locales : [];
      setLocales(registryLocales);
      if (registryLocales.length && !activeLocale) setActiveLocale((registry as any).platform?.default_locale || registryLocales[0].code);
    } catch (error: any) {
      message.error(error?.message || "Failed to load Guide Locale Studio");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!editing || !activeLocale) return;
    const document = translations[activeLocale] || emptyTranslation({ code: activeLocale });
    setEditorJson(document.rich_json || EMPTY_DOC);
    setEditorHtml(document.rich_html || "");
    form.setFieldsValue({
      title: document.title,
      summary: document.summary,
      keywords: document.keywords,
      seo_title: document.seo_title,
      seo_description: document.seo_description,
      alt_text: document.alt_text,
      cover_image_url: document.cover_image_url,
      cover_media_type: document.cover_media_type || "image",
      cover_video_url: document.cover_video_url || "",
      cover_video_poster_url: document.cover_video_poster_url || "",
      video_autoplay: document.video_autoplay === true,
      video_loop: document.video_loop === true,
      video_muted: document.video_muted !== false,
      video_controls: document.video_controls !== false,
      motion_enabled: document.motion_enabled !== false,
      title_animation: document.title_animation || "none",
      summary_animation: document.summary_animation || "none",
      content_animation: document.content_animation || "none",
      motion_intensity: document.motion_intensity || "subtle",
      status: document.status || "draft",
    });
  }, [activeLocale, editing, translations, form]);

  const openEditor = async (row?: any) => {
    setEditing(row || { title: "", slug: "", status: "draft", priority: 100, button_ids: [] });
    const selected = locales.find((locale) => locale.is_default)?.code || locales[0]?.code || "en";
    setActiveLocale(selected);
    form.setFieldsValue(row ? { ...row, primary_topic_id: row.primary_topic_id || row.category_id, topic_ids: row.topic_ids || (row.category_id ? [row.category_id] : []) } : { title: "", slug: "", status: "draft", priority: 100, button_ids: [], topic_ids: [] });
    if (!row?.id) {
      setTranslations({ [selected]: emptyTranslation({ code: selected }) });
      return;
    }
    try {
      const result: any = await api.listGuideTranslations(row.id);
      const next: Record<string, any> = {};
      for (const locale of locales) {
        const found = (result?.translations || []).find((translation: any) => translation.locale === locale.code);
        next[locale.code] = found ? rowToTranslation(found, locale) : emptyTranslation(locale);
      }
      next[selected] = next[selected]?.title ? next[selected] : rowToTranslation({
        locale: selected,
        title: row.title,
        summary: row.summary,
        body: row.body,
        rich_json: row.body_blocks_json,
        rich_html: row.body_html,
        image_urls: row.image_urls,
        cover_image_url: row.cover_image_url,
        cover_media_type: row.cover_media_type || "image",
        cover_video_url: row.cover_video_url || "",
        cover_video_poster_url: row.cover_video_poster_url || "",
        video_autoplay: row.video_autoplay === true,
        video_loop: row.video_loop === true,
        video_muted: row.video_muted !== false,
        video_controls: row.video_controls !== false,
        motion_enabled: row.motion_enabled !== false,
        title_animation: row.title_animation || "none",
        summary_animation: row.summary_animation || "none",
        content_animation: row.content_animation || "none",
        motion_intensity: row.motion_intensity || "subtle",
        keywords: row.keywords,
        status: row.status,
      }, locales.find((locale) => locale.code === selected) || { code: selected });
      setTranslations(next);
    } catch (error: any) {
      message.error(error?.message || "Could not load guide translations");
      setTranslations({ [selected]: emptyTranslation({ code: selected }) });
    }
  };

  const close = () => { setEditing(null); setTranslations({}); form.resetFields(); };

  const updateActiveDocument = (patch: any) => {
    setTranslations((current) => ({
      ...current,
      [activeLocale]: { ...(current[activeLocale] || emptyTranslation({ code: activeLocale })), ...patch },
    }));
  };

  const uploadImage = async (file: File) => {
    if (!canUploadGuides) throw new Error("Platform owner or platform admin permission is required to upload Guide media");
    return (await api.uploadGuide(file)).url;
  };
  const uploadCover = async (file: File) => {
    try {
      if (!canUploadGuides) throw new Error("Platform owner or platform admin permission is required to upload Guide media");
      const uploaded: any = await api.uploadGuideMotion(file);
      if (uploaded.media_kind === "video") {
        updateActiveDocument({ cover_media_type: "video", cover_video_url: uploaded.url, video_autoplay: true, video_loop: true, video_muted: true });
        form.setFieldsValue({ cover_media_type: "video", cover_video_url: uploaded.url, video_autoplay: true, video_loop: true, video_muted: true });
      } else {
        const type = uploaded.media_kind === "gif" ? "gif" : "image";
        updateActiveDocument({ cover_media_type: type, cover_image_url: uploaded.url });
        form.setFieldsValue({ cover_media_type: type, cover_image_url: uploaded.url });
      }
      message.success(`${uploaded.media_kind === "video" ? "Video" : uploaded.media_kind === "gif" ? "GIF" : "Image"} cover uploaded`);
    } catch (error: any) { message.error(error?.message || "Upload failed"); }
    return false;
  };
  const uploadPoster = async (file: File) => {
    try {
      const url = await uploadImage(file);
      updateActiveDocument({ cover_video_poster_url: url });
      form.setFieldValue("cover_video_poster_url", url);
      message.success("Video poster uploaded");
    } catch (error: any) { message.error(error?.message || "Poster upload failed"); }
    return false;
  };

  const save = async () => {
    if (!canUploadGuides) { message.error("Platform owner or platform admin permission is required to save Guides"); return; }
    const values = await form.validateFields();
    const document = {
      ...(translations[activeLocale] || emptyTranslation({ code: activeLocale })),
      ...values,
      locale: activeLocale,
      body: plainText(editorHtml),
      rich_json: editorJson,
      rich_html: editorHtml,
    };
    if (!document.title) { message.error(`Add a title for ${activeLocale}`); return; }
    try {
      let guide = editing;
      if (!guide?.id) {
        guide = await api.create("guide-images", {
          title: document.title,
          summary: document.summary,
          body: document.body,
          body_html: document.rich_html,
          body_blocks_json: document.rich_json,
          slug: form.getFieldValue("slug"),
          status: form.getFieldValue("status") || "draft",
          language: activeLocale,
          priority: form.getFieldValue("priority") || 100,
          category_id: form.getFieldValue("primary_topic_id") || form.getFieldValue("category_id"),
          primary_topic_id: form.getFieldValue("primary_topic_id") || form.getFieldValue("category_id"),
          topic_ids: form.getFieldValue("topic_ids") || [],
          keywords: document.keywords,
          button_ids: form.getFieldValue("button_ids") || [],
        });
        setEditing(guide);
      } else {
        // The legacy guides endpoint is a full-row update. Keep the base
        // locale's values intact while editing a non-default translation;
        // otherwise a partial payload would overwrite the guide with empty
        // fields or the generic "Guide" placeholder.
        const baseLocale = defaultLocale;
        const base = translations[baseLocale] || rowToTranslation(guide, { code: baseLocale });
        await api.update("guide-images", guide.id, {
          title: base.title || guide.title || "Guide",
          summary: base.summary || guide.summary || "",
          body: base.body || guide.body || "",
          body_html: base.rich_html || guide.body_html || "",
          body_blocks_json: base.rich_json || guide.body_blocks_json || "",
          image_urls: base.image_urls || guide.image_urls || [],
          cover_image_url: base.cover_image_url || guide.cover_image_url || "",
          keywords: base.keywords || guide.keywords || "",
          language: baseLocale,
          title_hi: guide.title_hi || "",
          summary_hi: guide.summary_hi || "",
          body_hi: guide.body_hi || "",
          body_html_hi: guide.body_html_hi || "",
          body_blocks_json_hi: guide.body_blocks_json_hi || "",
          image_urls_hi: guide.image_urls_hi || [],
          cover_image_url_hi: guide.cover_image_url_hi || "",
          slug: form.getFieldValue("slug"),
          category_id: form.getFieldValue("primary_topic_id") || form.getFieldValue("category_id"),
          primary_topic_id: form.getFieldValue("primary_topic_id") || form.getFieldValue("category_id"),
          topic_ids: form.getFieldValue("topic_ids") || [],
          priority: form.getFieldValue("priority"),
          status: guide.status || "draft",
          button_ids: form.getFieldValue("button_ids") || [],
        });
      }
      const result: any = document.id
        ? await api.updateGuideTranslation(document.id, document)
        : await api.saveGuideTranslation(guide.id, document);
      const saved = result?.translation || document;
      setTranslations((current) => ({ ...current, [activeLocale]: { ...document, ...saved } }));
      message.success(`Saved ${localeName(locales.find((locale) => locale.code === activeLocale) || { code: activeLocale })} guide content`);
      await load();
    } catch (error: any) { message.error(error?.message || "Guide save failed"); }
  };

  const publish = async () => {
    if (!canPublishGuides) { message.error("Platform owner or platform admin permission is required to publish Guides"); return; }
    const document = translations[activeLocale];
    if (!document?.id) { message.info("Save this locale before publishing it"); return; }
    try {
      const result: any = await api.publishGuideTranslation(document.id);
      updateActiveDocument({ ...(result?.translation || {}), status: "published" });
      message.success(`${localeName(locales.find((locale) => locale.code === activeLocale) || { code: activeLocale })} is published`);
      await load();
    } catch (error: any) { message.error(error?.message || "Publish failed"); }
  };

  const remove = async (id: number) => {
    if (!canPublishGuides) { message.error("Platform owner or platform admin permission is required to delete Guides"); return; }
    try { await api.remove("guide-images", id); message.success("Guide deleted"); await load(); }
    catch (error: any) { message.error(error?.message || "Delete failed"); }
  };

  return <>
    <div className="bdg-filters" style={{ marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <h2 style={{ margin: 0 }}>Guide Locale Studio</h2>
        <div style={{ color: "#8ea0bd", fontSize: 12 }}>Create and publish independent rich guide variants for every language enabled by this platform.</div>
      </div>
      <Button icon={<ReloadOutlined />} onClick={() => void load()}>Refresh</Button>
      <Button disabled={!canUploadGuides} type="primary" icon={<PlusOutlined />} onClick={() => void openEditor()}>Create visual guide</Button>
    </div>
    {access && !canUploadGuides && <Alert showIcon type="warning" style={{ marginBottom: 12 }} message="Guide editing is read-only for this account" description="Ask a tenant owner, tenant admin, platform owner, or platform admin to upload, edit, publish, or remove Guide content." />}
    <LocalizedHelp copies={{
      en: { title: "Advanced Visual Guide Studio", body: "Guide content and motion settings are independent for every enabled platform language. Upload images, playable GIF covers, or MP4/WebM video covers, then select safe text-animation presets. A missing translation is never replaced with another platform or provider content.", bullets: ["Autoplay video is always muted so modern browsers can play it; loop and player controls are independent options.", "Typewriter, fade & blur, slide & bounce, glitch & flicker, and scribble & draw are allowlisted presets—custom scripts are never accepted.", "Visitors who prefer reduced motion receive a still, accessible experience while the Guide content remains available."] },
      zh: { title: "高级可视化指南工作室", body: "每个平台语言的指南内容和动态设置都独立保存。您可以上传图片、可播放的 GIF 封面或 MP4/WebM 视频封面，并选择安全的文字动画预设。缺少翻译时绝不会回退到其他平台或提供商内容。", bullets: ["自动播放视频会强制静音，以符合现代浏览器规则；循环播放和播放器控制可分别设置。", "打字机、淡入模糊、滑入弹跳、故障闪烁、手写绘制均为安全白名单预设，不接受自定义脚本。", "当访客启用“减少动态效果”时，页面会自动使用静态、可访问的显示方式。"] },
      my: { title: "အဆင့်မြင့် Visual Guide Studio", body: "Platform တွင် ဖွင့်ထားသော ဘာသာတစ်ခုချင်းစီအတွက် Guide အကြောင်းအရာနှင့် motion setting များကို သီးခြားသိမ်းဆည်းသည်။ ပုံ၊ လှုပ်ရှားသည့် GIF cover သို့မဟုတ် MP4/WebM video cover တင်ပြီး လုံခြုံသော စာသား animation preset ကို ရွေးနိုင်သည်။ ဘာသာပြန်မရှိလျှင် အခြား platform သို့မဟုတ် provider အကြောင်းအရာသို့ fallback မလုပ်ပါ။", bullets: ["Browser များတွင် autoplay အလုပ်လုပ်စေရန် video ကို muted အဖြစ် အလိုအလျောက်ထားပြီး loop နှင့် controls ကို သီးခြားရွေးနိုင်သည်။", "Typewriter၊ fade & blur၊ slide & bounce၊ glitch & flicker နှင့် scribble & draw တို့သည် ခွင့်ပြုထားသော preset များသာဖြစ်ပြီး custom script များကို လက်မခံပါ။", "Reduced motion ကို သုံးသော visitor များအတွက် animation ကို ရပ်ပြီး Guide အကြောင်းအရာကို ရှင်းလင်းစွာ ဆက်လက်ပြသမည်။"] },
    }} />
    <Table rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 20 }} columns={[
      { title: "Guide", render: (_: any, row: any) => <div><b>{row.title}</b><div style={{ color: "#8ea0bd", fontSize: 12 }}>{row.slug}</div></div> },
      { title: "Available locales", dataIndex: "locale_coverage", render: (coverage: any) => <Space wrap>{Object.entries(coverage || {}).map(([code, status]: any) => <Tag key={code} color={status === "published" ? "green" : "gold"}>{code} · {status}</Tag>)}</Space> },
      { title: "Topics", width: 260, render: (_: any, row: any) => <Space wrap>{(row.topics?.length ? row.topics : [{ name: row.category_name || "—", is_primary: true }]).map((topic: any) => <Tag key={`${row.id}-${topic.id || topic.name}`} color={topic.is_primary ? "blue" : "default"}>{topic.name || topic.slug}{topic.is_primary ? " · primary" : ""}</Tag>)}</Space> },
      { title: "Status", dataIndex: "publication_status", width: 190, render: (value: string, row: any) => {
        const status = value || row.status || "draft";
        const color = status === "published" ? "green" : status === "partially_published" ? "blue" : status === "archived" ? "default" : "gold";
        return <div><Tag color={color}>{status.replaceAll("_", " ")}</Tag><div style={{ color: "#8ea0bd", fontSize: 11 }}>{Number(row.published_locale_count || 0)}/{Number(row.enabled_locale_count || 0)} locales published</div></div>;
      } },
      { title: "Actions", width: 145, render: (_: any, row: any) => <Space><Button disabled={!canUploadGuides} size="small" icon={<EditOutlined />} onClick={() => void openEditor(row)}>Edit</Button><Popconfirm title="Delete this guide?" onConfirm={() => void remove(row.id)}><Button disabled={!canPublishGuides} size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
    ]} />
    <Drawer open={!!editing} onClose={close} width="min(1220px, 97vw)" title={editing?.id ? `Edit visual guide — ${editing.title}` : "Create visual guide"} extra={<Space><Button onClick={close}>Cancel</Button><Button disabled={!canUploadGuides} icon={<SaveOutlined />} type="primary" onClick={() => void save()}>Save locale</Button><Button disabled={!canPublishGuides || !activeDocument.id || activeDocument.status === "published"} onClick={() => void publish()}>Publish locale</Button></Space>}>
      <Form form={form} layout="vertical">
        <Alert showIcon type="info" icon={<GlobalOutlined />} style={{ marginBottom: 14 }} message="Each locale is an independent guide document" description="Write the title, summary, rich content, images, SEO fields, and cover image for the selected locale. Publishing English does not publish Indonesian, and vice versa." />
        <Row gutter={12}>
          <Col xs={24} md={8}><Form.Item label="Guide locale" required><Select value={activeLocale || defaultLocale} onChange={setActiveLocale} options={locales.map((locale) => ({ value: locale.code, label: `${localeName(locale)}${locale.is_default ? " · default" : ""}` }))} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="slug" label="Stable slug" rules={[{ required: true }]}><Input placeholder="deposit-not-received" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="primary_topic_id" label="Primary topic"><Select allowClear showSearch optionFilterProp="label" onChange={(value) => { const current = form.getFieldValue("topic_ids") || []; form.setFieldValue("topic_ids", value ? [...new Set([value, ...current])] : current); }} options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item></Col>
        </Row>
        <Form.Item name="topic_ids" label="Topics" extra="Assign one or more searchable topics. The primary topic is always kept in the selection."><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>
        <Row gutter={12}>
          <Col xs={24} md={12}><Form.Item name="title" label={`${localeName(activeLocaleMeta)} title`} rules={[{ required: true }]}><Input onChange={(event) => updateActiveDocument({ title: event.target.value })} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="summary" label="Summary"><Input onChange={(event) => updateActiveDocument({ summary: event.target.value })} /></Form.Item></Col>
        </Row>
        <RichKnowledgeEditor value={editorJson} onChange={(json, html) => { setEditorJson(json); setEditorHtml(html); updateActiveDocument({ rich_json: json, rich_html: html, body: plainText(html) }); }} uploadImage={uploadImage} />
        <Row gutter={12} style={{ marginTop: 14 }}>
          <Col xs={24} md={12}><Form.Item name="keywords" label="Search keywords"><Input placeholder="deposit, pending, recharge" onChange={(event) => updateActiveDocument({ keywords: event.target.value })} /></Form.Item></Col>
        </Row>
        <Divider titlePlacement="start">Professional cover studio</Divider>
        <GuideCoverStudio
          locale={activeLocale}
          direction={activeLocaleMeta.direction}
          title={activeDocument.title || ""}
          summary={activeDocument.summary || ""}
          category={selectedCategoryName}
          currentCoverUrl={activeDocument.cover_image_url || ""}
          canUpload={canUploadGuides}
          onGenerated={(url) => {
            updateActiveDocument({ cover_media_type: "image", cover_image_url: url, cover_video_url: "", cover_video_poster_url: "" });
            form.setFieldsValue({ cover_media_type: "image", cover_image_url: url, cover_video_url: "", cover_video_poster_url: "" });
          }}
        />
        <Divider titlePlacement="start">Motion media cover / custom override</Divider>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Alert showIcon type="info" style={{ marginBottom: 14 }} message="Image, animated GIF, or video cover" description="Use this section when you want a fully custom cover instead of the generated professional cover. GIF covers play naturally. Video accepts MP4 or WebM. When Autoplay is enabled, Muted is locked on to satisfy browser autoplay rules." />
          <Row gutter={12}>
            <Col xs={24} md={8}><Form.Item name="cover_media_type" label="Cover media type"><Select options={[{ value: "image", label: "Image" }, { value: "gif", label: "Animated GIF" }, { value: "video", label: "Video" }]} onChange={(value) => updateActiveDocument({ cover_media_type: value })} /></Form.Item></Col>
            {activeDocument.cover_media_type === "video" ? <>
              <Col xs={24} md={16}><Form.Item name="cover_video_url" label="Video URL"><Input addonAfter={<Upload accept="video/mp4,video/webm" disabled={!canUploadGuides} showUploadList={false} beforeUpload={uploadCover}><Button disabled={!canUploadGuides} size="small" icon={<VideoCameraOutlined />}>Upload video</Button></Upload>} onChange={(event) => updateActiveDocument({ cover_video_url: event.target.value })} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="cover_video_poster_url" label="Video poster image"><Input addonAfter={<Upload accept="image/png,image/jpeg,image/webp" disabled={!canUploadGuides} showUploadList={false} beforeUpload={uploadPoster}><Button disabled={!canUploadGuides} size="small" icon={<UploadOutlined />}>Upload poster</Button></Upload>} onChange={(event) => updateActiveDocument({ cover_video_poster_url: event.target.value })} /></Form.Item></Col>
              <Col xs={24} md={12}>
                {activeDocument.cover_video_url && <video key={activeDocument.cover_video_url} src={activeDocument.cover_video_url} poster={activeDocument.cover_video_poster_url || undefined} autoPlay={activeDocument.video_autoplay === true} loop={activeDocument.video_loop === true} muted playsInline controls style={{ width: "100%", maxHeight: 260, borderRadius: 12, background: "#050a13" }} />}
              </Col>
            </> : <>
              <Col xs={24} md={16}><Form.Item name="cover_image_url" label={activeDocument.cover_media_type === "gif" ? "Animated GIF URL" : "Cover image URL"}><Input addonAfter={<Upload accept={activeDocument.cover_media_type === "gif" ? "image/gif" : "image/png,image/jpeg,image/webp,image/gif"} disabled={!canUploadGuides} showUploadList={false} beforeUpload={uploadCover}><Button disabled={!canUploadGuides} size="small" icon={<UploadOutlined />}>Upload</Button></Upload>} onChange={(event) => updateActiveDocument({ cover_image_url: event.target.value })} /></Form.Item></Col>
              <Col xs={24}>{activeDocument.cover_image_url && <Image src={activeDocument.cover_image_url} width={320} preview />}</Col>
            </>}
          </Row>
          {activeDocument.cover_media_type === "video" && <Row gutter={12}>
            <Col xs={12} md={6}><Form.Item name="video_autoplay" label="Autoplay" valuePropName="checked"><Switch onChange={(checked) => { updateActiveDocument({ video_autoplay: checked, ...(checked ? { video_muted: true } : {}) }); if (checked) form.setFieldValue("video_muted", true); }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="video_loop" label="Loop" valuePropName="checked"><Switch onChange={(checked) => updateActiveDocument({ video_loop: checked })} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="video_muted" label="Muted" valuePropName="checked"><Switch disabled={activeDocument.video_autoplay === true} onChange={(checked) => updateActiveDocument({ video_muted: checked })} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="video_controls" label="Player controls" valuePropName="checked"><Switch onChange={(checked) => updateActiveDocument({ video_controls: checked })} /></Form.Item></Col>
          </Row>}
        </Card>
        <Divider titlePlacement="start">Text motion</Divider>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col xs={24} md={6}><Form.Item name="motion_enabled" label="Enable text motion" valuePropName="checked"><Switch onChange={(checked) => updateActiveDocument({ motion_enabled: checked })} /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="motion_intensity" label="Motion intensity"><Select options={[{ value: "subtle", label: "Subtle · recommended" }, { value: "standard", label: "Standard" }]} onChange={(value) => updateActiveDocument({ motion_intensity: value })} /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="title_animation" label="Title animation"><Select options={ANIMATION_OPTIONS} onChange={(value) => updateActiveDocument({ title_animation: value })} /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="summary_animation" label="Summary animation"><Select options={ANIMATION_OPTIONS} onChange={(value) => updateActiveDocument({ summary_animation: value })} /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="content_animation" label="Guide content animation"><Select options={ANIMATION_OPTIONS} onChange={(value) => updateActiveDocument({ content_animation: value })} /></Form.Item></Col>
          </Row>
          <div style={{ color: "#8ea0bd", fontSize: 12 }}>Animations run once when the Guide opens. Reduced-motion visitors receive no text animation, and the glitch preset uses a restrained, low-frequency effect.</div>
        </Card>
        <Row gutter={12}>
          <Col xs={24} md={8}><Form.Item name="status" label="Locale status"><Select options={["draft", "published", "archived"].map((value) => ({ value, label: value }))} onChange={(value) => updateActiveDocument({ status: value })} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="priority" label="Sort order"><InputNumber min={1} max={9999} style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="button_ids" label="Recommended buttons"><Select mode="multiple" optionFilterProp="label" options={buttons.filter((button) => button.status === "active").map((button) => ({ value: button.id, label: `${button.label} — ${button.action_type}` }))} /></Form.Item></Col>
        </Row>
        <Row gutter={12}><Col xs={24} md={8}><Form.Item name="seo_title" label="SEO title"><Input /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="seo_description" label="SEO description"><Input /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="alt_text" label="Image alt text"><Input /></Form.Item></Col></Row>
      </Form>
    </Drawer>
  </>;
}

import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Upload,
  message,
} from "antd";
import { GlobalOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/theme-settings")({ component: ThemePage });

type Section = "guide" | "chat" | "identity";
type SiteKind = "guide" | "chat" | "admin" | "staff";
type LocalizedValues = Record<string, Record<string, string>>;

const ROUTES: { key: SiteKind; label: string; description: string }[] = [
  { key: "guide", label: "Guide", description: "Public Help Center and tutorial pages" },
  { key: "chat", label: "Chat", description: "Customer-facing AI and live-support chat" },
  { key: "admin", label: "Admin", description: "Platform administration console" },
  { key: "staff", label: "Staff", description: "Customer-service staff workspace" },
];

const HOME_FIELDS = [
  ["hero_eyebrow", "Hero badge", false],
  ["hero_title", "Hero title", false],
  ["hero_subtitle", "Hero subtitle", true],
  ["hero_description", "Hero description", true],
  ["search_placeholder", "Search placeholder", false],
  ["search_button_text", "Search button", false],
  ["topics_title", "Topics heading", false],
  ["guides_title", "Featured guides heading", false],
  ["faq_title", "FAQ heading", false],
  ["guide_empty_message", "Empty guide message", true],
  ["error_state_text", "Error message", true],
  ["view_all_text", "View all label", false],
  ["read_guide_text", "Read guide label", false],
] as const;

const SHELL_FIELDS = [
  ["header_tagline", "Header tagline", false],
  ["nav_home", "Navigation · Home", false],
  ["nav_guides", "Navigation · Guides", false],
  ["nav_faq", "Navigation · FAQ", false],
  ["guides_page_title", "Guides page title", false],
  ["guides_page_subtitle", "Guides page subtitle", true],
  ["guides_search_placeholder", "Guides search placeholder", false],
  ["guides_all_label", "Guides · All label", false],
  ["guides_loading_text", "Guides loading text", false],
  ["guides_error_text", "Guides error text", true],
  ["guides_retry_text", "Guides retry label", false],
  ["guides_empty_text", "Guides empty result text", true],
  ["guides_updated_label", "Updated label", false],
  ["faq_page_title", "FAQ page title", false],
  ["faq_page_subtitle", "FAQ page subtitle", true],
  ["faq_search_placeholder", "FAQ search placeholder", false],
  ["faq_loading_text", "FAQ loading text", false],
  ["faq_empty_text", "FAQ empty result text", true],
] as const;

const LEGACY_KEYS: Record<string, string> = {
  hero_eyebrow: "hero_eyebrow",
  hero_title: "hero_title",
  hero_subtitle: "hero_subtitle",
  search_placeholder: "search_placeholder",
  search_button_text: "search_button_text",
  topics_title: "topics_title",
  guides_title: "guides_title",
  faq_title: "faq_title",
  guide_empty_message: "guide_empty_message",
  error_state_text: "error_state_text",
  view_all_text: "view_all_text",
  read_guide_text: "read_guide_text",
};

function localeKey(value: unknown) {
  return String(value || "en").trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "en";
}

function localeLabel(code: string) {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code.split("-")[0]);
    return name ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

function ThemePage() {
  const location = useLocation();
  const initialSection = useMemo<Section>(() => {
    const value = new URL(location.href, window.location.origin).searchParams.get("section");
    return value === "chat" || value === "identity" ? value : "guide";
  }, [location.href]);
  const [section, setSection] = useState<Section>(initialSection);
  const [guideForm] = Form.useForm();
  const [chatForm] = Form.useForm();
  const [identityForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [platformContext, setPlatformContext] = useState<any>(null);
  const [siteValues, setSiteValues] = useState<Record<string, string>>({});
  const [localized, setLocalized] = useState<LocalizedValues>({});
  const [locales, setLocales] = useState<string[]>(["en"]);
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [baseSettings, setBaseSettings] = useState<any>({});

  useEffect(() => setSection(initialSection), [initialSection]);

  const load = async () => {
    setLoading(true);
    try {
      const [guide, chat, context, rows, settings] = await Promise.all([
        api.getGuideTheme(),
        api.getChatTheme(),
        api.getPlatformContext(),
        api.list("site-content"),
        api.getSettings(),
      ]);
      guideForm.setFieldsValue(guide);
      chatForm.setFieldsValue(chat);
      setPlatformContext(context);
      setBaseSettings(settings || {});

      const map = Object.fromEntries((rows as any[]).map((row) => [String(row.key || row.block_key || ""), String(row.value || "")]));
      setSiteValues(map);
      const platform = (context as any)?.platform || {};
      const fallbackLocale = localeKey(platform.default_locale || "en");
      const rawLanguages = Array.isArray(platform.supported_languages)
        ? platform.supported_languages
        : String(platform.supported_languages || fallbackLocale).split(/[\s,]+/);
      const nextLocales = [...new Set([fallbackLocale, ...rawLanguages.map(localeKey)].filter(Boolean))];
      setDefaultLocale(fallbackLocale);
      setLocales(nextLocales);

      const localizedValues: LocalizedValues = {};
      for (const locale of nextLocales) {
        localizedValues[locale] = {};
        for (const [field] of [...HOME_FIELDS, ...SHELL_FIELDS]) {
          const saved = map[`guide.i18n.${locale}.${field}`] || "";
          const legacy = locale === fallbackLocale && LEGACY_KEYS[field] ? map[LEGACY_KEYS[field]] || "" : "";
          localizedValues[locale][field] = saved || legacy;
        }
      }
      setLocalized(localizedValues);

      const identityValues: Record<string, string> = {};
      for (const route of ROUTES) {
        for (const field of ["browser_title", "description", "preview_title", "preview_description", "preview_image_url", "favicon_url"]) {
          identityValues[`${route.key}_${field}`] = map[`web.${route.key}.${field}`] || "";
        }
      }
      identityValues.guide_favicon_url ||= settings?.guide_favicon_url || "";
      identityValues.chat_favicon_url ||= settings?.chat_favicon_url || "";
      identityValues.admin_favicon_url ||= settings?.admin_favicon_url || "";
      identityForm.setFieldsValue(identityValues);
    } catch (error: any) {
      message.error(error?.message || "Theme settings unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const uploadTo = async (file: File, form: any, field: string, label: string) => {
    try {
      const result = await api.upload(file);
      form.setFieldValue(field, result.url);
      message.success(`${label} uploaded`);
    } catch (error: any) {
      message.error(error?.message || `${label} upload failed`);
    }
    return false;
  };

  const saveGuideTheme = async () => {
    setSaving(true);
    try {
      const values = await guideForm.validateFields();
      const result = await api.updateGuideTheme(values);
      guideForm.setFieldsValue(result);
      message.success("Guide appearance saved");
    } catch (error: any) {
      message.error(error?.message || "Guide appearance could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const saveChatTheme = async () => {
    setSaving(true);
    try {
      const values = await chatForm.validateFields();
      const result = await api.updateChatTheme(values);
      chatForm.setFieldsValue(result);
      message.success("Chat theme saved");
    } catch (error: any) {
      message.error(error?.message || "Chat theme could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const saveLocalizedGuide = async () => {
    setSaving(true);
    try {
      const writes: Promise<any>[] = [];
      let order = 200;
      for (const locale of locales) {
        for (const [field, label] of [...HOME_FIELDS, ...SHELL_FIELDS]) {
          const key = `guide.i18n.${locale}.${field}`;
          const value = localized[locale]?.[field] || "";
          writes.push(api.update("site-content", key, { key, block_key: key, label: `${label} · ${locale}`, value, input_type: "text", sort_order: order++ }));
          if (locale === defaultLocale && LEGACY_KEYS[field]) {
            const legacyKey = LEGACY_KEYS[field];
            writes.push(api.update("site-content", legacyKey, { key: legacyKey, block_key: legacyKey, label, value, input_type: "text", sort_order: order++ }));
          }
        }
      }
      await Promise.all(writes);
      message.success("Localized Guide content saved");
      await load();
    } catch (error: any) {
      message.error(error?.message || "Localized Guide content could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const saveWebIdentity = async () => {
    setSaving(true);
    try {
      const values = await identityForm.validateFields();
      const writes: Promise<any>[] = [];
      let order = 600;
      for (const route of ROUTES) {
        for (const field of ["browser_title", "description", "preview_title", "preview_description", "preview_image_url", "favicon_url"]) {
          const key = `web.${route.key}.${field}`;
          writes.push(api.update("site-content", key, {
            key,
            block_key: key,
            label: `${route.label} ${field.replaceAll("_", " ")}`,
            value: String(values[`${route.key}_${field}`] || "").trim(),
            input_type: field.includes("url") ? "url" : "text",
            sort_order: order++,
          }));
        }
      }
      await Promise.all(writes);

      const platformId = platformContext?.platform?.id;
      if (platformId) {
        await api.updatePlatformBrand(platformId, {
          guide_favicon_url: String(values.guide_favicon_url || "").trim(),
          chat_favicon_url: String(values.chat_favicon_url || "").trim(),
          admin_favicon_url: String(values.admin_favicon_url || "").trim(),
        });
      }
      message.success("Web identity saved for Guide, Chat, Admin and Staff");
      await load();
    } catch (error: any) {
      message.error(error?.message || "Web identity could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const localizedField = (locale: string, field: string, label: string, multiline: boolean) => (
    <Form.Item key={field} label={label}>
      {multiline ? (
        <Input.TextArea rows={3} value={localized[locale]?.[field] || ""} onChange={(event) => setLocalized((current) => ({ ...current, [locale]: { ...(current[locale] || {}), [field]: event.target.value } }))} />
      ) : (
        <Input value={localized[locale]?.[field] || ""} onChange={(event) => setLocalized((current) => ({ ...current, [locale]: { ...(current[locale] || {}), [field]: event.target.value } }))} />
      )}
    </Form.Item>
  );

  const platformName = platformContext?.platform?.name || baseSettings?.brand_name || "Platform";

  const guidePanel = <>
    <Alert showIcon type="info" style={{ marginBottom: 16 }} message="Guide appearance" description="Visual settings are independent from Chat. Language content below is generated from Platform Settings, so supported Guide languages always follow the platform." />
    <Form form={guideForm} layout="vertical">
      <Form.Item label="Guide page background URL" name="background_url"><Input /></Form.Item>
      <Upload showUploadList={false} beforeUpload={(file) => uploadTo(file, guideForm, "background_url", "Guide background")}><Button icon={<UploadOutlined />}>Upload background</Button></Upload>
      <Form.Item label="Hero background URL" name="hero_background_url" style={{ marginTop: 16 }}><Input /></Form.Item>
      <Upload showUploadList={false} beforeUpload={(file) => uploadTo(file, guideForm, "hero_background_url", "Hero image")}><Button icon={<UploadOutlined />}>Upload hero image</Button></Upload>
      <Row gutter={12} style={{ marginTop: 16 }}>
        <Col span={8}><Form.Item label="Hero overlay" name="hero_overlay_color"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item label="Surface color" name="surface_color"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item label="Text color" name="text_color"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={8}><Form.Item label="Typography" name="font_family"><Select options={[
          { value: "ios-system", label: "iOS / Apple System" },
          { value: "system", label: "System Default" },
          { value: "Inter", label: "Inter" },
          { value: "Roboto", label: "Roboto" },
          { value: "Segoe UI", label: "Segoe UI" },
        ]} /></Form.Item></Col>
        <Col span={8}><Form.Item label="Card radius" name="card_radius"><InputNumber min={8} max={32} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item label="Content width" name="content_width"><InputNumber min={720} max={1400} style={{ width: "100%" }} /></Form.Item></Col>
      </Row>
      <Button type="primary" loading={saving} onClick={saveGuideTheme}>Save Guide appearance</Button>
    </Form>

    <Divider />
    <Space style={{ marginBottom: 12 }} wrap>
      <b>Guide language content</b>
      <Tag color="blue">Default: {defaultLocale}</Tag>
      {locales.map((locale) => <Tag key={locale} color={locale === defaultLocale ? "green" : "default"}>{locale}</Tag>)}
    </Space>
    <Alert showIcon type="success" style={{ marginBottom: 16 }} message="Languages are controlled by Platform Settings" description="Add/remove supported languages or change the default language in Platform Control Center. This editor follows that list automatically. Removing a language from the platform hides it; saved translation values are retained." />
    <Tabs
      type="card"
      items={locales.map((locale) => ({
        key: locale,
        label: locale === defaultLocale ? <Space size={4}>{localeLabel(locale)}<Tag color="green">Default</Tag></Space> : localeLabel(locale),
        children: <>
          <Card size="small" title="Home / Hero">
            {HOME_FIELDS.map(([field, label, multiline]) => localizedField(locale, field, label, multiline))}
          </Card>
          <Card size="small" title="Navigation and Guide pages" style={{ marginTop: 12 }}>
            {SHELL_FIELDS.map(([field, label, multiline]) => localizedField(locale, field, label, multiline))}
          </Card>
        </>,
      }))}
    />
    <Button type="primary" loading={saving} onClick={saveLocalizedGuide}>Save all Guide languages</Button>
  </>;

  const chatPanel = <>
    <Alert showIcon type="info" style={{ marginBottom: 16 }} message="Independent Chat theme" description="These settings affect Chat only. Guide appearance remains unchanged." />
    <Form form={chatForm} layout="vertical">
      <Form.Item label="Header title" name="header_title"><Input /></Form.Item>
      <Form.Item label="Online status text" name="online_text"><Input /></Form.Item>
      <Form.Item label="Welcome title" name="welcome_title"><Input /></Form.Item>
      <Form.Item label="Welcome message" name="welcome_subtitle"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item label="Composer text" name="input_placeholder"><Input /></Form.Item>
      <Form.Item label="Chat icon URL" name="icon_url"><Input /></Form.Item>
      <Upload showUploadList={false} beforeUpload={(file) => uploadTo(file, chatForm, "icon_url", "Chat icon")}><Button icon={<UploadOutlined />}>Upload chat icon</Button></Upload>
      <Form.Item label="Chat background URL" name="background_url" style={{ marginTop: 16 }}><Input /></Form.Item>
      <Upload showUploadList={false} beforeUpload={(file) => uploadTo(file, chatForm, "background_url", "Chat background")}><Button icon={<UploadOutlined />}>Upload chat background</Button></Upload>
      <Row gutter={12} style={{ marginTop: 16 }}>
        <Col span={8}><Form.Item label="Layout" name="layout"><Select options={["standard", "compact", "centered"].map((value) => ({ value, label: value }))} /></Form.Item></Col>
        <Col span={8}><Form.Item label="Bubble style" name="bubble_style"><Select options={["soft", "sharp", "minimal"].map((value) => ({ value, label: value }))} /></Form.Item></Col>
        <Col span={8}><Form.Item label="Input style" name="input_style"><Select options={["rounded", "square", "minimal"].map((value) => ({ value, label: value }))} /></Form.Item></Col>
      </Row>
      <Form.Item label="Enable start screen" name="start_enabled" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item label="Start title" name="start_title"><Input /></Form.Item>
      <Form.Item label="Start message" name="start_body"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item label="Start button label" name="start_button_label"><Input /></Form.Item>
      <Form.Item label="Start announcement" name="start_announcement"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item label="Maintenance notice" name="start_maintenance_banner"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item label="Responsible-support notice" name="start_responsible_notice"><Input.TextArea rows={2} /></Form.Item>
      <Card size="small" title="Promotional Messages" style={{ marginTop: 16 }}>
        <Alert type="info" showIcon message="Carousel appearance" description="Manage individual advertisement cards in Customer Service → Promotional Messages." style={{ marginBottom: 12 }} />
        <Form.Item label="Enable promotional carousel" name="promotion_enabled" valuePropName="checked"><Switch /></Form.Item>
        <Row gutter={12}>
          <Col span={8}><Form.Item label="Autoplay" name="promotion_autoplay" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Loop" name="promotion_loop" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Hide during human support" name="promotion_hide_during_human" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col span={8}><Form.Item label="Autoplay interval (ms)" name="promotion_interval_ms"><InputNumber min={2500} max={30000} step={500} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Show indicators" name="promotion_show_indicators" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item label="Show arrows" name="promotion_show_arrows" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col span={8}><Form.Item label="Mobile height" name="promotion_mobile_height"><InputNumber min={100} max={360} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Desktop height" name="promotion_desktop_height"><InputNumber min={120} max={480} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={8}><Form.Item label="Card radius" name="promotion_border_radius"><InputNumber min={0} max={40} style={{ width: "100%" }} /></Form.Item></Col>
        </Row>
      </Card>
      <Button type="primary" loading={saving} onClick={saveChatTheme} style={{ marginTop: 16 }}>Save Chat theme</Button>
    </Form>
  </>;

  const identityPanel = <>
    <Alert showIcon type="info" icon={<GlobalOutlined />} style={{ marginBottom: 16 }} message="Route Web Identity & Link Preview" description="Control the browser title, web description, Telegram/Facebook preview and favicon independently for Guide, Chat, Admin and Staff. Once a route favicon is saved here it is the authoritative platform icon; the public shells no longer fall back to BDG/Lovable branding." />
    <Form form={identityForm} layout="vertical">
      {ROUTES.map((route) => <Card key={route.key} size="small" title={`${route.label} web identity`} extra={<span className="muted">{route.description}</span>} style={{ marginBottom: 14 }}>
        <Row gutter={12}>
          <Col xs={24} md={12}><Form.Item name={`${route.key}_browser_title`} label="Browser title"><Input placeholder={`${platformName} — ${route.label}`} maxLength={180} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name={`${route.key}_description`} label="Web description"><Input.TextArea rows={2} maxLength={500} /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col xs={24} md={12}><Form.Item name={`${route.key}_preview_title`} label="Link preview title"><Input maxLength={180} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name={`${route.key}_preview_description`} label="Link preview description"><Input.TextArea rows={2} maxLength={500} /></Form.Item></Col>
        </Row>
        <Form.Item name={`${route.key}_preview_image_url`} label="Description / social preview image URL">
          <Input addonAfter={<Upload showUploadList={false} beforeUpload={(file) => uploadTo(file, identityForm, `${route.key}_preview_image_url`, `${route.label} preview image`)}><Button size="small" icon={<UploadOutlined />}>Upload</Button></Upload>} />
        </Form.Item>
        <Form.Item name={`${route.key}_favicon_url`} label="Favicon URL" extra="When configured, this route icon stays authoritative and is not replaced by BDG/Lovable defaults.">
          <Input addonAfter={<Upload showUploadList={false} beforeUpload={(file) => uploadTo(file, identityForm, `${route.key}_favicon_url`, `${route.label} favicon`)}><Button size="small" icon={<UploadOutlined />}>Upload</Button></Upload>} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, current) => previous[`${route.key}_preview_title`] !== current[`${route.key}_preview_title`] || previous[`${route.key}_preview_description`] !== current[`${route.key}_preview_description`] || previous[`${route.key}_preview_image_url`] !== current[`${route.key}_preview_image_url`]}>
          {({ getFieldValue }) => {
            const image = getFieldValue(`${route.key}_preview_image_url`);
            const title = getFieldValue(`${route.key}_preview_title`) || getFieldValue(`${route.key}_browser_title`) || `${platformName} — ${route.label}`;
            const description = getFieldValue(`${route.key}_preview_description`) || getFieldValue(`${route.key}_description`) || baseSettings?.brand_tagline || "";
            return <Card type="inner" size="small" title="Link preview"><Space align="start">{image ? <img src={image} alt="Preview" style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8 }} /> : null}<div><b>{title}</b><div className="muted" style={{ marginTop: 4 }}>{description || "No preview description yet."}</div></div></Space></Card>;
          }}
        </Form.Item>
      </Card>)}
      <Button type="primary" loading={saving} onClick={saveWebIdentity}>Save Web Identity</Button>
    </Form>
  </>;

  return <Card className="bdg-card" title="Experience & Web Identity" loading={loading}>
    <Tabs activeKey={section} onChange={(key) => setSection(key as Section)} items={[
      { key: "guide", label: "Guide", children: guidePanel },
      { key: "chat", label: "Chat", children: chatPanel },
      { key: "identity", label: "Web Identity", children: identityPanel },
    ]} />
  </Card>;
}

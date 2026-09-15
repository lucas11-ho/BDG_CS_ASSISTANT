import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Divider, Form, Image, Input, InputNumber, message, Modal, Popconfirm, Select, Space, Table, Tag, Typography, Upload } from "antd";
import { DeleteOutlined, EditOutlined, GlobalOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { contentAnalyticsApi } from "@/lib/content-analytics-api";

export const Route = createFileRoute("/_admin/categories")({ component: CategoriesPage });
const { Text } = Typography;

type LocaleOption = { code: string; label?: string; native_name?: string; direction?: string; is_default?: boolean; translated?: boolean };

function sameLocale(a?: string, b?: string) {
  const left = String(a || "").toLowerCase();
  const right = String(b || "").toLowerCase();
  return !!left && !!right && (left === right || left.split("-")[0] === right.split("-")[0]);
}

function CategoriesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [iconUrl, setIconUrl] = useState("");
  const [localeLoading, setLocaleLoading] = useState(false);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [selectedLocale, setSelectedLocale] = useState("en");
  const [translations, setTranslations] = useState<any[]>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setRows((await api.list("categories")) as any[]); }
    catch (error: any) { message.error(error?.message || "Failed to load categories"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const translationFor = (locale: string, list = translations) => list.find((item: any) => sameLocale(item.locale, locale));

  const putLocaleIntoForm = (locale: string, item: any, list: any[], defaultCode: string) => {
    const tr = list.find((entry: any) => sameLocale(entry.locale, locale));
    const isDefault = sameLocale(locale, defaultCode);
    form.setFieldsValue({
      name: tr?.name ?? (isDefault ? item?.name || "" : ""),
      description: tr?.description ?? (isDefault ? item?.description || "" : ""),
    });
  };

  const open = async (item?: any) => {
    const value = item || { name: "", slug: "", description: "", icon: "target", icon_url: "", sort_order: 100 };
    setEditing(value);
    setIconUrl(value.icon_url || "");
    setTranslations([]);
    form.setFieldsValue(value);
    setLocaleLoading(true);
    try {
      const payload: any = item?.id
        ? await contentAnalyticsApi.getCategoryTranslations(item.id)
        : await contentAnalyticsApi.getCategoryLocalePolicy();
      const options: LocaleOption[] = Array.isArray(payload?.locales) ? payload.locales : [{ code: payload?.default_locale || "en", label: "English", is_default: true }];
      const defaultCode = payload?.default_locale || options.find((entry) => entry.is_default)?.code || options[0]?.code || "en";
      const list = Array.isArray(payload?.translations) ? payload.translations : [];
      setLocales(options);
      setDefaultLocale(defaultCode);
      setSelectedLocale(defaultCode);
      setTranslations(list);
      putLocaleIntoForm(defaultCode, value, list, defaultCode);
    } catch (error: any) {
      message.error(error?.message || "Could not load category languages");
      setLocales([{ code: "en", label: "English", is_default: true }]);
      setDefaultLocale("en");
      setSelectedLocale("en");
    } finally { setLocaleLoading(false); }
  };

  const switchLocale = (locale: string) => {
    setSelectedLocale(locale);
    putLocaleIntoForm(locale, editing, translations, defaultLocale);
  };

  const save = async () => {
    const values = await form.validateFields();
    if (!selectedLocale) return;
    try {
      let category = editing;
      if (!editing?.id) {
        if (!sameLocale(selectedLocale, defaultLocale)) throw new Error("Create the category in the platform default language first.");
        category = await api.create("categories", { ...values, icon_url: iconUrl });
        setEditing(category);
      } else {
        const isDefault = sameLocale(selectedLocale, defaultLocale);
        await api.update("categories", editing.id, {
          ...values,
          name: isDefault ? values.name : editing.name,
          description: isDefault ? values.description : editing.description,
          icon_url: iconUrl,
        });
        if (isDefault) category = { ...editing, name: values.name, description: values.description };
      }
      await contentAnalyticsApi.saveCategoryTranslation(category.id, {
        locale: selectedLocale,
        name: values.name,
        description: values.description || "",
      });
      message.success(`Category ${selectedLocale.toUpperCase()} locale saved`);
      await load();
      const refreshed: any = await contentAnalyticsApi.getCategoryTranslations(category.id);
      const list = Array.isArray(refreshed?.translations) ? refreshed.translations : [];
      setTranslations(list);
      setEditing(category);
      putLocaleIntoForm(selectedLocale, category, list, refreshed?.default_locale || defaultLocale);
    } catch (error: any) { message.error(error?.message || "Save failed"); }
  };

  const uploadIcon = async (file: File) => {
    try {
      const uploaded = await api.upload(file);
      setIconUrl(uploaded.url);
      message.success("Category icon uploaded");
    } catch (error: any) { message.error(error?.message || "Icon upload failed"); }
    return false;
  };

  const remove = async (id: number) => {
    try { await api.remove("categories", id); message.success("Category deleted"); await load(); }
    catch (error: any) { message.error(error?.message || "Delete failed"); }
  };

  const removeLocale = async () => {
    if (!editing?.id || sameLocale(selectedLocale, defaultLocale)) return;
    try {
      await contentAnalyticsApi.deleteCategoryTranslation(editing.id, selectedLocale);
      message.success(`${selectedLocale.toUpperCase()} translation removed`);
      const refreshed: any = await contentAnalyticsApi.getCategoryTranslations(editing.id);
      const list = Array.isArray(refreshed?.translations) ? refreshed.translations : [];
      setTranslations(list);
      putLocaleIntoForm(selectedLocale, editing, list, defaultLocale);
      await load();
    } catch (error: any) { message.error(error?.message || "Could not remove translation"); }
  };

  const localeOptions = useMemo(() => locales.map((locale) => ({
    value: locale.code,
    label: `${locale.native_name || locale.label || locale.code}${locale.is_default ? " · Default" : ""}`,
  })), [locales]);

  return <>
    <div className="bdg-filters" style={{ marginBottom: 12 }}>
      <div style={{ flex: 1, color: "#8ea0bd" }}>One category keeps one stable slug/icon/order. Name and description can now be translated for every enabled platform locale.</div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => void open()}>New category</Button>
    </div>
    <Table
      rowKey="id"
      loading={loading}
      dataSource={rows}
      pagination={{ pageSize: 20 }}
      columns={[
        { title: "Icon", width: 80, render: (_, item: any) => item.icon_url ? <Image src={item.icon_url} width={42} height={42} preview={false} style={{ objectFit: "contain", borderRadius: 8 }} /> : <div style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 8, background: "#13243d" }}>{item.icon || "◎"}</div> },
        { title: "Name", dataIndex: "name" },
        { title: "Locale", width: 310, render: (_, item: any) => <Space size={[4, 4]} wrap>{(item.locale_status || []).map((locale: LocaleOption) => <Tag key={locale.code} color={locale.translated ? (locale.is_default ? "blue" : "green") : "default"}>{locale.code.toUpperCase()}{locale.translated ? " ✓" : ""}</Tag>)}</Space> },
        { title: "Slug", dataIndex: "slug" },
        { title: "Description", dataIndex: "description" },
        { title: "Order", dataIndex: "sort_order", width: 90 },
        { title: "Actions", width: 140, render: (_, item: any) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => void open(item)}>Edit</Button><Popconfirm title="Delete category?" onConfirm={() => remove(item.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
      ]}
    />
    <Modal open={!!editing} width={720} title={editing?.id ? "Edit localized category" : "New localized category"} onCancel={() => setEditing(null)} onOk={() => void save()} okText="Save locale" confirmLoading={localeLoading}>
      <Form form={form} layout="vertical">
        <Alert type="info" showIcon icon={<GlobalOutlined />} message="Localized category content" description="Slug, icon and order are shared. Name and description below belong to the selected language. Missing languages automatically fall back to the default category content." style={{ marginBottom: 16 }} />
        <Form.Item label="Language">
          <Select loading={localeLoading} value={selectedLocale} onChange={switchLocale} options={localeOptions} disabled={!editing?.id && !!defaultLocale} />
          <Space style={{ marginTop: 8 }} wrap>
            {locales.map((locale) => {
              const saved = sameLocale(locale.code, defaultLocale) || !!translationFor(locale.code);
              return <Tag key={locale.code} color={sameLocale(locale.code, selectedLocale) ? "blue" : saved ? "green" : "default"}>{locale.code.toUpperCase()}{saved ? " ✓" : ""}</Tag>;
            })}
          </Space>
        </Form.Item>
        <Form.Item name="name" label={`Name · ${selectedLocale.toUpperCase()}`} rules={[{ required: true, message: "Category name is required" }]}><Input maxLength={120} /></Form.Item>
        <Form.Item name="description" label={`Description · ${selectedLocale.toUpperCase()}`}><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
        {!sameLocale(selectedLocale, defaultLocale) && editing?.id && translationFor(selectedLocale) ? <Button danger size="small" onClick={() => void removeLocale()} style={{ marginBottom: 12 }}>Remove this translation</Button> : null}
        <Divider titlePlacement="left">Shared category settings</Divider>
        <Text type="secondary">These settings are shared by every language.</Text>
        <Form.Item name="slug" label="Stable slug" rules={[{ required: true }]} style={{ marginTop: 12 }}><Input /></Form.Item>
        <Form.Item name="icon" label="Fallback built-in icon"><Input placeholder="target" /></Form.Item>
        <Form.Item label="Custom topic icon">
          <Space align="start">
            {iconUrl ? <Image src={iconUrl} width={64} height={64} style={{ objectFit: "contain", borderRadius: 10 }} /> : <div style={{ width: 64, height: 64, border: "1px dashed #53647e", borderRadius: 10 }} />}
            <Space direction="vertical"><Upload showUploadList={false} beforeUpload={uploadIcon} accept="image/png,image/jpeg,image/webp,image/gif"><Button icon={<UploadOutlined />}>Upload icon</Button></Upload>{iconUrl && <Button danger size="small" onClick={() => setIconUrl("")}>Remove icon</Button>}</Space>
          </Space>
        </Form.Item>
        <Form.Item name="sort_order" label="Sort order"><InputNumber min={1} max={999} style={{ width: "100%" }} /></Form.Item>
      </Form>
    </Modal>
  </>;
}

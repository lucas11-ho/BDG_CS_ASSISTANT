import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Drawer, Form, Input, InputNumber, Popconfirm, Select, Space, Table, Tag, Upload, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import RichKnowledgeEditor from "@/components/RichKnowledgeEditor";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/faq")({ component: FaqStudioPage });
const blankDoc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

function FaqStudioPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localeOptions, setLocaleOptions] = useState<{ value: string; label: string }[]>([]);
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [answerJson, setAnswerJson] = useState(blankDoc);
  const [answerHtml, setAnswerHtml] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [faqRows, registry] = await Promise.all([
        api.list("faq") as Promise<any[]>,
        api.getLocaleRegistry(),
      ]);
      setRows(faqRows || []);
      const options = Array.isArray(registry?.locales)
        ? registry.locales.map((locale: any) => ({ value: String(locale.code), label: `${String(locale.code).toUpperCase()} — ${locale.label || locale.code}` }))
        : [];
      setLocaleOptions(options);
      setDefaultLocale(String(registry?.default_locale || options[0]?.value || "en"));
    } catch (error: any) {
      message.error(error?.message || "Could not load FAQs or platform locales");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openEditor = (item?: any) => {
    const current = item || { question: "", topic: "General", locale: defaultLocale || localeOptions[0]?.value || "en", status: "published", priority: 100, keywords: "" };
    setEditing(current);
    setAnswerJson(current.answer_json || blankDoc);
    setAnswerHtml(current.answer_html || "");
    setImageUrls(Array.isArray(current.image_urls) ? current.image_urls : []);
    form.setFieldsValue({ ...current, topic: current.topic || current.category || "General" });
  };
  const closeEditor = () => { setEditing(null); form.resetFields(); setAnswerJson(blankDoc); setAnswerHtml(""); setImageUrls([]); };
  const uploadImage = async (file: File) => (await api.upload(file)).url;
  const addImage = async (file: File) => {
    try { const url = await uploadImage(file); setImageUrls((all) => [...all, url]); message.success("FAQ image added"); }
    catch (error: any) { message.error(error?.message || "Image upload failed"); }
    return false;
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = { ...values, topic: String(values.topic || "General").trim() || "General", answer: answerHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), answer_html: answerHtml, answer_json: answerJson, image_urls: imageUrls };
      if (editing?.id) await api.update("faq", editing.id, payload); else await api.create("faq", payload);
      message.success(editing?.id ? "FAQ updated" : "FAQ created"); closeEditor(); await load();
    } catch (error: any) { if (error?.errorFields) return; message.error(error?.message || "Could not save FAQ"); }
    finally { setSaving(false); }
  };
  const remove = async (id: number) => { try { await api.remove("faq", id); message.success("FAQ deleted"); await load(); } catch (error: any) { message.error(error?.message || "Delete failed"); } };
  const columns = useMemo(() => [
    { title: "Question", dataIndex: "question", render: (v: string) => <b>{v}</b> },
    { title: "Locale", dataIndex: "locale", width: 90, render: (v: string) => <Tag>{String(v || "en").toUpperCase()}</Tag> },
    { title: "Topic", dataIndex: "topic", width: 150, render: (v: string) => <Tag color="blue">{v || "General"}</Tag> },
    { title: "Answer", dataIndex: "answer", ellipsis: true },
    { title: "Status", dataIndex: "status", width: 110, render: (v: string) => <Tag color={v === "published" ? "green" : "gold"}>{v}</Tag> },
    { title: "Actions", width: 150, render: (_: any, row: any) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>Edit</Button><Popconfirm title="Delete this FAQ?" onConfirm={() => remove(row.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ], []);

  return <>
    <Alert showIcon type="info" message="Rich FAQ Studio" description="FAQ answers support formatted text, colors, highlights, links, tables, uploaded images, and a localized Topic. Write the Topic in the same language as the FAQ locale—for example English: Deposit, Hindi: जमा, Myanmar: ငွေသွင်း—so the public FAQ grouping is understandable in every language." style={{ marginBottom: 12 }} />
    <div className="bdg-filters" style={{ marginBottom: 12 }}><div style={{ flex: 1, color: "#8ea0bd" }}>Answers remain backward-compatible with the plain FAQ field. Platform locales: {localeOptions.length ? localeOptions.map((locale) => locale.value).join(", ") : "loading…"}</div><Button onClick={() => void load()}>Refresh</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>New FAQ</Button></div>
    <Table rowKey="id" loading={loading} dataSource={rows} columns={columns as any} pagination={{ pageSize: 20 }} scroll={{ x: 980 }} />
    <Drawer open={!!editing} onClose={closeEditor} width="min(1180px, 96vw)" title={editing?.id ? `Edit FAQ — ${editing.question}` : "New FAQ"} extra={<Space><Button onClick={closeEditor}>Cancel</Button><Button type="primary" loading={saving} onClick={save}>Save</Button></Space>}>
      <Form form={form} layout="vertical">
        <Form.Item name="question" label="Question" rules={[{ required: true }]}><Input placeholder="How do I make a deposit?" /></Form.Item>
        <Space style={{ display: "flex", flexWrap: "wrap" }} align="start">
          <Form.Item name="locale" label="Locale" rules={[{ required: true }]} style={{ width: 250 }}><Select showSearch optionFilterProp="label" loading={loading && !localeOptions.length} options={localeOptions} placeholder="Choose a platform locale" /></Form.Item>
          <Form.Item name="topic" label="Topic (localized)" rules={[{ required: true, message: "Topic is required" }]} style={{ width: 260 }} extra="Use the same language as this FAQ locale."><Input maxLength={160} placeholder="General / Deposit / Withdrawal / Bank" /></Form.Item>
          <Form.Item name="status" label="Status" style={{ width: 180 }}><Select options={["published", "draft", "archived"].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="priority" label="Priority"><InputNumber min={1} max={999} /></Form.Item>
        </Space>
        <Form.Item name="keywords" label="Search keywords and misspellings"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="answer" hidden><Input /></Form.Item>
        <Form.Item label="FAQ answer — rich editor"><RichKnowledgeEditor value={answerJson} onChange={(json, html) => { setAnswerJson(json); setAnswerHtml(html); }} uploadImage={uploadImage} /></Form.Item>
        <Space direction="vertical" style={{ width: "100%" }}><Space><Upload showUploadList={false} beforeUpload={addImage} accept="image/png,image/jpeg,image/webp,image/gif"><Button icon={<UploadOutlined />}>Upload FAQ image</Button></Upload><span style={{ color: "#8ea0bd" }}>{imageUrls.length} image(s)</span></Space>{imageUrls.map((url, index) => <Space key={url} style={{ width: "100%" }}><img src={url} alt={`FAQ ${index + 1}`} style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6 }} /><Input value={url} readOnly /><Button danger onClick={() => setImageUrls((all) => all.filter((_, i) => i !== index))}>Remove</Button></Space>)}</Space>
      </Form>
    </Drawer>
  </>;
}

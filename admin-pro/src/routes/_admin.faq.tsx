import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import RichKnowledgeEditor from "@/components/RichKnowledgeEditor";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/faq")({ component: FaqStudioPage });
const blankDoc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

function faqUpdatePayload(row: any, status?: string) {
  return {
    question: row.question,
    answer: row.answer || "",
    answer_html: row.answer_html || "",
    answer_json: row.answer_json || blankDoc,
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
    locale: row.locale || "en",
    slug: row.slug || "",
    topic: String(row.topic || "General").trim() || "General",
    tag_ids: Array.isArray(row.tag_ids) ? row.tag_ids : [],
    keywords: row.keywords || "",
    priority: Number(row.priority || 100),
    status: status || row.status || "draft",
  };
}

async function inChunks<T>(items: T[], size: number, worker: (item: T) => Promise<unknown>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker));
  }
}

function FaqStudioPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [localeOptions, setLocaleOptions] = useState<{ value: string; label: string }[]>([]);
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [answerJson, setAnswerJson] = useState(blankDoc);
  const [answerHtml, setAnswerHtml] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [localeFilter, setLocaleFilter] = useState<string | undefined>();
  const [topicFilter, setTopicFilter] = useState<string | undefined>();
  const [tagFilter, setTagFilter] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const watchedLocale = Form.useWatch("locale", form);
  const watchedQuestion = Form.useWatch("question", form);
  const watchedTopic = Form.useWatch("topic", form);
  const watchedTagIds = Form.useWatch("tag_ids", form) as number[] | undefined;

  const load = async () => {
    setLoading(true);
    try {
      const [faqRows, registry, tagRows] = await Promise.all([
        api.list("faq") as Promise<any[]>,
        api.getLocaleRegistry(),
        api.list("tags") as Promise<any[]>,
      ]);
      setRows(faqRows || []);
      setTags(tagRows || []);
      const options = Array.isArray(registry?.locales)
        ? registry.locales.map((locale: any) => ({ value: String(locale.code), label: `${String(locale.code).toUpperCase()} — ${locale.label || locale.code}` }))
        : [];
      setLocaleOptions(options);
      setDefaultLocale(String(registry?.default_locale || options[0]?.value || "en"));
      setSelectedRowKeys([]);
    } catch (error: any) {
      message.error(error?.message || "Could not load FAQs or platform locales");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const topicOptions = useMemo(() => [...new Set(rows.map((row) => String(row.topic || "General").trim() || "General"))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value })), [rows]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !needle || [row.question, row.slug, row.answer, row.keywords, row.topic, ...(row.tags || []).flatMap((tag: any) => [tag.name, tag.slug])]
        .some((value) => String(value || "").toLowerCase().includes(needle));
      const matchesLocale = !localeFilter || String(row.locale || "en") === localeFilter;
      const topic = String(row.topic || "General").trim() || "General";
      const matchesTopic = !topicFilter || topic === topicFilter;
      const matchesTag = !tagFilter || (row.tag_ids || []).map(Number).includes(Number(tagFilter));
      const matchesStatus = !statusFilter || String(row.status || "draft") === statusFilter;
      return matchesSearch && matchesLocale && matchesTopic && matchesTag && matchesStatus;
    });
  }, [rows, search, localeFilter, topicFilter, tagFilter, statusFilter]);

  const selectedRows = useMemo(() => {
    const selected = new Set(selectedRowKeys.map(String));
    return rows.filter((row) => selected.has(String(row.id)));
  }, [rows, selectedRowKeys]);

  const openEditor = (item?: any) => {
    const current = item || { question: "", slug: "", topic: "General", tag_ids: [], locale: defaultLocale || localeOptions[0]?.value || "en", status: "published", priority: 100, keywords: "" };
    setEditing(current);
    setAnswerJson(current.answer_json || blankDoc);
    setAnswerHtml(current.answer_html || "");
    setImageUrls(Array.isArray(current.image_urls) ? current.image_urls : []);
    form.setFieldsValue({ ...current, slug: current.slug || "", topic: current.topic || "General", tag_ids: current.tag_ids || [] });
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
      const payload = { ...values, slug: String(values.slug || "").trim(), topic: String(values.topic || "General").trim() || "General", tag_ids: values.tag_ids || [], answer: answerHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), answer_html: answerHtml, answer_json: answerJson, image_urls: imageUrls };
      if (editing?.id) await api.update("faq", editing.id, payload); else await api.create("faq", payload);
      message.success(editing?.id ? "FAQ updated" : "FAQ created"); closeEditor(); await load();
    } catch (error: any) { if (error?.errorFields) return; message.error(error?.message || "Could not save FAQ"); }
    finally { setSaving(false); }
  };
  const remove = async (id: number) => { try { await api.remove("faq", id); message.success("FAQ deleted"); await load(); } catch (error: any) { message.error(error?.message || "Delete failed"); } };

  const bulkSetStatus = async (status: "published" | "draft") => {
    if (!selectedRows.length) return;
    setBulkBusy(true);
    try {
      await inChunks(selectedRows, 8, (row) => api.update("faq", row.id, faqUpdatePayload(row, status)));
      message.success(`${selectedRows.length} FAQ${selectedRows.length === 1 ? "" : "s"} moved to ${status}`);
      await load();
    } catch (error: any) { message.error(error?.message || `Bulk ${status} failed`); }
    finally { setBulkBusy(false); }
  };

  const bulkDelete = async () => {
    if (!selectedRows.length) return;
    setBulkBusy(true);
    try {
      await inChunks(selectedRows, 8, (row) => api.remove("faq", row.id));
      message.success(`${selectedRows.length} selected FAQ${selectedRows.length === 1 ? "" : "s"} deleted`);
      await load();
    } catch (error: any) { message.error(error?.message || "Bulk delete failed"); }
    finally { setBulkBusy(false); }
  };

  const clearFilters = () => { setSearch(""); setLocaleFilter(undefined); setTopicFilter(undefined); setTagFilter(undefined); setStatusFilter(undefined); };
  const selectAllFiltered = () => setSelectedRowKeys(filteredRows.map((row) => row.id));

  const columns = useMemo(() => [
    { title: "Question", dataIndex: "question", render: (value: string) => <b>{value}</b> },
    { title: "Stable slug", dataIndex: "slug", width: 190, render: (value: string) => <code>{value || "—"}</code> },
    { title: "Locale", dataIndex: "locale", width: 100, render: (value: string) => <Tag>{String(value || "en").toUpperCase()}</Tag> },
    { title: "FAQ Topic", width: 170, render: (_: any, row: any) => <Tag color="blue">{row.topic || "General"}</Tag> },
    { title: "Tags", width: 220, render: (_: any, row: any) => <Space wrap>{(row.tags || []).map((tag: any) => <Tag key={`${row.id}-tag-${tag.id}`} color={tag.color || "blue"}>{tag.name || tag.slug}</Tag>)}</Space> },
    { title: "Answer", dataIndex: "answer", ellipsis: true },
    { title: "Status", dataIndex: "status", width: 115, render: (value: string) => <Tag color={value === "published" ? "green" : value === "archived" ? "default" : "gold"}>{value || "draft"}</Tag> },
    { title: "Actions", width: 150, render: (_: any, row: any) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>Edit</Button><Popconfirm title="Delete this FAQ?" description="This removes the selected FAQ from the current platform." onConfirm={() => remove(row.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ], []);

  return <>
    <Alert showIcon type="info" message="FAQ Management" description="Each FAQ has one localized Topic that is independent from Guide Topics/Categories, one stable slug, and any number of independent Tags." style={{ marginBottom: 12 }} />

    <div className="bdg-filters" style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <Input allowClear prefix={<SearchOutlined />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question, answer, keywords or FAQ topic" style={{ minWidth: 280, flex: "1 1 320px" }} />
      <Select allowClear showSearch optionFilterProp="label" value={localeFilter} onChange={setLocaleFilter} options={localeOptions} placeholder="All locales" style={{ width: 190 }} />
      <Select allowClear showSearch optionFilterProp="label" value={topicFilter} onChange={setTopicFilter} options={topicOptions} placeholder="All FAQ topics" style={{ width: 180 }} />
      <Select allowClear showSearch optionFilterProp="label" value={tagFilter} onChange={setTagFilter} options={tags.filter((tag) => tag.status === "active").map((tag) => ({ value: tag.id, label: tag.name }))} placeholder="All tags" style={{ width: 180 }} />
      <Select allowClear value={statusFilter} onChange={setStatusFilter} options={["published", "draft", "archived"].map((value) => ({ value, label: value }))} placeholder="All statuses" style={{ width: 150 }} />
      <Button onClick={clearFilters}>Clear filters</Button>
      <Button icon={<ReloadOutlined />} onClick={() => void load()}>Refresh</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>New FAQ</Button>
    </div>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minHeight: 42, marginBottom: 10 }}>
      <Tag color="blue">{filteredRows.length} filtered</Tag>
      {selectedRowKeys.length > 0 ? <>
        <Tag color="purple">{selectedRowKeys.length} selected</Tag>
        <Button size="small" onClick={selectAllFiltered} disabled={selectedRowKeys.length === filteredRows.length}>Select all {filteredRows.length} filtered</Button>
        <Button size="small" onClick={() => setSelectedRowKeys([])}>Clear selection</Button>
        <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={bulkBusy} onClick={() => void bulkSetStatus("published")}>Publish selected</Button>
        <Button size="small" icon={<StopOutlined />} loading={bulkBusy} onClick={() => void bulkSetStatus("draft")}>Move to draft</Button>
        <Popconfirm title={`Delete ${selectedRows.length} selected FAQ${selectedRows.length === 1 ? "" : "s"}?`} description="This action affects the current platform only." okText="Delete selected" okButtonProps={{ danger: true }} onConfirm={() => void bulkDelete()}>
          <Button size="small" danger icon={<DeleteOutlined />} loading={bulkBusy}>Delete selected</Button>
        </Popconfirm>
      </> : <span style={{ color: "#8ea0bd" }}>Select FAQ rows to show bulk publish, draft and delete actions.</span>}
    </div>

    <Table
      rowKey="id"
      loading={loading}
      dataSource={filteredRows}
      columns={columns as any}
      rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys, preserveSelectedRowKeys: true }}
      pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total) => `${total} FAQ${total === 1 ? "" : "s"}` }}
      scroll={{ x: 1020 }}
    />

    <Drawer open={!!editing} onClose={closeEditor} width="min(1180px, 96vw)" title={editing?.id ? `Edit FAQ — ${editing.question}` : "New FAQ"} extra={<Space><Button onClick={closeEditor}>Cancel</Button><Button type="primary" loading={saving} onClick={save}>Save</Button></Space>}>
      <Form form={form} layout="vertical">
        <Form.Item name="question" label="Question" rules={[{ required: true }]}><Input placeholder="How do I make a deposit?" /></Form.Item>
        <Form.Item name="slug" label="Stable slug" extra="Leave blank for a new FAQ to generate it automatically from the question. Once generated, changing the question does not change this slug."><Input placeholder="how-do-i-make-a-deposit" /></Form.Item>
        <Space style={{ display: "flex", flexWrap: "wrap" }} align="start">
          <Form.Item name="locale" label="Locale" rules={[{ required: true }]} style={{ width: 250 }}><Select showSearch optionFilterProp="label" loading={loading && !localeOptions.length} options={localeOptions} placeholder="Choose a platform locale" /></Form.Item>
          <Form.Item name="topic" label="FAQ Topic" rules={[{ required: true }]} style={{ width: 260 }} extra="FAQ Topics are independent from Guide Topics/Categories and can be localized for each FAQ language."><Input placeholder="Deposit" maxLength={160} /></Form.Item>
          <Form.Item name="status" label="Status" style={{ width: 180 }}><Select options={["published", "draft", "archived"].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="priority" label="Priority"><InputNumber min={1} max={999} /></Form.Item>
        </Space>
        <Form.Item name="tag_ids" label="Tags" extra="Optional flexible labels. Manage your own Tags from Content → Tags."><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={tags.filter((tag) => tag.status === "active").map((tag) => ({ value: tag.id, label: tag.name }))} /></Form.Item>
        <Form.Item name="keywords" label="Search keywords and misspellings"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="answer" hidden><Input /></Form.Item>
        <Form.Item label="FAQ answer — rich editor"><RichKnowledgeEditor
          value={answerJson}
          locale={String(watchedLocale || editing?.locale || defaultLocale || "en")}
          aiContext={{
            documentType: "faq",
            title: String(watchedQuestion || editing?.question || ""),
            summary: String(watchedTopic || editing?.topic || "General"),
            languageLabel: String(watchedLocale || editing?.locale || defaultLocale || "en").toUpperCase(),
            tags: tags.filter((tag) => (watchedTagIds || editing?.tag_ids || []).map(Number).includes(Number(tag.id))).map((tag) => tag.name),
          }}
          onChange={(json, html) => { setAnswerJson(json); setAnswerHtml(html); }}
          uploadImage={uploadImage}
        /></Form.Item>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space><Upload showUploadList={false} beforeUpload={addImage} accept="image/png,image/jpeg,image/webp,image/gif"><Button icon={<UploadOutlined />}>Upload FAQ image</Button></Upload><span style={{ color: "#8ea0bd" }}>{imageUrls.length} image(s)</span></Space>
          {imageUrls.map((url, index) => <Space key={`${url}-${index}`} style={{ width: "100%" }}><img src={url} alt={`FAQ ${index + 1}`} style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6 }} /><Input value={url} readOnly /><Button danger onClick={() => setImageUrls((all) => all.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></Space>)}
        </Space>
      </Form>
    </Drawer>
  </>;
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import RichKnowledgeEditor from "@/components/RichKnowledgeEditor";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/ai-content-studio")({
  component: AiContentStudioPage,
});

const blankDocument = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

function AiContentStudioPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [richJson, setRichJson] = useState(blankDocument);
  const [richHtml, setRichHtml] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [actionButtons, setActionButtons] = useState<any[]>([]);
  const [testMessage, setTestMessage] = useState("");
  const [testLanguage, setTestLanguage] = useState("my");
    const [testResult, setTestResult] = useState<any | null>(null);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [items, buttons, context] = await Promise.all([api.list("ai-content"),api.list("action-buttons"),api.getPlatformContext()]);
      if (!(context as any)?.platform) throw new Error("Active platform context is unavailable");
      setRows(items as any[]);
      setActionButtons(buttons as any[]);
    } catch (error: any) {
      message.error(error?.message || "Failed to load Menu & Images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEditor = (item?: any) => {
    const current = item || {
      title: "",
      intent_key: "",
      locale: "my",
      status: "draft",
      priority: 100,
      confidence_threshold: 55,
      category: "",
      matching_aliases: { my: "", en: "", id: "", zh: "", hi: "" },
      image_delivery: "after_answer",
      version_label: "v1",
      approval_status: "draft",
      platform_scope: "all",
      route_policy: "answer_only",
      source_type: "prompt_image",
    };
    setEditing(current);
    setRichJson(current.rich_json || blankDocument);
    setRichHtml(current.rich_html || "");
    setImages(Array.isArray(current.image_urls) ? current.image_urls : []);
    form.setFieldsValue({
      ...current,
      platform_scope: Array.isArray(current.platform_scope)
        ? current.platform_scope
        : String(current.platform_scope || "all").split(/[\s,|\n]+/).filter(Boolean),
    });
  };

  const closeEditor = () => {
    setEditing(null);
    form.resetFields();
    setImages([]);
    setRichJson(blankDocument);
    setRichHtml("");
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        ...values,
        source_type: "prompt_image",
        rich_json: richJson,
        rich_html: richHtml,
        rich_json_hi: editing?.rich_json_hi || blankDocument,
        rich_html_hi: editing?.rich_html_hi || "",
        image_urls: images,
      };
      if (editing?.id) await api.update("ai-content", editing.id, payload);
      else await api.create("ai-content", payload);
      message.success(editing?.id ? "Menu item updated" : "Menu item created");
      closeEditor();
      await load();
    } catch (error: any) {
      message.error(error?.message || "Failed to save menu item");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.remove("ai-content", id);
      message.success("Menu item archived");
      await load();
    } catch (error: any) {
      message.error(error?.message || "Delete failed");
    }
  };

  const uploadImage = async (file: File) => (await api.upload(file)).url;

  const uploadResponseImage = async (file: File) => {
    try {
      const url = await uploadImage(file);
      setImages((all) => [...all, url]);
      message.success("Menu image uploaded");
    } catch (error: any) {
      message.error(error?.message || "Upload failed");
    }
    return false;
  };

  const runTest = async () => {
    if (!testMessage.trim()) return;
    setTesting(true);
    try {
      setTestResult(await api.testAiContent(testMessage.trim(), testLanguage));
    } catch (error: any) {
      message.error(error?.message || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: "Menu item",
        key: "title",
        render: (_: any, item: any) => (
          <div>
            <strong>{item.title}</strong>
            <div style={{ color: "#8ea0bd", fontSize: 12 }}>{item.intent_key}</div>
          </div>
        ),
      },
      {
        title: "Locale",
        dataIndex: "locale",
        width: 90,
        render: (value: string) => <Tag>{String(value || "all").toUpperCase()}</Tag>,
      },
      {
        title: "Live status",
        width: 150,
        render: (_: any, item: any) => {
          const live = item.status === "published" && item.approval_status === "approved";
          return <Tag color={live ? "green" : "gold"}>{live ? "Live" : "Not live"}</Tag>;
        },
      },
      {
        title: "Images",
        dataIndex: "image_urls",
        width: 80,
        render: (value: string[]) => (Array.isArray(value) ? value.length : 0),
      },
      {
        title: "Updated",
        dataIndex: "updated_at",
        width: 190,
        render: (value: string) => (value ? new Date(value).toLocaleString() : "—"),
      },
      {
        title: "Actions",
        width: 150,
        render: (_: any, item: any) => (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(item)}>
              Edit
            </Button>
            <Popconfirm
              title="Archive this menu item?"
              description="It will stop being available to the live assistant immediately."
              onConfirm={() => remove(item.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 12 }}>
        Menu & Images
      </Typography.Title>

      <Alert
        showIcon
        type="success"
        message="Approved menu and media source"
        description="Create menu-specific facts, approved images, and optional buttons here. General assistant knowledge belongs in AI Knowledge. Draft or unapproved menu items are never sent to the live assistant."
        style={{ marginBottom: 12 }}
      />

      <Card className="bdg-card" size="small" title="Hybrid Menu & Images Match Tester" style={{ marginBottom: 12 }}>
        <Space.Compact style={{ width: "100%" }}>
          <Select
            value={testLanguage}
            onChange={setTestLanguage}
            options={[
              { value: "my", label: "Burmese" },
              { value: "en", label: "English" },
              { value: "id", label: "Indonesian" },
              { value: "zh", label: "Chinese" },
              { value: "hi", label: "Hindi" },
              { value: "auto", label: "Automatic" },
            ]}
            style={{ width: 145 }}
          />
          <Input
            value={testMessage}
            onChange={(event) => setTestMessage(event.target.value)}
            onPressEnter={runTest}
          />
          <Button icon={<ExperimentOutlined />} type="primary" loading={testing} onClick={runTest}>
            Test
          </Button>
        </Space.Compact>
        {testResult ? (
          <div style={{ marginTop: 12 }}>
            <Space wrap>
              <Tag color={testResult.ok ? "green" : "red"}>{testResult.ok ? "AI replied" : "Provider fallback"}</Tag>
              <Tag color="blue">Server-owned hybrid matching</Tag>
              <Tag>{testResult.catalog_size || 0} live menu candidate(s)</Tag>
              {testResult.selected_content ? (
                <Tag color="purple">Matched: {testResult.selected_content.title}</Tag>
              ) : (
                <Tag>General Assistant Setup answer</Tag>
              )}
            </Space>
            {testResult.selected_content ? <Card size="small" style={{marginTop:10}}><Space wrap>
              <Tag color="geekblue">Score {Math.round(Number(testResult.selected_content.match_score || 0))}</Tag>
              <Tag>Threshold {Math.round(Number(testResult.selected_content.match_threshold || 0))}</Tag>
              <Tag>Method {testResult.selected_content.match_method || "—"}</Tag>
              <Tag>Phrase {testResult.selected_content.matched_phrase || "—"}</Tag>
              <Tag color={(testResult.selected_content.image_urls || []).length ? "green" : "gold"}>{(testResult.selected_content.image_urls || []).length} approved image(s)</Tag>
            </Space></Card> : null}
            {Array.isArray(testResult.match_diagnostics?.candidates) && testResult.match_diagnostics.candidates.length ? <Table size="small" style={{marginTop:10}} pagination={false} rowKey={(r:any)=>String(r.id || r.title)} dataSource={testResult.match_diagnostics.candidates.slice(0,8)} columns={[
              {title:"Candidate",dataIndex:"title",ellipsis:true},
              {title:"Score",dataIndex:"score",width:80},
              {title:"Threshold",dataIndex:"threshold",width:90},
              {title:"Method",dataIndex:"method",width:150},
              {title:"Matched phrase",dataIndex:"matched_phrase",ellipsis:true},
              {title:"Images",dataIndex:"images",width:80,render:(v:number)=>v||0},
            ] as any}/> : null}
            {testResult.reply ? (
              <Typography.Paragraph style={{ marginTop: 10, marginBottom: 0, whiteSpace: "pre-wrap" }}>
                {testResult.reply}
              </Typography.Paragraph>
            ) : null}
            {testResult.provider_error ? (
              <Alert style={{ marginTop: 8 }} type="error" showIcon message={testResult.provider_error} />
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="bdg-filters" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, color: "#8ea0bd" }}>
          A menu item becomes available only when both Status = Published and Approval = Approved.
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
          New menu item
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns as any}
        pagination={{ pageSize: 20 }}
      />

      <Drawer
        open={!!editing}
        onClose={closeEditor}
        width="min(1050px, 96vw)"
        title={editing?.id ? `Edit Menu & Image — ${editing.title}` : "Create Menu & Image"}
        extra={
          <Space>
            <Button onClick={closeEditor}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={save}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Tabs
            items={[
              {
                key: "match",
                label: "Menu matching",
                children: (
                  <>
                    <Row gutter={12}>
                      <Col xs={24} md={12}>
                        <Form.Item name="title" label="Menu name" rules={[{ required: true }]}>
                          <Input placeholder="Jerry Special Fried Rice" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="intent_key" label="Stable item key" rules={[{ required: true }]}>
                          <Input placeholder="jerry-special-fried-rice" />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item name="locale" label="Language">
                          <Select
                            options={[
                              { value: "my", label: "Burmese" },
                              { value: "en", label: "English" },
                              { value: "id", label: "Indonesian" },
                              { value: "zh", label: "Chinese" },
                              { value: "hi", label: "Hindi" },
                              { value: "all", label: "All languages" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item name="category" label="Category">
                          <Input placeholder="fried-rice" />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item name="confidence_threshold" label="Match threshold">
                          <InputNumber min={25} max={85} style={{width:"100%"}} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item name="status" label="Status">
                          <Select options={["draft", "published", "archived"].map((value) => ({ value, label: value }))} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item name="approval_status" label="Approval">
                          <Select
                            options={[
                              { value: "draft", label: "Draft" },
                              { value: "approved", label: "Approved" },
                              { value: "archived", label: "Archived" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Item name="priority" label="Menu order">
                          <InputNumber min={1} max={999} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col xs={24} md={12}>
                        <Form.Item name="route_policy" label="Customer action">
                          <Select
                            options={[
                              { value: "answer_only", label: "Answer only" },
                              { value: "action_optional", label: "Optional approved button" },
                              { value: "human_escalation", label: "Human support when needed" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Alert type="info" showIcon message="Hybrid matching" description="Exact examples are strongest. Localized aliases, title/category tokens, and semantic character similarity provide safe fallback matching. The server selects the item and its approved media before calling the provider." style={{marginBottom:12}} />
                    <Row gutter={12}>
                      {[["my","Burmese aliases"],["en","English aliases"],["id","Indonesian aliases"],["zh","Chinese aliases"],["hi","Hindi aliases"]].map(([code,label])=><Col xs={24} md={12} key={code}><Form.Item name={["matching_aliases",code]} label={label}><Input.TextArea rows={3} placeholder="One phrase or alias per line" /></Form.Item></Col>)}
                    </Row>
                    <Row gutter={12}>
                      <Col xs={24} md={12}>
                        <Form.Item name="positive_examples" label="Customer messages that should match">
                          <Input.TextArea
                            rows={6}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="negative_examples" label="Messages that must not match">
                          <Input.TextArea
                            rows={6}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="ai_instruction" label="Item-specific instruction">
                      <Input.TextArea
                        rows={5}
                        placeholder="Use this item only when it genuinely matches. Describe it appetizingly, but never invent price, availability, delivery, or payment facts."
                      />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: "facts",
                label: "Approved facts",
                children: (
                  <>
                    <Alert
                      type="warning"
                      showIcon
                      message="Only enter verified production facts"
                      description="Include the real price, ingredients, availability, delivery-free conditions, accepted payment methods, and any limits. The assistant is forbidden from inventing missing facts."
                      style={{ marginBottom: 12 }}
                    />
                    <Form.Item name="knowledge_content" label="Verified menu facts">
                      <Input.TextArea
                        rows={12}
                        placeholder={"Menu: Jerry Special Fried Rice\nPrice: [real price]\nIngredients: [verified ingredients]\nAvailability: [verified status]\nFree delivery: [exact conditions]\nPayments: KBZPay, WavePay, [other verified methods]"}
                      />
                    </Form.Item>
                    <Form.Item name="example_answers" label="Approved response examples">
                      <Input.TextArea
                        rows={7}
                        placeholder="Add one or two Burmese/English examples that demonstrate the desired appetizing, casual style without changing the facts."
                      />
                    </Form.Item>
                    <Form.Item name="required_fields" label="Information to ask before ordering">
                      <Input.TextArea rows={4} placeholder={"quantity\ndelivery area\nphone number\npayment method"} />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: "visual",
                label: "Rich menu description",
                children: (
                  <RichKnowledgeEditor
                    value={richJson}
                    onChange={(json, html) => {
                      setRichJson(json);
                      setRichHtml(html);
                    }}
                    uploadImage={uploadImage}
                  />
                ),
              },
              {
                key: "images",
                label: `Images (${images.length})`,
                children: (
                  <>
                    <Alert
                      type="info"
                      showIcon
                      message="The server attaches only approved images from the selected item. The provider writes plain text and cannot choose a different image."
                      style={{ marginBottom: 12 }}
                    />
                    <Row gutter={12}>
                      <Col xs={24} md={8}>
                        <Form.Item name="image_delivery" label="Image delivery">
                          <Select
                            options={[
                              { value: "after_answer", label: "After the answer" },
                              { value: "never", label: "Never send automatically" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="version_label" label="Content version">
                          <Input placeholder="v1" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8} style={{ paddingTop: 30 }}>
                        <Upload
                          showUploadList={false}
                          beforeUpload={uploadResponseImage}
                          accept="image/png,image/jpeg,image/webp,image/gif"
                        >
                          <Button icon={<UploadOutlined />}>Upload menu image</Button>
                        </Upload>
                      </Col>
                    </Row>
                    <Image.PreviewGroup>
                      <Space wrap size={12}>
                        {images.map((url) => (
                          <Card
                            key={url}
                            size="small"
                            cover={<Image src={url} width={180} height={120} style={{ objectFit: "cover" }} />}
                            actions={[
                              <DeleteOutlined
                                key="delete"
                                onClick={() => setImages((all) => all.filter((item) => item !== url))}
                              />,
                            ]}
                          >
                            <Card.Meta description={url.split("/").pop()} />
                          </Card>
                        ))}
                      </Space>
                    </Image.PreviewGroup>
                  </>
                ),
              },
              {
                key: "buttons",
                label: "Optional buttons",
                children: (
                  <>
                    <Alert
                      showIcon
                      type="info"
                      style={{ marginBottom: 12 }}
                      message="Only assigned active buttons may be returned with this menu item."
                    />
                    <Form.Item name="button_ids" label="Approved buttons">
                      <Select
                        mode="multiple"
                        optionFilterProp="label"
                        placeholder="Choose Order Now, View Menu, or Contact buttons"
                        options={actionButtons
                          .filter((button) => button.status === "active")
                          .map((button) => ({ value: button.id, label: `${button.label} — ${button.action_type}` }))}
                      />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
    </>
  );
}

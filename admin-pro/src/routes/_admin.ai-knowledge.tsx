import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Drawer, Form, Input, Popconfirm, Space, Switch, Table, Tag, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/ai-knowledge")({ component: AiKnowledgePage });

type KnowledgeRow = {
  id: number;
  title: string;
  content: string;
  keywords?: string;
  priority?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

function AiKnowledgePage() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [editing, setEditing] = useState<KnowledgeRow | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.list("ai-knowledge") as KnowledgeRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (error: any) {
      message.error(error?.message || "Could not load AI Knowledge");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openEditor = (row?: KnowledgeRow) => {
    setEditing(row || null);
    form.setFieldsValue({
      question: row?.title || "",
      type: row?.keywords || "General",
      answer: row?.content || "",
      enabled: row ? row.status !== "inactive" : true,
    });
  };

  const closeEditor = () => {
    setEditing(undefined);
    form.resetFields();
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        title: String(values.question || "").trim(),
        content: String(values.answer || "").trim(),
        keywords: String(values.type || "General").trim(),
        priority: 100,
        status: values.enabled === false ? "inactive" : "active",
      };
      if (editing?.id) await api.update("ai-knowledge", editing.id, payload);
      else await api.create("ai-knowledge", payload);
      message.success(editing?.id ? "AI Knowledge updated" : "AI Knowledge added");
      closeEditor();
      await load();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || "Could not save AI Knowledge");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.remove("ai-knowledge", id);
      message.success("AI Knowledge deleted");
      await load();
    } catch (error: any) {
      message.error(error?.message || "Could not delete AI Knowledge");
    }
  };

  const columns = useMemo(() => [
    { title: "Question", dataIndex: "title", render: (value: string) => <b>{value}</b> },
    { title: "Type", dataIndex: "keywords", width: 180, render: (value: string) => <Tag>{value || "General"}</Tag> },
    { title: "Answer", dataIndex: "content", ellipsis: true },
    { title: "Enabled", dataIndex: "status", width: 100, render: (value: string) => <Tag color={value === "inactive" ? "default" : "green"}>{value === "inactive" ? "Off" : "On"}</Tag> },
    {
      title: "Actions",
      width: 150,
      render: (_: unknown, row: KnowledgeRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>Edit</Button>
          <Popconfirm title="Delete this AI Knowledge entry?" onConfirm={() => void remove(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], []);

  return <>
    <Alert
      showIcon
      type="info"
      message="AI Knowledge"
      description="Private knowledge for the AI Assistant only. It is separate from Guide-page FAQs and does not count toward the 24,000-character Assistant Setup runtime. Only relevant enabled entries are added to each AI request."
      style={{ marginBottom: 12 }}
    />
    <div className="bdg-filters" style={{ marginBottom: 12 }}>
      <div style={{ flex: 1, color: "#8ea0bd" }}>Add approved platform knowledge using only Question, Type, and Answer.</div>
      <Button onClick={() => void load()}>Refresh</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>Add Knowledge</Button>
    </div>
    <Table rowKey="id" loading={loading} dataSource={rows} columns={columns as any} pagination={{ pageSize: 20 }} />
    <Drawer
      open={editing !== undefined}
      onClose={closeEditor}
      width="min(760px, 96vw)"
      title={editing?.id ? "Edit AI Knowledge — " + editing.title : "Add AI Knowledge"}
      extra={<Space><Button onClick={closeEditor}>Cancel</Button><Button type="primary" loading={saving} onClick={() => void save()}>Save</Button></Space>}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="question" label="Question" rules={[{ required: true, message: "Enter the customer question" }]}>
          <Input maxLength={500} showCount placeholder="How can I change my withdrawal bank account?" />
        </Form.Item>
        <Form.Item name="type" label="Type" rules={[{ required: true, message: "Enter a type" }]}>
          <Input maxLength={200} placeholder="Withdrawal, Deposit, Account, Promotion..." />
        </Form.Item>
        <Form.Item name="answer" label="Answer" rules={[{ required: true, message: "Enter the approved answer" }]}>
          <Input.TextArea rows={12} maxLength={20000} showCount placeholder="Enter the approved information the AI should use when this knowledge matches a customer question." />
        </Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch checkedChildren="On" unCheckedChildren="Off" />
        </Form.Item>
      </Form>
    </Drawer>
  </>;
}

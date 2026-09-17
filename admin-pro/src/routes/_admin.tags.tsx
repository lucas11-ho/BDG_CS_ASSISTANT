import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Form, Input, InputNumber, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, TagsOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/tags")({ component: TagManagerPage });

function TagManagerPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setRows((await api.list("tags")) as any[]); }
    catch (error: any) { message.error(error?.message || "Could not load tags"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openEditor = (row?: any) => {
    const current = row || { name: "", slug: "", color: "#1677ff", status: "active", sort_order: 100 };
    setEditing(current);
    form.setFieldsValue(current);
  };
  const close = () => { setEditing(null); form.resetFields(); };

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing?.id) await api.update("tags", editing.id, values);
      else await api.create("tags", values);
      message.success(editing?.id ? "Tag updated" : "Tag created");
      close();
      await load();
    } catch (error: any) {
      if (!error?.errorFields) message.error(error?.message || "Could not save tag");
    } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    try { await api.remove("tags", id); message.success("Tag deleted"); await load(); }
    catch (error: any) { message.error(error?.message || "Could not delete tag"); }
  };

  return <>
    <div className="bdg-filters" style={{ marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <h2 style={{ margin: 0 }}><TagsOutlined /> Tags</h2>
        <div style={{ color: "#8ea0bd", fontSize: 12 }}>Manage your own reusable labels for Guides and FAQs. Tags are independent from Topics.</div>
      </div>
      <Button icon={<ReloadOutlined />} onClick={() => void load()}>Refresh</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>New tag</Button>
    </div>

    <Alert
      showIcon
      type="info"
      style={{ marginBottom: 12 }}
      message="Tags do not change Topics"
      description="Use Tags for flexible labels such as Tips & Tricks, Agent, Game, VIP or Beginner. The stable slug is generated from the tag name when left blank and should normally stay unchanged after creation."
    />

    <Table
      rowKey="id"
      loading={loading}
      dataSource={rows}
      pagination={{ pageSize: 30 }}
      columns={[
        { title: "Tag", render: (_: any, row: any) => <Space><span style={{ width: 12, height: 12, borderRadius: 99, background: row.color || "#1677ff", display: "inline-block" }} /><b>{row.name}</b></Space> },
        { title: "Stable slug", dataIndex: "slug", render: (value: string) => <code>{value}</code> },
        { title: "Guides", dataIndex: "guide_count", width: 90 },
        { title: "FAQs", dataIndex: "faq_count", width: 90 },
        { title: "Status", dataIndex: "status", width: 110, render: (value: string) => <Tag color={value === "active" ? "green" : "default"}>{value}</Tag> },
        { title: "Order", dataIndex: "sort_order", width: 90 },
        { title: "Actions", width: 145, render: (_: any, row: any) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>Edit</Button><Popconfirm title="Delete this tag?" description="The tag will be removed from Guides and FAQs, but the content will not be deleted." onConfirm={() => void remove(row.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
      ] as any}
    />

    <Drawer open={!!editing} onClose={close} width="min(560px, 96vw)" title={editing?.id ? `Edit tag — ${editing.name}` : "Create tag"} extra={<Space><Button onClick={close}>Cancel</Button><Button type="primary" loading={saving} onClick={() => void save()}>Save</Button></Space>}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Tag name" rules={[{ required: true, message: "Tag name is required" }]}><Input placeholder="Tips & Tricks" /></Form.Item>
        <Form.Item name="slug" label="Stable slug" extra="Leave blank when creating a tag to generate it from the tag name. Avoid changing it later unless you intentionally want a new stable identifier."><Input placeholder="tips-tricks" /></Form.Item>
        <Space align="start" style={{ display: "flex" }}>
          <Form.Item name="color" label="Display color"><Input type="color" style={{ width: 90, padding: 4 }} /></Form.Item>
          <Form.Item name="status" label="Status" style={{ width: 170 }}><Select options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} /></Form.Item>
          <Form.Item name="sort_order" label="Order"><InputNumber min={0} max={9999} /></Form.Item>
        </Space>
      </Form>
    </Drawer>
  </>;
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { api, getActiveAdminPlatformRoute } from "@/lib/api";

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

type ImportPreviewRow = {
  row_number: number;
  question: string;
  type: string;
  answer: string;
  enabled: boolean;
  action: "create" | "update" | "skip";
  existing_id?: number | null;
  error?: string;
};

type ImportPreview = {
  ok: boolean;
  filename: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  create_rows: number;
  update_rows: number;
  rows: ImportPreviewRow[];
};

function AiKnowledgePage() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [editing, setEditing] = useState<KnowledgeRow | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = (await api.list("ai-knowledge")) as KnowledgeRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (error: any) {
      message.error(error?.message || "Could not load AI Knowledge");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const typeOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => String(row.keywords || "General").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value })),
    [rows],
  );

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

  const downloadTemplate = async () => {
    try {
      await api.downloadKnowledgeImportTemplate();
      message.success("AI Knowledge Excel template downloaded");
    } catch (error: any) {
      message.error(error?.message || "Could not download the AI Knowledge template");
    }
  };

  const previewImport = async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      message.error("Please select an .xlsx Excel workbook");
      return;
    }
    setPreviewing(true);
    try {
      const result = (await api.previewKnowledgeImport(
        file,
        getActiveAdminPlatformRoute() || "default",
      )) as ImportPreview;
      setImportFile(file);
      setPreview(result);
    } catch (error: any) {
      message.error(error?.message || "Could not preview the AI Knowledge workbook");
    } finally {
      setPreviewing(false);
    }
  };

  const applyImport = async () => {
    if (!importFile || !preview?.valid_rows) return;
    setImporting(true);
    try {
      const result = (await api.importAiKnowledgeWorkbook(importFile)) as {
        created?: number;
        updated?: number;
        skipped?: number;
      };
      message.success(
        `AI Knowledge imported: ${Number(result.created || 0)} created, ${Number(result.updated || 0)} updated, ${Number(result.skipped || 0)} skipped`,
      );
      setPreview(null);
      setImportFile(null);
      await load();
    } catch (error: any) {
      message.error(error?.message || "Could not import AI Knowledge");
    } finally {
      setImporting(false);
    }
  };

  const columns = useMemo(
    () => [
      { title: "Question", dataIndex: "title", render: (value: string) => <b>{value}</b> },
      {
        title: "Type",
        dataIndex: "keywords",
        width: 180,
        render: (value: string) => <Tag>{value || "General"}</Tag>,
      },
      { title: "Answer", dataIndex: "content", ellipsis: true },
      {
        title: "Enabled",
        dataIndex: "status",
        width: 100,
        render: (value: string) => (
          <Tag color={value === "inactive" ? "default" : "green"}>
            {value === "inactive" ? "Off" : "On"}
          </Tag>
        ),
      },
      {
        title: "Actions",
        width: 150,
        render: (_: unknown, row: KnowledgeRow) => (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>
              Edit
            </Button>
            <Popconfirm title="Delete this AI Knowledge entry?" onConfirm={() => void remove(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );

  const previewColumns = [
    { title: "Row", dataIndex: "row_number", width: 70 },
    {
      title: "Question",
      dataIndex: "question",
      ellipsis: true,
      render: (value: string) => value || <span style={{ color: "#d46b08" }}>Missing</span>,
    },
    { title: "Type", dataIndex: "type", width: 150, render: (value: string) => <Tag>{value}</Tag> },
    {
      title: "Action",
      dataIndex: "action",
      width: 100,
      render: (value: ImportPreviewRow["action"]) => (
        <Tag color={value === "create" ? "green" : value === "update" ? "blue" : "default"}>
          {value.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Validation",
      dataIndex: "error",
      ellipsis: true,
      render: (value: string) => value ? <span style={{ color: "#cf1322" }}>{value}</span> : "Ready",
    },
  ];

  return (
    <>
      <Alert
        showIcon
        type="info"
        message="AI Knowledge Library"
        description="Every enabled Answer is trusted private knowledge for the AI Assistant. Question is a human-readable title/example, not a trigger. Runtime retrieval evaluates the Answer content and can combine several relevant knowledge entries. Guide-page FAQs remain separate, and AI Knowledge does not count toward the 24,000-character Assistant Setup runtime."
        style={{ marginBottom: 12 }}
      />
      <div className="bdg-filters" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, color: "#8ea0bd" }}>
          Add knowledge manually or import an Excel workbook. Existing questions are updated automatically during import.
        </div>
        <Button onClick={() => void load()}>Refresh</Button>
        <Button icon={<DownloadOutlined />} onClick={() => void downloadTemplate()}>
          Download Template
        </Button>
        <Upload
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          showUploadList={false}
          beforeUpload={(file) => {
            void previewImport(file as File);
            return Upload.LIST_IGNORE;
          }}
        >
          <Button icon={<ImportOutlined />} loading={previewing}>
            Import Excel
          </Button>
        </Upload>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
          Add Knowledge
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
        open={editing !== undefined}
        onClose={closeEditor}
        width="min(760px, 96vw)"
        title={editing?.id ? `Edit AI Knowledge — ${editing.title}` : "Add AI Knowledge"}
        extra={
          <Space>
            <Button onClick={closeEditor}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="question"
            label="Question"
            extra="Human-readable title/example only. It is not a keyword trigger for the AI."
            rules={[{ required: true, message: "Enter the customer question or knowledge title" }]}
          >
            <Input maxLength={500} showCount placeholder="How can I change my withdrawal bank account?" />
          </Form.Item>
          <Form.Item
            name="type"
            label="Type"
            extra="Free-form category for organization and light context. You can reuse an existing type or create a new one."
            rules={[{ required: true, message: "Enter a type" }]}
          >
            <AutoComplete options={typeOptions} placeholder="Withdrawal, Deposit, Account, Promotion..." />
          </Form.Item>
          <Form.Item
            name="answer"
            label="Answer"
            extra="This is the trusted knowledge. Write it so the facts make sense on their own; the AI retrieves from this content and may combine it with other relevant enabled answers."
            rules={[{ required: true, message: "Enter the approved knowledge answer" }]}
          >
            <Input.TextArea
              rows={12}
              maxLength={20000}
              showCount
              placeholder="Enter the approved business knowledge the AI should understand and use when relevant."
            />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        open={!!preview}
        onCancel={() => {
          if (importing) return;
          setPreview(null);
          setImportFile(null);
        }}
        width="min(1120px, 96vw)"
        title={preview ? `Import AI Knowledge — ${preview.filename}` : "Import AI Knowledge"}
        footer={[
          <Button
            key="cancel"
            disabled={importing}
            onClick={() => {
              setPreview(null);
              setImportFile(null);
            }}
          >
            Cancel
          </Button>,
          <Button
            key="import"
            type="primary"
            icon={<ImportOutlined />}
            loading={importing}
            disabled={!preview?.valid_rows}
            onClick={() => void applyImport()}
          >
            Import Add / Update
          </Button>,
        ]}
      >
        {preview && (
          <>
            <Alert
              type={preview.error_rows ? "warning" : "success"}
              showIcon
              message="Review before import"
              description="Rows marked CREATE will be added. Rows marked UPDATE match an existing Question and will replace its Type, Answer, and Enabled state. Invalid or duplicate workbook rows are skipped. Nothing is written until you click Import Add / Update."
              style={{ marginBottom: 16 }}
            />
            <Row gutter={12} style={{ marginBottom: 16 }}>
              <Col span={6}><Statistic title="Total rows" value={preview.total_rows} /></Col>
              <Col span={6}><Statistic title="Create" value={preview.create_rows} /></Col>
              <Col span={6}><Statistic title="Update" value={preview.update_rows} /></Col>
              <Col span={6}><Statistic title="Skipped" value={preview.error_rows} /></Col>
            </Row>
            <Table
              rowKey="row_number"
              size="small"
              dataSource={preview.rows}
              columns={previewColumns as any}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </>
        )}
      </Modal>
    </>
  );
}

import { useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  Modal,
  Space,
  Statistic,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import {
  DownloadOutlined,
  ExportOutlined,
  HistoryOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { bulkContentApi, type BulkKind } from "@/lib/bulk-content-api";

function actionColor(action: string) {
  if (action === "create") return "green";
  if (action === "update") return "blue";
  return "default";
}

export default function BulkContentRouteToolbar() {
  const location = useLocation();
  const kind = useMemo<BulkKind | null>(() => {
    const path = String(location.pathname || "").toLowerCase();
    if (/(^|\/)faq(?:\/|$)/.test(path)) return "faq";
    if (/(^|\/)(guide-images|guide)(?:\/|$)/.test(path)) return "guide";
    return null;
  }, [location.pathname]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preserveStatus, setPreserveStatus] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  if (!kind) return null;

  const title = kind === "faq" ? "FAQ Excel Import / Export" : "Guide Excel Import / Export";
  const description = kind === "faq"
    ? "Preview Question + Locale changes before importing. Spreadsheet content imports as Draft by default."
    : "Stable slug + Guide locale identifies each Guide. Insert-image-in-cell is supported when the exported XLSX exposes the embedded image; unreadable images are reported as warnings instead of failing the row.";

  const beginPreview = async (nextFile: File) => {
    setFile(nextFile);
    setPreviewing(true);
    try {
      const result = await bulkContentApi.preview(kind, nextFile);
      setPreview(result);
    } catch (error: any) {
      setFile(null);
      message.error(error?.message || "Workbook preview failed");
    } finally {
      setPreviewing(false);
    }
    return false;
  };

  const applyImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await bulkContentApi.apply(kind, file, preserveStatus ? "preserve" : "draft");
      message.success(`${kind === "faq" ? "FAQ" : "Guide"} import complete: ${result.created || 0} created, ${result.updated || 0} updated, ${result.skipped || 0} skipped`);
      setPreview(null);
      setFile(null);
      setPreserveStatus(false);
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error: any) {
      message.error(error?.message || "Workbook import failed");
    } finally {
      setImporting(false);
    }
  };

  const showHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const result = await bulkContentApi.history(kind);
      setHistory(Array.isArray(result?.rows) ? result.rows : []);
    } catch (error: any) {
      message.error(error?.message || "Could not load import history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const previewColumns = kind === "faq"
    ? [
        { title: "Row", dataIndex: "row_number", width: 70 },
        { title: "Action", dataIndex: "action", width: 90, render: (value: string) => <Tag color={actionColor(value)}>{String(value || "").toUpperCase()}</Tag> },
        { title: "Question", dataIndex: "question", ellipsis: true },
        { title: "Locale", dataIndex: "locale", width: 110 },
        { title: "Status", dataIndex: "status", width: 110 },
        { title: "Error", dataIndex: "error", ellipsis: true, render: (value: string) => value ? <span style={{ color: "#ff7875" }}>{value}</span> : "—" },
      ]
    : [
        { title: "Row", dataIndex: "row_number", width: 70 },
        { title: "Action", dataIndex: "action", width: 90, render: (value: string) => <Tag color={actionColor(value)}>{String(value || "").toUpperCase()}</Tag> },
        { title: "Stable slug", dataIndex: "slug", width: 190, ellipsis: true },
        { title: "Locale", dataIndex: "locale", width: 100 },
        { title: "Title", dataIndex: "title", ellipsis: true },
        { title: "Image", dataIndex: "image_source", width: 100, render: (value: string) => <Tag>{value || "none"}</Tag> },
        { title: "Warnings / Error", width: 300, ellipsis: true, render: (_: any, row: any) => row.error ? <span style={{ color: "#ff7875" }}>{row.error}</span> : (row.warnings?.length ? row.warnings.join(" ") : "—") },
      ];

  return <>
    <Card size="small" style={{ marginBottom: 14 }}>
      <div className="bdg-filters" style={{ marginBottom: 0, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <b>{title}</b>
          <div style={{ color: "#8ea0bd", fontSize: 12, marginTop: 3 }}>{description}</div>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => bulkContentApi.downloadTemplate(kind).catch((error) => message.error(error?.message || "Template download failed"))}>Download Template</Button>
          <Button icon={<ExportOutlined />} onClick={() => bulkContentApi.exportCurrent(kind).catch((error) => message.error(error?.message || "Export failed"))}>Export Excel</Button>
          <Button icon={<HistoryOutlined />} onClick={() => void showHistory()}>Import History</Button>
          <Upload accept=".xlsx" maxCount={1} showUploadList={false} beforeUpload={beginPreview}>
            <Button type="primary" loading={previewing} icon={<InboxOutlined />}>Import Excel</Button>
          </Upload>
        </Space>
      </div>
    </Card>

    <Modal
      open={!!preview}
      width="min(1280px, 96vw)"
      title={`${kind === "faq" ? "FAQ" : "Guide"} import preview — ${preview?.filename || file?.name || "workbook"}`}
      onCancel={() => { if (!importing) { setPreview(null); setFile(null); setPreserveStatus(false); } }}
      okText="Import workbook"
      okButtonProps={{ disabled: !preview?.valid_rows || importing }}
      confirmLoading={importing}
      onOk={() => void applyImport()}
      destroyOnHidden
    >
      <Alert
        showIcon
        type={preview?.error_rows ? "warning" : "info"}
        message="Preview only — nothing has been written yet"
        description="Rows with validation errors are skipped. Unknown Guide buttons are warnings. By default every imported row becomes Draft so you can review it in Admin before publishing."
        style={{ marginBottom: 14 }}
      />
      <Space size="large" wrap style={{ marginBottom: 14 }}>
        <Statistic title="Rows" value={preview?.total_rows || 0} />
        <Statistic title="Create" value={preview?.create_rows || 0} />
        <Statistic title="Update" value={preview?.update_rows || 0} />
        <Statistic title="Errors" value={preview?.error_rows || 0} />
        <Statistic title="Warnings" value={preview?.warning_rows || 0} />
      </Space>
      <div style={{ marginBottom: 12 }}>
        <Checkbox checked={preserveStatus} onChange={(event) => setPreserveStatus(event.target.checked)}>
          Preserve spreadsheet status instead of importing everything as Draft
        </Checkbox>
      </div>
      <Table
        rowKey={(row) => String(row.row_number)}
        size="small"
        columns={previewColumns as any}
        dataSource={preview?.rows || []}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 980 }}
      />
    </Modal>

    <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} width="min(960px, 96vw)" title={`${kind === "faq" ? "FAQ" : "Guide"} import history`}>
      <Table
        rowKey="id"
        size="small"
        loading={historyLoading}
        dataSource={history}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "Date", dataIndex: "created_at", width: 190, render: (value: string) => value ? new Date(value).toLocaleString() : "—" },
          { title: "File", dataIndex: "filename", ellipsis: true },
          { title: "Rows", dataIndex: "total_rows", width: 70 },
          { title: "Created", dataIndex: "created_rows", width: 80 },
          { title: "Updated", dataIndex: "updated_rows", width: 80 },
          { title: "Skipped", dataIndex: "skipped_rows", width: 80 },
          { title: "Errors", dataIndex: "error_rows", width: 70 },
          { title: "Warnings", dataIndex: "warning_rows", width: 85 },
        ]}
      />
    </Drawer>
  </>;
}

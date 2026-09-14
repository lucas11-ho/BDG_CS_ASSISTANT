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
import { useAdminI18n } from "@/i18n/runtime";

function actionColor(action: string) {
  if (action === "create") return "green";
  if (action === "update") return "blue";
  return "default";
}

function titleCase(value: string) {
  return String(value || "").replaceAll("_", " ").replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

export default function BulkContentRouteToolbar() {
  const { t } = useAdminI18n();
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
    ? "Preview Question + Locale changes before importing. Topic is locale-specific, so use the same language as each FAQ row. Spreadsheet content imports as Draft by default."
    : "Stable slug + Guide locale identifies each Guide. Insert-image-in-cell is supported when the exported XLSX exposes the embedded image; unreadable images are reported as warnings instead of failing the row.";

  const beginPreview = async (nextFile: File) => {
    setFile(nextFile);
    setPreviewing(true);
    try {
      const result = await bulkContentApi.preview(kind, nextFile);
      setPreview(result);
    } catch (error: any) {
      setFile(null);
      message.error(error?.message || t("Workbook preview failed"));
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
      const label = kind === "faq" ? t("FAQ") : t("Guide");
      message.success(`${label} ${t("Import")}：${result.created || 0} ${t("Created")}, ${result.updated || 0} ${t("Updated")}, ${result.skipped || 0} ${t("Skipped")}`);
      setPreview(null);
      setFile(null);
      setPreserveStatus(false);
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error: any) {
      message.error(error?.message || t("Workbook import failed"));
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
      message.error(error?.message || t("Could not load import history"));
    } finally {
      setHistoryLoading(false);
    }
  };

  const previewColumns = kind === "faq"
    ? [
        { title: t("Row"), dataIndex: "row_number", width: 70 },
        { title: t("Action"), dataIndex: "action", width: 90, render: (value: string) => <Tag color={actionColor(value)}>{t(titleCase(value))}</Tag> },
        { title: t("Question"), dataIndex: "question", ellipsis: true },
        { title: t("Locale"), dataIndex: "locale", width: 110 },
        { title: t("Topic"), dataIndex: "topic", width: 150, ellipsis: true },
        { title: t("Status"), dataIndex: "status", width: 110, render: (value: string) => t(titleCase(value)) },
        { title: t("Error"), dataIndex: "error", ellipsis: true, render: (value: string) => value ? <span style={{ color: "#ff7875" }}>{value}</span> : "—" },
      ]
    : [
        { title: t("Row"), dataIndex: "row_number", width: 70 },
        { title: t("Action"), dataIndex: "action", width: 90, render: (value: string) => <Tag color={actionColor(value)}>{t(titleCase(value))}</Tag> },
        { title: t("Stable slug"), dataIndex: "slug", width: 190, ellipsis: true },
        { title: t("Locale"), dataIndex: "locale", width: 100 },
        { title: t("Title"), dataIndex: "title", ellipsis: true },
        { title: t("Image"), dataIndex: "image_source", width: 100, render: (value: string) => <Tag>{value || t("None")}</Tag> },
        { title: t("Warnings / Error"), width: 300, ellipsis: true, render: (_: any, row: any) => row.error ? <span style={{ color: "#ff7875" }}>{row.error}</span> : (row.warnings?.length ? row.warnings.join(" ") : "—") },
      ];

  return <>
    <Card size="small" style={{ marginBottom: 14 }}>
      <div className="bdg-filters" style={{ marginBottom: 0, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <b>{t(title)}</b>
          <div style={{ color: "#8ea0bd", fontSize: 12, marginTop: 3 }}>{t(description)}</div>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => bulkContentApi.downloadTemplate(kind).catch((error) => message.error(error?.message || t("Template download failed")))}>{t("Download Template")}</Button>
          <Button icon={<ExportOutlined />} onClick={() => bulkContentApi.exportCurrent(kind).catch((error) => message.error(error?.message || t("Export failed")))}>{t("Export Excel")}</Button>
          <Button icon={<HistoryOutlined />} onClick={() => void showHistory()}>{t("Import History")}</Button>
          <Upload accept=".xlsx" maxCount={1} showUploadList={false} beforeUpload={beginPreview}>
            <Button type="primary" loading={previewing} icon={<InboxOutlined />}>{t("Import Excel")}</Button>
          </Upload>
        </Space>
      </div>
    </Card>

    <Modal
      open={!!preview}
      width="min(1280px, 96vw)"
      title={`${kind === "faq" ? t("FAQ") : t("Guide")} ${t("Import")} — ${preview?.filename || file?.name || "workbook"}`}
      onCancel={() => { if (!importing) { setPreview(null); setFile(null); setPreserveStatus(false); } }}
      okText={t("Import workbook")}
      cancelText={t("Cancel")}
      okButtonProps={{ disabled: !preview?.valid_rows || importing }}
      confirmLoading={importing}
      onOk={() => void applyImport()}
      destroyOnHidden
    >
      <Alert
        showIcon
        type={preview?.error_rows ? "warning" : "info"}
        message={t("Preview only — nothing has been written yet")}
        description={t(kind === "faq"
          ? "Rows with validation errors are skipped. FAQ Topic is saved per locale, so translate the Topic label in each locale row. By default every imported row becomes Draft so you can review it in Admin before publishing."
          : "Rows with validation errors are skipped. Unknown Guide buttons are warnings. By default every imported row becomes Draft so you can review it in Admin before publishing.")}
        style={{ marginBottom: 14 }}
      />
      <Space size="large" wrap style={{ marginBottom: 14 }}>
        <Statistic title={t("Rows")} value={preview?.total_rows || 0} />
        <Statistic title={t("Create")} value={preview?.create_rows || 0} />
        <Statistic title={t("Update")} value={preview?.update_rows || 0} />
        <Statistic title={t("Errors")} value={preview?.error_rows || 0} />
        <Statistic title={t("Warnings")} value={preview?.warning_rows || 0} />
      </Space>
      <div style={{ marginBottom: 12 }}>
        <Checkbox checked={preserveStatus} onChange={(event) => setPreserveStatus(event.target.checked)}>
          {t("Preserve spreadsheet status instead of importing everything as Draft")}
        </Checkbox>
      </div>
      <Table
        rowKey={(row) => String(row.row_number)}
        size="small"
        columns={previewColumns as any}
        dataSource={preview?.rows || []}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 1080 }}
      />
    </Modal>

    <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} width="min(960px, 96vw)" title={`${kind === "faq" ? t("FAQ") : t("Guide")} ${t("Import History")}`}>
      <Table
        rowKey="id"
        size="small"
        loading={historyLoading}
        dataSource={history}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: t("Date"), dataIndex: "created_at", width: 190, render: (value: string) => value ? new Date(value).toLocaleString() : "—" },
          { title: t("File"), dataIndex: "filename", ellipsis: true },
          { title: t("Rows"), dataIndex: "total_rows", width: 70 },
          { title: t("Created"), dataIndex: "created_rows", width: 80 },
          { title: t("Updated"), dataIndex: "updated_rows", width: 80 },
          { title: t("Skipped"), dataIndex: "skipped_rows", width: 80 },
          { title: t("Errors"), dataIndex: "error_rows", width: 70 },
          { title: t("Warnings"), dataIndex: "warning_rows", width: 85 },
        ]}
      />
    </Drawer>
  </>;
}

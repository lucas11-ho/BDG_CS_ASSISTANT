import { useEffect, useMemo, useState } from "react";
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Drawer,
  Form,
  Popconfirm,
  Empty,
  Skeleton,
  Alert,
  message,
} from "antd";
import {
  ReloadOutlined,
  ExportOutlined,
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";
import { useAdminI18n } from "@/i18n/runtime";

export type DataPageProps<T extends { id: number | string; status?: string }> = {
  resource: string;
  columns: ColumnsType<T>;
  editableFields?: { name: string; label: string; type?: "text" | "textarea" | "select" | "number"; options?: string[]; required?: boolean; rows?: number; help?: string }[];
  createLabel?: string;
  statusFilterKey?: string;
  enableDuplicateCleanup?: boolean;
  enableDeleteAll?: boolean;
  readOnly?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canSelect?: boolean;
  showStatusFilter?: boolean;
  onExport?: (rows: T[]) => void | Promise<void>;
};

function displayStatus(value?: string) {
  const raw = String(value || "").replaceAll("_", " ").trim();
  return raw ? raw.replace(/(^|\s)\S/g, (char) => char.toUpperCase()) : raw;
}

export function StatusTag({ value }: { value?: string }) {
  const { t } = useAdminI18n();
  const v = (value || "").toLowerCase();
  const color =
    v === "active" || v === "operational" || v === "published" || v === "indexed"
      ? "success"
      : v === "inactive" || v === "draft"
      ? "default"
      : v === "pending"
      ? "warning"
      : v === "error"
      ? "error"
      : "processing";
  return <Tag color={color as any} style={{ margin: 0 }}>{t(displayStatus(value))}</Tag>;
}

export default function DataPage<T extends { id: number | string; status?: string }>({
  resource,
  columns,
  editableFields = [],
  createLabel = "Create",
  enableDuplicateCleanup = false,
  enableDeleteAll = false,
  readOnly = false,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  canSelect = true,
  showStatusFilter = true,
  onExport,
}: DataPageProps<T>) {
  const { t } = useAdminI18n();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [form] = Form.useForm();
  const allowCreate = !readOnly && canCreate;
  const allowEdit = !readOnly && canEdit;
  const allowDelete = !readOnly && canDelete;
  const allowSelect = !readOnly && canSelect && allowDelete;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await api.list(resource)) as T[];
      setRows(data);
      setSelectedRowKeys([]);
    } catch (e: any) {
      setError(e?.message ?? t("Failed to load data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  const filtered = useMemo(() => rows.filter((r) => {
    const s = search.trim().toLowerCase();
    const matchSearch = !s || JSON.stringify(r).toLowerCase().includes(s);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  }), [rows, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  };
  const openEdit = (row: T) => {
    setEditing(row);
    form.setFieldsValue(row);
    setDrawerOpen(true);
  };
  const remove = async (row: T) => {
    await api.remove(resource, row.id);
    setRows((r) => r.filter((x) => x.id !== row.id));
    setSelectedRowKeys((keys) => keys.filter((k) => k !== row.id));
    message.success(t("Deleted"));
  };
  const bulkDelete = async () => {
    if (!selectedRowKeys.length) return message.warning(t("Select records first"));
    await api.bulkRemove(resource, selectedRowKeys as any[]);
    setRows((r) => r.filter((x) => !selectedRowKeys.includes(x.id)));
    message.success(t(`Deleted ${selectedRowKeys.length} selected record(s)`));
    setSelectedRowKeys([]);
  };
  const cleanupDuplicates = async () => {
    const res: any = await api.cleanupQuickReplyDuplicates();
    message.success(t(`Removed ${res?.deleted ?? 0} duplicate quick replies`));
    load();
  };
  const deleteAllQuickReplies = async () => {
    const res: any = await api.deleteAllQuickReplies();
    message.success(t(`Deleted ${res?.deleted ?? 0} quick replies`));
    load();
  };
  const exportRows = async () => {
    if (!onExport) return;
    try {
      await onExport(filtered);
    } catch (e: any) {
      message.error(e?.message || t("Export failed"));
    }
  };
  const save = async () => {
    const values = await form.validateFields();
    if (editing) {
      const updated = await api.update(resource, editing.id, values);
      setRows((r) => r.map((x) => (x.id === editing.id ? { ...x, ...(updated as any) } : x)));
      message.success(t("Updated"));
    } else {
      const created = (await api.create(resource, values)) as T;
      setRows((r) => [created, ...r]);
      message.success(t("Created"));
    }
    setDrawerOpen(false);
  };

  const cols: ColumnsType<T> = [
    ...columns.map((column: any) => ({ ...column, title: typeof column.title === "string" ? t(column.title) : column.title })),
    ...((allowEdit || allowDelete) ? [{
      title: t("Actions"),
      key: "_actions",
      width: 140,
      render: (_: unknown, row: T) => (
        <Space>
          {allowEdit ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              {t("Edit")}
            </Button>
          ) : null}
          {allowDelete ? (
            <Popconfirm title={t("Delete this item?")} onConfirm={() => remove(row)} okText={t("Delete")} cancelText={t("Cancel")} okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          ) : null}
        </Space>
      ),
    }] : []),
  ] as ColumnsType<T>;

  return (
    <>
      <div className="bdg-filters">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t("Search...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        {showStatusFilter ? (
          <Select
            allowClear
            placeholder={t("Status")}
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            options={[
              { value: "active", label: t("Active") },
              { value: "inactive", label: t("Inactive") },
              { value: "published", label: t("Published") },
              { value: "draft", label: t("Draft") },
              { value: "pending", label: t("Pending") },
            ]}
          />
        ) : null}
        <Select
          value={pageSize}
          onChange={setPageSize}
          style={{ width: 120 }}
          options={[20, 50, 100].map((n) => ({ value: n, label: t(`${n} / page`) }))}
        />
        <div style={{ flex: 1 }} />
        <Space wrap>
          {allowDelete && selectedRowKeys.length > 0 && <Popconfirm title={t(`Delete ${selectedRowKeys.length} selected record(s)?`)} onConfirm={bulkDelete} okText={t("Delete")} cancelText={t("Cancel")} okButtonProps={{ danger: true }}><Button danger icon={<DeleteOutlined />}>{t("Delete selected")}</Button></Popconfirm>}
          {!readOnly && enableDuplicateCleanup && <Button icon={<ClearOutlined />} onClick={cleanupDuplicates}>{t("Remove duplicates")}</Button>}
          {!readOnly && enableDeleteAll && <Popconfirm title={t("Delete ALL quick replies?")} onConfirm={deleteAllQuickReplies} okText={t("Delete")} cancelText={t("Cancel")} okButtonProps={{ danger: true }}><Button danger>{t("Delete all")}</Button></Popconfirm>}
          <Button icon={<ReloadOutlined />} onClick={load}>{t("Refresh")}</Button>
          {onExport ? <Button icon={<ExportOutlined />} onClick={exportRows}>{t("Export")}</Button> : null}
          {allowCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t(createLabel)}</Button> : null}
        </Space>
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      {loading ? (
        <div style={{ padding: 16, background: "var(--navy-800)", border: "1px solid var(--border-dim)", borderRadius: 8 }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, background: "var(--navy-800)", border: "1px solid var(--border-dim)", borderRadius: 8 }}>
          <Empty description={<span style={{ color: "#8ea0bd" }}>{t("No records found")}</span>} />
        </div>
      ) : (
        <Table
          className="bdg-table"
          rowKey="id"
          rowSelection={allowSelect ? { selectedRowKeys, onChange: setSelectedRowKeys } : undefined}
          columns={cols}
          dataSource={filtered}
          size="middle"
          pagination={{ pageSize, showSizeChanger: false, showTotal: (total) => t(`${total} records`) }}
        />
      )}

      <Drawer
        title={editing ? t("Edit record") : t(createLabel)}
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={<Space><Button onClick={() => setDrawerOpen(false)}>{t("Cancel")}</Button><Button type="primary" onClick={save}>{t("Save")}</Button></Space>}
      >
        <Form layout="vertical" form={form}>
          {editableFields.map((field) => (
            <Form.Item key={field.name} label={t(field.label)} name={field.name} extra={field.help ? t(field.help) : undefined} rules={field.required === false ? [] : [{ required: true, message: t(`${field.label} required`) }]}>
              {field.type === "textarea" ? <Input.TextArea rows={field.rows || 4} /> : field.type === "select" ? <Select options={(field.options || []).map((option) => ({ value: option, label: t(displayStatus(option)) }))} /> : field.type === "number" ? <Input type="number" /> : <Input />}
            </Form.Item>
          ))}
        </Form>
      </Drawer>
    </>
  );
}

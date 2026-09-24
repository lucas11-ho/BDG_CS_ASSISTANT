import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Progress,
  Result,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CopyOutlined,
  ExportOutlined,
  ImportOutlined,
  LockOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { api, getCurrentUser } from "@/lib/api";
import { useAdminI18n } from "@/i18n/runtime";

export const Route = createFileRoute("/_admin/platform-transfer")({
  component: PlatformTransferPage,
});

const MODULES = [
  {
    value: "locales",
    label: "Languages & locales",
    description: "Enabled customer languages and locale order",
  },
  {
    value: "categories",
    label: "Categories",
    description: "Guide categories, icons, and ordering",
  },
  {
    value: "guides",
    label: "Guides & media",
    description: "Guide content, translations, images, GIFs, and videos",
  },
  { value: "faqs", label: "FAQ", description: "Localized FAQ content and topics" },
  {
    value: "branding",
    label: "Branding & themes",
    description: "Platform logos, text, icons, colors, Guide theme, and Chat theme",
  },
  {
    value: "assistant",
    label: "Assistant setup",
    description: "Prompt sections, reliability, and source-routing policy without provider secrets",
  },
  {
    value: "experience",
    label: "Site & chat experience",
    description: "Site content, navigation, home sections, help cards, and quick replies",
  },
  {
    value: "ai_knowledge",
    label: "AI knowledge",
    description: "Menu, image, and Q&A knowledge imported as drafts",
  },
] as const;

type TransferCounts = { create: number; skip: number; replace: number; total: number };
type MediaProgress = {
  total_files?: number;
  completed_files?: number;
  failed_files?: number;
  pending_files?: number;
  total_bytes?: number;
  completed_bytes?: number;
  percent?: number;
  batch_size?: number;
  last_progress_at?: string;
};
type TransferJob = {
  id: string;
  status: string;
  source_platform_id: number;
  target_platform_id: number;
  source_platform_name?: string;
  target_platform_name?: string;
  preview?: { totals?: TransferCounts; modules?: Record<string, TransferCounts> };
  result?: { created?: number; skipped?: number; replaced?: number; media_files?: number; media_bytes?: number; data_imported?: boolean };
  media_progress?: MediaProgress;
  data_imported_at?: string;
  rollback_available?: boolean;
  rollback_expires_at?: string;
  error_code?: string;
  error_message?: string;
  created_at?: string;
};
type TransferGrant = {
  id: string;
  status: string;
  token_hint: string;
  modules: string[];
  expires_at: string;
  created_at: string;
};
type TransferState = {
  platform?: { id: number; name: string };
  grants: TransferGrant[];
  jobs: TransferJob[];
  policy: Record<string, unknown>;
};
type TransferPreview = {
  job: TransferJob;
  source?: { platform_name?: string };
  destination?: { platform_name?: string };
};
type GeneratedTransfer = { secret: string; grant: TransferGrant };

function errorDetails(error: unknown) {
  return error && typeof error === "object" ? (error as Record<string, unknown>) : {};
}

function formatBytes(value: number | undefined) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusColor(status: string) {
  if (status === "completed") return "success";
  if (status === "rolled_back" || status === "revoked" || status === "expired") return "default";
  if (status === "failed") return "error";
  return "processing";
}

function PlatformTransferPage() {
  const { t } = useAdminI18n();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<TransferState>({ grants: [], jobs: [], policy: {} });
  const [generated, setGenerated] = useState<GeneratedTransfer | null>(null);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [rollbackJob, setRollbackJob] = useState<TransferJob | null>(null);
  const [pumpingJobId, setPumpingJobId] = useState("");
  const mediaPumpRef = useRef(new Set<string>());
  const [generateForm] = Form.useForm<{ modules: string[]; twofa_code: string }>();
  const [claimForm] = Form.useForm<{ secret: string }>();
  const [applyForm] = Form.useForm<{ confirmation: string; twofa_code: string }>();
  const [rollbackForm] = Form.useForm<{ confirmation: string; twofa_code: string }>();
  const user = getCurrentUser();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await api.listPlatformTransfers());
    } catch (error: unknown) {
      message.error(String(errorDetails(error).message || t("Failed to load platform transfers")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const mergeJob = useCallback((job: TransferJob) => {
    setState((current) => ({
      ...current,
      jobs: (current.jobs || []).map((row) => row.id === job.id ? { ...row, ...job } : row),
    }));
    setPreview((current) => current?.job?.id === job.id ? { ...current, job:{ ...current.job, ...job } } : current);
  }, []);

  const pumpMedia = useCallback(async (jobId: string) => {
    if (!jobId || mediaPumpRef.current.has(jobId)) return;
    mediaPumpRef.current.add(jobId);
    setPumpingJobId(jobId);
    try {
      for (let batch = 0; batch < 2000; batch += 1) {
        const result: any = await api.continuePlatformTransferMedia(jobId);
        const job = result?.job as TransferJob;
        if (!job) break;
        mergeJob(job);
        if (job.status !== "running") {
          if (job.status === "completed") message.success(t("Platform transfer completed with all media verified"));
          if (job.status === "failed") message.warning(t("Some media files still need attention. Use Retry failed media."));
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    } catch (error: unknown) {
      message.error(String(errorDetails(error).message || t("Media copy paused. You can resume it from Transfer history.")));
    } finally {
      mediaPumpRef.current.delete(jobId);
      setPumpingJobId((current) => current === jobId ? "" : current);
      await load();
    }
  }, [load, mergeJob, t]);

  const retryMedia = useCallback(async (jobId: string) => {
    if (!jobId || mediaPumpRef.current.has(jobId)) return;
    try {
      setPumpingJobId(jobId);
      const result: any = await api.retryPlatformTransferMedia(jobId);
      if (result?.job) mergeJob(result.job);
      if (result?.job?.status === "running") {
        setPumpingJobId("");
        void pumpMedia(jobId);
      } else {
        setPumpingJobId("");
        await load();
      }
    } catch (error: unknown) {
      setPumpingJobId("");
      message.error(String(errorDetails(error).message || t("Failed media could not be retried")));
    }
  }, [load, mergeJob, pumpMedia, t]);

  const createGrant = async () => {
    try {
      const values = await generateForm.validateFields();
      setSubmitting(true);
      const result = await api.createPlatformTransferGrant(values.modules, values.twofa_code);
      setGenerated(result);
      generateForm.setFieldValue("twofa_code", "");
      await load();
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (details.errorFields) return;
      message.error(String(details.message || t("Transfer key could not be generated")));
    } finally {
      setSubmitting(false);
    }
  };

  const claim = async () => {
    try {
      const values = await claimForm.validateFields();
      setSubmitting(true);
      const result = await api.claimPlatformTransfer(values.secret.trim());
      setPreview(result);
      claimForm.resetFields();
      await load();
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (details.errorFields) return;
      message.error(String(details.message || t("Transfer key could not be claimed")));
    } finally {
      setSubmitting(false);
    }
  };

  const apply = async () => {
    try {
      if (!preview) return;
      const values = await applyForm.validateFields();
      setSubmitting(true);
      const result = await api.applyPlatformTransfer(
        preview.job.id,
        values.confirmation,
        values.twofa_code,
      );
      setPreview({ ...preview, job: result.job });
      applyForm.resetFields();
      if (result.job?.status === "running") {
        message.success(t("Platform data imported. Media is copying in resumable batches."));
        void pumpMedia(result.job.id);
      } else {
        message.success(t("Platform data copied successfully"));
      }
      await load();
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (details.errorFields) return;
      message.error(String(details.message || t("Platform transfer failed")));
    } finally {
      setSubmitting(false);
    }
  };

  const rollback = async () => {
    try {
      const values = await rollbackForm.validateFields();
      setSubmitting(true);
      if (!rollbackJob) return;
      await api.rollbackPlatformTransfer(rollbackJob.id, values.confirmation, values.twofa_code);
      message.success(t("Transfer rolled back"));
      setRollbackJob(null);
      rollbackForm.resetFields();
      await load();
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (details.errorFields) return;
      message.error(String(details.message || t("Rollback failed")));
    } finally {
      setSubmitting(false);
    }
  };

  const revokeGrant = async (grantId: string) => {
    try {
      setSubmitting(true);
      await api.revokePlatformTransferGrant(grantId);
      message.success(t("Transfer key revoked"));
      await load();
    } catch (error: unknown) {
      message.error(String(errorDetails(error).message || t("Transfer key could not be revoked")));
    } finally {
      setSubmitting(false);
    }
  };

  const previewRows = useMemo(
    () =>
      Object.entries(preview?.job?.preview?.modules || {}).map(([module, value]) => ({
        module,
        ...value,
      })),
    [preview],
  );
  const destinationName = state?.platform?.name || preview?.destination?.platform_name || "";
  const activePlatformName = preview?.job?.target_platform_name || destinationName;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message={t("Secure platform-to-platform copy")}
        description={t(
          "Data is copied from the old platform; the source is never changed. Transfer keys expire after 30 minutes, work once, and are never stored in readable form.",
        )}
      />
      {user?.twofa_enabled !== true && (
        <Alert
          type="warning"
          showIcon
          message={t("Two-factor authentication required")}
          description={t(
            "Enable 2FA in Account & Security before generating or applying a transfer.",
          )}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            title={
              <Space>
                <ExportOutlined />
                {t("Old platform: Generate transfer key")}
              </Space>
            }
            loading={loading}
          >
            <Form
              form={generateForm}
              layout="vertical"
              initialValues={{ modules: MODULES.map((module) => module.value) }}
            >
              <Form.Item
                name="modules"
                label={t("Data to copy")}
                rules={[{ required: true, message: t("Select at least one data group") }]}
              >
                <Checkbox.Group style={{ width: "100%" }}>
                  <Row gutter={[8, 8]}>
                    {MODULES.map((module) => (
                      <Col span={24} key={module.value}>
                        <Checkbox value={module.value}>
                          <Typography.Text strong>{t(module.label)}</Typography.Text>
                          <Typography.Text
                            type="secondary"
                            style={{ display: "block", marginLeft: 24 }}
                          >
                            {t(module.description)}
                          </Typography.Text>
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                </Checkbox.Group>
              </Form.Item>
              <Form.Item
                name="twofa_code"
                label={t("Current 2FA code")}
                rules={[
                  { required: true, len: 6, message: t("Enter a six-digit authenticator code") },
                ]}
              >
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  prefix={<LockOutlined />}
                  autoComplete="one-time-code"
                />
              </Form.Item>
              <Button
                type="primary"
                icon={<SafetyCertificateOutlined />}
                onClick={createGrant}
                loading={submitting}
                disabled={user?.twofa_enabled !== true}
              >
                {t("Generate one-time key")}
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card
            title={
              <Space>
                <ImportOutlined />
                {t("New platform: Paste transfer key")}
              </Space>
            }
            loading={loading}
          >
            <Form form={claimForm} layout="vertical">
              <Form.Item
                name="secret"
                label={t("One-time transfer key")}
                rules={[{ required: true, message: t("Paste the complete transfer key") }]}
              >
                <Input.TextArea
                  rows={5}
                  autoComplete="off"
                  placeholder="LTX1_…"
                  data-i18n-skip="true"
                />
              </Form.Item>
              <Alert
                type="warning"
                showIcon
                message={t(
                  "Pasting a valid key consumes it immediately. Review the preview before applying any data.",
                )}
                style={{ marginBottom: 16 }}
              />
              <Button type="primary" icon={<ImportOutlined />} onClick={claim} loading={submitting}>
                {t("Validate key & preview")}
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>

      {generated && (
        <Card>
          <Result
            status="success"
            title={t("Transfer key generated")}
            subTitle={t(
              "This key is shown only once. Copy it now and send it through a trusted private channel.",
            )}
            extra={[
              <Input.Password
                key="secret"
                value={generated.secret}
                readOnly
                visibilityToggle
                data-i18n-skip="true"
                style={{ width: "min(720px, 90vw)" }}
                addonAfter={
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(generated.secret);
                      message.success(t("Copied"));
                    }}
                  >
                    {t("Copy")}
                  </Button>
                }
              />,
              <Typography.Text key="expires" type="warning">
                {t("Expires")}: {new Date(generated.grant.expires_at).toLocaleString()}
              </Typography.Text>,
              <Button key="dismiss" onClick={() => setGenerated(null)}>
                {t("I saved the key")}
              </Button>,
            ]}
          />
        </Card>
      )}

      {preview && (
        <Card title={t("Required transfer preview")}>
          {preview.job.status === "completed" ? (
            <Result
              status="success"
              title={t("Platform data copied successfully")}
              subTitle={t(
                "Imported Guides, FAQs, and AI knowledge remain drafts until reviewed and published.",
              )}
            />
          ) : (
            <>
              <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
                <Descriptions.Item label={t("Source platform")}>
                  {preview.source?.platform_name || preview.job.source_platform_id}
                </Descriptions.Item>
                <Descriptions.Item label={t("Conflict policy")}>
                  {t("Skip existing records")}
                </Descriptions.Item>
                <Descriptions.Item label={t("Key status")}>{t("Consumed")}</Descriptions.Item>
                <Descriptions.Item label={t("Imported content status")}>
                  {t("Draft")}
                </Descriptions.Item>
              </Descriptions>
              <Row gutter={12} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title={t("Create")}
                      value={preview.job.preview?.totals?.create || 0}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic title={t("Skip")} value={preview.job.preview?.totals?.skip || 0} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title={t("Replace settings")}
                      value={preview.job.preview?.totals?.replace || 0}
                    />
                  </Card>
                </Col>
              </Row>
              <Table
                size="small"
                pagination={false}
                rowKey="module"
                dataSource={previewRows}
                style={{ marginTop: 16 }}
                columns={[
                  {
                    title: t("Data group"),
                    dataIndex: "module",
                    render: (value) =>
                      t(MODULES.find((module) => module.value === value)?.label || value),
                  },
                  { title: t("Create"), dataIndex: "create", width: 100 },
                  { title: t("Skip"), dataIndex: "skip", width: 100 },
                  { title: t("Replace"), dataIndex: "replace", width: 100 },
                ]}
              />
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
                message={t("Final security confirmation")}
                description={t(
                  "Review the counts carefully. Applying the transfer copies media and writes the selected configuration in one database transaction.",
                )}
              />
              <Divider />
              <Form form={applyForm} layout="vertical">
                <Form.Item
                  name="confirmation"
                  label={t("Type the destination platform name")}
                  rules={[{ required: true, message: t("Destination confirmation is required") }]}
                >
                  <Input placeholder={activePlatformName || t("Destination platform name")} />
                </Form.Item>
                <Form.Item
                  name="twofa_code"
                  label={t("Current 2FA code")}
                  rules={[
                    { required: true, len: 6, message: t("Enter a six-digit authenticator code") },
                  ]}
                >
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    prefix={<LockOutlined />}
                  />
                </Form.Item>
                <Button
                  type="primary"
                  danger
                  icon={<ImportOutlined />}
                  loading={submitting}
                  onClick={apply}
                  disabled={user?.twofa_enabled !== true}
                >
                  {t("Apply secure transfer")}
                </Button>
              </Form>
            </>
          )}
        </Card>
      )}

      <Card title={t("Outbound transfer keys")} loading={loading}>
        <Table
          rowKey="id"
          dataSource={state.grants || []}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: t("Created"),
              dataIndex: "created_at",
              render: (value) => (value ? new Date(value).toLocaleString() : "—"),
            },
            {
              title: t("Key hint"),
              dataIndex: "token_hint",
              render: (value) => (
                <Typography.Text code data-i18n-skip="true">
                  ••••{value}
                </Typography.Text>
              ),
            },
            {
              title: t("Data groups"),
              dataIndex: "modules",
              render: (values: string[]) =>
                (values || []).map((value) => (
                  <Tag key={value}>
                    {t(MODULES.find((module) => module.value === value)?.label || value)}
                  </Tag>
                )),
            },
            {
              title: t("Expires"),
              dataIndex: "expires_at",
              render: (value) => (value ? new Date(value).toLocaleString() : "—"),
            },
            {
              title: t("Status"),
              dataIndex: "status",
              render: (value) => (
                <Tag color={statusColor(value)}>{t(String(value).replaceAll("_", " "))}</Tag>
              ),
            },
            {
              title: t("Actions"),
              render: (_, row: TransferGrant) =>
                row.status === "created" ? (
                  <Button
                    danger
                    size="small"
                    onClick={() => revokeGrant(row.id)}
                    loading={submitting}
                  >
                    {t("Revoke key")}
                  </Button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Card>

      <Card
        title={t("Transfer history")}
        extra={
          <Button icon={<ReloadOutlined />} onClick={load}>
            {t("Refresh")}
          </Button>
        }
        loading={loading}
      >
        <Table
          rowKey="id"
          dataSource={state.jobs || []}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: t("Created"),
              dataIndex: "created_at",
              render: (value) => (value ? new Date(value).toLocaleString() : "—"),
            },
            {
              title: t("Direction"),
              render: (_, row: TransferJob) =>
                `${row.source_platform_name || row.source_platform_id} → ${row.target_platform_name || row.target_platform_id}`,
            },
            {
              title: t("Status"),
              dataIndex: "status",
              render: (value) => (
                <Tag color={statusColor(value)}>{t(String(value).replaceAll("_", " "))}</Tag>
              ),
            },
            {
              title: t("Result"),
              render: (_, row: TransferJob) =>
                row.result?.created == null
                  ? "—"
                  : `${t("Created")} ${row.result.created} · ${t("Skipped")} ${row.result.skipped} · ${t("Replaced")} ${row.result.replaced}`,
            },
            {
              title: t("Actions"),
              render: (_, row: TransferJob) =>
                row.status === "preview" ? (
                  <Button
                    size="small"
                    onClick={() =>
                      setPreview({
                        job: row,
                        source: {
                          platform_name:
                            row.source_platform_name || `Platform ${row.source_platform_id}`,
                        },
                      })
                    }
                  >
                    {t("Open preview")}
                  </Button>
                ) : row.rollback_available ? (
                  <Button
                    danger
                    size="small"
                    icon={<RollbackOutlined />}
                    onClick={() => setRollbackJob(row)}
                  >
                    {t("Rollback")}
                  </Button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Card>

      <Alert
        type="success"
        showIcon
        message={t("Security exclusions")}
        description={t(
          "Administrators, passwords, 2FA, sessions, customer conversations, staff data, audit logs, analytics, domains, DNS, SSL, route keys, API keys, provider secrets, connector secrets, and webhooks are never transferred.",
        )}
      />

      <Modal
        title={t("Rollback platform transfer")}
        open={Boolean(rollbackJob)}
        onCancel={() => setRollbackJob(null)}
        onOk={rollback}
        okButtonProps={{ danger: true, loading: submitting }}
        okText={t("Rollback")}
      >
        <Alert
          type="error"
          showIcon
          message={t(
            "This removes records created by this transfer and restores replaced settings.",
          )}
          style={{ marginBottom: 16 }}
        />
        <Form form={rollbackForm} layout="vertical">
          <Form.Item
            name="confirmation"
            label={t("Type ROLLBACK to confirm")}
            rules={[{ required: true, pattern: /^ROLLBACK$/, message: t("Type ROLLBACK exactly") }]}
          >
            <Input data-i18n-skip="true" />
          </Form.Item>
          <Form.Item
            name="twofa_code"
            label={t("Current 2FA code")}
            rules={[{ required: true, len: 6, message: t("Enter a six-digit authenticator code") }]}
          >
            <Input inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

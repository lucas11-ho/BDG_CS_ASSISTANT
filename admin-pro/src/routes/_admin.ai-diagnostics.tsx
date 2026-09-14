import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { CheckCircleFilled, CloseCircleFilled, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/ai-diagnostics")({ component: DiagnosticsPage });

function Bool({ v }: { v: boolean }) {
  return v ? (
    <Tag color="success" icon={<CheckCircleFilled />}>
      Yes
    </Tag>
  ) : (
    <Tag color="error" icon={<CloseCircleFilled />}>
      No
    </Tag>
  );
}

function DiagnosticsPage() {
  const [d, setD] = useState<any>(null);
  const [apiDiag, setApiDiag] = useState<any>(null);
  const [msg, setMsg] = useState("ဗိုက်ဆာနေတယ်၊ ဘာစားရမလဲ");
  const [reply, setReply] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    api.getDiagnostics().then(setD);
    api
      .getAdminApiDiagnostics()
      .then(setApiDiag)
      .catch((e: any) => setApiDiag({ ok: false, checks: [], error: e?.message }));
  };

  useEffect(() => {
    load();
  }, []);

  if (!d) return <Skeleton active paragraph={{ rows: 8 }} />;

  const runTest = async () => {
    setLoading(true);
    try {
      setReply(await api.testAI(msg || "ဗိုက်ဆာနေတယ်၊ ဘာစားရမလဲ"));
    } finally {
      setLoading(false);
    }
  };

  const selectedContent = reply?.diagnostics?.selected_content;
  const detectedLanguage = reply?.language || reply?.diagnostics?.selected_source_locale || "—";

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 12 }}>
        Test & Diagnostics
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="Production path: Assistant Setup → Menu & Images → one DeepSeek call"
        description="This test always starts a fresh session. It shows the exact runtime, detected message language, menu candidate count, selected approved item, and final resolution path."
        style={{ marginBottom: 12 }}
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card
            className="bdg-card"
            title="Production runtime"
            size="small"
            extra={
              <Button size="small" icon={<ReloadOutlined />} onClick={load}>
                Refresh
              </Button>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={12}>
                <div style={{ color: "#8ea0bd", fontSize: 12 }}>DEEPSEEK KEY PRESENT</div>
                <Bool v={d.deepSeekKeyPresent} />
              </Col>
              <Col xs={12}>
                <div style={{ color: "#8ea0bd", fontSize: 12 }}>AI ENABLED</div>
                <Bool v={d.aiEnabled} />
              </Col>
              <Col xs={12}>
                <Statistic title="Assistant sections" value={d.promptCount} />
              </Col>
              <Col xs={12}>
                <Statistic title="Prompt runtime" value={d.prompt_runtime?.version_number || 0} prefix="v" />
              </Col>
              <Col xs={12}>
                <Statistic title="Compiled prompt" value={d.prompt_runtime?.prompt_characters || 0} suffix="chars" />
              </Col>
              <Col xs={12}>
                <Statistic title="All Menu & Images" value={d.menuImageCount ?? d.counts?.menu_images ?? 0} />
              </Col>
              <Col xs={12}>
                <Statistic title="Live approved menu items" value={d.publishedMenuImageCount ?? d.counts?.published_menu_images ?? 0} />
              </Col>
              <Col xs={12}>
                <Statistic title="Response time" value={d.responseTimeMs} suffix="ms" />
              </Col>
              <Col xs={24}>
                <Space wrap>
                  <Tag color="blue">{d.routing_engine || "assistant-profile-menu-image-one-call"}</Tag>
                  <Tag color="green">General answers allowed</Tag>
                  <Tag color="purple">Automatic message language</Tag>
                  <Tag>Memory {d.memory_enabled ? "enabled" : "disabled"}</Tag>
                </Space>
              </Col>
              <Col xs={24}>
                <Alert
                  type={d.recentErrors?.length ? "warning" : "success"}
                  showIcon
                  message="Latest AI diagnostic"
                  description={d.lastApiError}
                />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card className="bdg-card" title="Fresh AI reply test" size="small">
            <Space direction="vertical" style={{ width: "100%" }}>
              <Input.TextArea
                rows={4}
                value={msg}
                onChange={(event) => setMsg(event.target.value)}
                placeholder="Type a Burmese or English customer question..."
              />
              <Button type="primary" icon={<SendOutlined />} onClick={runTest} loading={loading}>
                Send fresh test
              </Button>
              {reply ? (
                <div
                  style={{
                    background: "var(--navy-700)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: 6,
                    padding: 12,
                    color: "#c5d0e4",
                  }}
                >
                  <div style={{ color: "#8ea0bd", fontSize: 11, marginBottom: 6 }}>
                    FRESH TEST SESSION · {reply.latencyMs} ms
                  </div>
                  <Typography.Paragraph style={{ color: "#c5d0e4", whiteSpace: "pre-wrap" }}>
                    {reply.reply}
                  </Typography.Paragraph>
                  <Space wrap>
                    <Tag color="green">
                      Runtime v{reply.diagnostics?.prompt_runtime?.version_number || reply.prompt_runtime?.version_number || "—"}
                    </Tag>
                    <Tag>
                      Hash {(reply.diagnostics?.prompt_runtime?.hash || reply.prompt_runtime?.hash || "").slice(0, 12) || "—"}
                    </Tag>
                    <Tag>{reply.diagnostics?.prompt_sections_used ?? "—"} sections</Tag>
                    <Tag>{reply.diagnostics?.candidate_catalog_size ?? 0} menu candidates</Tag>
                    <Tag color="purple">Language {detectedLanguage}</Tag>
                    <Tag color={selectedContent ? "success" : "blue"}>
                      {selectedContent ? `Matched ${selectedContent.title}` : "General prompt answer"}
                    </Tag>
                    <Tag color={reply.diagnostics?.memory_reset?.reset ? "warning" : "blue"}>Fresh memory</Tag>
                  </Space>
                  <DescriptionsForReply reply={reply} />
                </div>
              ) : null}
            </Space>
          </Card>
        </Col>

        <Col xs={24}>
          <Card className="bdg-card" title="Retired AI modules" size="small">
            <Space wrap>
              {(d.retired_modules || d.source_router?.retired_modules || []).map((module: string) => (
                <Tag key={module}>{module.replaceAll("_", " ")}</Tag>
              ))}
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0 }}>
              Their Admin routes redirect to the simplified pages, their backend Admin endpoints return HTTP 410, and they no longer participate in live AI decisions. Historical database records remain archived for rollback and audit safety.
            </Typography.Paragraph>
          </Card>
        </Col>

        <Col xs={24}>
          <Card className="bdg-card" title="Recent provider errors and fallbacks" size="small">
            <Table
              rowKey={(row: any) => row.id || row.request_id || row.error_type}
              className="bdg-table"
              size="small"
              dataSource={d.recentErrors || []}
              pagination={{ pageSize: 10 }}
              columns={[
                { title: "Time", dataIndex: "created_at", width: 190 },
                {
                  title: "Result",
                  render: (_: any, row: any) => (
                    <Tag
                      color={
                        row.response_status === "degraded"
                          ? "warning"
                          : row.provider_status === "error"
                            ? "error"
                            : "success"
                      }
                    >
                      {row.response_status || row.provider_status || row.error_type || "unknown"}
                    </Tag>
                  ),
                },
                { title: "Resolution path", dataIndex: "resolution_path", render: (value: string) => value || "—" },
                { title: "Attempts", dataIndex: "provider_attempts", render: (value: number) => Number(value || 0) },
                { title: "Customer asked", dataIndex: "customer_message", ellipsis: true },
                { title: "Menu intent", dataIndex: "intent_id", render: (value: string) => value || "—" },
                { title: "Platform", dataIndex: "platform_key", render: (value: string) => value || "default" },
                {
                  title: "Reason",
                  render: (_: any, row: any) => (
                    <Typography.Text copyable={{ text: row.degraded_reason || row.error_type || row.error_detail || "" }}>
                      {row.degraded_reason || row.error_type || row.error_detail || "—"}
                    </Typography.Text>
                  ),
                },
                {
                  title: "Request ID",
                  dataIndex: "request_id",
                  ellipsis: true,
                  render: (value: string) => <Typography.Text copyable>{value || "—"}</Typography.Text>,
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card className="bdg-card" title="Admin API diagnostics" size="small">
            {apiDiag?.error ? <Alert type="error" showIcon message={apiDiag.error} style={{ marginBottom: 12 }} /> : null}
            <Table
              rowKey={(row: any) => row.name}
              className="bdg-table"
              size="small"
              dataSource={apiDiag?.checks || []}
              pagination={false}
              columns={[
                { title: "Check", dataIndex: "name" },
                { title: "Endpoint", dataIndex: "endpoint" },
                {
                  title: "Status",
                  render: (_: any, row: any) => {
                    const status = String(row.status || (row.ok ? "verified" : "failed"));
                    const color = status === "failed" ? "error" : status === "verified" || status === "configured" ? "success" : "warning";
                    return <Tag color={color}>{status.replaceAll("_", " ")}</Tag>;
                  },
                },
                { title: "Time", dataIndex: "ms", render: (value: number | null) => Number.isFinite(value) ? String(value) + " ms" : "—" },
                { title: "Detail", render: (_: any, row: any) => row.error || String(row.detail ?? "") },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}

function DescriptionsForReply({ reply }: { reply: any }) {
  const resolutionPath = reply?.diagnostics?.resolution_path || reply?.resolution_path || "—";
  const sourceType = reply?.diagnostics?.selected_source_type || "none";
  return (
    <div style={{ marginTop: 10, color: "#8ea0bd", fontSize: 12 }}>
      Resolution: {resolutionPath} · Selected source: {sourceType} · Provider attempts: {reply?.diagnostics?.provider_attempts ?? 0}
    </div>
  );
}

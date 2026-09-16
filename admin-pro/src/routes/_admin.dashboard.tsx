import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Empty, List, Row, Skeleton, Space, Statistic, Tag } from "antd";
import {
  AppstoreOutlined,
  BookOutlined,
  CloudOutlined,
  DatabaseOutlined,
  EyeOutlined,
  GlobalOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";
import { contentAnalyticsApi } from "@/lib/content-analytics-api";
import { useAdminI18n } from "@/i18n/runtime";

export const Route = createFileRoute("/_admin/dashboard")({
  component: DashboardPage,
});

function statusColor(status: string) {
  if (["healthy", "verified", "configured"].includes(status)) return "success";
  if (["not_enabled", "available", "unknown"].includes(status)) return "warning";
  return "error";
}

function statusLabel(status: string) {
  return String(status || "unknown").replaceAll("_", " ");
}

function StatCard({ icon, title, value, tone }: any) {
  return (
    <Card className="bdg-card bdg-stat" size="small">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: tone === "ok" ? "rgba(34,197,94,0.15)" : tone === "warn" ? "rgba(245,158,11,0.15)" : "rgba(59,130,246,0.15)",
            color: tone === "ok" ? "#22c55e" : tone === "warn" ? "#f59e0b" : "#3b82f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <Statistic title={title} value={value} />
        </div>
      </div>
    </Card>
  );
}

function DashboardPage() {
  const { t } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [traffic, setTraffic] = useState<any>(null);
  const [error, setError] = useState("");
  const trafficInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    api.getDashboardStats()
      .then((result) => { if (active) setData(result); })
      .catch((reason: any) => { if (active) setError(reason?.message || t("Failed to load dashboard")); });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      if (!active || trafficInFlightRef.current || document.visibilityState === "hidden") return;
      trafficInFlightRef.current = true;
      try {
        const result = await contentAnalyticsApi.getTrafficAnalytics("7d");
        if (active) setTraffic(result);
      } catch {} finally { trafficInFlightRef.current = false; }
    };
    const schedule = () => { if (active) timer = window.setTimeout(async () => { await load(); schedule(); }, 60_000); };
    void load().finally(schedule);
    const onVisibility = () => { if (document.visibilityState === "visible") { if (timer) window.clearTimeout(timer); void load().finally(schedule); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; if (timer) window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const checks = useMemo(
    () => new Map((data?.systemHealth?.checks || []).map((check: any) => [check.name, check])),
    [data],
  );

  if (error) return <Alert type="error" showIcon message={error} />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const deepseek: any = checks.get("deepseek") || { status: data.deepSeekStatus || "unknown" };
  const database: any = checks.get("database") || { status: data.databaseStatus || "unknown" };
  const r2: any = checks.get("r2") || { status: data.r2StorageStatus || "unknown" };

  const stats = [
    { icon: <BookOutlined />, title: t("Total Guides"), value: data.totalGuides },
    { icon: <QuestionCircleOutlined />, title: t("Total FAQ"), value: data.totalFAQ },
    { icon: <AppstoreOutlined />, title: t("Total Categories"), value: data.totalCategories },
    { icon: <RobotOutlined />, title: t("AI Prompt Sections"), value: data.aiPromptSections },
    { icon: <ThunderboltOutlined />, title: t("AI Content Items"), value: data.aiContentItems },
    { icon: <MessageOutlined />, title: t("Chat Sessions"), value: data.chatSessions },
    { icon: <ThunderboltOutlined />, title: t("DeepSeek Status"), value: t(statusLabel(deepseek.status)), tone: statusColor(deepseek.status) === "success" ? "ok" : "warn" },
    { icon: <DatabaseOutlined />, title: t("Database Status"), value: t(statusLabel(database.status)), tone: statusColor(database.status) === "success" ? "ok" : "warn" },
    { icon: <CloudOutlined />, title: t("R2 Storage Status"), value: t(statusLabel(r2.status)), tone: statusColor(r2.status) === "success" ? "ok" : "warn" },
  ];

  const healthMetrics = [
    { label: t("Overall status"), value: t(statusLabel(data.systemHealth?.status || "unknown")), status: data.systemHealth?.status || "unknown" },
    { label: t("API version"), value: data.systemHealth?.version || "—", status: "verified" },
    { label: t("Database latency"), value: Number.isFinite(database.latency_ms) ? String(database.latency_ms) + " ms" : t(statusLabel(database.status)), status: database.status },
    { label: t("R2 storage"), value: Number.isFinite(r2.latency_ms) ? String(r2.latency_ms) + " ms" : t(statusLabel(r2.status)), status: r2.status },
  ];

  return (
    <>
      {data.unavailableResources?.length ? (
        <Alert
          type="warning"
          showIcon
          message={t("Some dashboard data is unavailable")}
          description={`${t("Unavailable")}: ${data.unavailableResources.map((resource: string) => t(resource)).join(", ")}`}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <Row gutter={[12, 12]}>
        {stats.map((item) => (
          <Col xs={24} sm={12} md={8} lg={6} key={String(item.title)}>
            <StatCard {...item} value={item.value ?? "—"} />
          </Col>
        ))}
      </Row>

      <Card
        className="bdg-card"
        size="small"
        style={{ marginTop: 12 }}
        title={<Space><span style={{ color: "#22c55e" }}>●</span><span>Live Website Traffic</span><Tag color="green">LIVE</Tag></Space>}
        extra={<Link to="/analytics"><Button size="small">Open analytics</Button></Link>}
      >
        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}><Statistic title="Active now" value={traffic?.active_now ?? "—"} prefix={<GlobalOutlined />} suffix={<span style={{ fontSize: 11, color: "#8ea0bd" }}>2 min</span>} /></Col>
          <Col xs={12} md={6}><Statistic title="Visitors today" value={traffic?.visitors_today ?? "—"} prefix={<TeamOutlined />} /></Col>
          <Col xs={12} md={6}><Statistic title="Page views today" value={traffic?.pageviews_today ?? "—"} prefix={<EyeOutlined />} /></Col>
          <Col xs={12} md={6}><Statistic title="Visitors · 7 days" value={traffic?.visitors_7d ?? "—"} prefix={<GlobalOutlined />} /></Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={16}>
          <Card
            className="bdg-card"
            title={t("System Health")}
            size="small"
            extra={data.systemHealth?.timestamp ? new Date(data.systemHealth.timestamp).toLocaleString() : null}
          >
            <Row gutter={[12, 12]}>
              {healthMetrics.map((metric) => (
                <Col xs={12} md={6} key={String(metric.label)}>
                  <div style={{ color: "#8ea0bd", fontSize: 12, textTransform: "uppercase" }}>{metric.label}</div>
                  <div style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginTop: 4, wordBreak: "break-word" }}>{metric.value}</div>
                  <Tag color={statusColor(metric.status)} style={{ marginTop: 6 }}>
                    {t(statusLabel(metric.status))}
                  </Tag>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card className="bdg-card" title={t("Recent Activity")} size="small">
            {data.recentActivity?.length ? (
              <List
                dataSource={data.recentActivity}
                renderItem={(activity: any) => (
                  <List.Item style={{ borderColor: "var(--border-dim)" }}>
                    <List.Item.Meta
                      title={<span style={{ color: "#e6edf7" }}>{activity.action}</span>}
                      description={
                        <span style={{ color: "#8ea0bd" }}>
                          {activity.actor}
                          {activity.time ? " · " + new Date(activity.time).toLocaleString() : ""}
                          {activity.details ? <><br />{activity.details}</> : null}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("No recent activity")} />
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}

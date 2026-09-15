import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, Col, Empty, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import { EyeOutlined, GlobalOutlined, LaptopOutlined, ReloadOutlined, TeamOutlined } from "@ant-design/icons";
import { contentAnalyticsApi } from "@/lib/content-analytics-api";

export const Route = createFileRoute("/_admin/analytics")({ component: TrafficAnalyticsPage });
const { Text, Title } = Typography;

type Range = "24h" | "7d" | "30d";

function TrafficAnalyticsPage() {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await contentAnalyticsApi.getTrafficAnalytics(range);
      setData(result);
      setError("");
    } catch (reason: any) {
      setError(reason?.message || "Failed to load traffic analytics");
    } finally { if (!quiet) setLoading(false); }
  }, [range]);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const maxLive = useMemo(() => Math.max(1, ...(data?.live_30m || []).map((item: any) => Number(item.views || 0))), [data]);
  const rangeLabel = range === "24h" ? "Last 24 hours" : range === "30d" ? "Last 30 days" : "Last 7 days";

  return <>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <div>
        <Space align="center"><Title level={3} style={{ margin: 0 }}>Traffic Analytics</Title><Tag color="green">LIVE</Tag></Space>
        <Text type="secondary">Anonymous first-party visitor analytics for the current platform. Refreshes every 10 seconds.</Text>
      </div>
      <Space>
        <Select<Range> value={range} onChange={setRange} style={{ width: 150 }} options={[{ value: "24h", label: "24 hours" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />
        <Tag icon={<ReloadOutlined />}>{data?.generated_at ? new Date(data.generated_at).toLocaleTimeString() : "Waiting…"}</Tag>
      </Space>
    </div>

    {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

    <Row gutter={[12, 12]}>
      <Col xs={24} sm={12} lg={6}><Card loading={loading} size="small"><Statistic title="Active now" value={data?.active_now ?? 0} prefix={<span style={{ color: "#22c55e" }}>●</span>} suffix={<span style={{ fontSize: 12, color: "#8ea0bd" }}>last 2 min</span>} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card loading={loading} size="small"><Statistic title="Visitors today" value={data?.visitors_today ?? 0} prefix={<TeamOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card loading={loading} size="small"><Statistic title="Page views today" value={data?.pageviews_today ?? 0} prefix={<EyeOutlined />} /></Card></Col>
      <Col xs={24} sm={12} lg={6}><Card loading={loading} size="small"><Statistic title="Visitors · 7 days" value={data?.visitors_7d ?? 0} prefix={<GlobalOutlined />} /></Card></Col>
    </Row>

    <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
      <Col xs={24} lg={16}>
        <Card title="Live traffic · last 30 minutes" size="small" loading={loading}>
          {(data?.live_30m || []).length ? <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.live_30m.length}, minmax(0, 1fr))`, alignItems: "end", gap: 10, minHeight: 220 }}>
            {data.live_30m.map((item: any, index: number) => {
              const height = Math.max(8, Math.round((Number(item.views || 0) / maxLive) * 170));
              return <div key={`${item.label}-${index}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: 210 }}>
                <Text strong>{item.views}</Text>
                <div title={`${item.views} page views`} style={{ width: "72%", maxWidth: 52, height, minHeight: 8, background: "linear-gradient(180deg,#4d8dff,#2864d7)", borderRadius: "7px 7px 3px 3px", marginTop: 6 }} />
                <Text type="secondary" style={{ fontSize: 11, marginTop: 7 }}>{new Date(item.label).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
              </div>;
            })}
          </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No page views recorded yet" />}
          <Space style={{ marginTop: 10 }} wrap><Tag>{rangeLabel}: {data?.range_visitors ?? 0} visitors</Tag><Tag>{rangeLabel}: {data?.range_pageviews ?? 0} page views</Tag></Space>
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card title="Device mix" size="small" loading={loading}>
          {(data?.devices || []).length ? data.devices.map((item: any) => {
            const total = Math.max(1, Number(data.range_pageviews || 0));
            const percent = Math.round((Number(item.views || 0) / total) * 100);
            return <div key={item.device_type} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><Space><LaptopOutlined /><span style={{ textTransform: "capitalize" }}>{item.device_type || "unknown"}</span></Space><span>{item.views}</span></div>
              <Progress percent={percent} showInfo={false} size="small" />
            </div>;
          }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No device data yet" />}
        </Card>
      </Col>
    </Row>

    <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
      <Col xs={24} lg={14}>
        <Card title={`Top pages · ${rangeLabel}`} size="small" loading={loading}>
          <Table rowKey={(row: any) => row.path} size="small" pagination={false} dataSource={data?.top_pages || []} columns={[
            { title: "Page", dataIndex: "path", ellipsis: true },
            { title: "Visitors", dataIndex: "visitors", width: 100 },
            { title: "Views", dataIndex: "views", width: 80 },
          ]} />
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card title="Languages" size="small" loading={loading}>
          <Table rowKey={(row: any) => row.locale} size="small" pagination={false} dataSource={data?.locales || []} columns={[
            { title: "Locale", dataIndex: "locale", render: (value: string) => <Tag>{String(value || "").toUpperCase()}</Tag> },
            { title: "Visitors", dataIndex: "visitors", width: 100 },
            { title: "Views", dataIndex: "views", width: 80 },
          ]} />
        </Card>
      </Col>
    </Row>

    <Alert type="info" showIcon style={{ marginTop: 12 }} message="Privacy-first tracking" description="This analytics feature uses an anonymous browser visitor ID and session ID. It does not store raw visitor IP addresses. Analytics failures never block the public Guide Center." />
  </>;
}

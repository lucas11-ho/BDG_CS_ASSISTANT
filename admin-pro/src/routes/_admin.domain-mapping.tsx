import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Form, Input, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import { CopyOutlined, DeleteOutlined, GlobalOutlined, ReloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import LocalizedHelp from "@/components/LocalizedHelp";

export const Route = createFileRoute("/_admin/domain-mapping")({ component: DomainMappingPage });

function statusColor(value: string) {
  if (["active", "verified"].includes(String(value || "").toLowerCase())) return "green";
  if (["error", "disabled"].includes(String(value || "").toLowerCase())) return "red";
  return "gold";
}

function DomainMappingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const cloudflareReady = data?.cloudflare?.configured === true;
  const hostingMode = data?.platform?.hosting_mode || "luke_shared";

  const load = async () => {
    setLoading(true);
    try { setData(await api.getDomainMapping()); }
    catch (error: any) { message.error(error?.message || "Could not load hosting settings"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const changeHostingMode = async (nextMode: "luke_shared" | "custom_domain") => {
    if (nextMode === hostingMode) return;
    setBusy(true);
    try {
      const result = await api.updateHostingMode(nextMode);
      setData(result);
      message.success(nextMode === "luke_shared" ? "Luke Shared Hosting enabled" : "Custom Domain mode enabled");
    } catch (error: any) { message.error(error?.message || "Could not change hosting mode"); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true);
    try { setData(await api.generateDomainMapping()); message.success("Luke platform links refreshed"); }
    catch (error: any) { message.error(error?.message || "Could not generate links"); }
    finally { setBusy(false); }
  };

  const copy = async (value?: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    message.success("Link copied");
  };

  const addDomain = async (values: any) => {
    setBusy(true);
    try { await api.createDomainMappingDomain(values); form.resetFields(); message.success("Domain added. Provision it through Cloudflare next."); await load(); }
    catch (error: any) { message.error(error?.message || "Could not add domain"); }
    finally { setBusy(false); }
  };

  const updateCors = async (id: number, enabled: boolean) => {
    setBusy(true);
    try {
      const result = await api.updateMappedDomainCors(id, enabled);
      message.success(result?.domain?.cors_effective ? "Verified domain is trusted for API access" : enabled ? "API access will activate after DNS and SSL verification" : "API access disabled for this hostname");
      await load();
    } catch (error: any) { message.error(error?.message || "Could not update API access"); }
    finally { setBusy(false); }
  };

  const runDomainAction = async (action: "provision" | "sync" | "delete", id: number) => {
    setBusy(true);
    try {
      if (action === "provision") await api.provisionMappedDomain(id);
      if (action === "sync") await api.syncMappedDomain(id);
      if (action === "delete") await api.deleteMappedDomain(id);
      message.success(action === "delete" ? "Domain mapping archived" : "Cloudflare status refreshed");
      await load();
    } catch (error: any) { message.error(error?.message || "Domain action failed"); }
    finally { setBusy(false); }
  };

  const linkRow = (label: string, value?: string) => (
    <Descriptions.Item label={label}>
      {value ? <Space wrap><Typography.Link href={value} target="_blank" rel="noreferrer">{value}</Typography.Link><Button size="small" icon={<CopyOutlined />} onClick={() => void copy(value)}>Copy</Button></Space> : "—"}
    </Descriptions.Item>
  );

  const columns = [
    { title: "Site", dataIndex: "site_kind", render: (value: string) => <Tag>{value === "staff" ? "CS WORKSPACE" : String(value || "guide").toUpperCase()}</Tag> },
    { title: "Hostname", dataIndex: "hostname", render: (value: string, row: any) => <Space direction="vertical" size={0}><Typography.Text>{value}</Typography.Text><Typography.Link href={row.custom_url} target="_blank" rel="noreferrer">{row.custom_url}</Typography.Link></Space> },
    { title: "Provisioning", dataIndex: "provisioning_status", render: (value: string) => <Tag color={statusColor(value)}>{value || "planned"}</Tag> },
    { title: "Cloudflare", render: (_: any, row: any) => <Space direction="vertical" size={0}><span>Hostname: <Tag color={statusColor(row.cloudflare_status)}>{row.cloudflare_status || "not created"}</Tag></span><span>SSL: <Tag color={statusColor(row.cloudflare_ssl_status)}>{row.cloudflare_ssl_status || "not checked"}</Tag></span></Space> },
    { title: "Ready", render: (_: any, row: any) => row.ready ? <Tag color="green">Ready</Tag> : <Tag color="gold">DNS / SSL pending</Tag> },
    { title: "API / CORS", render: (_: any, row: any) => <Space direction="vertical" size={2}><Space><Switch size="small" checked={row.cors_allowed !== false} loading={busy} onChange={(checked) => void updateCors(row.id, checked)} /><Typography.Text>{row.cors_allowed === false ? "Disabled" : "Enabled"}</Typography.Text></Space>{row.cors_effective ? <Tag color="green">Automatically trusted</Tag> : row.cors_allowed === false ? <Tag>Not trusted</Tag> : <Tag color="gold">Activates after verification</Tag>}</Space> },
    { title: "Action", render: (_: any, row: any) => <Space wrap><Button size="small" type="primary" icon={<SafetyCertificateOutlined />} loading={busy} disabled={!cloudflareReady} title={cloudflareReady ? undefined : "Configure Cloudflare in Render first"} onClick={() => void runDomainAction(row.cloudflare_hostname_id ? "sync" : "provision", row.id)}>{row.cloudflare_hostname_id ? "Refresh status" : "Provision"}</Button><Popconfirm title="Archive this domain mapping?" description="Cloudflare will be asked to remove the hostname when configured." onConfirm={() => void runDomainAction("delete", row.id)}><Button size="small" danger icon={<DeleteOutlined />} loading={busy}>Remove</Button></Popconfirm></Space> },
  ];

  return <>
    <LocalizedHelp copies={{
      en: { title: "Luke Hosting", body: "Luke provides a neutral white-label hosting layer. Use Luke Shared Hosting when the client does not want to buy a domain. Use Custom Domain when the client wants their own hostname.", bullets: ["Shared hosting uses the Admin, CS Workspace, Guide, and Chat origins configured for this deployment.", "The platform route stays permanent even if the client changes their display name.", "Custom domains continue to use Cloudflare verification and automatic dynamic CORS trust."] },
      zh: { title: "Luke 托管", body: "Luke 提供中立的白标托管层。客户不购买域名时使用 Luke Shared Hosting；客户需要自己的域名时使用 Custom Domain。", bullets: ["共享托管会自动生成 Admin、Staff、Guide 和 Chat 链接。", "平台路由保持稳定，不会因品牌名称修改而变化。", "自定义域名继续使用 Cloudflare 验证和动态 CORS。"] },
      my: { title: "Luke Hosting", body: "Luke သည် client brand ကို သီးခြားစီထိန်းချုပ်နိုင်သော neutral white-label hosting layer ဖြစ်သည်။ Domain မဝယ်လိုသော client များအတွက် Luke Shared Hosting ကို အသုံးပြုပါ။", bullets: ["Shared hosting သည် deployment တွင် သတ်မှတ်ထားသော Admin၊ CS Workspace၊ Guide နှင့် Chat origin များကို အသုံးပြုသည်။", "Platform route သည် brand name ပြောင်းသော်လည်း မပြောင်းပါ။", "Custom Domain များအတွက် Cloudflare verification နှင့် dynamic CORS ကို ဆက်သုံးမည်။"] },
    }} />

    <Card loading={loading} title="Hosting Mode">
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Alert showIcon type="info" message="White-label hosting" description="Luke is the neutral hosting layer. Your client's own brand remains visible in Chat, Guide, Staff, and Admin. No provider branding is required for the client experience." />
        <Space wrap>
          <Button type={hostingMode === "luke_shared" ? "primary" : "default"} loading={busy} onClick={() => void changeHostingMode("luke_shared")}>Luke Shared Hosting</Button>
          <Button type={hostingMode === "custom_domain" ? "primary" : "default"} loading={busy} onClick={() => void changeHostingMode("custom_domain")}>Custom Domain</Button>
          <Tag color={hostingMode === "luke_shared" ? "blue" : "purple"}>{hostingMode === "luke_shared" ? "Shared hosting active" : "Custom domain active"}</Tag>
        </Space>
        <Typography.Text type="secondary">Shared mode requires no client DNS, SSL, or per-client CORS changes. Custom Domain uses the verified Cloudflare workflow below.</Typography.Text>
      </Space>
    </Card>

    <Card loading={loading} title={<Space><GlobalOutlined />Luke Shared Hosting links</Space>} extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>Refresh</Button><Button type="primary" loading={busy} onClick={() => void generate()}>Refresh links</Button></Space>} style={{ marginTop: 12 }}>
      <Alert showIcon type="success" message="One shared domain set for every client" description="Generated links use the effective shared origins configured for this deployment. New clients are separated by their immutable /p/<platform-route> path." style={{ marginBottom: 12 }} />
      {data ? <Descriptions bordered column={1}>
        {linkRow("Admin", data.generated?.admin)}
        {linkRow("CS Workspace", data.generated?.staff)}
        {linkRow("Guide", data.generated?.guide)}
        {linkRow("Chat", data.generated?.chat)}
        <Descriptions.Item label="Effective Admin origin"><Typography.Text code>{data.shared_hosting?.origins?.admin || "—"}</Typography.Text></Descriptions.Item>
        <Descriptions.Item label="Effective CS Workspace origin"><Typography.Text code>{data.shared_hosting?.origins?.staff || "—"}</Typography.Text></Descriptions.Item>
        <Descriptions.Item label="Effective Guide origin"><Typography.Text code>{data.shared_hosting?.origins?.guide || "—"}</Typography.Text></Descriptions.Item>
        <Descriptions.Item label="Effective Chat origin"><Typography.Text code>{data.shared_hosting?.origins?.chat || "—"}</Typography.Text></Descriptions.Item>
        <Descriptions.Item label="Platform route"><Typography.Text code>{data.platform?.route_prefix || "—"}</Typography.Text></Descriptions.Item>
        <Descriptions.Item label="Client DNS required"><Tag color="green">No</Tag></Descriptions.Item>
        <Descriptions.Item label="Per-client CORS change"><Tag color="green">No</Tag></Descriptions.Item>
      </Descriptions> : null}
    </Card>

    <Card title="Custom Domain (optional)" style={{ marginTop: 12 }}>
      <Alert showIcon type={data?.cloudflare?.configured ? "success" : "warning"} message={data?.cloudflare?.configured ? "Cloudflare custom-domain provisioning is configured" : "Cloudflare custom-domain provisioning is not configured"} description={data?.cloudflare?.configured ? `SaaS CNAME target: ${data.cloudflare.cname_target || "—"}. This section is only needed when the client owns a custom domain.` : `Shared Luke hosting still works. Configure these Render variables only when you need client-owned custom domains: ${(data?.cloudflare?.missing_env || ["CLOUDFLARE_CUSTOM_HOSTNAMES_ENABLED", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID", "CLOUDFLARE_SAAS_CNAME_TARGET"]).join(", ")}.`} style={{ marginBottom: 12 }} />
      <Alert showIcon type="info" message="Automatic custom-domain API/CORS trust" description="You do not need to add each client domain to Render ALLOWED_ORIGINS. Verified client domains are trusted dynamically after Cloudflare hostname and SSL status become active." style={{ marginBottom: 12 }} />
      <Form form={form} layout="inline" onFinish={addDomain} initialValues={{ site_kind: "guide" }}>
        <Form.Item name="hostname" rules={[{ required: true, message: "Enter a hostname" }, { pattern: /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i, message: "Use a hostname without https:// or a path" }]}><Input placeholder="support.example.com" style={{ width: 260 }} /></Form.Item>
        <Form.Item name="site_kind"><Select style={{ width: 150 }} options={[{ value: "guide", label: "Guide" }, { value: "chat", label: "Chat" }, { value: "admin", label: "Admin" }, { value: "staff", label: "CS Workspace" }]} /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" loading={busy}>Add custom domain</Button></Form.Item>
      </Form>
    </Card>

    <Card title="Mapped custom domains" style={{ marginTop: 12 }}>
      <Table rowKey="id" loading={loading} dataSource={data?.custom_domains || []} columns={columns} pagination={false} expandable={{ expandedRowRender: (row: any) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Text type="secondary">DNS records to add at the customer's DNS provider</Typography.Text><Descriptions size="small" bordered column={1}><Descriptions.Item label="API / CORS policy">{row.cors_allowed === false ? "Disabled" : "Enabled"}</Descriptions.Item><Descriptions.Item label="Effective API origin">{row.cors_effective ? `https://${row.hostname}` : "Not trusted until verification is complete"}</Descriptions.Item></Descriptions><Table size="small" rowKey={(record: any, index) => `${record.type}-${record.name}-${index}`} dataSource={row.dns?.records || []} pagination={false} columns={[{ title: "Type", dataIndex: "type" }, { title: "Name", dataIndex: "name" }, { title: "Value", dataIndex: "value" }, { title: "Purpose", dataIndex: "purpose" }]} /></Space> }} />
      {data?.custom_domains?.length ? null : <Alert showIcon type="info" message="No custom domains" description="This is normal when the client uses Luke Shared Hosting." style={{ marginTop: 12 }} />}
    </Card>
  </>;
}

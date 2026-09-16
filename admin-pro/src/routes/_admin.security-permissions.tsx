import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  LockOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { api, getCurrentUser } from "@/lib/api";
import { useAdminI18n } from "@/i18n/runtime";

export const Route = createFileRoute("/_admin/security-permissions")({ component: SecurityPermissionsPage });

type Member = {
  id: number;
  admin_user_id?: number;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  is_active?: boolean;
  twofa_enabled?: boolean;
  require_2fa?: boolean;
  twofa_required?: boolean;
  permissions?: string[];
  permission_catalog?: string[];
};

const GROUP_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  platform: "Platform",
  content: "Content",
  ai: "AI",
  support: "Customer Service",
  chat: "Chat",
  appearance: "Appearance",
  audit: "Audit",
  system: "System",
};

const SIDEBAR_PREVIEW: Array<[string, string]> = [
  ["dashboard.view", "Dashboard"],
  ["platform.view", "Platform Control Center"],
  ["content.view", "Site Content / Categories / Guide / FAQ"],
  ["ai.view", "Assistant Setup / AI Knowledge / Diagnostics"],
  ["support.view", "Customer Service"],
  ["chat.view", "Chat tools"],
  ["appearance.view", "Guide Theme / Chat Theme / Global Buttons"],
  ["audit.view", "Audit Logs"],
  ["system.view", "System diagnostics"],
];

function normalizePermissions(values: string[], catalog: string[]) {
  const allowed = new Set(catalog);
  const selected = new Set(values.filter((value) => allowed.has(value)));
  for (const permission of [...selected]) {
    if (permission.endsWith(".manage")) {
      const view = permission.replace(/\.manage$/, ".view");
      if (allowed.has(view)) selected.add(view);
    }
  }
  return [...selected].sort();
}

function presetPermissions(name: string, catalog: string[]) {
  const all = [...catalog];
  if (name === "full") return all;
  if (name === "viewer") return all.filter((permission) => permission.endsWith(".view"));
  if (name === "content") return all.filter((permission) =>
    ["dashboard.view", "content.view", "content.manage", "appearance.view"].includes(permission),
  );
  if (name === "support") return all.filter((permission) =>
    ["dashboard.view", "support.view", "support.manage", "chat.view", "chat.manage"].includes(permission),
  );
  if (name === "ai") return all.filter((permission) =>
    ["dashboard.view", "ai.view", "ai.manage", "content.view"].includes(permission),
  );
  return [];
}

function SecurityPermissionsPage() {
  const { t } = useAdminI18n();
  const currentUser = getCurrentUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [platform, setPlatform] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [require2fa, setRequire2fa] = useState(false);
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm] = Form.useForm();

  const selected = members.find((member) => Number(member.id) === Number(selectedId)) || null;
  const catalog = useMemo(() => {
    const fromMembers = members.flatMap((member) => member.permission_catalog || []);
    return [...new Set(fromMembers.length ? fromMembers : [
      "dashboard.view", "platform.view", "platform.manage", "content.view", "content.manage",
      "ai.view", "ai.manage", "support.view", "support.manage", "chat.view", "chat.manage",
      "appearance.view", "appearance.manage", "audit.view", "system.view",
    ])];
  }, [members]);

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const permission of catalog) {
      const group = permission.split(".")[0] || "other";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(permission);
    }
    return [...map.entries()];
  }, [catalog]);

  const load = async () => {
    setLoading(true);
    try {
      const [context, rows] = await Promise.all([
        api.getPlatformContext(),
        api.list("admin-users") as Promise<Member[]>,
      ]);
      const next = rows || [];
      setPlatform((context as any)?.platform || null);
      setMembers(next);
      const nextId = selectedId && next.some((member) => Number(member.id) === Number(selectedId))
        ? selectedId
        : next[0]?.id || null;
      setSelectedId(nextId);
    } catch (error: any) {
      message.error(error?.message || t("Failed to load Security & Permissions"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!selected) return;
    setPermissions(normalizePermissions(selected.permissions || [], catalog));
    setRequire2fa(selected.require_2fa === true || selected.twofa_required === true);
    setRole(selected.role || "viewer");
  }, [selectedId, members, catalog]);

  const ownerLocked = selected?.role === "platform_owner";
  const self = !!selected?.email && String(selected.email).toLowerCase() === String(currentUser?.email || "").toLowerCase();

  const setPermission = (permission: string, checked: boolean) => {
    const next = new Set(permissions);
    if (checked) next.add(permission); else next.delete(permission);
    if (permission.endsWith(".manage") && checked) {
      const view = permission.replace(/\.manage$/, ".view");
      if (catalog.includes(view)) next.add(view);
    }
    if (permission.endsWith(".view") && !checked) {
      const manage = permission.replace(/\.view$/, ".manage");
      next.delete(manage);
    }
    setPermissions(normalizePermissions([...next], catalog));
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.update("admin-users", selected.id, {
        name: selected.name,
        role: ownerLocked ? "platform_owner" : role,
        status: selected.is_active === false || selected.status === "inactive" ? "inactive" : "active",
        permissions: ownerLocked ? catalog : normalizePermissions(permissions, catalog),
        require_2fa: require2fa,
      });
      message.success(t("Security policy saved"));
      await load();
    } catch (error: any) {
      message.error(error?.message || t("Could not save security policy"));
    } finally {
      setSaving(false);
    }
  };

  const assign = async () => {
    try {
      const values = await assignForm.validateFields();
      await api.create("admin-users", values);
      message.success(t("Administrator assigned to this platform"));
      setAssignOpen(false);
      assignForm.resetFields();
      await load();
    } catch (error: any) {
      if (!error?.errorFields) message.error(error?.message || t("Could not assign administrator"));
    }
  };

  const forceLogout = async () => {
    if (!selected) return;
    try {
      await api.forceLogoutPlatformAdmin(selected.id);
      message.success(t("All active sessions were revoked"));
    } catch (error: any) {
      message.error(error?.message || t("Could not force logout"));
    }
  };

  const reset2fa = async () => {
    if (!selected) return;
    try {
      await api.resetPlatformAdmin2FA(selected.id);
      message.success(t("2FA was reset. The administrator must set it up again."));
      await load();
    } catch (error: any) {
      message.error(error?.message || t("Could not reset 2FA"));
    }
  };

  return <>
    <div className="bdg-filters" style={{ marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <h2 style={{ margin: 0 }}>{t("Security & Permissions")}</h2>
        <div style={{ color: "#8ea0bd", fontSize: 12 }}>
          {platform?.platform_name || platform?.name || t("Current platform")} · {t("membership-scoped access control")}
        </div>
      </div>
      <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t("Refresh")}</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setAssignOpen(true)}>{t("Assign admin")}</Button>
    </div>

    <Alert
      showIcon
      type="info"
      icon={<SafetyCertificateOutlined />}
      message={t("Permissions belong to this platform membership")}
      description={t("The same administrator can have different permissions on different platforms. Manage permission always includes the matching View permission. Platform owners remain unrestricted.")}
      style={{ marginBottom: 12 }}
    />

    <Row gutter={14}>
      <Col xs={24} lg={9}>
        <Card title={t("Administrators")} className="bdg-card" styles={{ body: { padding: 0 } }}>
          <Table
            size="small"
            loading={loading}
            rowKey="id"
            pagination={false}
            dataSource={members}
            rowClassName={(row) => Number(row.id) === Number(selectedId) ? "ant-table-row-selected" : ""}
            onRow={(row) => ({ onClick: () => setSelectedId(Number(row.id)), style: { cursor: "pointer" } })}
            columns={[
              { title: t("Admin"), render: (_: any, row: Member) => <div><b>{row.name || row.email}</b><div style={{ color: "#8ea0bd", fontSize: 11 }}>{row.email}</div></div> },
              { title: t("Role"), width: 130, render: (_: any, row: Member) => <Tag color={row.role === "platform_owner" ? "gold" : "blue"}>{String(row.role || "viewer").replaceAll("_", " ")}</Tag> },
              { title: "2FA", width: 82, render: (_: any, row: Member) => <Tag color={row.twofa_enabled ? "success" : "warning"}>{row.twofa_enabled ? t("On") : t("Off")}</Tag> },
            ]}
          />
        </Card>
      </Col>

      <Col xs={24} lg={15}>
        {!selected ? <Card loading={loading} /> : <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Card className="bdg-card" title={<Space><LockOutlined />{selected.name || selected.email}</Space>}>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Typography.Text type="secondary">{t("Role")}</Typography.Text>
                <Select
                  value={role}
                  disabled={ownerLocked || self}
                  onChange={setRole}
                  style={{ width: "100%", marginTop: 6 }}
                  options={["platform_admin", "content_manager", "ai_manager", "support_analyst", "viewer"].map((value) => ({ value, label: value.replaceAll("_", " ") }))}
                />
              </Col>
              <Col xs={24} md={12}>
                <Typography.Text type="secondary">{t("Require 2FA for this platform")}</Typography.Text>
                <div style={{ marginTop: 10 }}><Switch checked={require2fa} onChange={setRequire2fa} /> <span style={{ marginLeft: 8 }}>{require2fa ? t("Required") : t("Optional")}</span></div>
              </Col>
            </Row>
            {ownerLocked ? <Alert type="warning" showIcon style={{ marginTop: 12 }} message={t("Platform owner permissions are unrestricted and cannot be reduced here.")} /> : null}
          </Card>

          <Card className="bdg-card" title={t("Permission groups")} extra={<Space wrap>
            <Select
              placeholder={t("Apply preset")}
              style={{ width: 170 }}
              onChange={(value) => setPermissions(normalizePermissions(presetPermissions(value, catalog), catalog))}
              options={[
                { value: "full", label: t("Full admin") },
                { value: "content", label: t("Content manager") },
                { value: "support", label: t("Support manager") },
                { value: "ai", label: t("AI manager") },
                { value: "viewer", label: t("View only") },
              ]}
              disabled={ownerLocked}
            />
            <Button size="small" disabled={ownerLocked} onClick={() => setPermissions(normalizePermissions(catalog, catalog))}>{t("Check all")}</Button>
            <Button size="small" disabled={ownerLocked} onClick={() => setPermissions([])}>{t("Clear all")}</Button>
          </Space>}>
            <Row gutter={[12, 12]}>
              {grouped.map(([group, items]) => <Col xs={24} md={12} key={group}>
                <Card size="small" title={t(GROUP_LABELS[group] || group)}>
                  <Space direction="vertical">
                    {items.map((permission) => <Checkbox
                      key={permission}
                      checked={ownerLocked || permissions.includes(permission)}
                      disabled={ownerLocked}
                      onChange={(event) => setPermission(permission, event.target.checked)}
                    >{permission.endsWith(".manage") ? t("Manage") : t("View")} <Typography.Text type="secondary">({permission})</Typography.Text></Checkbox>)}
                  </Space>
                </Card>
              </Col>)}
            </Row>
          </Card>

          <Card className="bdg-card" title={t("Sidebar preview")}>
            <Space wrap>
              {SIDEBAR_PREVIEW.filter(([permission]) => ownerLocked || permissions.includes(permission)).map(([permission, label]) => <Tag key={permission} color="blue">{t(label)}</Tag>)}
              {!ownerLocked && !SIDEBAR_PREVIEW.some(([permission]) => permissions.includes(permission)) ? <Typography.Text type="secondary">{t("No sidebar modules selected")}</Typography.Text> : null}
            </Space>
          </Card>

          <Card className="bdg-card" title={t("Security actions")}>
            <Space wrap>
              <Popconfirm title={t("Force logout this administrator from all active Admin sessions?")} onConfirm={() => void forceLogout()}>
                <Button icon={<LogoutOutlined />} danger>{t("Force logout")}</Button>
              </Popconfirm>
              <Popconfirm title={t("Reset this administrator's 2FA setup?")} description={t("They will need to enroll an authenticator again before using required 2FA access.")} onConfirm={() => void reset2fa()}>
                <Button icon={<SafetyCertificateOutlined />}>{t("Reset 2FA")}</Button>
              </Popconfirm>
              <Button type="primary" loading={saving} onClick={() => void save()}>{t("Save security policy")}</Button>
            </Space>
          </Card>
        </Space>}
      </Col>
    </Row>

    <Drawer open={assignOpen} onClose={() => setAssignOpen(false)} width={520} title={t("Assign administrator to this platform")} extra={<Button type="primary" onClick={() => void assign()}>{t("Assign")}</Button>}>
      <Alert type="info" showIcon message={t("Existing accounts are reused by email. New accounts require a temporary password of at least 12 characters.")} style={{ marginBottom: 14 }} />
      <Form form={assignForm} layout="vertical" initialValues={{ role: "viewer" }}>
        <Form.Item name="name" label={t("Name")}><Input /></Form.Item>
        <Form.Item name="email" label={t("Email")} rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
        <Form.Item name="role" label={t("Platform role")} rules={[{ required: true }]}>
          <Select options={["platform_admin", "content_manager", "ai_manager", "support_analyst", "viewer"].map((value) => ({ value, label: value.replaceAll("_", " ") }))} />
        </Form.Item>
        <Form.Item name="temporary_password" label={t("Temporary password")}><Input.Password minLength={12} /></Form.Item>
      </Form>
    </Drawer>
  </>;
}

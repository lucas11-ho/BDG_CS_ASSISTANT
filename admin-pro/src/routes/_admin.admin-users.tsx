import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Checkbox, Drawer, Form, Input, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api, getActiveAdminPlatformRoute, getCurrentUser } from "@/lib/api";
import { useAdminI18n } from "@/i18n/runtime";

export const Route = createFileRoute("/_admin/admin-users")({ component: AdminUsersPage });

type AdminUser = {
  id: number | string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin?: string;
  twofa_enabled?: boolean;
  twofa_required?: boolean;
  permissions?: string[];
  permissions_configured?: boolean;
};

const PERMISSION_OPTIONS = [
  "dashboard.view",
  "platform.view", "platform.manage",
  "content.view", "content.manage",
  "ai.view", "ai.manage",
  "support.view", "support.manage",
  "chat.view", "chat.manage",
  "appearance.view", "appearance.manage",
  "audit.view", "system.view",
];

function AdminUsersPage() {
  const { t } = useAdminI18n();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [resetForm] = Form.useForm();
  const platformContext = Boolean(getActiveAdminPlatformRoute());
  const currentUser = getCurrentUser();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.list("admin-users")) as AdminUser[]);
    } catch (error: any) {
      message.error(error?.message || t("Failed to load admins"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const create = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      role: platformContext ? "platform_admin" : "admin",
      status: "active",
      twofa_required: !platformContext,
      permissions: ["dashboard.view"],
    });
    setOpen(true);
  };

  const edit = (row: AdminUser) => {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      if (editing) await api.update("admin-users", editing.id, values);
      else await api.create("admin-users", values);
      message.success(t(editing ? "Admin updated" : "Admin created"));
      setOpen(false);
      await load();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || t("Unable to save administrator"));
    }
  };

  const changePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      if (values.password !== values.confirm_password) {
        message.error(t("Passwords do not match"));
        return;
      }
      await api.changeAdminPassword(passwordUser!.id, values.password);
      message.success(t("Password changed and existing sessions revoked"));
      setPasswordOpen(false);
      await load();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || t("Unable to change password"));
    }
  };

  const forceLogout = async (row: AdminUser) => {
    try {
      await api.forceLogoutAdmin(row.id);
      message.success(t("All active sessions were revoked"));
      await load();
    } catch (error: any) {
      message.error(error?.message || t("Unable to force logout"));
    }
  };

  const openReset2FA = (row: AdminUser) => {
    setResetUser(row);
    resetForm.resetFields();
    setResetOpen(true);
  };

  const reset2FA = async () => {
    try {
      const values = await resetForm.validateFields();
      if (!resetUser) return;
      await api.resetAdmin2FA(resetUser.id, values.confirmation, values.owner_code || "");
      message.success(t("2FA was reset and all sessions were revoked"));
      setResetOpen(false);
      await load();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || t("Unable to reset 2FA"));
    }
  };

  const columns: ColumnsType<AdminUser> = [
    { title: t("Name"), dataIndex: "name" },
    { title: t("Email"), dataIndex: "email" },
    {
      title: t("Role"),
      dataIndex: "role",
      width: 140,
      render: (value) => <Tag color={value === "owner" ? "gold" : "blue"}>{String(value).replaceAll("_", " ")}</Tag>,
    },
    {
      title: t("Status"),
      dataIndex: "status",
      width: 110,
      render: (value) => <Tag color={value === "active" ? "green" : "default"}>{t(value)}</Tag>,
    },
    {
      title: t("2FA"),
      dataIndex: "twofa_enabled",
      width: 110,
      render: (value) => <Tag color={value ? "green" : "orange"}>{t(value ? "Enabled" : "Disabled")}</Tag>,
    },
    ...(!platformContext ? [{
      title: t("2FA policy"),
      dataIndex: "twofa_required",
      width: 130,
      render: (value: boolean) => <Tag color={value ? "blue" : "default"}>{t(value ? "Required" : "Optional")}</Tag>,
    }] : []),
    { title: t("Last login"), dataIndex: "lastLogin", width: 190, render: (value) => value || "—" },
    {
      title: t("Actions"),
      width: platformContext ? 260 : 520,
      render: (_, row) => {
        const isSelf = String(row.email || "").toLowerCase() === String(currentUser?.email || "").toLowerCase();
        return (
          <Space wrap>
            <Button size="small" icon={<EditOutlined />} onClick={() => edit(row)}>{t("Edit")}</Button>
            <Button
              size="small"
              icon={<KeyOutlined />}
              onClick={() => {
                setPasswordUser(row);
                passwordForm.resetFields();
                setPasswordOpen(true);
              }}
            >
              {t("Password")}
            </Button>
            {!platformContext && !isSelf ? (
              <>
                <Popconfirm
                  title={t("Force logout this administrator?")}
                  description={t("Every active token for this account will stop working immediately.")}
                  okText={t("Force logout")}
                  cancelText={t("Cancel")}
                  onConfirm={() => forceLogout(row)}
                >
                  <Button size="small" icon={<LogoutOutlined />}>{t("Force logout")}</Button>
                </Popconfirm>
                <Button
                  size="small"
                  danger
                  icon={<SafetyCertificateOutlined />}
                  disabled={!row.twofa_enabled}
                  onClick={() => openReset2FA(row)}
                >
                  {t("Reset 2FA")}
                </Button>
              </>
            ) : null}
            {row.role !== "owner" ? (
              <Popconfirm
                title={t("Delete this admin?")}
                okText={t("Delete")}
                cancelText={t("Cancel")}
                onConfirm={() => api.remove("admin-users", row.id).then(load)}
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ) : null}
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <div className="bdg-filters">
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{t("Admin Users")}</h2>
          <div style={{ color: "#8ea0bd", fontSize: 12 }}>
            {t(platformContext
              ? "Manage administrators assigned to this platform."
              : "Owner security actions are protected, confirmed, and recorded in Audit Logs.")}
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>{t("Refresh")}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={create}>{t("Create admin")}</Button>
        </Space>
      </div>

      <Table
        className="bdg-table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1100 }}
      />

      <Drawer
        title={t(editing ? "Edit admin" : "Create admin")}
        width={520}
        open={open}
        onClose={() => setOpen(false)}
        extra={<Space><Button onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button type="primary" onClick={save}>{t("Save")}</Button></Space>}
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="name" label={t("Name")} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label={t("Email")} rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
          {!editing ? (
            <Form.Item name="password" label={t("Temporary password")} rules={[{ required: true, min: 12 }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          ) : null}
          <Form.Item name="role" label={t("Role")}>
            <Select options={platformContext
              ? ["platform_admin", "content_manager", "ai_manager", "support_analyst", "viewer"].map((value) => ({ value, label: value.replaceAll("_", " ") }))
              : editing?.role === "owner"
                ? [{ value: "owner", label: t("Owner (protected)") }]
                : [{ value: "admin", label: t("Admin") }]}
              disabled={!platformContext && editing?.role === "owner"}
            />
          </Form.Item>
          <Form.Item name="status" label={t("Status")}>
            <Select options={[{ value: "active", label: t("Active") }, { value: "inactive", label: t("Inactive") }]} />
          </Form.Item>
          {!platformContext && editing?.role !== "owner" ? (
            <>
              <Form.Item name="twofa_required" label={t("Require two-factor authentication")} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Alert
                type="info"
                showIcon
                message={t("Backend-enforced permissions")}
                description={t("The administrator sees only allowed areas, and direct API requests are rejected by the server.")}
                style={{ marginBottom: 16 }}
              />
              <Form.Item
                name="permissions"
                label={t("Admin permissions")}
                rules={[{ required: true, type: "array", min: 1, message: t("Select at least one permission") }]}
              >
                <Checkbox.Group style={{ width: "100%" }}>
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    {PERMISSION_OPTIONS.map((permission) => (
                      <Checkbox key={permission} value={permission}>
                        <Typography.Text>{t(permission)}</Typography.Text>
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              </Form.Item>
            </>
          ) : null}
          {!platformContext && editing?.role === "owner" ? (
            <Alert type="success" showIcon message={t("The owner always has full access and cannot be restricted.")} />
          ) : null}
        </Form>
      </Drawer>

      <Drawer
        title={[t("Change password"), passwordUser?.email].filter(Boolean).join(" · ")}
        width={420}
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        extra={<Space><Button onClick={() => setPasswordOpen(false)}>{t("Cancel")}</Button><Button type="primary" onClick={changePassword}>{t("Update password")}</Button></Space>}
      >
        <Alert
          type="info"
          showIcon
          message={t("Changing the password revokes the administrator's existing sessions.")}
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" form={passwordForm}>
          <Form.Item name="password" label={t("New password")} rules={[{ required: true, min: 12 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirm_password" label={t("Confirm password")} rules={[{ required: true, min: 12 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={[t("Reset 2FA"), resetUser?.email].filter(Boolean).join(" · ")}
        width={440}
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        extra={<Space><Button onClick={() => setResetOpen(false)}>{t("Cancel")}</Button><Button danger type="primary" onClick={reset2FA}>{t("Reset 2FA")}</Button></Space>}
      >
        <Alert
          type="warning"
          showIcon
          message={t("This removes 2FA and revokes every active session for the selected administrator.")}
          description={t("If your owner account has 2FA enabled, enter your own authenticator code to authorize this action.")}
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" form={resetForm}>
          <Form.Item
            name="confirmation"
            label={t("Type the administrator email to confirm")}
            rules={[
              { required: true, message: t("Type the target administrator email") },
              {
                validator: (_, value) =>
                  String(value || "").trim().toLowerCase() === String(resetUser?.email || "").trim().toLowerCase()
                    ? Promise.resolve()
                    : Promise.reject(new Error(t("Email confirmation does not match"))),
              },
            ]}
          >
            <Input autoComplete="off" placeholder={resetUser?.email} />
          </Form.Item>
          <Form.Item
            name="owner_code"
            label={t("Owner 2FA code (required if enabled)")}
          >
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              onChange={(event) => resetForm.setFieldValue("owner_code", event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}

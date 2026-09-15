import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Popconfirm,
  QRCode,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { CopyOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useAdminI18n } from "@/i18n/runtime";

type Props = {
  open: boolean;
  onClose: () => void;
};

type AdminProfile = {
  id?: number | string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  twofa_enabled?: boolean;
  lastLogin?: string;
};

type SetupResult = {
  secret: string;
  otpauth_url: string;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AccountSecurityDrawer({ open, onClose }: Props) {
  const { t } = useAdminI18n();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = (await api.getMe()) as AdminProfile & { user?: AdminProfile };
    setProfile(result?.user || result || null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSetup(null);
    setCode("");
    load().catch((error: unknown) =>
      message.error(errorMessage(error, t("Failed to load account security"))),
    );
  }, [load, open, t]);

  const beginSetup = async () => {
    setBusy(true);
    try {
      const result = (await api.setup2FA()) as SetupResult;
      setSetup({ secret: String(result.secret || ""), otpauth_url: String(result.otpauth_url || "") });
      setCode("");
    } catch (error: unknown) {
      message.error(errorMessage(error, t("Unable to start 2FA setup")));
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    if (!/^\d{6}$/.test(code)) {
      message.warning(t("Enter a valid 6-digit code"));
      return;
    }
    setBusy(true);
    try {
      await api.enable2FA(code);
      message.success(t("Two-factor authentication enabled"));
      setSetup(null);
      setCode("");
      await load();
    } catch (error: unknown) {
      message.error(errorMessage(error, t("Unable to enable 2FA")));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!/^\d{6}$/.test(code)) {
      message.warning(t("Enter your current 6-digit code"));
      return;
    }
    setBusy(true);
    try {
      await api.disable2FA(code);
      message.success(t("Two-factor authentication disabled"));
      setCode("");
      await load();
    } catch (error: unknown) {
      message.error(errorMessage(error, t("Unable to disable 2FA")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={t("Account & Security")}
      width={520}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {!profile ? (
        <Skeleton active paragraph={{ rows: 7 }} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card size="small" className="bdg-card">
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t("Name")}>{profile.name || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Email")}>{profile.email || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Role")}>
                <Tag color={profile.role === "owner" ? "gold" : "blue"}>{profile.role || "admin"}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("Two-factor authentication")}>
                <Tag color={profile.twofa_enabled ? "success" : "warning"}>
                  {t(profile.twofa_enabled ? "Enabled" : "Disabled")}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            size="small"
            className="bdg-card"
            title={<Space><SafetyCertificateOutlined />{t("Authenticator app")}</Space>}
          >
            {profile.twofa_enabled ? (
              <>
                <Alert
                  type="success"
                  showIcon
                  message={t("Your account is protected with 2FA")}
                  description={t("A current authenticator code is required to disable protection.")}
                />
                <Divider />
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("Current 6-digit code")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
                <Popconfirm
                  title={t("Disable two-factor authentication?")}
                  description={t("Your account will be protected only by its password.")}
                  okText={t("Disable 2FA")}
                  cancelText={t("Cancel")}
                  okButtonProps={{ danger: true }}
                  onConfirm={disable}
                >
                  <Button danger loading={busy} style={{ marginTop: 12 }}>
                    {t("Disable 2FA")}
                  </Button>
                </Popconfirm>
              </>
            ) : setup ? (
              <>
                <Alert
                  type="info"
                  showIcon
                  message={t("Scan this code with your authenticator app")}
                  description={t("You can also copy the manual setup key. Verify one code before 2FA becomes active.")}
                />
                <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                  <QRCode value={setup.otpauth_url} size={190} bordered={false} />
                </div>
                <Typography.Text type="secondary">{t("Manual setup key")}</Typography.Text>
                <Typography.Paragraph
                  copyable={{ text: setup.secret, icon: [<CopyOutlined key="copy" />, <CopyOutlined key="copied" />] }}
                  style={{ marginTop: 4, wordBreak: "break-all", fontFamily: "monospace" }}
                >
                  {setup.secret}
                </Typography.Paragraph>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("Enter the 6-digit code")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
                <Space style={{ marginTop: 12 }}>
                  <Button type="primary" onClick={enable} loading={busy}>{t("Verify and enable")}</Button>
                  <Button onClick={() => { setSetup(null); setCode(""); }}>{t("Cancel")}</Button>
                </Space>
              </>
            ) : (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message={t("Two-factor authentication is disabled")}
                  description={t("Protect this administrator account with a time-based authenticator code.")}
                />
                <Button type="primary" onClick={beginSetup} loading={busy} style={{ marginTop: 12 }}>
                  {t("Set up 2FA")}
                </Button>
              </>
            )}
          </Card>

          <Alert
            type="info"
            showIcon
            message={t("Security recovery")}
            description={t("Do not share the setup key. If access is lost, contact the platform owner for a controlled reset.")}
          />
        </Space>
      )}
    </Drawer>
  );
}

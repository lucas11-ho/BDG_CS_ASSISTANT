import { useCallback, useEffect, useRef, useState } from "react";
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
  required?: boolean;
  onClose: () => void;
  onProfileChange?: (profile: AdminProfile) => void;
};

type AdminProfile = {
  id?: number | string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  twofa_enabled?: boolean;
  twofa_required?: boolean;
  twofa_setup_required?: boolean;
  permissions?: string[];
  lastLogin?: string;
};

type SetupResult = {
  secret: string;
  otpauth_url: string;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AccountSecurityDrawer({ open, required = false, onClose, onProfileChange }: Props) {
  const { t } = useAdminI18n();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [code, setCode] = useState("");
  const [testCode, setTestCode] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const profileChangeRef = useRef(onProfileChange);
  profileChangeRef.current = onProfileChange;

  const load = useCallback(async () => {
    const result = (await api.getMe()) as AdminProfile & { user?: AdminProfile };
    const next = result?.user || result || null;
    setProfile(next);
    if (next) profileChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSetup(null);
    setCode("");
    setTestCode("");
    setTestResult(null);
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

  const test2fa = async () => {
    if (!/^\d{6}$/.test(testCode)) { message.warning(t('Enter a valid 6-digit code')); return; }
    setBusy(true);
    try {
      const result: any = await api.verifyOwn2FA(testCode);
      setTestResult(result);
      setTestCode('');
      message.success(t('2FA code verified successfully'));
    } catch (error: unknown) {
      message.error(errorMessage(error, t('2FA verification failed')));
    } finally { setBusy(false); }
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
      closable={!required}
      maskClosable={!required}
      keyboard={!required}
      destroyOnHidden
    >
      {!profile ? (
        <Skeleton active paragraph={{ rows: 7 }} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {required ? (
            <Alert
              type="error"
              showIcon
              message={t("Two-factor authentication setup is required")}
              description={t("The platform owner requires 2FA for this account. Set it up before using the Admin console.")}
            />
          ) : null}
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
                  <Button danger loading={busy} disabled={profile.twofa_required} style={{ marginTop: 12 }}>
                    {t("Disable 2FA")}
                  </Button>
                </Popconfirm>
                <Divider />
                <Typography.Title level={5} style={{ marginBottom: 6 }}>{t('Test my 2FA code')}</Typography.Title>
                <Typography.Paragraph type="secondary">
                  {t('Verify your authenticator is working. A successful test consumes this 30-second code, so wait for the next code before using 2FA again.')}
                </Typography.Paragraph>
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={testCode} onChange={(event) => setTestCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('Current 6-digit code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  <Button onClick={() => void test2fa()} loading={busy}>{t('Test code')}</Button>
                </Space.Compact>
                {testResult?.verified ? <Alert type="success" showIcon style={{ marginTop: 10 }} message={t('Code verified and consumed')} description={`${t('Use a new authenticator code after approximately')} ${testResult.next_code_in_seconds || 30}s.`} /> : null}
                {profile.twofa_required ? (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    {t("2FA is required by the platform owner and cannot be disabled.")}
                  </Typography.Paragraph>
                ) : null}
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

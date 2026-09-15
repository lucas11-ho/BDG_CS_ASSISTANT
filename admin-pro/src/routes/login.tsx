import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Form, Input, Button, Checkbox, ConfigProvider, Select, Space, theme, message, Alert } from "antd";
import { GlobalOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useAdminI18n } from "@/i18n/runtime";
import type { AdminLocale } from "@/i18n/messages";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { locale, setLocale, t } = useAdminI18n();
  const [twofaRequired, setTwofaRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      const res: any = await api.login(values.email, values.password, values.twofa_code, values.remember === true);
      if (res?.twofa_required) {
        setTwofaRequired(true);
        message.info(t("Enter your 2FA code"));
        return;
      }
      message.success(t("Signed in"));
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      message.error(e?.message || t("Sign in failed"));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: "#3b82f6", colorBgContainer: "#0f172a", borderRadius: 6 },
      }}
    >
      <div className="bdg-login-wrap">
        <div className="bdg-login-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="bdg-brand-mark">B</div>
              <div>
                <div style={{ color: "#fff", fontWeight: 600 }}>Luke Platform</div>
                <div style={{ color: "#8ea0bd", fontSize: 12 }}>{t("Business Admin Console / 业务管理后台")}</div>
              </div>
            </div>
            <Space size={4}>
              <GlobalOutlined style={{ color: "#8ea0bd" }} />
              <Select
                aria-label={t("Language")}
                size="small"
                value={locale}
                onChange={(value) => setLocale(value as AdminLocale)}
                style={{ width: 108 }}
                options={[
                  { value: "en", label: "English" },
                  { value: "zh-CN", label: "中文" },
                  { value: "my-MM", label: "မြန်မာ" },
                ]}
              />
            </Space>
          </div>
          <h2 style={{ color: "#fff", marginBottom: 4, fontSize: 20 }}>{t("Sign in / 登录")}</h2>
          <p style={{ color: "#8ea0bd", marginTop: 0, marginBottom: 20, fontSize: 13 }}>
            {t("Enter your credentials to access the admin console. / 输入账号密码进入管理后台。")}
          </p>
          <Form layout="vertical" onFinish={onFinish} initialValues={{ email: "", remember: false }}>
            {twofaRequired && <Alert type="info" showIcon message={t("2FA required")} description={t("Open your authenticator app and enter the 6-digit code.")} style={{ marginBottom: 16 }} />}
            <Form.Item label={t("Email / 邮箱")} name="email" rules={[{ required: true, type: "email" }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder="you@bdg.io" autoComplete="username" />
            </Form.Item>
            <Form.Item label={t("Password / 密码")} name="password" rules={[{ required: true }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="••••••••" autoComplete="current-password" />
            </Form.Item>
            {twofaRequired && (
              <Form.Item label={t("2FA code")} name="twofa_code" rules={[{ required: true, len: 6 }]}>
                <Input size="large" maxLength={6} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
              </Form.Item>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>{t("Remember me / 记住我")}</Checkbox>
              </Form.Item>
              <span style={{ color: "#8ea0bd", fontSize: 12 }}>{t("Contact the owner to reset access")}</span>
            </div>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>{t("Sign in / 登录")}</Button>
          </Form>
          <div style={{ marginTop: 20, fontSize: 12, color: "#55698a", textAlign: "center" }}>
            © 2026 Luke · {t("Secure platform access")}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

import { Alert } from "antd";
import { useAdminI18n } from "@/i18n/runtime";

export type AdminHelpLocale = "en" | "zh" | "my";
export type AdminHelpCopy = { title: string; body: string; bullets?: string[] };

export default function LocalizedHelp({
  copies,
  type = "info",
}: {
  copies: Record<AdminHelpLocale, AdminHelpCopy>;
  type?: "info" | "warning" | "success";
}) {
  const { locale } = useAdminI18n();
  const key: AdminHelpLocale = locale === "zh-CN" ? "zh" : locale === "my-MM" ? "my" : "en";
  const copy = copies[key] || copies.en;
  return <Alert
    showIcon
    type={type}
    style={{ marginBottom: 12 }}
    message={copy.title}
    description={<div><p style={{ marginBottom: copy.bullets?.length ? 8 : 0 }}>{copy.body}</p>{copy.bullets?.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{copy.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}</div>}
  />;
}

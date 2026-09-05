import { ReactNode, useEffect, useState } from "react";
import {
  Layout,
  Menu,
  Dropdown,
  Avatar,
  Space,
  Breadcrumb,
  Select,
  Tag,
  ConfigProvider,
  theme,
} from "antd";
import type { MenuProps } from "antd";
import {
  DashboardOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  RobotOutlined,
  MonitorOutlined,
  MessageOutlined,
  MessageFilled,
  BgColorsOutlined,
  AuditOutlined,
  TeamOutlined,
  UserOutlined,
  LogoutOutlined,
  DownOutlined,
  LinkOutlined,
  ApartmentOutlined,
} from "@ant-design/icons";
import { Link, useLocation, useNavigate, useMatches } from "@tanstack/react-router";
import { api, getActiveAdminPlatformRoute, getCurrentUser, logout } from "@/lib/api";

const { Sider, Header, Content } = Layout;
const ADMIN_VERSION = "v1.18.1";

const NAV: { key: string; to: string; label: string; icon: ReactNode; group?: string }[] = [
  {
    key: "/dashboard",
    to: "/dashboard",
    label: "Dashboard",
    icon: <DashboardOutlined />,
    group: "OVERVIEW",
  },
  {
    key: "/platform-control-center",
    to: "/platform-control-center",
    label: "Platform Control Center",
    icon: <ApartmentOutlined />,
    group: "PLATFORM",
  },
  {
    key: "/domain-mapping",
    to: "/domain-mapping",
    label: "Domain Mapping",
    icon: <LinkOutlined />,
    group: "PLATFORM",
  },

  {
    key: "/site-content",
    to: "/site-content",
    label: "Site Content",
    icon: <FileTextOutlined />,
    group: "CONTENT",
  },
  {
    key: "/categories",
    to: "/categories",
    label: "Categories",
    icon: <AppstoreOutlined />,
    group: "CONTENT",
  },
  {
    key: "/guide-images",
    to: "/guide-images",
    label: "Guide",
    icon: <FileTextOutlined />,
    group: "CONTENT",
  },
  { key: "/faq", to: "/faq", label: "FAQ", icon: <QuestionCircleOutlined />, group: "CONTENT" },

  {
    key: "/ai-prompt-manager",
    to: "/ai-prompt-manager",
    label: "Assistant Setup",
    icon: <RobotOutlined />,
    group: "AI",
  },
  {
    key: "/ai-knowledge",
    to: "/ai-knowledge",
    label: "AI Knowledge",
    icon: <QuestionCircleOutlined />,
    group: "AI",
  },
  {
    key: "/ai-content-studio",
    to: "/ai-content-studio",
    label: "Menu & Images",
    icon: <BulbOutlined />,
    group: "AI",
  },
  {
    key: "/ai-diagnostics",
    to: "/ai-diagnostics",
    label: "Test & Diagnostics",
    icon: <MonitorOutlined />,
    group: "AI",
  },

  {
    key: "/customer-service",
    to: "/customer-service",
    label: "Customer Service",
    icon: <TeamOutlined />,
    group: "CUSTOMER SERVICE",
  },

  {
    key: "/chat-quick-replies",
    to: "/chat-quick-replies",
    label: "Chat Quick Replies",
    icon: <MessageOutlined />,
    group: "CHAT",
  },
  {
    key: "/chat-logs",
    to: "/chat-logs",
    label: "Chat Logs",
    icon: <MessageFilled />,
    group: "CHAT",
  },
  {
    key: "/unmatched-questions",
    to: "/unmatched-questions",
    label: "Unmatched Questions",
    icon: <MessageOutlined />,
    group: "CHAT",
  },

  { key: "/theme-settings?section=guide", to: "/theme-settings?section=guide", label: "Guide Theme", icon: <BgColorsOutlined />, group: "APPEARANCE" },
  { key: "/theme-settings?section=chat", to: "/theme-settings?section=chat", label: "Chat Theme", icon: <BgColorsOutlined />, group: "APPEARANCE" },
  { key: "/action-buttons", to: "/action-buttons", label: "Global Buttons", icon: <LinkOutlined />, group: "ENGAGEMENT" },
  {
    key: "/audit-logs",
    to: "/audit-logs",
    label: "Audit Logs",
    icon: <AuditOutlined />,
    group: "SETTINGS",
  },
  {
    key: "/admin-users",
    to: "/admin-users",
    label: "Admin Users",
    icon: <TeamOutlined />,
    group: "SETTINGS",
  },
];

const ZH: Record<string, string> = {
  Dashboard: "仪表盘",
  "Site Content": "网站内容",
  Categories: "分类",
  Guide: "指南",
  FAQ: "常见问题",
  "Assistant Setup": "助手设置", "AI Knowledge": "AI 知识", "Customer Service": "客户服务", "CUSTOMER SERVICE": "客户服务",
  "Menu & Images": "菜单与图片",
  "AI Knowledge Import": "AI 知识导入",
  "AI Q&A": "AI 问答",
  "AI Source Router": "AI 来源路由",
  "Prompt Version History": "提示词版本历史",
  "Global Buttons": "全局按钮", "Guide Theme": "指南主题", "Chat Theme": "聊天主题",
  "Test & Diagnostics": "测试与诊断",
  "Chat Quick Replies": "聊天快捷回复",
  "Chat Logs": "聊天记录",
  "Unmatched Questions": "未匹配问题",
  APPEARANCE: "外观", ENGAGEMENT: "互动",
  "Audit Logs": "审计日志",
  "Admin Users": "管理员账号",
  "Platform Control Center": "平台控制中心",
  "Domain Mapping": "域名映射",
  "AI Reliability": "AI 可靠性",
  "AI Response Quality": "AI 回应质量",
  PLATFORM: "平台",
  OVERVIEW: "概览",
  CONTENT: "内容",
  AI: "AI",
  CHAT: "聊天",
  SETTINGS: "设置",
  Console: "控制台",
  "Sign out": "退出登录",
  "My Profile": "我的资料",
};
const MY: Record<string, string> = {
  Dashboard: "ဒက်ရှ်ဘုတ်", "Platform Control Center": "ပလက်ဖောင်းထိန်းချုပ်မှု", "Domain Mapping": "ဒိုမိန်းချိတ်ဆက်မှု", "Site Content": "ဆိုက်အကြောင်းအရာ", Categories: "အမျိုးအစားများ", Guide: "လမ်းညွှန်", FAQ: "အမေးများ", "Assistant Setup": "AI Assistant ပြင်ဆင်မှု", "AI Knowledge": "AI အသိပညာ", "Customer Service": "ဖောက်သည်ဝန်ဆောင်မှု", "CUSTOMER SERVICE": "ဖောက်သည်ဝန်ဆောင်မှု", "Menu & Images": "မီနူးနှင့် ပုံများ", "AI Knowledge Import": "AI အသိပညာ တင်သွင်းရန်", "AI Q&A": "AI အမေးအဖြေ", "AI Source Router": "AI ရင်းမြစ် လမ်းကြောင်း", "AI Reliability": "AI ယုံကြည်စိတ်ချရမှု", "AI Response Quality": "AI တုံ့ပြန်မှုအရည်အသွေး", "Prompt Version History": "Prompt ဗားရှင်းမှတ်တမ်း", "Global Buttons": "Global Buttons", "Guide Theme": "Guide Theme", "Chat Theme": "Chat Theme", "Test & Diagnostics": "စမ်းသပ်ခြင်းနှင့် စစ်ဆေးမှု", "Chat Quick Replies": "Chat အမြန်ဖြေ", "Chat Logs": "Chat မှတ်တမ်း", "Unmatched Questions": "မကိုက်ညီသောမေးခွန်းများ", APPEARANCE: "Appearance", ENGAGEMENT: "Engagement", "Audit Logs": "စစ်ဆေးမှတ်တမ်း", "Admin Users": "စီမံသူများ", PLATFORM: "ပလက်ဖောင်း", OVERVIEW: "အနှစ်ချုပ်", CONTENT: "အကြောင်းအရာ", AI: "AI", CHAT: "Chat", SETTINGS: "ဆက်တင်များ", Console: "ကွန်ဆိုလ်", "Sign out": "ထွက်ရန်", "My Profile": "ကိုယ်ရေးအချက်အလက်"
};
function langNow() {
  try {
    return localStorage.getItem("bdg_admin_lang") || "en";
  } catch {
    return "en";
  }
}
function tr(v?: string) {
  if (!v) return "";
  const lang = langNow();
  return lang === "zh" ? ZH[v] || v : lang === "my" ? MY[v] || v : v;
}

function buildMenu(userRole?: string, canManagePlatform = false): MenuProps["items"] {
  const groups = new Map<string, typeof NAV>();
  for (const item of NAV) {
    if (item.key === "/admin-users" && userRole !== "owner" && !(getActiveAdminPlatformRoute() && canManagePlatform)) continue;
    const g = item.group || "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(item);
  }
  const items: MenuProps["items"] = [];
  for (const [group, list] of groups) {
    items.push({
      key: `g-${group}`,
      type: "group",
      label: tr(group),
      children: list.map((n) => ({
        key: n.key,
        icon: n.icon,
        label: (() => { const [to,query] = n.to.split("?"); const search = query ? Object.fromEntries(new URLSearchParams(query)) : undefined; return <Link to={to as any} search={search as any}>{tr(n.label)}</Link>; })(),
      })),
    });
  }
  return items;
}

export default function AdminLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [adminLang, setAdminLang] = useState(langNow());
  const [platformContext, setPlatformContext] = useState<any>(null);
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const matches = useMatches();
  const currentSearch = typeof window !== "undefined" ? window.location.search : "";
  const current = NAV.find((n) => n.to.includes("?") ? `${location.pathname}${currentSearch}` === n.to : location.pathname.startsWith(n.key));

  useEffect(() => {
    if (!getActiveAdminPlatformRoute()) { setPlatformContext(null); return; }
    let alive = true;
    api.getPlatformContext().then((value) => { if (alive) setPlatformContext(value); }).catch(() => { if (alive) setPlatformContext(null); });
    return () => { alive = false; };
  }, [location.pathname]);

  const crumbTitle = title ?? current?.label ?? "Dashboard";

  const userMenu: MenuProps["items"] = [
    { key: "profile", icon: <UserOutlined />, label: tr("My Profile") },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: tr("Sign out"),
      onClick: () => {
        logout();
        navigate({ to: "/login" });
      },
    },
  ];

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#3b82f6",
          colorBgBase: "#0b1220",
          colorBgContainer: "#0f172a",
          colorBgElevated: "#142033",
          colorBorder: "#1e2a44",
          colorText: "#e6edf7",
          colorTextSecondary: "#8ea0bd",
          borderRadius: 6,
          fontSize: 13,
        },
      }}
    >
      <Layout style={{ minHeight: "100vh" }}>
        <Sider
          className="bdg-sider"
          width={244}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
        >
          <div className="bdg-brand">
            <div className="bdg-brand-mark">AI</div>
            {!collapsed && (
              <div>
                <div className="bdg-brand-title">Luke Admin Control</div>
                <div className="bdg-brand-sub">
                  {adminLang === "zh" ? `业务管理后台 · ${ADMIN_VERSION}` : adminLang === "my" ? `လုပ်ငန်းစီမံခန့်ခွဲမှု · ${ADMIN_VERSION}` : `Business Admin Console · ${ADMIN_VERSION}`}
                </div>
              </div>
            )}
          </div>
          <Menu
            mode="inline"
            selectedKeys={current ? [current.key] : []}
            items={buildMenu(user?.role, platformContext?.access?.can_manage_platform === true)}
            key={adminLang}
            style={{ paddingBottom: 24 }}
          />
        </Sider>

        <Layout>
          <Header className="bdg-header">
            <div>
              {platformContext?.platform && (
                <Tag color="blue" style={{ margin: 0 }}>
                  Platform: {platformContext.platform.platform_name} · {platformContext.access?.role || "viewer"}
                </Tag>
              )}
            </div>
            <Space size={12}>
              <Select
                value={adminLang}
                onChange={(v) => {
                  try {
                    localStorage.setItem("bdg_admin_lang", v);
                  } catch {
                    // Language preference is optional when browser storage is unavailable.
                  }
                  setAdminLang(v);
                }}
                size="small"
                style={{ width: 96 }}
                variant="borderless"
                options={[
                  { value: "en", label: "English" },
                  { value: "zh", label: "中文" },
                  { value: "my", label: "မြန်မာ" },
                ]}
              />
              <Dropdown menu={{ items: userMenu }} trigger={["click"]}>
                <Space style={{ cursor: "pointer", color: "#e6edf7" }}>
                  <Avatar size={28} icon={<UserOutlined />} style={{ background: "#1d4ed8" }} />
                  <span>{user?.email || "admin@bdg.io"}</span>
                  <DownOutlined style={{ fontSize: 10 }} />
                </Space>
              </Dropdown>
            </Space>
          </Header>

          <Content className="bdg-content">
            <Breadcrumb
              className="bdg-crumbs"
              items={[
                { title: tr("Console") },
                { title: tr(current?.group ?? "Overview") },
                { title: tr(crumbTitle) },
              ]}
            />
            <div className="bdg-page-header">
              <div>
                <h1 className="bdg-page-title">{tr(crumbTitle)}</h1>
                {subtitle && <div className="bdg-page-sub">{subtitle}</div>}
              </div>
            </div>
            {children}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

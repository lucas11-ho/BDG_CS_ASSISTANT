import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const messages = fs.readFileSync(path.join(root, "src/i18n/messages.ts"), "utf8");
const runtime = fs.readFileSync(path.join(root, "src/i18n/runtime.tsx"), "utf8");
const rootRoute = fs.readFileSync(path.join(root, "src/routes/__root.tsx"), "utf8");

const requiredEnglish = [
  "Dashboard",
  "Platform Control Center",
  "Domain Mapping",
  "Site Content",
  "Categories",
  "Guide",
  "FAQ",
  "Assistant Setup",
  "AI Knowledge",
  "Menu & Images",
  "Test & Diagnostics",
  "Customer Service",
  "Chat Quick Replies",
  "Chat Logs",
  "Unmatched Questions",
  "Guide Theme",
  "Chat Theme",
  "Global Buttons",
  "Audit Logs",
  "Admin Users",
  "Save",
  "Cancel",
  "Edit",
  "Delete",
  "Refresh",
  "Search",
  "Status",
  "Actions",
  "Download Template",
  "Export Excel",
  "Import History",
  "Import Excel",
  "Rich FAQ Studio",
  "AI Knowledge Library",
  "System Health",
  "Production AI settings",
  "All Conversations",
  "Mapped custom domains",
  "Bold",
  "Upload image",
  "Sign in",
];

for (const phrase of requiredEnglish) {
  if (!messages.includes(`[\"${phrase}\"`)) {
    throw new Error(`Missing Admin i18n catalog coverage for: ${phrase}`);
  }
}

for (const token of ["\"zh-CN\"", "\"my-MM\"", "normalizeAdminLocale", "translateAdminText"]) {
  if (!messages.includes(token)) throw new Error(`Admin i18n messages missing ${token}`);
}

for (const token of ["MutationObserver", "requestAnimationFrame", "renderedText", "originalText", "attributeFilter", "ConfigProvider", "zhCN", "myMM"]) {
  if (!runtime.includes(token)) throw new Error(`Admin i18n runtime missing ${token}`);
}

if (!runtime.includes("current !== previousRendered")) {
  throw new Error("Runtime translator must preserve the English source and avoid self-trigger mutation loops");
}

if (!rootRoute.includes("<AdminI18nProvider>")) {
  throw new Error("Admin root route must install AdminI18nProvider");
}

if (!runtime.includes("bdg_admin_lang")) {
  throw new Error("Admin i18n must remain compatible with the existing language preference key");
}

console.log("Admin i18n regression checks passed");

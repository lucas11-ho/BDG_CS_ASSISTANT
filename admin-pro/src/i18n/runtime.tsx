import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  legacyStorageLocale,
  normalizeAdminLocale,
  translateAdminText,
  type AdminLocale,
} from "./messages";
import "./styles.css";

const STORAGE_KEY = "bdg_admin_lang";
const LANGUAGE_EVENT = "bdg-admin-language-change";

const myMM: any = {
  ...enUS,
  locale: "my-MM",
  Pagination: {
    ...(enUS as any).Pagination,
    items_per_page: "/ စာမျက်နှာ",
    jump_to: "သွားရန်",
    jump_to_confirm: "အတည်ပြု",
    page: "စာမျက်နှာ",
    prev_page: "ယခင်စာမျက်နှာ",
    next_page: "နောက်စာမျက်နှာ",
    prev_5: "ယခင် ၅ စာမျက်နှာ",
    next_5: "နောက် ၅ စာမျက်နှာ",
    prev_3: "ယခင် ၃ စာမျက်နှာ",
    next_3: "နောက် ၃ စာမျက်နှာ",
  },
  Modal: {
    ...(enUS as any).Modal,
    okText: "အတည်ပြု",
    cancelText: "ပယ်ဖျက်",
    justOkText: "အတည်ပြု",
  },
  Popconfirm: {
    ...(enUS as any).Popconfirm,
    okText: "အတည်ပြု",
    cancelText: "ပယ်ဖျက်",
  },
  Table: {
    ...(enUS as any).Table,
    filterTitle: "စစ်ထုတ်ရန်",
    filterConfirm: "အတည်ပြု",
    filterReset: "ပြန်သတ်မှတ်",
    filterEmptyText: "စစ်ထုတ်မှု မရှိပါ",
    emptyText: "ဒေတာမရှိပါ",
    selectAll: "အားလုံးရွေးမည်",
    selectInvert: "ရွေးချယ်မှု ပြောင်းပြန်",
    selectionAll: "ဒေတာအားလုံးရွေးမည်",
    sortTitle: "အစီအစဉ်ပြောင်းမည်",
  },
  Empty: {
    ...(enUS as any).Empty,
    description: "ဒေတာမရှိပါ",
  },
  Upload: {
    ...(enUS as any).Upload,
    uploading: "တင်နေသည်...",
    removeFile: "ဖိုင်ဖယ်ရှားမည်",
    uploadError: "တင်မှုအမှား",
    previewFile: "ဖိုင်ကြည့်မည်",
    downloadFile: "ဖိုင်ဒေါင်းလုဒ်လုပ်မည်",
  },
};

type AdminI18nContextValue = {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  t: (value: string) => string;
};

const AdminI18nContext = createContext<AdminI18nContextValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (value) => value,
});

function readLocale() {
  if (typeof window === "undefined") return "en" as AdminLocale;
  try {
    return normalizeAdminLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "en" as AdminLocale;
  }
}

const originalText = new WeakMap<Text, string>();
const renderedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();

function excludedElement(element: Element | null) {
  if (!element) return true;
  if (element.closest("script,style,pre,code,[data-i18n-skip='true'],.bdg-rich-editor-content,[contenteditable='true']")) return true;
  return false;
}

function aggressiveElement(element: Element | null) {
  if (!element || excludedElement(element)) return false;
  if (element.closest(".ant-table-tbody") && !element.closest("button,.ant-btn,.ant-tag,.ant-switch,.ant-select,.ant-dropdown,.ant-popconfirm")) return false;
  if (element.closest(".support-admin-workspace main") && !element.closest("button,.ant-btn,.ant-tag,.ant-select,.ant-tabs-tab,.ant-form-item-label")) return false;
  return true;
}

function translateTextNode(node: Text, locale: AdminLocale) {
  const parent = node.parentElement;
  if (!parent || excludedElement(parent)) return;
  const current = node.nodeValue || "";
  if (!current.trim()) return;
  const previousRendered = renderedText.get(node);
  let source = originalText.get(node);
  if (source === undefined || (previousRendered !== undefined && current !== previousRendered)) {
    source = current;
    originalText.set(node, current);
  }
  const next = locale === "en" ? source : translateAdminText(source, locale, aggressiveElement(parent));
  renderedText.set(node, next);
  if (current !== next) node.nodeValue = next;
}

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "data-tooltip"] as const;

function translateAttributes(element: Element, locale: AdminLocale) {
  if (excludedElement(element)) return;
  let state = originalAttributes.get(element);
  if (!state) {
    state = new Map();
    originalAttributes.set(element, state);
  }
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current?.trim()) continue;
    const previous = state.get(attribute);
    const source = !previous || current !== previous.rendered ? current : previous.source;
    const rendered = locale === "en" ? source : translateAdminText(source, locale, true);
    state.set(attribute, { source, rendered });
    if (current !== rendered) element.setAttribute(attribute, rendered);
  }
}

function translateSubtree(root: Node, locale: AdminLocale) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, locale);
    return;
  }
  if (!(root instanceof Element) && !(root instanceof Document) && !(root instanceof DocumentFragment)) return;
  if (root instanceof Element) translateAttributes(root, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, locale);
    else if (node instanceof Element) translateAttributes(node, locale);
    node = walker.nextNode();
  }
}

function AdminRuntimeTranslator({ locale }: { locale: AdminLocale }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let frame = 0;
    const pending = new Set<Node>();
    const flush = () => {
      frame = 0;
      if (!pending.size) pending.add(document.body);
      const roots = [...pending];
      pending.clear();
      for (const root of roots) translateSubtree(root, locale);
    };
    const schedule = (node: Node) => {
      pending.add(node);
      if (!frame) frame = window.requestAnimationFrame(flush);
    };

    schedule(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") schedule(mutation.target);
        else if (mutation.type === "attributes") schedule(mutation.target);
        else {
          if (mutation.addedNodes.length) mutation.addedNodes.forEach(schedule);
          else schedule(mutation.target);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [locale]);
  return null;
}

export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>(readLocale);

  const setLocale = useCallback((next: AdminLocale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(STORAGE_KEY, legacyStorageLocale(next)); } catch { /* optional */ }
      window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: next }));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setLocaleState((current) => {
      const next = readLocale();
      return current === next ? current : next;
    });
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setLocaleState(normalizeAdminLocale(detail));
    };
    const timer = window.setInterval(sync, 250);
    window.addEventListener("storage", sync);
    window.addEventListener(LANGUAGE_EVENT, onCustom);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
      window.removeEventListener(LANGUAGE_EVENT, onCustom);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dataset.adminLocale = locale;
  }, [locale]);

  const t = useCallback((value: string) => translateAdminText(value, locale, true), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  const antdLocale = locale === "zh-CN" ? zhCN : locale === "my-MM" ? myMM : enUS;

  return (
    <AdminI18nContext.Provider value={value}>
      <ConfigProvider locale={antdLocale}>
        <AdminRuntimeTranslator locale={locale} />
        {children}
      </ConfigProvider>
    </AdminI18nContext.Provider>
  );
}

export function useAdminI18n() {
  return useContext(AdminI18nContext);
}

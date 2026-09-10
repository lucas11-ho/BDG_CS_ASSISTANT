import { API_BASE, getPublicLanguage, getPublicPlatformKey } from "@/lib/api";

export type SiteKind = "guide" | "chat" | "admin" | "staff";

export type GuideExperience = {
  manifest: any;
  platformContext: any;
  defaultLocale: string;
  supportedLanguages: { code: string; label: string }[];
  effectiveLocale: string;
};

export type GuideShellCopy = {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  searchPlaceholder: string;
  searchButtonText: string;
  topicsTitle: string;
  featuredGuidesTitle: string;
  faqTitle: string;
  supportCtaTitle: string;
  supportCtaSubtitle: string;
  emptyStateText: string;
  errorStateText: string;
  buttons: { contactSupport: string; readGuide: string; viewAll: string };
  navHome: string;
  navGuides: string;
  navFaq: string;
  headerTagline: string;
  guidesPageTitle: string;
  guidesPageSubtitle: string;
  guidesSearchPlaceholder: string;
  guidesAllLabel: string;
  guidesLoadingText: string;
  guidesErrorText: string;
  guidesRetryText: string;
  guidesEmptyText: string;
  guidesUpdatedLabel: string;
  faqPageTitle: string;
  faqPageSubtitle: string;
  faqSearchPlaceholder: string;
  faqLoadingText: string;
  faqEmptyText: string;
  heroBackgroundUrl: string;
  heroOverlayColor: string;
};

export type RouteIdentity = {
  browserTitle: string;
  description: string;
  previewTitle: string;
  previewDescription: string;
  previewImageUrl: string;
  faviconUrl: string;
};

const DEFAULTS: Omit<GuideShellCopy, "heroBackgroundUrl" | "heroOverlayColor"> = {
  heroEyebrow: "Official support",
  heroTitle: "How can we help you today?",
  heroSubtitle: "Browse approved guides, FAQs, and support information.",
  heroDescription: "",
  searchPlaceholder: "Search guides…",
  searchButtonText: "Search",
  topicsTitle: "Browse by topic",
  featuredGuidesTitle: "Featured guides",
  faqTitle: "Frequently asked questions",
  supportCtaTitle: "Still need help?",
  supportCtaSubtitle: "Please contact the platform support team.",
  emptyStateText: "No guide has been published for this platform yet.",
  errorStateText: "Unable to load this platform's guide content.",
  buttons: { contactSupport: "Contact support", readGuide: "Read guide", viewAll: "View all" },
  navHome: "Home",
  navGuides: "Guides",
  navFaq: "FAQ",
  headerTagline: "Official support",
  guidesPageTitle: "Guides & tutorials",
  guidesPageSubtitle: "Step-by-step help for this platform.",
  guidesSearchPlaceholder: "Search guides…",
  guidesAllLabel: "All",
  guidesLoadingText: "Loading guides…",
  guidesErrorText: "Unable to connect to this platform's guide service. Published content is still safe.",
  guidesRetryText: "Try again",
  guidesEmptyText: "No results found. Try a different keyword.",
  guidesUpdatedLabel: "Updated",
  faqPageTitle: "Frequently asked questions",
  faqPageSubtitle: "Quick answers to the most common questions.",
  faqSearchPlaceholder: "Search FAQ…",
  faqLoadingText: "Loading FAQ…",
  faqEmptyText: "No matching questions.",
};

const LEGACY_KEYS: Record<string, string> = {
  hero_eyebrow: "hero_eyebrow",
  hero_title: "hero_title",
  hero_subtitle: "hero_subtitle",
  search_placeholder: "search_placeholder",
  search_button_text: "search_button_text",
  topics_title: "topics_title",
  guides_title: "guides_title",
  faq_title: "faq_title",
  support_cta_title: "support_cta_title",
  support_cta_subtitle: "support_cta_subtitle",
  guide_empty_message: "guide_empty_message",
  error_state_text: "error_state_text",
  support_button_text: "support_button_text",
  read_guide_text: "read_guide_text",
  view_all_text: "view_all_text",
};

function localeKey(value: unknown) {
  return String(value || "en").trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "en";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function languageLabel(code: string) {
  try {
    const language = code.split("-")[0];
    return new Intl.DisplayNames(["en"], { type: "language" }).of(language) || code;
  } catch {
    return code;
  }
}

async function jsonFetch(url: string, headers?: HeadersInit) {
  const response = await fetch(url, { cache: "no-store", headers });
  if (!response.ok) throw new Error(`Guide configuration request failed (${response.status})`);
  return response.json();
}

export async function getPlatformGuideExperience(): Promise<GuideExperience> {
  if (!API_BASE) throw new Error("Guide API is not configured.");
  const platform = getPublicPlatformKey();
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : "";
  const [manifest, context] = await Promise.all([
    jsonFetch(`${API_BASE}/guide/content${query}`),
    jsonFetch(`${API_BASE}/public/platform-context${query}`).catch(() => null),
  ]);
  const platformInfo = context?.platform || manifest?.platform_resolution?.platform || {};
  const defaultLocale = localeKey(platformInfo.default_locale || manifest?.default_locale || manifest?.public_languages?.[0]?.code || "en");
  const rawSupported = Array.isArray(platformInfo.supported_languages)
    ? platformInfo.supported_languages
    : Array.isArray(manifest?.public_languages)
      ? manifest.public_languages.map((item: any) => item?.code)
      : [defaultLocale];
  const codes = [...new Set([defaultLocale, ...rawSupported.map(localeKey)].filter(Boolean))];
  const supportedLanguages = codes.map((code) => ({
    code,
    label: manifest?.public_languages?.find((item: any) => localeKey(item?.code) === code)?.label || languageLabel(code),
  }));
  const requested = localeKey(getPublicLanguage());
  const effectiveLocale = codes.includes(requested) ? requested : defaultLocale;
  return { manifest, platformContext: context, defaultLocale, supportedLanguages, effectiveLocale };
}

function localizedValue(experience: GuideExperience, field: string, fallback: string) {
  const content = experience.manifest?.content || {};
  const current = localeKey(experience.effectiveLocale);
  const defaultLocale = localeKey(experience.defaultLocale);
  const currentValue = stringValue(content[`guide.i18n.${current}.${field}`]);
  if (currentValue) return currentValue;
  const defaultValue = stringValue(content[`guide.i18n.${defaultLocale}.${field}`]);
  if (defaultValue) return defaultValue;
  const legacyKey = LEGACY_KEYS[field];
  if (legacyKey) {
    const legacy = stringValue(content[legacyKey]);
    if (legacy) return legacy;
  }
  return fallback;
}

export function guideShellCopy(experience: GuideExperience): GuideShellCopy {
  const manifest = experience.manifest || {};
  const guideTheme = manifest.guide_theme || manifest.settings || {};
  return {
    heroEyebrow: localizedValue(experience, "hero_eyebrow", DEFAULTS.heroEyebrow),
    heroTitle: localizedValue(experience, "hero_title", DEFAULTS.heroTitle),
    heroSubtitle: localizedValue(experience, "hero_subtitle", DEFAULTS.heroSubtitle),
    heroDescription: localizedValue(experience, "hero_description", DEFAULTS.heroDescription),
    searchPlaceholder: localizedValue(experience, "search_placeholder", DEFAULTS.searchPlaceholder),
    searchButtonText: localizedValue(experience, "search_button_text", DEFAULTS.searchButtonText),
    topicsTitle: localizedValue(experience, "topics_title", DEFAULTS.topicsTitle),
    featuredGuidesTitle: localizedValue(experience, "guides_title", DEFAULTS.featuredGuidesTitle),
    faqTitle: localizedValue(experience, "faq_title", DEFAULTS.faqTitle),
    supportCtaTitle: localizedValue(experience, "support_cta_title", DEFAULTS.supportCtaTitle),
    supportCtaSubtitle: localizedValue(experience, "support_cta_subtitle", DEFAULTS.supportCtaSubtitle),
    emptyStateText: localizedValue(experience, "guide_empty_message", DEFAULTS.emptyStateText),
    errorStateText: localizedValue(experience, "error_state_text", DEFAULTS.errorStateText),
    buttons: {
      contactSupport: localizedValue(experience, "support_button_text", DEFAULTS.buttons.contactSupport),
      readGuide: localizedValue(experience, "read_guide_text", DEFAULTS.buttons.readGuide),
      viewAll: localizedValue(experience, "view_all_text", DEFAULTS.buttons.viewAll),
    },
    navHome: localizedValue(experience, "nav_home", DEFAULTS.navHome),
    navGuides: localizedValue(experience, "nav_guides", DEFAULTS.navGuides),
    navFaq: localizedValue(experience, "nav_faq", DEFAULTS.navFaq),
    headerTagline: localizedValue(experience, "header_tagline", DEFAULTS.headerTagline),
    guidesPageTitle: localizedValue(experience, "guides_page_title", DEFAULTS.guidesPageTitle),
    guidesPageSubtitle: localizedValue(experience, "guides_page_subtitle", DEFAULTS.guidesPageSubtitle),
    guidesSearchPlaceholder: localizedValue(experience, "guides_search_placeholder", DEFAULTS.guidesSearchPlaceholder),
    guidesAllLabel: localizedValue(experience, "guides_all_label", DEFAULTS.guidesAllLabel),
    guidesLoadingText: localizedValue(experience, "guides_loading_text", DEFAULTS.guidesLoadingText),
    guidesErrorText: localizedValue(experience, "guides_error_text", DEFAULTS.guidesErrorText),
    guidesRetryText: localizedValue(experience, "guides_retry_text", DEFAULTS.guidesRetryText),
    guidesEmptyText: localizedValue(experience, "guides_empty_text", DEFAULTS.guidesEmptyText),
    guidesUpdatedLabel: localizedValue(experience, "guides_updated_label", DEFAULTS.guidesUpdatedLabel),
    faqPageTitle: localizedValue(experience, "faq_page_title", DEFAULTS.faqPageTitle),
    faqPageSubtitle: localizedValue(experience, "faq_page_subtitle", DEFAULTS.faqPageSubtitle),
    faqSearchPlaceholder: localizedValue(experience, "faq_search_placeholder", DEFAULTS.faqSearchPlaceholder),
    faqLoadingText: localizedValue(experience, "faq_loading_text", DEFAULTS.faqLoadingText),
    faqEmptyText: localizedValue(experience, "faq_empty_text", DEFAULTS.faqEmptyText),
    heroBackgroundUrl: stringValue(guideTheme.hero_background_url),
    heroOverlayColor: stringValue(guideTheme.hero_overlay_color) || "#081525cc",
  };
}

export function routeIdentity(experience: GuideExperience, kind: SiteKind): RouteIdentity {
  const content = experience.manifest?.content || {};
  const settings = experience.manifest?.settings || {};
  const prefix = `web.${kind}.`;
  const brandName = stringValue(settings.brand_name || settings.app_name) || "Support";
  const labels: Record<SiteKind, string> = { guide: "Help Center", chat: "Support Chat", admin: "Admin", staff: "Staff Console" };
  const explicitThemeFavicon: Record<SiteKind, string> = {
    guide: stringValue(settings.guide_favicon_url),
    chat: stringValue(settings.chat_favicon_url),
    admin: stringValue(settings.admin_favicon_url),
    staff: "",
  };
  const browserTitle = stringValue(content[`${prefix}browser_title`]) || `${brandName} — ${labels[kind]}`;
  const description = stringValue(content[`${prefix}description`]) || stringValue(settings.brand_tagline) || `${brandName} ${labels[kind]}`;
  return {
    browserTitle,
    description,
    previewTitle: stringValue(content[`${prefix}preview_title`]) || browserTitle,
    previewDescription: stringValue(content[`${prefix}preview_description`]) || description,
    previewImageUrl: stringValue(content[`${prefix}preview_image_url`]),
    faviconUrl: stringValue(content[`${prefix}favicon_url`]) || explicitThemeFavicon[kind],
  };
}

export function syncStoredGuideLanguage(experience: GuideExperience) {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem("bdg_public_language");
  const normalizedStored = stored ? localeKey(stored) : "";
  const supported = experience.supportedLanguages.map((item) => localeKey(item.code));
  const next = normalizedStored && supported.includes(normalizedStored) ? normalizedStored : experience.defaultLocale;
  if (stored !== next) {
    window.localStorage.setItem("bdg_public_language", next);
    return true;
  }
  return false;
}

export function applyDocumentIdentity(identity: RouteIdentity) {
  if (typeof document === "undefined") return;
  document.title = identity.browserTitle;
  const upsertMeta = (selector: string, attr: "name" | "property", key: string, value: string) => {
    let node = document.head.querySelector<HTMLMetaElement>(selector);
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attr, key);
      node.setAttribute("data-platform-meta", "true");
      document.head.appendChild(node);
    }
    node.content = value;
  };
  upsertMeta('meta[name="description"]', "name", "description", identity.description);
  upsertMeta('meta[property="og:title"]', "property", "og:title", identity.previewTitle);
  upsertMeta('meta[property="og:description"]', "property", "og:description", identity.previewDescription);
  upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", identity.previewTitle);
  upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", identity.previewDescription);
  if (identity.previewImageUrl) {
    upsertMeta('meta[property="og:image"]', "property", "og:image", identity.previewImageUrl);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", identity.previewImageUrl);
  }
  document.querySelectorAll('link[data-platform-default-favicon="true"]').forEach((node) => node.remove());
  let favicon = document.head.querySelector<HTMLLinkElement>('link[data-platform-favicon="true"]');
  if (identity.faviconUrl) {
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      favicon.setAttribute("data-platform-favicon", "true");
      document.head.appendChild(favicon);
    }
    favicon.href = identity.faviconUrl;
  } else if (favicon) {
    favicon.remove();
  }
}

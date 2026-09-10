import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, BookOpen, MessageSquare, Languages } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { api, getPlatformCacheKey, getPublicLanguage, type PublicLanguage } from "@/lib/api";
import {
  applyDocumentIdentity,
  getPlatformGuideExperience,
  guideShellCopy,
  routeIdentity,
  syncStoredGuideLanguage,
} from "@/lib/platform-guide-content";

const IOS_FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const SYSTEM_FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function PublicLayout({ children }: { children: ReactNode }) {
  const platformKey = getPlatformCacheKey();
  const { data: theme } = useQuery({
    queryKey: ["platform-theme", platformKey],
    queryFn: api.getSettings,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: experience } = useQuery({
    queryKey: ["platform-guide-experience", platformKey],
    queryFn: getPlatformGuideExperience,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!experience) return;
    if (syncStoredGuideLanguage(experience)) window.location.reload();
  }, [experience]);

  const copy = useMemo(() => experience ? guideShellCopy(experience) : null, [experience]);
  const identity = useMemo(() => experience ? routeIdentity(experience, "guide") : null, [experience]);
  const platformName = theme?.brand_name || theme?.app_name || (platformKey === "default" ? "Help Center" : "Platform Help Center");
  const platformTagline = copy?.headerTagline || theme?.brand_tagline || (platformKey === "default" ? "Official Support" : `${platformName} Support`);
  const rawFont = String(theme?.guide_font_family || "system").trim();
  const fontStack = rawFont === "ios-system"
    ? IOS_FONT_STACK
    : rawFont === "system"
      ? SYSTEM_FONT_STACK
      : /^[A-Za-z0-9 ,'-]{1,120}$/.test(rawFont)
        ? `${rawFont}, ui-sans-serif, system-ui, sans-serif`
        : SYSTEM_FONT_STACK;

  const guideStyle = {
    ...(theme?.guide_background_url ? { backgroundImage: `url(${theme.guide_background_url})`, backgroundSize: "cover", backgroundAttachment: "fixed" } : {}),
    fontFamily: fontStack,
    ["--font-sans" as string]: fontStack,
    ["--font-display" as string]: fontStack,
    ["--guide-runtime-font" as string]: fontStack,
    ...(theme?.guide_text_color ? { color: theme.guide_text_color } : {}),
    ...(theme?.guide_surface_color ? { ["--card" as string]: theme.guide_surface_color } : {}),
    ...(theme?.guide_card_radius ? { ["--radius" as string]: `${Math.max(8, Math.min(32, theme.guide_card_radius))}px` } : {}),
  } as CSSProperties;

  useEffect(() => {
    if (!identity) return;
    applyDocumentIdentity(identity);
  }, [identity]);

  useEffect(() => {
    const root = document.documentElement;
    const previousSans = root.style.getPropertyValue("--font-sans");
    const previousDisplay = root.style.getPropertyValue("--font-display");
    const previousRuntime = root.style.getPropertyValue("--guide-runtime-font");
    root.style.setProperty("--font-sans", fontStack);
    root.style.setProperty("--font-display", fontStack);
    root.style.setProperty("--guide-runtime-font", fontStack);
    return () => {
      if (previousSans) root.style.setProperty("--font-sans", previousSans); else root.style.removeProperty("--font-sans");
      if (previousDisplay) root.style.setProperty("--font-display", previousDisplay); else root.style.removeProperty("--font-display");
      if (previousRuntime) root.style.setProperty("--guide-runtime-font", previousRuntime); else root.style.removeProperty("--guide-runtime-font");
    };
  }, [fontStack]);

  const languages = experience?.supportedLanguages?.length
    ? experience.supportedLanguages
    : [{ code: String(getPublicLanguage() || "en"), label: "Language" }];
  const activeLanguage = experience?.effectiveLocale || getPublicLanguage();

  return (
    <div className="guide-runtime-font min-h-screen bg-background text-foreground font-sans" style={guideStyle}>
      <PublicHeader
        platformKey={platformKey}
        platformName={platformName}
        platformTagline={platformTagline}
        logoUrl={theme?.guide_logo_url || ""}
        languages={languages}
        activeLanguage={activeLanguage}
      />
      <main
        className="mx-auto w-full px-4 pb-28 pt-4 md:pb-16"
        style={{ maxWidth: `${Math.max(720, Math.min(1400, Number(theme?.guide_content_width || 960)))}px` }}
      >
        {children}
      </main>
      <BottomNav labels={{ home: copy?.navHome || "Home", guides: copy?.navGuides || "Guides", faq: copy?.navFaq || "FAQ" }} />
    </div>
  );
}

function PublicHeader({
  platformKey,
  platformName,
  platformTagline,
  logoUrl,
  languages,
  activeLanguage,
}: {
  platformKey: string;
  platformName: string;
  platformTagline: string;
  logoUrl: string;
  languages: { code: string; label: string }[];
  activeLanguage: string;
}) {
  const [language, setLanguage] = useState<PublicLanguage>(() => activeLanguage as PublicLanguage);

  useEffect(() => setLanguage(activeLanguage as PublicLanguage), [activeLanguage]);

  const changeLanguage = (next: PublicLanguage) => {
    setLanguage(next);
    window.localStorage.setItem("bdg_public_language", String(next).toLowerCase());
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-2 px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={`${platformName} logo`} className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <span
              className="grid h-8 min-w-11 place-items-center rounded-lg px-1.5 font-display text-[11px] font-bold text-[color:var(--bdg-navy-deep)]"
              style={{ background: "var(--gradient-gold)" }}
              title={platformKey === "default" ? "Help" : "Logo not configured"}
            >
              {platformKey === "default" ? "Help" : "?"}
            </span>
          )}
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-display text-sm font-semibold">{platformName}</span>
            <span className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">{platformTagline}</span>
          </div>
        </Link>
        <label className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">
          <Languages className="h-3.5 w-3.5" />
          <select
            value={language}
            onChange={(event) => changeLanguage(event.target.value as PublicLanguage)}
            className="bg-transparent text-foreground outline-none"
            aria-label="Language"
          >
            {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
      </div>
    </header>
  );
}

function BottomNav({ labels }: { labels: { home: string; guides: string; faq: string } }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const nav = [
    { to: "/", label: labels.home, icon: Home },
    { to: "/guides", label: labels.guides, icon: BookOpen },
    { to: "/faq", label: labels.faq, icon: MessageSquare },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-md md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-[color:var(--bdg-navy)]" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-[color:var(--bdg-gold-deep)]")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

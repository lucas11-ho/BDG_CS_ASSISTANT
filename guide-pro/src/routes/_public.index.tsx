import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, ArrowRight, Sparkles, ChevronRight } from "lucide-react";
import { api, getPlatformCacheKey, getPublicBasePath } from "@/lib/api";
import { getPlatformGuideExperience, guideShellCopy } from "@/lib/platform-guide-content";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CategoryIcon } from "@/components/public/CategoryIcon";
import { ServiceErrorPanel } from "@/components/public/ServiceErrorPanel";
import { sanitizeRichHtml } from "@/lib/sanitize-html";

export const Route = createFileRoute("/_public/")({ component: Home });

function Home() {
  const platformKey = getPlatformCacheKey();
  const content = useQuery({
    queryKey: ["platform-guide-experience", platformKey],
    queryFn: getPlatformGuideExperience,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const categories = useQuery({ queryKey: ["categories", platformKey], queryFn: api.getCategories });
  const guides = useQuery({ queryKey: ["guides", platformKey], queryFn: () => api.getGuides() });
  const faqs = useQuery({ queryKey: ["faqs", platformKey], queryFn: api.getFaqs });
  const [q, setQ] = useState("");
  const c = content.data ? guideShellCopy(content.data) : undefined;
  const lang = content.data?.effectiveLocale || "en";

  return (
    <div className="space-y-10">
      <section
        className="relative overflow-hidden rounded-3xl p-6 pt-8 text-white shadow-[var(--shadow-card)] md:p-10"
        style={{
          backgroundImage: c?.heroBackgroundUrl || undefined,
          background: c?.heroBackgroundUrl
            ? `linear-gradient(${c.heroOverlayColor},${c.heroOverlayColor}), url(${c.heroBackgroundUrl}) center/cover`
            : "var(--gradient-hero)",
          borderRadius: "var(--radius-3xl)",
        }}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-25 blur-3xl" style={{ background: "var(--bdg-gold)" }} />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider">
            <Sparkles className="h-3 w-3" style={{ color: "var(--bdg-gold)" }} />
            {c?.heroEyebrow || "Official support"}
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">{c?.heroTitle || "How can we help you today?"}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/75 md:text-base">{c?.heroSubtitle || "Browse approved guides, FAQs, and support information."}</p>
          {c?.heroDescription ? <p className="mt-2 max-w-2xl text-sm text-white/60">{c.heroDescription}</p> : null}

          <form
            className="mt-6 flex items-center gap-2 rounded-2xl bg-white p-1.5 shadow-lg"
            onSubmit={(event) => {
              event.preventDefault();
              if (q.trim()) window.location.href = `${getPublicBasePath()}/guides?q=${encodeURIComponent(q.trim())}`;
            }}
          >
            <div className="flex flex-1 items-center gap-2 pl-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder={c?.searchPlaceholder || "Search guides…"}
                className="w-full bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-[color:var(--bdg-navy-deep)] shadow-[var(--shadow-gold)]"
              style={{ background: "var(--gradient-gold)" }}
            >
              {c?.searchButtonText || "Search"}
            </button>
          </form>
        </div>
      </section>

      {content.isError && <ServiceErrorPanel compact language={lang} onRetry={() => void content.refetch()} />}

      <section>
        <SectionHeader title={c?.topicsTitle || "Browse by topic"} />
        {categories.isError ? (
          <div className="mt-3"><ServiceErrorPanel compact language={lang} onRetry={() => void categories.refetch()} /></div>
        ) : categories.data && categories.data.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {categories.data.map((cat) => (
              <Link
                key={cat.id}
                to="/guides"
                search={{ category: cat.slug }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[color:var(--bdg-navy)] text-[color:var(--bdg-gold)]">
                  <CategoryIcon name={cat.icon} url={cat.iconUrl} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{cat.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{cat.description || "Official topic"}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
            {c?.emptyStateText || "No guide has been published for this platform yet."}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title={c?.featuredGuidesTitle || "Featured guides"}
          action={<Link to="/guides" className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--bdg-navy)] hover:underline">{c?.buttons.viewAll || "View all"} <ArrowRight className="h-3 w-3" /></Link>}
        />
        {guides.isError ? (
          <div className="mt-3"><ServiceErrorPanel compact language={lang} onRetry={() => void guides.refetch()} /></div>
        ) : guides.data && guides.data.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {guides.data.slice(0, 4).map((guide) => (
              <Link
                key={guide.id}
                to="/guides/$slug"
                params={{ slug: guide.slug }}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
              >
                {guide.cover ? <div className="aspect-[16/9] w-full overflow-hidden bg-muted"><img src={guide.cover} alt={guide.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" /></div> : null}
                <div className="p-4">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--bdg-gold-deep)]">{guide.category}</span>
                  <h3 className="mt-1 font-display text-base font-semibold">{guide.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{guide.summary}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">{c?.emptyStateText || "No guide has been published yet."}</div>
        )}
      </section>

      <section>
        <SectionHeader
          title={c?.faqTitle || "Frequently asked questions"}
          action={<Link to="/faq" className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--bdg-navy)] hover:underline">{c?.buttons.viewAll || "View all"} <ArrowRight className="h-3 w-3" /></Link>}
        />
        {faqs.isError ? (
          <div className="mt-3"><ServiceErrorPanel compact language={lang} onRetry={() => void faqs.refetch()} /></div>
        ) : faqs.data && faqs.data.length > 0 ? (
          <Card className="mt-3 p-2">
            <Accordion type="single" collapsible>
              {faqs.data.slice(0, 4).map((faq) => (
                <AccordionItem key={faq.id} value={faq.id} className="border-border">
                  <AccordionTrigger className="text-left text-sm">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{faq.answerHtml ? <div className="bdg-rich-public" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(faq.answerHtml) }} /> : faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">{c?.faqPageSubtitle || "No FAQ has been published yet."}</div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="flex items-end justify-between"><h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>{action}</div>;
}

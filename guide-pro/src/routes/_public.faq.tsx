import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { api, getPlatformCacheKey } from "@/lib/api";
import { getPlatformGuideExperience, guideShellCopy } from "@/lib/platform-guide-content";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import type { Faq } from "@/mock/data";
import { ServiceErrorPanel } from "@/components/public/ServiceErrorPanel";
import { sanitizeRichHtml } from "@/lib/sanitize-html";

export const Route = createFileRoute("/_public/faq")({ component: FAQ });

function FAQ() {
  const platformKey = getPlatformCacheKey();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["faqs", platformKey], queryFn: api.getFaqs });
  const experience = useQuery({
    queryKey: ["platform-guide-experience", platformKey],
    queryFn: getPlatformGuideExperience,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const copy = experience.data ? guideShellCopy(experience.data) : null;
  const lang = experience.data?.effectiveLocale || "en";
  const [q, setQ] = useState("");

  const filtered = useMemo<Faq[]>(() => {
    if (!data) return [];
    const search = q.toLowerCase();
    if (!search) return data;
    return data.filter((faq) => faq.question.toLowerCase().includes(search) || faq.answer.toLowerCase().includes(search) || (faq.answerHtml || "").toLowerCase().includes(search));
  }, [data, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Faq[]>();
    filtered.forEach((faq) => {
      const key = faq.category ?? "general";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(faq);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold md:text-3xl">{copy?.faqPageTitle || "Frequently asked questions"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy?.faqPageSubtitle || "Quick answers to the most common questions."}</p>
      </header>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={copy?.faqSearchPlaceholder || "Search FAQ…"} className="h-11 rounded-xl pl-9" />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {copy?.faqLoadingText || "Loading FAQ…"}
        </div>
      )}

      {isError && <ServiceErrorPanel language={lang} onRetry={() => void refetch()} />}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {copy?.faqEmptyText || "No matching questions."}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <Card key={category} className="p-3">
              <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--bdg-gold-deep)]">{category}</div>
              <Accordion type="single" collapsible>
                {items.map((faq) => (
                  <AccordionItem key={faq.id} value={faq.id}>
                    <AccordionTrigger className="text-left text-sm">{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {faq.answerHtml ? <div className="bdg-rich-public" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(faq.answerHtml) }} /> : faq.answer}
                      {!!faq.imageUrls?.length && <div className="mt-3 grid gap-2 sm:grid-cols-2">{faq.imageUrls.map((url) => <img key={url} src={url} alt="FAQ reference" className="max-h-64 w-full rounded-xl object-contain" loading="lazy" />)}</div>}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

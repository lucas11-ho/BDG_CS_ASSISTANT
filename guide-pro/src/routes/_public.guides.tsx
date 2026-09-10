import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Filter, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { api, getPlatformCacheKey } from "@/lib/api";
import { getPlatformGuideExperience, guideShellCopy } from "@/lib/platform-guide-content";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type GuideSearch = { q?: string; category?: string };

export const Route = createFileRoute("/_public/guides")({
  validateSearch: (search: Record<string, unknown>): GuideSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  component: Guides,
});

function Guides() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  if (cleanPath !== "/guides") return <Outlet />;
  return <GuidesIndex />;
}

function GuidesIndex() {
  const { q, category } = Route.useSearch();
  const navigate = useNavigate({ from: "/guides" });
  const [text, setText] = useState(q ?? "");
  const platformKey = getPlatformCacheKey();
  const experience = useQuery({
    queryKey: ["platform-guide-experience", platformKey],
    queryFn: getPlatformGuideExperience,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const copy = experience.data ? guideShellCopy(experience.data) : null;
  const lang = experience.data?.effectiveLocale || "en";

  useEffect(() => setText(q ?? ""), [q]);

  const cats = useQuery({ queryKey: ["categories", platformKey], queryFn: api.getCategories });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["guides", platformKey, q, category, lang],
    queryFn: () => api.getGuides({ q, category }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold md:text-3xl">{copy?.guidesPageTitle || "Guides & tutorials"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy?.guidesPageSubtitle || "Step-by-step help for this platform."}</p>
      </header>

      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ search: (previous: any) => ({ ...previous, q: text || undefined }) });
        }}
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={copy?.guidesSearchPlaceholder || "Search guides…"}
          className="h-11 rounded-xl pl-9 pr-10"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              setText("");
              navigate({ search: (previous: any) => ({ ...previous, q: undefined }) });
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <FilterChip active={!category} onClick={() => navigate({ search: (previous: any) => ({ ...previous, category: undefined }) })}>
          {copy?.guidesAllLabel || "All"}
        </FilterChip>
        {cats.data?.map((item) => (
          <FilterChip
            key={item.id}
            active={category === item.slug}
            onClick={() => navigate({ search: (previous: any) => ({ ...previous, category: item.slug }) })}
          >
            {item.name}
          </FilterChip>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {copy?.guidesLoadingText || "Loading guides…"}
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{copy?.guidesErrorText || "Unable to connect to this platform's guide service."}</p>
          <button className="mt-2 text-sm font-medium underline" onClick={() => refetch()}>{copy?.guidesRetryText || "Try again"}</button>
        </div>
      )}

      {!isLoading && !isError && data?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {copy?.guidesEmptyText || "No results found. Try a different keyword."}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((guide) => (
          <Link
            key={guide.id}
            to="/guides/$slug"
            params={{ slug: guide.slug }}
            className="group flex overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
          >
            {guide.cover ? <div className="h-28 w-28 shrink-0 overflow-hidden bg-muted"><img src={guide.cover} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" /></div> : null}
            <div className="min-w-0 flex-1 p-3">
              <Badge variant="secondary" className="text-[10px] uppercase">{guide.category}</Badge>
              <h3 className="mt-1 line-clamp-1 font-display text-sm font-semibold">{guide.title}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{guide.summary}</p>
              <div className="mt-2 text-[10px] text-muted-foreground">{copy?.guidesUpdatedLabel || "Updated"} {guide.updatedAt}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-[color:var(--bdg-navy)] bg-[color:var(--bdg-navy)] text-white"
          : "border-border bg-card text-foreground hover:bg-muted")
      }
    >
      {children}
    </button>
  );
}

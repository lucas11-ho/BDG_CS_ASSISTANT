from pathlib import Path
import json, re

ROOT = Path('.')
OLD = '1.22.0-secure-platform-transfer'
NEW = '1.22.1-stability-performance'

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f'missing marker in {path}: {old[:100]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'expected one marker in {path}, found {text.count(old)}')
    write(path, text.replace(old, new, 1))

# Keep the release marker consistent across source-level regression guards.
for base in [ROOT / 'backend-api' / 'src', ROOT / 'backend-api' / 'scripts']:
    for path in base.rglob('*.js'):
        text = path.read_text(encoding='utf-8')
        if OLD in text:
            path.write_text(text.replace(OLD, NEW), encoding='utf-8')

server_path = 'backend-api/src/server.js'
server = read(server_path)
feature_anchor = "  'secure-platform-transfer',\n"
if "'stability-performance'" not in server:
    server = server.replace(feature_anchor, feature_anchor + "  'stability-performance',\n  'single-flight-background-refresh',\n  'visibility-aware-polling',\n  'analytics-summary-cache',\n  'guide-runtime-cache',\n  'bounded-category-icons',\n", 1)
write(server_path, server)

# Admin displayed version follows backend release marker.
layout_path = 'admin-pro/src/components/AdminLayout.tsx'
layout = read(layout_path)
layout = layout.replace('const ADMIN_VERSION = "v1.22.0"', 'const ADMIN_VERSION = "v1.22.1"')
write(layout_path, layout)

# Customer Service: replace the nine-request/10-second refresh with a small essential
# refresh, single-flight guard, visibility pause, backoff, and lazy tab data.
cs_path = 'admin-pro/src/routes/_admin.customer-service.tsx'
cs = read(cs_path)
old_refs = '  const fileRef=useRef<HTMLInputElement|null>(null); const streamAbortRef=useRef<AbortController|null>(null); const sequenceRef=useRef(0);\n\n  const load=useCallback(async()=>{setLoading(true);try{const [o,s,c,p,st,a,j,q,pr]=await Promise.all([\n    api.getSupportOverview(),api.listSupportStaff(),api.listSupportConversations(),api.getSupportPerformance(),api.getSupportSettings(),api.getSupportAudit(),api.listSupportAiJobs(),api.listSupportQuickReplies(),api.listChatPromotions(),\n  ]);setOverview(o);setStaff(s);setConversations(c);setPerformance(p);setSettings(st);settingsForm.setFieldsValue(st);identityForm.setFieldsValue(st);menuForm.setFieldsValue({chat_menu_enabled:st.chat_menu_enabled,sticky_support_header_enabled:st.sticky_support_header_enabled,...(st.chat_menu_config_json||{})});setAudit(a);setJobs(j);setQuickReplies(Array.isArray(q)?q:q?.items||[]);setPromotions(pr?.items||[]);}catch(e:any){message.error(e?.message||"Could not load Customer Service Center");}finally{setLoading(false);}},[settingsForm,identityForm,menuForm]);\n  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),10000);return()=>clearInterval(timer);},[load]);\n'
new_refs = '''  const fileRef=useRef<HTMLInputElement|null>(null); const streamAbortRef=useRef<AbortController|null>(null); const sequenceRef=useRef(0);
  const refreshInFlightRef=useRef(false); const refreshFailuresRef=useRef(0); const tabLoadedRef=useRef(new Set<string>());

  const load=useCallback(async(options:{quiet?:boolean;force?:boolean}={})=>{
    const quiet=options.quiet===true,force=options.force===true;
    if(refreshInFlightRef.current&&!force)return;
    if(typeof document!=="undefined"&&document.visibilityState==="hidden"&&!force)return;
    refreshInFlightRef.current=true;if(!quiet)setLoading(true);
    try{
      const [o,s,c,q]=await Promise.all([api.getSupportOverview(),api.listSupportStaff(),api.listSupportConversations(),api.listSupportQuickReplies()]);
      setOverview(o);setStaff(s);setConversations(c);setQuickReplies(Array.isArray(q)?q:q?.items||[]);refreshFailuresRef.current=0;
    }catch(e:any){refreshFailuresRef.current=Math.min(refreshFailuresRef.current+1,3);if(!quiet)message.error(e?.message||"Could not load Customer Service Center");}
    finally{refreshInFlightRef.current=false;if(!quiet)setLoading(false);}
  },[]);

  const loadTabData=useCallback(async(tab:string,force=false)=>{
    if(!force&&tabLoadedRef.current.has(tab))return;
    try{
      if(tab==="promotions"){const value=await api.listChatPromotions();setPromotions(value?.items||[]);}
      else if(tab==="performance")setPerformance(await api.getSupportPerformance());
      else if(tab==="delivery")setJobs(await api.listSupportAiJobs());
      else if(tab==="audit")setAudit(await api.getSupportAudit());
      else if(["settings","identities","menu"].includes(tab)){
        const st=await api.getSupportSettings();setSettings(st);settingsForm.setFieldsValue(st);identityForm.setFieldsValue(st);menuForm.setFieldsValue({chat_menu_enabled:st.chat_menu_enabled,sticky_support_header_enabled:st.sticky_support_header_enabled,...(st.chat_menu_config_json||{})});
      }
      tabLoadedRef.current.add(tab);
    }catch(e:any){message.error(e?.message||"Could not load this Customer Service tab");}
  },[settingsForm,identityForm,menuForm]);

  useEffect(()=>{
    let stopped=false;let timer:number|undefined;
    const schedule=()=>{if(stopped)return;const delay=Math.min(120000,45000*(2**refreshFailuresRef.current));timer=window.setTimeout(async()=>{if(document.visibilityState==="visible")await load({quiet:true});schedule();},delay);};
    void load().finally(schedule);
    const onVisibility=()=>{if(document.visibilityState==="visible"){if(timer)window.clearTimeout(timer);void load({quiet:true,force:true}).finally(schedule);}};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{stopped=true;if(timer)window.clearTimeout(timer);document.removeEventListener("visibilitychange",onVisibility);};
  },[load]);
  useEffect(()=>{void loadTabData(activeTab);},[activeTab,loadTabData]);
'''
if old_refs not in cs:
    raise SystemExit('Customer Service refresh block changed unexpectedly')
cs = cs.replace(old_refs, new_refs, 1)
# Refresh the promotion list after mutation instead of pulling every support dataset.
cs = cs.replace('setPromotionRichJson("");setPromotionRichHtml("");await load();}', 'setPromotionRichJson("");setPromotionRichHtml("");tabLoadedRef.current.delete("promotions");await loadTabData("promotions",true);}', 1)
cs = cs.replace('onConfirm={()=>api.deleteChatPromotion(r.id).then(load)}', 'onConfirm={()=>api.deleteChatPromotion(r.id).then(()=>loadTabData("promotions",true))}', 1)
write(cs_path, cs)

# Traffic Analytics: 30-second visibility-aware recursive refresh + single-flight/backoff.
analytics_path = 'admin-pro/src/routes/_admin.analytics.tsx'
analytics = read(analytics_path)
analytics = analytics.replace('import { useCallback, useEffect, useMemo, useState } from "react";', 'import { useCallback, useEffect, useMemo, useRef, useState } from "react";', 1)
analytics = analytics.replace('  const [loading, setLoading] = useState(true);\n\n  const load = useCallback(async (quiet = false) => {\n    if (!quiet) setLoading(true);\n    try {\n      const result = await contentAnalyticsApi.getTrafficAnalytics(range);\n      setData(result);\n      setError("");\n    } catch (reason: any) {\n      setError(reason?.message || "Failed to load traffic analytics");\n    } finally { if (!quiet) setLoading(false); }\n  }, [range]);\n\n  useEffect(() => {\n    void load(false);\n    const timer = window.setInterval(() => void load(true), 10_000);\n    return () => window.clearInterval(timer);\n  }, [load]);', '''  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);
  const failuresRef = useRef(0);

  const load = useCallback(async (quiet = false) => {
    if (inFlightRef.current || (quiet && document.visibilityState === "hidden")) return;
    inFlightRef.current = true;
    if (!quiet) setLoading(true);
    try {
      const result = await contentAnalyticsApi.getTrafficAnalytics(range);
      setData(result);
      setError("");
      failuresRef.current = 0;
    } catch (reason: any) {
      failuresRef.current = Math.min(failuresRef.current + 1, 3);
      setError(reason?.message || "Failed to load traffic analytics");
    } finally {
      inFlightRef.current = false;
      if (!quiet) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(120_000, 30_000 * (2 ** failuresRef.current));
      timer = window.setTimeout(async () => { await load(true); schedule(); }, delay);
    };
    void load(false).finally(schedule);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) window.clearTimeout(timer);
        void load(true).finally(schedule);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stopped = true; if (timer) window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);''', 1)
analytics = analytics.replace('Refreshes every 10 seconds.', 'Refreshes every 30 seconds while this tab is visible.', 1)
write(analytics_path, analytics)

# Dashboard traffic tile: 60-second single-flight refresh, paused while hidden.
dashboard_path = 'admin-pro/src/routes/_admin.dashboard.tsx'
dashboard = read(dashboard_path)
dashboard = dashboard.replace('import { useEffect, useMemo, useState } from "react";', 'import { useEffect, useMemo, useRef, useState } from "react";', 1)
dashboard = dashboard.replace('  const [error, setError] = useState("");\n', '  const [error, setError] = useState("");\n  const trafficInFlightRef = useRef(false);\n', 1)
old_dash_effect = '''  useEffect(() => {
    let active = true;
    const load = () => contentAnalyticsApi.getTrafficAnalytics("7d")
      .then((result) => { if (active) setTraffic(result); })
      .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);'''
new_dash_effect = '''  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      if (!active || trafficInFlightRef.current || document.visibilityState === "hidden") return;
      trafficInFlightRef.current = true;
      try {
        const result = await contentAnalyticsApi.getTrafficAnalytics("7d");
        if (active) setTraffic(result);
      } catch {} finally { trafficInFlightRef.current = false; }
    };
    const schedule = () => { if (active) timer = window.setTimeout(async () => { await load(); schedule(); }, 60_000); };
    void load().finally(schedule);
    const onVisibility = () => { if (document.visibilityState === "visible") { if (timer) window.clearTimeout(timer); void load().finally(schedule); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; if (timer) window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);'''
if old_dash_effect not in dashboard:
    raise SystemExit('Dashboard traffic polling block changed unexpectedly')
dashboard = dashboard.replace(old_dash_effect, new_dash_effect, 1)
write(dashboard_path, dashboard)

# Backend analytics: bounded pool stays unchanged; add slow-query tracing, summary cache,
# request coalescing and reduce summary query count from nine to five.
backend_path = 'backend-api/src/localized-categories-analytics.js'
backend = read(backend_path)
backend = backend.replace('''async function q(env, text, params = []) {
  return poolFor(env).query(text, params);
}
''', '''async function q(env, text, params = []) {
  const started = Date.now();
  try { return await poolFor(env).query(text, params); }
  finally {
    const duration = Date.now() - started;
    if (duration >= 500) console.warn(JSON.stringify({ level:'warn', event:'slow_localized_content_query', duration_ms:duration, operation:String(text || '').trim().split(/\\s+/)[0] || 'query' }));
  }
}
''', 1)
start = backend.index('export async function handleTrafficAdminRoute')
prefix = backend[:start]
new_function = r'''const analyticsSummaryCache = new Map();
const analyticsSummaryFlights = new Map();
const ANALYTICS_SUMMARY_TTL_MS = 15_000;

export async function handleTrafficAdminRoute(request, env, scope) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (request.method !== 'GET' || path !== '/admin/analytics/summary') return null;
  const range = url.searchParams.get('range') || '7d';
  const interval = rangeInterval(range);
  const cacheKey = `${scope.tenant_id}:${scope.platform_id}:${range}`;
  const cached = analyticsSummaryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ANALYTICS_SUMMARY_TTL_MS) return json(cached.payload);
  if (analyticsSummaryFlights.has(cacheKey)) return json(await analyticsSummaryFlights.get(cacheKey));

  const flight = (async () => {
    const started = Date.now();
    const params = [scope.tenant_id, scope.platform_id];
    const [metrics, topPages, locales, devices, minuteRows] = await Promise.all([
      q(env, `SELECT
        (SELECT COUNT(*)::int FROM traffic_presence WHERE tenant_id=$1 AND platform_id=$2 AND last_seen_at >= NOW()-INTERVAL '2 minutes') AS active_now,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= date_trunc('day',NOW()))::int AS visitors_today,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day',NOW()))::int AS pageviews_today,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')::int AS visitors_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW()-($3::text)::interval)::int AS range_pageviews,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW()-($3::text)::interval)::int AS range_visitors
        FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview'`, [...params, interval]),
      q(env, `SELECT path,COUNT(*)::int AS views,COUNT(DISTINCT visitor_id)::int AS visitors FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-($3::text)::interval GROUP BY path ORDER BY views DESC,path ASC LIMIT 12`, [...params, interval]),
      q(env, `SELECT locale,COUNT(*)::int AS views,COUNT(DISTINCT visitor_id)::int AS visitors FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-($3::text)::interval GROUP BY locale ORDER BY views DESC LIMIT 12`, [...params, interval]),
      q(env, `SELECT device_type,COUNT(*)::int AS views,COUNT(DISTINCT visitor_id)::int AS visitors FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-($3::text)::interval GROUP BY device_type ORDER BY views DESC LIMIT 8`, [...params, interval]),
      q(env, `SELECT created_at FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-INTERVAL '30 minutes' ORDER BY created_at ASC`, params),
    ]);
    const now = Date.now();
    const buckets = Array.from({ length: 6 }, (_, index) => ({
      start: now - (5 - index) * 5 * 60_000,
      label: new Date(now - (5 - index) * 5 * 60_000).toISOString(),
      views: 0,
    }));
    for (const row of minuteRows.rows) {
      const ts = new Date(row.created_at).getTime();
      const age = now - ts;
      const index = 5 - Math.min(5, Math.max(0, Math.floor(age / (5 * 60_000))));
      if (buckets[index]) buckets[index].views += 1;
    }
    const row = metrics.rows[0] || {};
    const payload = {
      ok: true,
      generated_at: new Date().toISOString(),
      active_window_seconds: 120,
      range,
      active_now: Number(row.active_now || 0),
      visitors_today: Number(row.visitors_today || 0),
      pageviews_today: Number(row.pageviews_today || 0),
      visitors_7d: Number(row.visitors_7d || 0),
      range_pageviews: Number(row.range_pageviews || 0),
      range_visitors: Number(row.range_visitors || 0),
      live_30m: buckets,
      top_pages: topPages.rows,
      locales: locales.rows,
      devices: devices.rows,
      privacy: { raw_ip_stored: false, visitor_identity: 'anonymous browser id' },
    };
    analyticsSummaryCache.set(cacheKey, { at: Date.now(), payload });
    console.log(JSON.stringify({ level:'info', event:'analytics_summary_computed', tenant_id:scope.tenant_id, platform_id:scope.platform_id, range, query_count:5, duration_ms:Date.now()-started }));
    return payload;
  })();
  analyticsSummaryFlights.set(cacheKey, flight);
  try { return json(await flight); }
  finally { analyticsSummaryFlights.delete(cacheKey); }
}
'''
backend = prefix + new_function
write(backend_path, backend)

# Category icons: avoid importing the full Lucide namespace into the public bundle.
write('guide-pro/src/components/public/CategoryIcon.tsx', '''import {
  ArrowDownToLine, ArrowUpFromLine, BadgeDollarSign, Banknote, BookOpen, CircleDollarSign,
  CircleHelp, CreditCard, Gift, Headphones, HelpCircle, Info, Landmark, LockKeyhole,
  MessageCircle, Settings, ShieldCheck, Smartphone, Sparkles, Target, Trophy, User, Wallet,
  type LucideIcon, type LucideProps,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  target: Target, wallet: Wallet, creditcard: CreditCard, credit_card: CreditCard, landmark: Landmark,
  bank: Landmark, banknote: Banknote, shield: ShieldCheck, shieldcheck: ShieldCheck, security: ShieldCheck,
  gift: Gift, info: Info, circledollarsign: CircleDollarSign, money: CircleDollarSign,
  badgedollarsign: BadgeDollarSign, deposit: ArrowDownToLine, withdrawal: ArrowUpFromLine,
  user: User, account: User, lock: LockKeyhole, trophy: Trophy, bonus: Gift, sparkles: Sparkles,
  messagecircle: MessageCircle, support: Headphones, headphones: Headphones, smartphone: Smartphone,
  settings: Settings, bookopen: BookOpen, guide: BookOpen, helpcircle: CircleHelp, help: HelpCircle,
};

function iconKey(value: string) { return String(value || "").replace(/[^a-z0-9_]/gi, "").toLowerCase(); }

export function CategoryIcon({ name, url, className, ...props }: { name: string; url?: string } & LucideProps) {
  const safeUrl = String(url || "").trim();
  if (safeUrl && (safeUrl.startsWith("/") || /^https?:\\/\\//i.test(safeUrl))) {
    return <img src={safeUrl} alt="" className={className} style={{ objectFit: "contain" }} />;
  }
  const Icon = ICONS[iconKey(name)] ?? HelpCircle;
  return <Icon className={className} {...props} />;
}
''')

# Guide runtime: honor global query caching and avoid full-page reloads on language changes.
public_layout_path = 'guide-pro/src/components/public/PublicLayout.tsx'
pl = read(public_layout_path)
pl = pl.replace('import { useQuery } from "@tanstack/react-query";', 'import { useQuery, useQueryClient } from "@tanstack/react-query";', 1)
pl = pl.replace('  const platformKey = getPlatformCacheKey();\n', '  const platformKey = getPlatformCacheKey();\n  const queryClient = useQueryClient();\n', 1)
pl = pl.replace('    staleTime: 0,\n    refetchOnMount: "always",', '    staleTime: 5 * 60_000,\n    refetchOnMount: false,', 1)
pl = pl.replace('    staleTime: 0,\n    refetchOnMount: "always",\n    refetchOnWindowFocus: true,', '    staleTime: 5 * 60_000,\n    refetchOnMount: false,\n    refetchOnWindowFocus: false,', 1)
pl = pl.replace('    if (syncStoredGuideLanguage(experience)) window.location.reload();', '    syncStoredGuideLanguage(experience);', 1)
pl = pl.replace('        activeLanguage={activeLanguage}\n', '        activeLanguage={activeLanguage}\n        onLanguageChanged={() => void queryClient.invalidateQueries()}\n', 1)
pl = pl.replace('  activeLanguage,\n}: {', '  activeLanguage,\n  onLanguageChanged,\n}: {', 1)
pl = pl.replace('  activeLanguage: string;\n}) {', '  activeLanguage: string;\n  onLanguageChanged: () => void;\n}) {', 1)
pl = pl.replace('    window.localStorage.setItem("bdg_public_language", String(next).toLowerCase());\n    window.location.reload();', '    window.localStorage.setItem("bdg_public_language", String(next).toLowerCase());\n    onLanguageChanged();', 1)
write(public_layout_path, pl)

for route in ['guide-pro/src/routes/_public.index.tsx','guide-pro/src/routes/_public.guides.tsx','guide-pro/src/routes/_public.faq.tsx']:
    text = read(route)
    text = text.replace('staleTime: 0,\n    refetchOnMount: "always",\n    refetchOnWindowFocus: true,', 'staleTime: 5 * 60_000,\n    refetchOnMount: false,\n    refetchOnWindowFocus: false,')
    text = text.replace('staleTime: 0,\n    refetchOnMount: "always",', 'staleTime: 5 * 60_000,\n    refetchOnMount: false,')
    write(route, text)

# Add a short module-level cache for the two-request platform experience bootstrap.
pgc_path = 'guide-pro/src/lib/platform-guide-content.ts'
pgc = read(pgc_path)
anchor = 'async function jsonFetch(url: string, headers?: HeadersInit) {\n'
if 'const experienceCache = new Map' not in pgc:
    pgc = pgc.replace(anchor, 'const experienceCache = new Map<string, { at: number; value: GuideExperience }>();\nconst experienceFlights = new Map<string, Promise<GuideExperience>>();\nconst EXPERIENCE_TTL_MS = 60_000;\n\n' + anchor, 1)
old_func_start = 'export async function getPlatformGuideExperience(): Promise<GuideExperience> {'
start = pgc.index(old_func_start)
end = pgc.index('\nfunction localizedValue', start)
old_func = pgc[start:end]
body = old_func[len(old_func_start):]
# Strip outer final brace and reuse original logic inside a coalesced promise.
inner = body.rsplit('\n}',1)[0]
# Original inner ends with return object. It can run inside an async IIFE unchanged after cache preamble.
new_func = '''export async function getPlatformGuideExperience(): Promise<GuideExperience> {
  if (!API_BASE) throw new Error("Guide API is not configured.");
  const platform = getPublicPlatformKey();
  const requestedLanguage = localeKey(getPublicLanguage());
  const cacheKey = `${platform || "default"}:${requestedLanguage}`;
  const cached = experienceCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXPERIENCE_TTL_MS) return cached.value;
  const existing = experienceFlights.get(cacheKey);
  if (existing) return existing;
  const flight = (async (): Promise<GuideExperience> => {''' + inner.replace('  if (!API_BASE) throw new Error("Guide API is not configured.");\n  const platform = getPublicPlatformKey();\n', '\n', 1).replace('  const requested = localeKey(getPublicLanguage());', '  const requested = requestedLanguage;', 1) + '''
  })();
  experienceFlights.set(cacheKey, flight);
  try {
    const value = await flight;
    experienceCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } finally { experienceFlights.delete(cacheKey); }
}
'''
pgc = pgc[:start] + new_func + pgc[end:]
write(pgc_path, pgc)

# Additive hot-path indexes; do not increase the PostgreSQL pool size.
migration = '''-- v1.22.1 Stability & Performance\n-- Additive hot-path indexes only. Connection pool sizing is intentionally unchanged.\n\nBEGIN;\n\nCREATE INDEX IF NOT EXISTS idx_support_conversations_platform_recent\n  ON support_conversations(platform_id, last_message_at DESC);\nCREATE INDEX IF NOT EXISTS idx_traffic_events_platform_locale_time\n  ON traffic_events(platform_id, locale, created_at DESC) WHERE event_type='pageview';\nCREATE INDEX IF NOT EXISTS idx_traffic_events_platform_device_time\n  ON traffic_events(platform_id, device_type, created_at DESC) WHERE event_type='pageview';\n\nINSERT INTO system_migrations(migration_key, notes)\nVALUES(\n  'v1.22.1_stability_performance',\n  'Reduces overlapping background traffic and adds indexes for support recency and traffic analytics groupings without increasing database pool size.'\n)\nON CONFLICT(migration_key) DO NOTHING;\n\nCOMMIT;\n'''
write('backend-api/migrations/055_v1.22.1_stability_performance.sql', migration)

# Regression contract for the freeze/stability patch.
regression = r'''import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const server = read('../src/server.js');
const analyticsBackend = read('../src/localized-categories-analytics.js');
const migration = read('../migrations/055_v1.22.1_stability_performance.sql');
const customerService = read('../../admin-pro/src/routes/_admin.customer-service.tsx');
const analytics = read('../../admin-pro/src/routes/_admin.analytics.tsx');
const dashboard = read('../../admin-pro/src/routes/_admin.dashboard.tsx');
const categoryIcon = read('../../guide-pro/src/components/public/CategoryIcon.tsx');
const publicLayout = read('../../guide-pro/src/components/public/PublicLayout.tsx');
const guideHome = read('../../guide-pro/src/routes/_public.index.tsx');
const guideContent = read('../../guide-pro/src/lib/platform-guide-content.ts');

assert.ok(server.includes("const API_VERSION = '1.22.1-stability-performance'"));
for (const feature of ['stability-performance','single-flight-background-refresh','visibility-aware-polling','analytics-summary-cache','guide-runtime-cache','bounded-category-icons']) assert.ok(server.includes(`'${feature}'`), `missing feature ${feature}`);
assert.ok(customerService.includes('refreshInFlightRef'));
assert.ok(customerService.includes('document.visibilityState==="hidden"'));
assert.ok(customerService.includes('45000'));
assert.ok(customerService.includes('loadTabData'));
assert.ok(!customerService.includes('window.setInterval(()=>void load(),10000)'));
assert.ok(!customerService.includes('api.getSupportPerformance(),api.getSupportSettings(),api.getSupportAudit(),api.listSupportAiJobs()'));
assert.ok(analytics.includes('inFlightRef'));
assert.ok(analytics.includes('30_000'));
assert.ok(analytics.includes('visibilitychange'));
assert.ok(dashboard.includes('trafficInFlightRef'));
assert.ok(dashboard.includes('60_000'));
assert.ok(analyticsBackend.includes('ANALYTICS_SUMMARY_TTL_MS = 15_000'));
assert.ok(analyticsBackend.includes('analyticsSummaryFlights'));
assert.ok(analyticsBackend.includes("query_count:5"));
assert.ok(analyticsBackend.includes('slow_localized_content_query'));
assert.ok(migration.includes('idx_support_conversations_platform_recent'));
assert.ok(migration.includes('idx_traffic_events_platform_locale_time'));
assert.ok(migration.includes('idx_traffic_events_platform_device_time'));
assert.ok(!categoryIcon.includes('import * as Lucide'));
assert.ok(categoryIcon.includes('const ICONS: Record<string, LucideIcon>'));
assert.ok(publicLayout.includes('staleTime: 5 * 60_000'));
assert.ok(publicLayout.includes('onLanguageChanged'));
assert.ok(!publicLayout.includes('window.location.reload()'));
assert.ok(guideHome.includes('refetchOnWindowFocus: false'));
assert.ok(guideContent.includes('experienceFlights'));
assert.ok(guideContent.includes('EXPERIENCE_TTL_MS = 60_000'));
console.log('PASS v1.22.1 stability/performance regression contract');
'''
write('backend-api/scripts/v1.22.1-stability-performance-regression-test.js', regression)

# Register the new test in package scripts and standard CI.
pkg_path = ROOT / 'backend-api/package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['scripts']['test:v1221-stability'] = 'node scripts/v1.22.1-stability-performance-regression-test.js'
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')
ci_path = '.github/workflows/ci.yml'
ci = read(ci_path)
if 'npm run test:v1221-stability' not in ci:
    ci = ci.replace('          npm run test:v1220-platform-transfer\n', '          npm run test:v1220-platform-transfer\n          npm run test:v1221-stability\n', 1)
write(ci_path, ci)

print('v1.22.1 stability patch applied')

import { API_BASE, api, getPublicLanguage, getPublicPlatformKey } from "@/lib/api";

export type PublicGuideTag = {
  id: string;
  name: string;
  slug: string;
  color?: string;
};

function normalizeTags(value: unknown): PublicGuideTag[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag: any) => ({
      id: String(tag?.id ?? tag?.slug ?? tag?.name ?? ""),
      name: String(tag?.name || tag?.slug || "").trim(),
      slug: String(tag?.slug || tag?.name || "").trim(),
      color: /^#[0-9a-f]{6}$/i.test(String(tag?.color || "")) ? String(tag.color) : undefined,
    }))
    .filter((tag) => tag.name);
}

async function rawGuideRows(params?: { category?: string; q?: string }) {
  if (!API_BASE) return [] as any[];
  const search = new URLSearchParams();
  if (params?.category) search.set("category", params.category);
  if (params?.q) search.set("q", params.q);
  search.set("language", getPublicLanguage());
  const platform = getPublicPlatformKey();
  if (platform) search.set("platform", platform);
  const response = await fetch(`${API_BASE}/guides?${search.toString()}`, { cache: "no-store" });
  if (!response.ok) return [] as any[];
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

export async function getGuidesWithTags(params?: { category?: string; q?: string }) {
  const guides = await api.getGuides(params);
  const base = guides.map((guide) => ({ ...guide, tags: [] as PublicGuideTag[] }));
  try {
    const raw = await rawGuideRows(params);
    const byId = new Map(raw.map((row: any) => [String(row?.id ?? ""), row]));
    const bySlug = new Map(raw.map((row: any) => [String(row?.slug ?? ""), row]));
    return base.map((guide) => {
      const row = byId.get(String(guide.id)) || bySlug.get(String(guide.slug));
      return { ...guide, tags: normalizeTags(row?.tags) };
    });
  } catch {
    return base;
  }
}

export async function getGuideWithTags(slugOrId: string) {
  const guide = await api.getGuide(slugOrId);
  if (!guide) return null;
  const base = { ...guide, tags: [] as PublicGuideTag[] };
  if (!API_BASE) return base;
  try {
    const search = new URLSearchParams();
    search.set("language", getPublicLanguage());
    const platform = getPublicPlatformKey();
    if (platform) search.set("platform", platform);
    const response = await fetch(`${API_BASE}/guides/${encodeURIComponent(slugOrId)}?${search.toString()}`, { cache: "no-store" });
    if (!response.ok) return base;
    const row = await response.json().catch(() => null);
    return { ...base, tags: normalizeTags(row?.tags) };
  } catch {
    return base;
  }
}

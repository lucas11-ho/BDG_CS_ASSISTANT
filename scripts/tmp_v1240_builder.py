from pathlib import Path
import json

ROOT = Path('.')
NEW_VERSION = '1.24.0-content-taxonomy-stable-faq-slugs'
OLD_VERSION = '1.23.0-topics-security-control'

def read(path): return (ROOT / path).read_text(encoding='utf-8')
def write(path, text): (ROOT / path).write_text(text, encoding='utf-8')
def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing {label}: {old[:120]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'expected one {label}, found {text.count(old)}')
    return text.replace(old, new, 1)

# Backend runtime marker and FAQ output fields.
core_path = 'backend-api/src/core.js'
core = read(core_path)
core = replace_once(core, f"const VERSION = '{OLD_VERSION}';", f"const VERSION = '{NEW_VERSION}';", 'core version')
old_faq_out = "function faqOut(row) { return { id: row.id, question: row.question, answer: row.answer, answer_html: sanitizeRichHtml(row.answer_html || ''), answer_json: row.answer_json || '', image_urls: splitUrls(row.image_urls), locale: row.locale || 'en', keywords: row.keywords || '', priority: row.priority ?? 100, status: row.status || 'published' }; }"
new_faq_out = "function faqOut(row) { return { id: row.id, slug: row.slug || '', topic_id: row.topic_id == null ? null : Number(row.topic_id), question: row.question, answer: row.answer, answer_html: sanitizeRichHtml(row.answer_html || ''), answer_json: row.answer_json || '', image_urls: splitUrls(row.image_urls), locale: row.locale || 'en', keywords: row.keywords || '', priority: row.priority ?? 100, status: row.status || 'published' }; }"
core = replace_once(core, old_faq_out, new_faq_out, 'faqOut')
write(core_path, core)

# Render server integration: Tags admin API, parsed JSON payload, Guide-only multi-topics,
# FAQ single topic, stable slugs and Guide/FAQ tag enrichment.
server_path = 'backend-api/src/server.js'
server = read(server_path)
server = replace_once(
    server,
    "import { closeMultiTopicPools, enrichTopicsResponse, syncTopicsFromResponse } from './multi-topics.js';",
    "import { closeMultiTopicPools, enrichContentTaxonomyResponse, enrichTopicsResponse, handleTagAdminRoute, syncContentTaxonomyFromResponse, syncTopicsFromResponse } from './multi-topics.js';",
    'taxonomy import',
)
server = replace_once(server, f"const API_VERSION = '{OLD_VERSION}';", f"const API_VERSION = '{NEW_VERSION}';", 'server version')
server = replace_once(
    server,
    "  'multi-topic-content',\n",
    "  'faq-stable-slugs',\n  'faq-single-topic',\n  'managed-content-tags',\n  'guide-tags',\n  'faq-tags',\n  'multi-topic-content',\n",
    'feature flags',
)
old_admin_tail = """  if (path.startsWith('/admin/categories')) {
    const permission = isWrite ? 'content.manage' : 'content.view';
    if (denied(permission)) return new Response(JSON.stringify({ ok:false,error:`Administrator permission required: ${permission}`,code:'ADMIN_PERMISSION_DENIED' }), { status:403,headers:{ 'Content-Type':'application/json; charset=utf-8' } });
    return handleCategoryLocaleAdminRoute(request, env, scope);
  }
  return null;
}"""
new_admin_tail = """  if (path.startsWith('/admin/categories')) {
    const permission = isWrite ? 'content.manage' : 'content.view';
    if (denied(permission)) return new Response(JSON.stringify({ ok:false,error:`Administrator permission required: ${permission}`,code:'ADMIN_PERMISSION_DENIED' }), { status:403,headers:{ 'Content-Type':'application/json; charset=utf-8' } });
    return handleCategoryLocaleAdminRoute(request, env, scope);
  }
  if (path.startsWith('/admin/tags')) {
    const permission = isWrite ? 'content.manage' : 'content.view';
    if (denied(permission)) return new Response(JSON.stringify({ ok:false,error:`Administrator permission required: ${permission}`,code:'ADMIN_PERMISSION_DENIED' }), { status:403,headers:{ 'Content-Type':'application/json; charset=utf-8' } });
    return handleTagAdminRoute(request, env, scope);
  }
  return null;
}"""
server = replace_once(server, old_admin_tail, new_admin_tail, 'tag admin route')
old_admin_match = """      path === '/admin/analytics/summary'
      || path === '/admin/categories/locales'
      || /^\/admin\/categories\/\d+\/translations(?:\/[^/]+)?$/.test(path)
    );"""
new_admin_match = """      path === '/admin/analytics/summary'
      || path === '/admin/categories/locales'
      || /^\/admin\/categories\/\d+\/translations(?:\/[^/]+)?$/.test(path)
      || path === '/admin/tags'
      || /^\/admin\/tags\/\d+$/.test(path)
    );"""
server = replace_once(server, old_admin_match, new_admin_match, 'tag dispatch matcher')
old_after_response = """    if (!response) throw Object.assign(new Error('Bulk content route was not found'), { status: 404 });

    const isFaqWrite = response.ok && ((method === 'POST' && path === '/admin/faqs') || (method === 'PUT' && /^\/admin\/faqs\/\d+$/.test(path)));"""
new_after_response = """    if (!response) throw Object.assign(new Error('Bulk content route was not found'), { status: 404 });
    let contentBody = {};
    if (body && String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
      try { contentBody = JSON.parse(Buffer.from(body).toString('utf8')); }
      catch { contentBody = {}; }
    }

    const isFaqWrite = response.ok && ((method === 'POST' && path === '/admin/faqs') || (method === 'PUT' && /^\/admin\/faqs\/\d+$/.test(path)));"""
server = replace_once(server, old_after_response, new_after_response, 'content body parser')
old_wrappers = """    if (isFaqWrite) {
      await persistFaqTopicFromResponse(response, env, faqTopicFromJsonBody(body));
      response = await syncTopicsFromResponse(response, env, 'faq', body || {});
      response = await enrichFaqTopicResponse(response, env);
      response = await enrichTopicsResponse(response, env, 'faq');
    } else if (isFaqRead) {
      response = await enrichFaqTopicResponse(response, env);
      response = await enrichTopicsResponse(response, env, 'faq');
    }
    if (isGuideWrite) {
      response = await syncTopicsFromResponse(response, env, 'guide', body || {});
      response = await enrichTopicsResponse(response, env, 'guide');
    } else if (isGuideRead) {
      response = await enrichTopicsResponse(response, env, 'guide');
    }"""
new_wrappers = """    if (isFaqWrite) {
      await persistFaqTopicFromResponse(response, env, faqTopicFromJsonBody(body));
      response = await syncContentTaxonomyFromResponse(response, env, 'faq', contentBody);
      response = await enrichFaqTopicResponse(response, env);
      response = await enrichContentTaxonomyResponse(response, env, 'faq');
    } else if (isFaqRead) {
      response = await enrichFaqTopicResponse(response, env);
      response = await enrichContentTaxonomyResponse(response, env, 'faq');
    }
    if (isGuideWrite) {
      response = await syncTopicsFromResponse(response, env, 'guide', contentBody);
      response = await syncContentTaxonomyFromResponse(response, env, 'guide', contentBody);
      response = await enrichTopicsResponse(response, env, 'guide');
      response = await enrichContentTaxonomyResponse(response, env, 'guide');
    } else if (isGuideRead) {
      response = await enrichTopicsResponse(response, env, 'guide');
      response = await enrichContentTaxonomyResponse(response, env, 'guide');
    }"""
server = replace_once(server, old_wrappers, new_wrappers, 'taxonomy wrappers')
write(server_path, server)

# Admin API resource.
api_path = 'admin-pro/src/lib/api.ts'
api = read(api_path)
api = replace_once(api, '  categories: "/admin/categories",\n', '  categories: "/admin/categories",\n  tags: "/admin/tags",\n', 'tags API resource')
write(api_path, api)

# Sidebar + release badge.
layout_path = 'admin-pro/src/components/AdminLayout.tsx'
layout = read(layout_path)
layout = replace_once(layout, '  SafetyCertificateOutlined,\n', '  SafetyCertificateOutlined,\n  TagsOutlined,\n', 'tags icon import')
layout = replace_once(layout, 'const ADMIN_VERSION = "v1.23.0";', 'const ADMIN_VERSION = "v1.24.0";', 'Admin version')
layout = replace_once(
    layout,
    '''  {
    key: "/guide-images",
    to: "/guide-images",
    label: "Guide",
    icon: <FileTextOutlined />,
    group: "CONTENT",
  },''',
    '''  {
    key: "/guide-images",
    to: "/guide-images",
    label: "Guide",
    icon: <FileTextOutlined />,
    group: "CONTENT",
  },
  { key: "/tags", to: "/tags", label: "Tags", icon: <TagsOutlined />, group: "CONTENT" },''',
    'Tags nav item',
)
layout = replace_once(layout, '  Categories: "分类",\n', '  Categories: "分类",\n  Tags: "标签",\n', 'Tags zh')
layout = replace_once(layout, '"Site Content": "ဆိုက်အကြောင်းအရာ", Categories: "အမျိုးအစားများ", Guide:', '"Site Content": "ဆိုက်အကြောင်းအရာ", Categories: "အမျိုးအစားများ", Tags: "တဂ်များ", Guide:', 'Tags my')
write(layout_path, layout)

# FAQ Admin: one Topic, stable slug and multiple independent Tags.
faq_path = 'admin-pro/src/routes/_admin.faq.tsx'
faq = read(faq_path)
faq = replace_once(faq,
'''    topic: String(row.topic || row.category || "General").trim() || "General",
    primary_topic_id: row.primary_topic_id || row.category_id || null,
    topic_ids: Array.isArray(row.topic_ids) ? row.topic_ids : [],
    keywords: row.keywords || "",''',
'''    slug: row.slug || "",
    topic: String(row.topic || row.category || "General").trim() || "General",
    topic_id: row.topic_id || row.primary_topic_id || row.category_id || null,
    tag_ids: Array.isArray(row.tag_ids) ? row.tag_ids : [],
    keywords: row.keywords || "",''', 'FAQ bulk payload')
faq = replace_once(faq, '  const [categories, setCategories] = useState<any[]>([]);\n', '  const [categories, setCategories] = useState<any[]>([]);\n  const [tags, setTags] = useState<any[]>([]);\n', 'FAQ tag state')
faq = replace_once(faq, '  const [topicFilter, setTopicFilter] = useState<string | undefined>();\n', '  const [topicFilter, setTopicFilter] = useState<string | undefined>();\n  const [tagFilter, setTagFilter] = useState<number | undefined>();\n', 'FAQ tag filter state')
faq = replace_once(faq,
'''      const [faqRows, registry, categoryRows] = await Promise.all([
        api.list("faq") as Promise<any[]>,
        api.getLocaleRegistry(),
        api.list("categories") as Promise<any[]>,
      ]);
      setRows(faqRows || []);
      setCategories(categoryRows || []);''',
'''      const [faqRows, registry, categoryRows, tagRows] = await Promise.all([
        api.list("faq") as Promise<any[]>,
        api.getLocaleRegistry(),
        api.list("categories") as Promise<any[]>,
        api.list("tags") as Promise<any[]>,
      ]);
      setRows(faqRows || []);
      setCategories(categoryRows || []);
      setTags(tagRows || []);''', 'FAQ load tags')
faq = replace_once(faq,
'''      const matchesSearch = !needle || [row.question, row.answer, row.keywords, row.topic, row.category, ...(row.topics || []).flatMap((topic: any) => [topic.name, topic.slug])]
        .some((value) => String(value || "").toLowerCase().includes(needle));''',
'''      const matchesSearch = !needle || [row.question, row.slug, row.answer, row.keywords, row.topic, row.category, ...(row.tags || []).flatMap((tag: any) => [tag.name, tag.slug])]
        .some((value) => String(value || "").toLowerCase().includes(needle));''', 'FAQ search')
faq = replace_once(faq,
'''      const rowTopicLabels = (row.topics || []).flatMap((item: any) => [String(item.name || ''), String(item.slug || '')]);
      const matchesTopic = !topicFilter || topic === topicFilter || rowTopicLabels.includes(topicFilter);
      const matchesStatus = !statusFilter || String(row.status || "draft") === statusFilter;
      return matchesSearch && matchesLocale && matchesTopic && matchesStatus;
    });
  }, [rows, search, localeFilter, topicFilter, statusFilter]);''',
'''      const matchesTopic = !topicFilter || topic === topicFilter;
      const matchesTag = !tagFilter || (row.tag_ids || []).map(Number).includes(Number(tagFilter));
      const matchesStatus = !statusFilter || String(row.status || "draft") === statusFilter;
      return matchesSearch && matchesLocale && matchesTopic && matchesTag && matchesStatus;
    });
  }, [rows, search, localeFilter, topicFilter, tagFilter, statusFilter]);''', 'FAQ filter logic')
faq = replace_once(faq,
'''    const current = item || { question: "", topic: "General", topic_ids: [], primary_topic_id: null, locale: defaultLocale || localeOptions[0]?.value || "en", status: "published", priority: 100, keywords: "" };''',
'''    const current = item || { question: "", slug: "", topic: "General", topic_id: null, tag_ids: [], locale: defaultLocale || localeOptions[0]?.value || "en", status: "published", priority: 100, keywords: "" };''', 'FAQ editor default')
faq = replace_once(faq,
'''    form.setFieldsValue({ ...current, topic: current.topic || current.category || "General", primary_topic_id: current.primary_topic_id || current.category_id || null, topic_ids: current.topic_ids || (current.category_id ? [current.category_id] : []) });''',
'''    form.setFieldsValue({ ...current, slug: current.slug || "", topic: current.topic || current.category || "General", topic_id: current.topic_id || current.primary_topic_id || current.category_id || null, tag_ids: current.tag_ids || [] });''', 'FAQ editor values')
faq = replace_once(faq,
'''      const payload = { ...values, topic: String(values.topic || "General").trim() || "General", primary_topic_id: values.primary_topic_id || null, topic_ids: values.topic_ids || [], answer: answerHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), answer_html: answerHtml, answer_json: answerJson, image_urls: imageUrls };''',
'''      const selectedTopic = categories.find((category) => Number(category.id) === Number(values.topic_id));
      const payload = { ...values, slug: String(values.slug || "").trim(), topic_id: values.topic_id || null, topic: selectedTopic?.name || String(values.topic || "General").trim() || "General", tag_ids: values.tag_ids || [], answer: answerHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), answer_html: answerHtml, answer_json: answerJson, image_urls: imageUrls };''', 'FAQ save payload')
faq = replace_once(faq,
'''  const clearFilters = () => { setSearch(""); setLocaleFilter(undefined); setTopicFilter(undefined); setStatusFilter(undefined); };''',
'''  const clearFilters = () => { setSearch(""); setLocaleFilter(undefined); setTopicFilter(undefined); setTagFilter(undefined); setStatusFilter(undefined); };''', 'FAQ clear filters')
faq = replace_once(faq,
'''    { title: "Locale", dataIndex: "locale", width: 100, render: (value: string) => <Tag>{String(value || "en").toUpperCase()}</Tag> },
    { title: "Topics", width: 260, render: (_: any, row: any) => <Space wrap>{(row.topics?.length ? row.topics : [{ name: row.topic || row.category || "General", is_primary: true }]).map((topic: any) => <Tag key={`${row.id}-${topic.id || topic.name}`} color={topic.is_primary ? "blue" : "default"}>{topic.name || topic.slug}{topic.is_primary ? " · primary" : ""}</Tag>)}</Space> },
    { title: "Answer", dataIndex: "answer", ellipsis: true },''',
'''    { title: "Stable slug", dataIndex: "slug", width: 190, render: (value: string) => <code>{value || "—"}</code> },
    { title: "Locale", dataIndex: "locale", width: 100, render: (value: string) => <Tag>{String(value || "en").toUpperCase()}</Tag> },
    { title: "Topic", width: 170, render: (_: any, row: any) => <Tag color="blue">{row.topic || row.category || "General"}</Tag> },
    { title: "Tags", width: 220, render: (_: any, row: any) => <Space wrap>{(row.tags || []).map((tag: any) => <Tag key={`${row.id}-tag-${tag.id}`} color={tag.color || "blue"}>{tag.name || tag.slug}</Tag>)}</Space> },
    { title: "Answer", dataIndex: "answer", ellipsis: true },''', 'FAQ table taxonomy columns')
faq = replace_once(faq,
'''    <Alert showIcon type="info" message="FAQ Management v2" description="Search and filter FAQs by language, topic and status. Select individual rows, the current page, or all filtered results, then publish, move to draft, or delete the selection in one workflow." style={{ marginBottom: 12 }} />''',
'''    <Alert showIcon type="info" message="FAQ Management" description="Each FAQ has one Topic, one stable slug, and any number of independent Tags. Search, filter and bulk-manage FAQs without merging Topics together." style={{ marginBottom: 12 }} />''', 'FAQ alert')
faq = replace_once(faq,
'''      <Select allowClear showSearch optionFilterProp="label" value={topicFilter} onChange={setTopicFilter} options={topicOptions} placeholder="All topics" style={{ width: 180 }} />
      <Select allowClear value={statusFilter}''',
'''      <Select allowClear showSearch optionFilterProp="label" value={topicFilter} onChange={setTopicFilter} options={topicOptions} placeholder="All topics" style={{ width: 180 }} />
      <Select allowClear showSearch optionFilterProp="label" value={tagFilter} onChange={setTagFilter} options={tags.filter((tag) => tag.status === "active").map((tag) => ({ value: tag.id, label: tag.name }))} placeholder="All tags" style={{ width: 180 }} />
      <Select allowClear value={statusFilter}''', 'FAQ tag filter control')
faq = replace_once(faq,
'''        <Form.Item name="question" label="Question" rules={[{ required: true }]}><Input placeholder="How do I make a deposit?" /></Form.Item>
        <Space style={{ display: "flex", flexWrap: "wrap" }} align="start">
          <Form.Item name="locale" label="Locale" rules={[{ required: true }]} style={{ width: 250 }}><Select showSearch optionFilterProp="label" loading={loading && !localeOptions.length} options={localeOptions} placeholder="Choose a platform locale" /></Form.Item>
          <Form.Item name="primary_topic_id" label="Primary topic" style={{ width: 260 }}><Select allowClear showSearch optionFilterProp="label" onChange={(value) => { const current = form.getFieldValue("topic_ids") || []; form.setFieldValue("topic_ids", value ? [...new Set([value, ...current])] : current); const category = categories.find((item) => Number(item.id) === Number(value)); if (category?.name) form.setFieldValue("topic", category.name); }} options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>
          <Form.Item name="status" label="Status" style={{ width: 180 }}><Select options={["published", "draft", "archived"].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="priority" label="Priority"><InputNumber min={1} max={999} /></Form.Item>
        </Space>
        <Form.Item name="topic_ids" label="Topics" extra="Choose every topic this FAQ belongs to. The primary topic is used as the compatibility label."><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>
        <Form.Item name="topic" hidden><Input /></Form.Item>''',
'''        <Form.Item name="question" label="Question" rules={[{ required: true }]}><Input placeholder="How do I make a deposit?" /></Form.Item>
        <Form.Item name="slug" label="Stable slug" extra="Leave blank for a new FAQ to generate it automatically from the question. Once generated, changing the question does not change this slug."><Input placeholder="how-do-i-make-a-deposit" /></Form.Item>
        <Space style={{ display: "flex", flexWrap: "wrap" }} align="start">
          <Form.Item name="locale" label="Locale" rules={[{ required: true }]} style={{ width: 250 }}><Select showSearch optionFilterProp="label" loading={loading && !localeOptions.length} options={localeOptions} placeholder="Choose a platform locale" /></Form.Item>
          <Form.Item name="topic_id" label="Topic" style={{ width: 260 }} extra="Each FAQ belongs to one Topic only."><Select allowClear showSearch optionFilterProp="label" onChange={(value) => { const category = categories.find((item) => Number(item.id) === Number(value)); form.setFieldValue("topic", category?.name || "General"); }} options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>
          <Form.Item name="status" label="Status" style={{ width: 180 }}><Select options={["published", "draft", "archived"].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="priority" label="Priority"><InputNumber min={1} max={999} /></Form.Item>
        </Space>
        <Form.Item name="tag_ids" label="Tags" extra="Optional flexible labels. Manage your own Tags from Content → Tags."><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={tags.filter((tag) => tag.status === "active").map((tag) => ({ value: tag.id, label: tag.name }))} /></Form.Item>
        <Form.Item name="topic" hidden><Input /></Form.Item>''', 'FAQ form taxonomy')
write(faq_path, faq)

# Guide Admin keeps multiple Topics and gets a separate Tag selector.
guide_path = 'admin-pro/src/routes/_admin.guide-images.tsx'
guide = read(guide_path)
guide = replace_once(guide, '  const [categories, setCategories] = useState<any[]>([]);\n', '  const [categories, setCategories] = useState<any[]>([]);\n  const [tags, setTags] = useState<any[]>([]);\n', 'Guide tag state')
guide = replace_once(guide,
'''      const [guides, categoryRows, actionRows, registry, context] = await Promise.all([
        api.list("guide-images"),
        api.list("categories"),
        api.list("action-buttons"),
        api.getGuideLocaleStudio(),
        api.getPlatformContext(),
      ]);
      setRows(guides as any[]);
      setCategories(categoryRows as any[]);''',
'''      const [guides, categoryRows, tagRows, actionRows, registry, context] = await Promise.all([
        api.list("guide-images"),
        api.list("categories"),
        api.list("tags"),
        api.list("action-buttons"),
        api.getGuideLocaleStudio(),
        api.getPlatformContext(),
      ]);
      setRows(guides as any[]);
      setCategories(categoryRows as any[]);
      setTags(tagRows as any[]);''', 'Guide load tags')
guide = replace_once(guide,
'''    setEditing(row || { title: "", slug: "", status: "draft", priority: 100, button_ids: [] });''',
'''    setEditing(row || { title: "", slug: "", status: "draft", priority: 100, button_ids: [], tag_ids: [] });''', 'Guide editor default')
guide = replace_once(guide,
'''    form.setFieldsValue(row ? { ...row, primary_topic_id: row.primary_topic_id || row.category_id, topic_ids: row.topic_ids || (row.category_id ? [row.category_id] : []) } : { title: "", slug: "", status: "draft", priority: 100, button_ids: [], topic_ids: [] });''',
'''    form.setFieldsValue(row ? { ...row, primary_topic_id: row.primary_topic_id || row.category_id, topic_ids: row.topic_ids || (row.category_id ? [row.category_id] : []), tag_ids: row.tag_ids || [] } : { title: "", slug: "", status: "draft", priority: 100, button_ids: [], topic_ids: [], tag_ids: [] });''', 'Guide editor values')
guide = guide.replace('          topic_ids: form.getFieldValue("topic_ids") || [],\n          keywords:', '          topic_ids: form.getFieldValue("topic_ids") || [],\n          tag_ids: form.getFieldValue("tag_ids") || [],\n          keywords:', 1)
guide = guide.replace('          topic_ids: form.getFieldValue("topic_ids") || [],\n          priority:', '          topic_ids: form.getFieldValue("topic_ids") || [],\n          tag_ids: form.getFieldValue("tag_ids") || [],\n          priority:', 1)
guide = replace_once(guide,
'''      { title: "Topics", width: 260, render: (_: any, row: any) => <Space wrap>{(row.topics?.length ? row.topics : [{ name: row.category_name || "—", is_primary: true }]).map((topic: any) => <Tag key={`${row.id}-${topic.id || topic.name}`} color={topic.is_primary ? "blue" : "default"}>{topic.name || topic.slug}{topic.is_primary ? " · primary" : ""}</Tag>)}</Space> },
      { title: "Status",''',
'''      { title: "Topics", width: 260, render: (_: any, row: any) => <Space wrap>{(row.topics?.length ? row.topics : [{ name: row.category_name || "—", is_primary: true }]).map((topic: any) => <Tag key={`${row.id}-${topic.id || topic.name}`} color={topic.is_primary ? "blue" : "default"}>{topic.name || topic.slug}{topic.is_primary ? " · primary" : ""}</Tag>)}</Space> },
      { title: "Tags", width: 220, render: (_: any, row: any) => <Space wrap>{(row.tags || []).map((tag: any) => <Tag key={`${row.id}-tag-${tag.id}`} color={tag.color || "blue"}>{tag.name || tag.slug}</Tag>)}</Space> },
      { title: "Status",''', 'Guide table tags')
guide = replace_once(guide,
'''        <Form.Item name="topic_ids" label="Topics" extra="Assign one or more searchable topics. The primary topic is always kept in the selection."><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>
        <Row gutter={12}>''',
'''        <Form.Item name="topic_ids" label="Topics" extra="Assign one or more searchable Topics. The primary Topic is always kept in the selection."><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>
        <Form.Item name="tag_ids" label="Tags" extra="Optional flexible labels such as Tips & Tricks, Agent or Game. Tags are independent from Topics and are managed from Content → Tags."><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={tags.filter((tag) => tag.status === "active").map((tag) => ({ value: tag.id, label: tag.name }))} /></Form.Item>
        <Row gutter={12}>''', 'Guide tags form')
write(guide_path, guide)

# Current-runtime assertions advance with the production marker. Historical
# migration checks are left untouched because this only changes exact marker strings.
for path in (ROOT / 'backend-api' / 'scripts').glob('*.js'):
    text = path.read_text(encoding='utf-8')
    changed = text.replace(OLD_VERSION, NEW_VERSION).replace('v1.23.0"', 'v1.24.0"').replace("v1.23.0'", "v1.24.0'")
    if changed != text:
        path.write_text(changed, encoding='utf-8')

# v1.24 contract.
regression = r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const migration=read('../migrations/056_v1.24.0_content_taxonomy_stable_faq_slugs.sql');
const taxonomy=read('../src/multi-topics.js');
const server=read('../src/server.js');
const core=read('../src/core.js');
const faq=read('../../admin-pro/src/routes/_admin.faq.tsx');
const guide=read('../../admin-pro/src/routes/_admin.guide-images.tsx');
const tags=read('../../admin-pro/src/routes/_admin.tags.tsx');
const layout=read('../../admin-pro/src/components/AdminLayout.tsx');
const api=read('../../admin-pro/src/lib/api.ts');

assert.ok(core.includes("1.24.0-content-taxonomy-stable-faq-slugs"));
assert.ok(server.includes("1.24.0-content-taxonomy-stable-faq-slugs"));
for(const feature of ['faq-stable-slugs','faq-single-topic','managed-content-tags','guide-tags','faq-tags']) assert.ok(server.includes(`'${feature}'`));
assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS slug VARCHAR(180)'));
assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS topic_id INTEGER REFERENCES categories'));
assert.ok(migration.includes('ensure_faq_stable_slug'));
assert.ok(migration.includes("'faq-' || f.id::text"));
assert.ok(migration.includes('uq_faq_topics_one_topic'));
assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS content_tags'));
assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS guide_tags'));
assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS faq_tags'));
assert.ok(taxonomy.includes("if (kind !== 'guide'"));
assert.ok(taxonomy.includes('syncFaqTopic'));
assert.ok(taxonomy.includes('syncContentTaxonomyFromResponse'));
assert.ok(taxonomy.includes('handleTagAdminRoute'));
assert.ok(server.includes("handleTagAdminRoute"));
assert.ok(server.includes("syncContentTaxonomyFromResponse(response, env, 'faq', contentBody)"));
assert.ok(!server.includes("syncTopicsFromResponse(response, env, 'faq'"));
assert.ok(server.includes("syncTopicsFromResponse(response, env, 'guide', contentBody)"));
assert.ok(server.includes("JSON.parse(Buffer.from(body).toString('utf8'))"));
assert.ok(faq.includes('name="slug" label="Stable slug"'));
assert.ok(faq.includes('name="topic_id" label="Topic"'));
assert.ok(faq.includes('name="tag_ids" label="Tags"'));
assert.ok(!faq.includes('name="topic_ids" label="Topics"'));
assert.ok(guide.includes('name="topic_ids" label="Topics"'));
assert.ok(guide.includes('name="tag_ids" label="Tags"'));
assert.ok(tags.includes('TagManagerPage'));
assert.ok(layout.includes('to: "/tags"'));
assert.ok(layout.includes('const ADMIN_VERSION = "v1.24.0"'));
assert.ok(api.includes('tags: "/admin/tags"'));
console.log('PASS v1.24.0 content taxonomy and stable FAQ slug contract');
'''
write('backend-api/scripts/v1.24.0-content-taxonomy-regression-test.js', regression)

pkg_path = ROOT / 'backend-api/package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['scripts']['test:v1240-taxonomy'] = 'node scripts/v1.24.0-content-taxonomy-regression-test.js'
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

ci_path = '.github/workflows/ci.yml'
ci = read(ci_path)
if 'npm run test:v1240-taxonomy' not in ci:
    ci = replace_once(ci, '          npm run test:v1230-topics-security\n', '          npm run test:v1230-topics-security\n          npm run test:v1240-taxonomy\n', 'v1.24 CI hook')
write(ci_path, ci)

print('v1.24.0 taxonomy integration applied')

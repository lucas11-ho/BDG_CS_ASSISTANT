import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const p = (file) => path.join(root, file);
const read = (file) => fs.readFileSync(p(file), 'utf8');
const write = (file, content) => {
  const target = p(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
};

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function assertRepo() {
  const required = [
    'backend-api/src/core.js',
    'backend-api/src/server.js',
    'admin-pro/src/components/AdminLayout.tsx',
    'admin-pro/src/routes/_admin.ai-knowledge.tsx',
    'admin-pro/src/lib/api.ts',
    '.github/workflows/ci.yml',
    '.github/workflows/bdg-production-release.yml',
  ];
  for (const file of required) if (!fs.existsSync(p(file))) fail(`Run this file from the BDG_CS_ASSISTANT repository root. Missing: ${file}`);

  const api = read('admin-pro/src/lib/api.ts');
  if (!api.includes('"ai-knowledge": "/admin/knowledge"')) {
    fail('The expected ai-knowledge API mapping was not found. The repository may have changed; no patch was applied.');
  }
}

function assertGitClean() {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
    if (status) fail('Your Git working tree is not clean. Commit/stash your current changes first, then run this patch again.');
  } catch (error) {
    fail(`Git check failed: ${error.message}`);
  }
}

function replaceOnce(file, search, replacement, label = search) {
  const source = read(file);
  const first = source.indexOf(search);
  const last = source.lastIndexOf(search);
  if (first < 0) fail(`Missing patch marker in ${file}: ${label}`);
  if (first !== last) fail(`Patch marker is not unique in ${file}: ${label}`);
  write(file, source.slice(0, first) + replacement + source.slice(first + search.length));
}

function replaceCount(file, search, replacement, expected, label = search) {
  const source = read(file);
  const count = source.split(search).length - 1;
  if (count !== expected) fail(`Expected ${expected} matches in ${file} for ${label}, found ${count}`);
  write(file, source.split(search).join(replacement));
}

function ensureFeatureBranch() {
  const branch = 'feature/v1.18.1-ai-knowledge';
  const current = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  if (current === branch) return;
  const exists = execFileSync('git', ['branch', '--list', branch], { cwd: root, encoding: 'utf8' }).trim();
  if (exists) execFileSync('git', ['checkout', branch], { cwd: root, stdio: 'inherit' });
  else execFileSync('git', ['checkout', '-b', branch], { cwd: root, stdio: 'inherit' });
}

assertRepo();
assertGitClean();
ensureFeatureBranch();

// Production version identity. The existing release workflow waits for Render to expose this exact value.
replaceOnce(
  'backend-api/src/core.js',
  "const VERSION = '1.18.0-luke-commerce-connector-v2';",
  "const VERSION = '1.18.1-ai-knowledge-runtime';",
  'core VERSION',
);
replaceOnce(
  'backend-api/src/server.js',
  "const API_VERSION = '1.18.0-luke-commerce-connector-v2';",
  "const API_VERSION = '1.18.1-ai-knowledge-runtime';",
  'server API_VERSION',
);

// Restore only the simple platform-scoped AI Knowledge API. Other retired AI subsystems remain retired.
replaceOnce(
  'backend-api/src/core.js',
  "    /^\\/admin\\/knowledge(?:\\/|$)/,\n",
  '',
  'retired AI Knowledge matcher',
);

replaceOnce(
  'backend-api/src/core.js',
  '  // AI Knowledge endpoints kept only as backend compatibility. The Admin UI no longer shows AI Knowledge in v0.6.2.\n',
  [
    '  // AI Knowledge is a private assistant-only knowledge source. It is separate from Guide-page FAQs.',
    "  if (method === 'GET' && path === '/admin/knowledge') return json(await listKnowledge(env, scope), 200, env);",
    "  if (method === 'POST' && path === '/admin/knowledge') return json(await createKnowledge(env, await readJson(request), scope), 200, env);",
    "  if (method === 'PUT' && /^\\/admin\\/knowledge\\/\\d+$/.test(path)) return json(await updateKnowledge(env, idFromPath(path), await readJson(request), scope), 200, env);",
    "  if (method === 'DELETE' && /^\\/admin\\/knowledge\\/\\d+$/.test(path)) return json(await deleteById(env, 'knowledge_items', idFromPath(path), scope), 200, env);",
    '',
  ].join('\n'),
  'AI Knowledge compatibility comment',
);

// Add a bounded tenant/platform-scoped knowledge catalog. It is separate from the 24k compiled Assistant Setup.
const knowledgeCatalogBlock = [
  '',
  'async function buildAiKnowledgeCatalog(env, scope, maxCandidates = 500) {',
  '  const limit = Math.max(1, Math.min(500, Number(maxCandidates || 500)));',
  '  const rows = (await q(env, `SELECT * FROM knowledge_items',
  "    WHERE status='active' AND tenant_id=$1::integer AND platform_id=$2::integer",
  '    ORDER BY priority ASC, updated_at DESC, id DESC',
  '    LIMIT $3::integer`, [scope.tenant_id, scope.platform_id, limit])).rows;',
  '  return rows.map(virtualKnowledgeRow);',
  '}',
  '',
  'async function previewAiSourceRouter(env, payload = {}, scope) {',
].join('\n');
replaceOnce(
  'backend-api/src/core.js',
  '\nasync function previewAiSourceRouter(env, payload = {}, scope) {',
  knowledgeCatalogBlock,
  'previewAiSourceRouter marker',
);

replaceOnce(
  'backend-api/src/core.js',
  '  const unified = await buildPromptImageCatalog(env, scope, lang, router.max_candidates);',
  [
    '  const [unified, knowledgeRows] = await Promise.all([',
    '    buildPromptImageCatalog(env, scope, lang, router.max_candidates),',
    '    buildAiKnowledgeCatalog(env, scope, 500),',
    '  ]);',
  ].join('\n'),
  'prompt-first catalog load',
);

replaceOnce(
  'backend-api/src/core.js',
  '  const selected = selectedEntry?.row || null;\n',
  '  const selected = selectedEntry?.row || null;\n  const rankedKnowledge = rankApprovedMenuCandidates(message, knowledgeRows, 3);\n',
  'selected Menu & Images row',
);

const knowledgeContextBlock = [
  '  const knowledgeContexts = rankedKnowledge.map((entry, index) =>',
  "    `Knowledge ${index + 1}:\\nQuestion: ${promptClip(entry.row.title || '', 500)}\\nType: ${promptClip(entry.row.keywords || 'General', 200)}\\nApproved answer: ${promptClip(entry.row.knowledge_content || '', 4500)}`",
  "  ).join('\\n\\n---\\n\\n');",
  '  const dynamicApprovedContext = [',
  "    knowledgeContexts ? `APPROVED AI KNOWLEDGE\\n${knowledgeContexts}` : '',",
  "    approvedContexts ? `APPROVED MENU & IMAGES\\n${approvedContexts}` : '',",
  "  ].filter(Boolean).join('\\n\\n====\\n\\n');",
  '  const baseSystemPrompt = buildPlainTextSystemPrompt({',
].join('\n');
replaceOnce(
  'backend-api/src/core.js',
  '  const baseSystemPrompt = buildPlainTextSystemPrompt({',
  knowledgeContextBlock,
  'baseSystemPrompt marker',
);

replaceOnce(
  'backend-api/src/core.js',
  '    approvedContext:approvedContexts,',
  '    approvedContext:dynamicApprovedContext,',
  'dynamic approved context',
);
replaceCount(
  'backend-api/src/core.js',
  'characters:approvedContexts.length',
  'characters:dynamicApprovedContext.length',
  2,
  'catalog diagnostic character count',
);
replaceOnce(
  'backend-api/src/core.js',
  'confidence:selectedEntry ? selectedEntry.score : null',
  'confidence:selectedEntry ? selectedEntry.score : (rankedKnowledge[0]?.score ?? null)',
  'knowledge diagnostic confidence',
);
replaceOnce(
  'backend-api/src/core.js',
  "reason:selectedEntry ? `Server-selected approved Menu & Images candidate via ${selectedEntry.method}` : 'General Assistant Setup answer'",
  "reason:selectedEntry ? `Server-selected approved Menu & Images candidate via ${selectedEntry.method}` : (rankedKnowledge[0] ? `Server-selected AI Knowledge via ${rankedKnowledge[0].method}` : 'General Assistant Setup answer')",
  'knowledge diagnostic reason',
);

// Simple private Admin surface: Question / Type / Answer / Enabled.
write('admin-pro/src/routes/_admin.ai-knowledge.tsx', String.raw`import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Drawer, Form, Input, Popconfirm, Space, Switch, Table, Tag, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_admin/ai-knowledge")({ component: AiKnowledgePage });

type KnowledgeRow = {
  id: number;
  title: string;
  content: string;
  keywords?: string;
  priority?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

function AiKnowledgePage() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [editing, setEditing] = useState<KnowledgeRow | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.list("ai-knowledge") as KnowledgeRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (error: any) {
      message.error(error?.message || "Could not load AI Knowledge");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openEditor = (row?: KnowledgeRow) => {
    setEditing(row || null);
    form.setFieldsValue({
      question: row?.title || "",
      type: row?.keywords || "General",
      answer: row?.content || "",
      enabled: row ? row.status !== "inactive" : true,
    });
  };

  const closeEditor = () => {
    setEditing(undefined);
    form.resetFields();
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        title: String(values.question || "").trim(),
        content: String(values.answer || "").trim(),
        keywords: String(values.type || "General").trim(),
        priority: 100,
        status: values.enabled === false ? "inactive" : "active",
      };
      if (editing?.id) await api.update("ai-knowledge", editing.id, payload);
      else await api.create("ai-knowledge", payload);
      message.success(editing?.id ? "AI Knowledge updated" : "AI Knowledge added");
      closeEditor();
      await load();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || "Could not save AI Knowledge");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.remove("ai-knowledge", id);
      message.success("AI Knowledge deleted");
      await load();
    } catch (error: any) {
      message.error(error?.message || "Could not delete AI Knowledge");
    }
  };

  const columns = useMemo(() => [
    { title: "Question", dataIndex: "title", render: (value: string) => <b>{value}</b> },
    { title: "Type", dataIndex: "keywords", width: 180, render: (value: string) => <Tag>{value || "General"}</Tag> },
    { title: "Answer", dataIndex: "content", ellipsis: true },
    { title: "Enabled", dataIndex: "status", width: 100, render: (value: string) => <Tag color={value === "inactive" ? "default" : "green"}>{value === "inactive" ? "Off" : "On"}</Tag> },
    {
      title: "Actions",
      width: 150,
      render: (_: unknown, row: KnowledgeRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>Edit</Button>
          <Popconfirm title="Delete this AI Knowledge entry?" onConfirm={() => void remove(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], []);

  return <>
    <Alert
      showIcon
      type="info"
      message="AI Knowledge"
      description="Private knowledge for the AI Assistant only. It is separate from Guide-page FAQs and does not count toward the 24,000-character Assistant Setup runtime. Only relevant enabled entries are added to each AI request."
      style={{ marginBottom: 12 }}
    />
    <div className="bdg-filters" style={{ marginBottom: 12 }}>
      <div style={{ flex: 1, color: "#8ea0bd" }}>Add approved platform knowledge using only Question, Type, and Answer.</div>
      <Button onClick={() => void load()}>Refresh</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>Add Knowledge</Button>
    </div>
    <Table rowKey="id" loading={loading} dataSource={rows} columns={columns as any} pagination={{ pageSize: 20 }} />
    <Drawer
      open={editing !== undefined}
      onClose={closeEditor}
      width="min(760px, 96vw)"
      title={editing?.id ? "Edit AI Knowledge — " + editing.title : "Add AI Knowledge"}
      extra={<Space><Button onClick={closeEditor}>Cancel</Button><Button type="primary" loading={saving} onClick={() => void save()}>Save</Button></Space>}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="question" label="Question" rules={[{ required: true, message: "Enter the customer question" }]}>
          <Input maxLength={500} showCount placeholder="How can I change my withdrawal bank account?" />
        </Form.Item>
        <Form.Item name="type" label="Type" rules={[{ required: true, message: "Enter a type" }]}>
          <Input maxLength={200} placeholder="Withdrawal, Deposit, Account, Promotion..." />
        </Form.Item>
        <Form.Item name="answer" label="Answer" rules={[{ required: true, message: "Enter the approved answer" }]}>
          <Input.TextArea rows={12} maxLength={20000} showCount placeholder="Enter the approved information the AI should use when this knowledge matches a customer question." />
        </Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch checkedChildren="On" unCheckedChildren="Off" />
        </Form.Item>
      </Form>
    </Drawer>
  </>;
}
`);

// Navigation: keep Guide FAQ unchanged and add the new private AI module in the AI group.
replaceOnce(
  'admin-pro/src/components/AdminLayout.tsx',
  [
    '  {',
    '    key: "/ai-content-studio",',
    '    to: "/ai-content-studio",',
    '    label: "Menu & Images",',
    '    icon: <BulbOutlined />,',
    '    group: "AI",',
    '  },',
  ].join('\n'),
  [
    '  {',
    '    key: "/ai-knowledge",',
    '    to: "/ai-knowledge",',
    '    label: "AI Knowledge",',
    '    icon: <QuestionCircleOutlined />,',
    '    group: "AI",',
    '  },',
    '  {',
    '    key: "/ai-content-studio",',
    '    to: "/ai-content-studio",',
    '    label: "Menu & Images",',
    '    icon: <BulbOutlined />,',
    '    group: "AI",',
    '  },',
  ].join('\n'),
  'Menu & Images navigation block',
);
replaceOnce(
  'admin-pro/src/components/AdminLayout.tsx',
  'const ADMIN_VERSION = "v1.18.0";',
  'const ADMIN_VERSION = "v1.18.1";',
  'Admin version',
);
replaceOnce(
  'admin-pro/src/components/AdminLayout.tsx',
  '  "Assistant Setup": "助手设置", "Customer Service": "客户服务", "CUSTOMER SERVICE": "客户服务",',
  '  "Assistant Setup": "助手设置", "AI Knowledge": "AI 知识", "Customer Service": "客户服务", "CUSTOMER SERVICE": "客户服务",',
  'Chinese AI Knowledge label',
);
replaceOnce(
  'admin-pro/src/components/AdminLayout.tsx',
  '"Assistant Setup": "AI Assistant ပြင်ဆင်မှု", "Customer Service":',
  '"Assistant Setup": "AI Assistant ပြင်ဆင်မှု", "AI Knowledge": "AI အသိပညာ", "Customer Service":',
  'Myanmar AI Knowledge label',
);

// Regression guard.
write('backend-api/scripts/v1.18.1-ai-knowledge-regression-test.js', String.raw`import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rankApprovedMenuCandidates } from '../src/plain-text-ai.js';

const core = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const admin = await readFile(new URL('../../admin-pro/src/routes/_admin.ai-knowledge.tsx', import.meta.url), 'utf8');

assert.match(core, /async function buildAiKnowledgeCatalog\(/, 'AI Knowledge catalog must exist');
assert.match(core, /path === '\/admin\/knowledge'/, 'AI Knowledge admin CRUD route must be active');
assert.match(core, /APPROVED AI KNOWLEDGE/, 'AI Knowledge must be injected as bounded dynamic context');
assert.match(core, /buildAiKnowledgeCatalog\(env, scope, 500\)/, 'AI Knowledge retrieval must remain bounded');
assert.match(core, /promptClip\(entry\.row\.knowledge_content \|\| '', 4500\)/, 'Selected answers must have a per-entry prompt budget');

const retiredStart = core.indexOf('function retiredAiAdminEndpoint');
assert.ok(retiredStart >= 0, 'Retired AI endpoint guard must remain present');
const retiredBlock = core.slice(retiredStart, retiredStart + 1800);
assert.equal(retiredBlock.includes('/^\\/admin\\/knowledge(?:\\/|$)/'), false, 'AI Knowledge must not remain inside the retired endpoint guard');
assert.match(retiredBlock, /knowledge-import/, 'Other retired knowledge-import modules must stay retired');

assert.match(admin, /label="Question"/, 'Admin UI must expose Question');
assert.match(admin, /label="Type"/, 'Admin UI must expose Type');
assert.match(admin, /label="Answer"/, 'Admin UI must expose Answer');
assert.match(admin, /separate from Guide-page FAQs/, 'Admin UI must state Guide FAQ separation');

const rows = [{
  id: -1001,
  title: 'How can I change my withdrawal bank account?',
  positive_examples: 'change bank | wrong withdrawal bank | replace linked bank',
  keywords: 'Account Bank Withdrawal',
  knowledge_content: 'Use the approved bank-change procedure.',
  priority: 100,
  confidence_threshold: 25,
}];
const ranked = rankApprovedMenuCandidates('my withdrawal bank is wrong, how can I change it?', rows, 3);
assert.equal(ranked.length, 1, 'Relevant AI Knowledge must be retrievable');
assert.equal(ranked[0].row.id, -1001, 'The matching knowledge row must be selected');
assert.ok(ranked[0].score >= ranked[0].threshold, 'Matched knowledge must meet its confidence threshold');

console.log('v1.18.1 AI Knowledge regression checks passed');
`);

const backendPackagePath = 'backend-api/package.json';
const backendPackage = JSON.parse(read(backendPackagePath));
backendPackage.scripts['test:v1181-ai-knowledge'] = 'node scripts/v1.18.1-ai-knowledge-regression-test.js';
write(backendPackagePath, JSON.stringify(backendPackage, null, 2) + '\n');

replaceOnce(
  '.github/workflows/ci.yml',
  '          npm run test:v1180r1\n',
  '          npm run test:v1180r1\n          npm run test:v1181-ai-knowledge\n',
  'CI v1.18.0-R1 test line',
);
replaceOnce(
  '.github/workflows/bdg-production-release.yml',
  '          npm --prefix backend-api run test:v1180r1\n',
  '          npm --prefix backend-api run test:v1180r1\n          npm --prefix backend-api run test:v1181-ai-knowledge\n',
  'production v1.18.0-R1 test line',
);

write('AI_KNOWLEDGE_V1.18.1.md', `# AI Knowledge v1.18.1\n\nAI Knowledge is a private, tenant/platform-scoped source for the CS Assistant. It is intentionally separate from the public Guide FAQ module.\n\n## Admin surface\n\nThe Admin form contains only Question, Type, Answer, and Enabled. Type is stored using the existing knowledge keyword field, so no destructive database migration is required.\n\n## Runtime\n\nThe compiled Assistant Setup remains capped at 24,000 characters. AI Knowledge is retrieved separately at request time. The backend searches up to 500 active entries for the current tenant/platform, ranks them against the customer message, and supplies only the top three matches. Each selected answer is clipped to 4,500 characters before prompt composition.\n\nMenu & Images remains a separate approved media source and continues to own response images/buttons. Guide-page FAQs are unchanged.\n\n## Safety\n\n- tenant/platform isolation is preserved;\n- inactive entries are never routed;\n- the existing retired AI Q&A/import/router modules remain retired;\n- only the simple /admin/knowledge CRUD route is restored;\n- no SQL migration is introduced;\n- the 24k Assistant Setup compiler limit is unchanged.\n`);

console.log('\nAI Knowledge v1.18.1 patch applied successfully.');
console.log('Next: run the verification commands in START-AI-KNOWLEDGE-V1.18.1.bat.\n');

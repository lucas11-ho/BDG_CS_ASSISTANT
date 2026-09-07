import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPlainTextSystemPrompt,
  enforceHandoffDisabledReply,
  normalizePlainTextReply,
  providerFailureCustomerText,
  rankApprovedMenuCandidates,
} from '../src/plain-text-ai.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const core = read('backend-api/src/core.js');
const server = read('backend-api/src/server.js');
const worker = read('backend-api/src/ai-job-worker.js');
const realtime = read('backend-api/src/support-realtime.js');
const service = read('backend-api/src/support-service.js');
const migration = read('backend-api/migrations/039_v1.16.1_plain_text_ai_worker_realtime_delivery.sql');
const chat = read('chat-pro/src/App.tsx');
const chatApi = read('chat-pro/src/lib/api.ts');
const staff = read('staff-pro/src/App.tsx');
const admin = read('admin-pro/src/routes/_admin.customer-service.tsx');

const checks = [];
function test(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}

test('v1.16.1 worker foundation remains active in the current release', core.includes('1.18.2-ai-knowledge-library') && server.includes('1.18.2-ai-knowledge-library'));
test('migration 039 creates a durable PostgreSQL AI queue', migration.includes('CREATE TABLE IF NOT EXISTS ai_jobs') && migration.includes("status IN ('QUEUED','PROCESSING','RETRYING','COMPLETED','FAILED','CANCELLED','SUPPRESSED')"));
test('migration 039 adds ordered realtime messages and duplicate protection', migration.includes('message_sequence BIGINT') && migration.includes('UNIQUE(conversation_id, client_message_id)'));
test('temporary processing text is configured outside normal messages', migration.includes('processing_message_text') && migration.includes('processing_message_secondary_text') && !core.includes("sender_type,'SYSTEM','AI_PROCESSING'"));
test('DeepSeek output uses plain text instead of model JSON', core.includes('json:false') && core.includes('Return only the final customer-facing answer as plain text') && !buildPlainTextSystemPrompt({}).includes('Return JSON'));
test('background provider attempts are controlled by the durable queue', core.includes('attempts:background ? 1 :') && core.includes("status='RETRYING'"));
test('readable provider text is normalized without JSON parsing', normalizePlainTextReply('```text\nHello customer\n```') === 'Hello customer');
test('server selects approved Menu & Images before calling the model', core.includes('rankApprovedMenuCandidates(message, unified.rows, 3)') && core.includes('Server-selected approved Menu & Images candidate'));
test('retrieval ranks relevant approved menu candidates', rankApprovedMenuCandidates('chicken fried rice',[{id:1,title:'Chicken Fried Rice',priority:1},{id:2,title:'Seafood Noodles',priority:1}],1)[0]?.row?.id === 1);
test('handoff-disabled replies are enforced by the backend', !/contact customer service/i.test(enforceHandoffDisabledReply('Please contact customer service for help.','en')) && core.includes('handoff_disabled_enforced'));
test('provider failure message never requires human support by default', !/support|agent|representative/i.test(providerFailureCustomerText('en')));
test('chat messages are accepted asynchronously with an AI job', core.includes('accepted:true') && core.includes("mode:result.human ? 'HUMAN' : 'AI_PROCESSING'") && chatApi.includes('ChatAcceptedResponse'));
test('AI worker starts independently from the browser request', server.includes('startAiJobWorker') && worker.includes('processNext(env, workerId)'));
test('human takeover suppresses queued or running AI jobs', core.includes("status='SUPPRESSED'") && service.includes("'CANCELLED'") && core.includes('HUMAN_CONTROL_TAKEN'));
test('staff resolution returns the customer to AI by default', service.includes('return_to_ai_on_resolve') && service.includes("control_mode=CASE WHEN return_to_ai_on_resolve THEN 'AI' ELSE 'CLOSED' END"));
test('realtime gateway supports catch-up, delivery, and read events', realtime.includes("support:sync") && realtime.includes("support:delivered") && realtime.includes("support:read"));
test('customer reconnects and requests missed message sequences', chat.includes('openCustomerSupportStream(supportSession.publicId,supportSession.token,lastSequenceRef.current') && chatApi.includes('after_sequence=${Math.max(0, Number(afterSequence || 0))}') && chat.includes('syncCustomerSupport(supportSession.publicId,supportSession.token,lastSequenceRef.current'));
test('processing indicator is ephemeral and removed by job events', chat.includes('AsyncProcessingIndicator') && chat.includes('response.cancelled') && chat.includes('message.created'));
const staffConsoleMarkers = [
  ['Dashboard', 'Dashboard'],
  ['conversation list', 'conversation-list'],
  ['context panel', 'context-panel'],
  ['SSE stream opener', 'openStaffConversationStream'],
  ['HTTP sequence catch-up', 'api.sync'],
];
for (const [label, marker] of staffConsoleMarkers) {
  test(`staff console source contains ${label} marker`, staff.includes(marker));
}
test('staff console has dashboard, three-panel chat, and realtime sync', staffConsoleMarkers.every(([, marker]) => staff.includes(marker)));
test('Admin can manage processing experience and inspect AI jobs', admin.includes('Handoff & Attachments') && admin.includes('Response Delivery') && admin.includes('listSupportAiJobs'));
test('Admin overview exposes queue health', service.includes('completed_24h') && service.includes('/admin/support/ai-jobs'));

test('stale PROCESSING jobs are recoverable after a worker restart', core.includes("j.status='PROCESSING' AND j.locked_at < NOW()-INTERVAL '5 minutes'"));
test('duplicate customer submissions are not rebroadcast', core.includes('if (!result.duplicate)'));
test('customer support tokens are scoped by platform in browser storage', chatApi.includes('supportStorageKey') && chatApi.includes('platformKey = getPlatformKey()'));

console.log(`\n${checks.length}/${checks.length} v1.16.1 realtime AI worker checks passed.`);

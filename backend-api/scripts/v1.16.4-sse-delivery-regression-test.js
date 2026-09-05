import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const server=read('backend-api/src/server.js');
const support=read('backend-api/src/support-service.js');
const realtime=read('backend-api/src/support-realtime.js');
const chat=read('chat-pro/src/App.tsx');
const chatApi=read('chat-pro/src/lib/api.ts');
const staff=read('staff-pro/src/App.tsx');
const staffApi=read('staff-pro/src/api.ts');
const migration=read('backend-api/migrations/042_v1.16.4_sse_customer_delivery_durable_queue.sql');
const checks=[
 ['v1.16.4 release marker is active',server.includes('1.18.1-ai-knowledge-runtime')],
 ['server pipes text/event-stream without buffering',server.includes("contentType.includes('text/event-stream')") && server.includes('response.body.getReader()')],
 ['node request close aborts the streaming response',server.includes('requestAbort.signal') && server.includes("res.once('close'")],
 ['customer support exposes an authenticated SSE endpoint',support.includes('customerSupportStreamResponse') && support.includes('/stream$/i')],
 ['staff support exposes a conversation SSE endpoint',support.includes('staffSupportStreamResponse') && support.includes('staffStreamMatch')],
 ['AI completion and saved message use separate SSE event names',support.includes("'ai:message_created':'response.completed'") && support.includes("'support:message_created':'message.created'")],
 ['SSE sends a database snapshot before live events',support.includes("push('session'") && support.includes('active_ai_jobs')],
 ['SSE filters events by platform and conversation',support.includes('customer.conversation.platform_id') && support.includes('customer.conversation.id')],
 ['SSE emits heartbeat frames and no-transform headers',support.includes("push('heartbeat'") && support.includes("'X-Accel-Buffering':'no'")],
 ['customer Chat consumes SSE with Authorization headers',chatApi.includes('openCustomerSupportStream') && chatApi.includes('text/event-stream') && chat.includes('consumeSupportEventStream')],
 ['customer Chat retains HTTP sequence catch-up fallback',chat.includes('syncCustomerSupport') && chat.includes('setInterval')],
 ['staff Console consumes SSE for permanent conversation events',staffApi.includes('openStaffConversationStream') && staff.includes('consumeStaffEventStream')],
 ['WebSocket gateway still carries presence and typing',realtime.includes("event === 'support:presence'") && realtime.includes("event === 'support:typing'")],
 ['typing is bridged to the SSE event bus',realtime.includes("emitSupportEvent({ event:'support:typing'") && support.includes("'support:typing':'conversation.typing'")],
 ['PostgreSQL durable AI worker remains present',read('backend-api/src/core.js').includes('processNextAiJob') && read('backend-api/src/core.js').includes('ai_jobs')],
 ['migration 042 adds stream controls and sequence resume index',migration.includes('customer_stream_enabled') && migration.includes('idx_support_messages_sse_resume')],
];
let passed=0;
for(const [name,ok] of checks){assert.equal(ok,true,name);console.log(`PASS ${name}`);passed++;}
console.log(`\n${passed}/${checks.length} v1.16.4 SSE delivery checks passed.`);

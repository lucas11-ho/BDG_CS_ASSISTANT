import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { customerExplicitlyRequestsHuman, customerRequestsContactInformation } from '../src/support-service.js';
import { explainMenuCandidateRanking, rankApprovedMenuCandidates } from '../src/plain-text-ai.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const core = read('backend-api/src/core.js');
const server = read('backend-api/src/server.js');
const service = read('backend-api/src/support-service.js');
const realtime = read('backend-api/src/support-realtime.js');
const migration = read('backend-api/migrations/040_v1.16.2_conversation_continuity_realtime_media_matching.sql');
const chat = read('chat-pro/src/App.tsx');
const chatApi = read('chat-pro/src/lib/api.ts');
const staff = read('staff-pro/src/App.tsx');
const staffApi = read('staff-pro/src/api.ts');
const admin = read('admin-pro/src/routes/_admin.customer-service.tsx');
const contentStudio = read('admin-pro/src/routes/_admin.ai-content-studio.tsx');
const integrationTest = read('backend-api/scripts/integration-test.js');

const checks = [];
function test(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}

test('v1.16.2 release marker is active', core.includes('1.18.2-ai-knowledge-library') && server.includes('1.18.2-ai-knowledge-library'));
test('migration 040 adds resume and read continuity fields', migration.includes('customer_resume_key_hash') && migration.includes('last_customer_read_sequence') && migration.includes('last_staff_read_sequence'));
test('migration 040 creates one-time realtime tickets', migration.includes('CREATE TABLE IF NOT EXISTS support_realtime_tickets') && migration.includes('consumed_at') && migration.includes('expires_at'));
test('migration 040 adds localized customer messages and fallback interval', migration.includes('customer_messages_json') && migration.includes('realtime_poll_interval_ms'));
test('migration 040 persists selected menu and media diagnostics', migration.includes('selected_content_id') && migration.includes('selected_match_score') && migration.includes('selected_asset_manifest'));
test('menu matching default is repaired to 55', migration.includes('ALTER COLUMN confidence_threshold SET DEFAULT 55') && migration.includes('SET confidence_threshold=55'));
test('customer conversation can resume with rotating key', service.includes('/support/customer/resume') && service.includes('customer_resume_key_hash') && service.includes('nextResume'));
test('customer receives a fresh one-time realtime ticket', service.includes('/support/customer/realtime-ticket') && chatApi.includes('createCustomerRealtimeTicket'));
test('staff receives a fresh one-time realtime ticket', service.includes('/staff/realtime-ticket') && staffApi.includes('realtimeTicket'));
test('realtime tickets are single use and expire', service.includes('consumed_at IS NULL AND expires_at>NOW()') && service.includes("startsWith('rt_')"));
test('staff ticket consumption revalidates session revocation', service.includes('ticketSessionVersion') && service.includes('SUPPORT_SESSION_REVOKED') && service.includes('support_staff_sessions'));
test('realtime gateway accepts query tickets', realtime.includes("requestUrl.searchParams.get('ticket')") && realtime.includes('event_id'));
test('customer HTTP catch-up returns messages after sequence', service.includes('/sync') && service.includes('message_sequence>$2') && chatApi.includes('syncCustomerSupport'));
test('staff HTTP catch-up returns messages after sequence', service.includes('staffSyncMatch') && staffApi.includes('sync:'));
test('customer client uses connected and fallback synchronization intervals', chat.includes('pollIntervalMs') && chat.includes('12000') && chat.includes('2500'));
test('staff client uses connected and fallback synchronization intervals', staff.includes('socketState') && staff.includes('12000') && staff.includes('2500') && staff.includes('api.sync'));
test('customer restores conversation through resume before old-token fallback', chat.includes('resumeCustomerConversation') && chatApi.includes('resume_key'));
test('customer resume key is platform scoped', chatApi.includes('supportStorageKey(SUPPORT_RESUME_KEY') && chatApi.includes('getPlatformKey()'));
test('refresh restores the latest message anchor', chat.includes('initialAnchorRef') && chat.includes('scrollToBottom') && chat.includes('newMessageCount'));
test('image loading repairs the bottom anchor', chat.includes('onMediaLoad') && chat.includes('handleMediaLoad'));
test('customer UI uses neutral brand status', chat.includes('modeCopy') && chat.includes('uiCopy.online') && !chat.includes('AI Assistant') && !chat.includes('AI offline'));
test('customer UI does not expose raw realtime offline wording', !chat.includes('Realtime connection is offline'));
test('provider failure keeps conversation AI active', core.includes("status=CASE WHEN $2 THEN 'HANDOFF_OFFERED' ELSE 'AI_ACTIVE' END") && !core.includes("last_error_code=$2,last_error_detail=$3,provider_status='failed',control_mode='CLOSED'"));
test('resolved stale human send is rerouted to brand chat', service.includes('SUPPORT_RETURNED_TO_BRAND') && chat.includes('SUPPORT_RETURNED_TO_BRAND'));
test('staff resolution broadcasts return to brand support', service.includes('support:conversation_resolved') && service.includes('return_to_ai:resolution?.returnsToAi === true'));
test('customer can cancel an unassigned queue request', service.includes('cancel-handoff') && chatApi.includes('cancelCustomerHandoff'));
test('contact information questions are separate from live-human requests', customerRequestsContactInformation('Where is your Contact Us page?') && !customerExplicitlyRequestsHuman('Where is your Contact Us page?'));
test('explicit human requests still trigger handoff intent', customerExplicitlyRequestsHuman('Please connect me to a human agent'));
const candidates = [
  { id:1,title:'Jerry Chicken Fried Rice',intent_key:'chicken-fried-rice',locale:'my',positive_examples:'ကြက်သားထမင်းကြော်ရှိလား\nဘာစားရမလဲ',matching_aliases_json:{ my:'စားကောင်းတာလေး\nကြက်သားထမင်းကြော်' },confidence_threshold:55,priority:10,image_urls:['https://example.com/chicken.jpg'] },
  { id:2,title:'Seafood Noodles',intent_key:'seafood-noodles',locale:'my',positive_examples:'ပင်လယ်စာခေါက်ဆွဲ',confidence_threshold:55,priority:20,image_urls:[] },
];
test('hybrid matching selects localized exact trigger', rankApprovedMenuCandidates('ဘာစားရမလဲ', candidates, 3)[0]?.row?.id === 1);
test('hybrid matching selects localized alias', rankApprovedMenuCandidates('စားကောင်းတာလေး အကြံပေးပါ', candidates, 3)[0]?.row?.id === 1);
const diagnostics = explainMenuCandidateRanking('ကြက်သားထမင်းကြော်ရှိလား', candidates, 10);
test('menu diagnostics expose score, threshold, method, phrase and images', diagnostics.selected?.id === 1 && diagnostics.candidates[0]?.score >= diagnostics.candidates[0]?.threshold && diagnostics.candidates[0]?.method && diagnostics.candidates[0]?.images === 1);
test('server persists its selected asset manifest', core.includes('selected_asset_manifest') && core.includes('selectedContent?.id'));
test('Menu & Images Admin exposes aliases, category and threshold', contentStudio.includes('matching_aliases') && contentStudio.includes('Category') && contentStudio.includes('Match threshold'));
test('Menu & Images Admin exposes hybrid match diagnostics', contentStudio.includes('Hybrid Menu & Images Match Tester') && contentStudio.includes('matched_phrase') && contentStudio.includes('approved image(s)'));
test('Customer Service Admin exposes localized customer messages', admin.includes('Localized Customer Messages') && admin.includes('customer_messages_json') && admin.includes('HTTP recovery interval'));
test('Customer Service Admin exposes selected media diagnostics', admin.includes('selected_match_method') && admin.includes('selected_asset_manifest'));
test('all customer system messages are localized centrally', service.includes('DEFAULT_CUSTOMER_MESSAGES') && ['my','id','zh','hi'].every((locale)=>service.includes(`${locale}:{`)));
test('server advertises continuity and hybrid media features', server.includes('customer-sse-stream') && server.includes('sse-last-sequence-resume') && server.includes('hybrid-menu-media-matching') && server.includes('neutral-customer-brand-status'));
test('integration provider classifies the plain-text runtime by contract markers', integrationTest.includes('isPlainTextPrompt') && integrationTest.includes('Return only the customer-facing answer as plain text') && integrationTest.includes('ACTIVE ASSISTANT SETUP RUNTIME') && !integrationTest.includes("systemPrompt.startsWith('You are the production AI assistant') ? 'prompt_first'"));

console.log(`\n${checks.length}/${checks.length} v1.16.2 conversation continuity checks passed.`);

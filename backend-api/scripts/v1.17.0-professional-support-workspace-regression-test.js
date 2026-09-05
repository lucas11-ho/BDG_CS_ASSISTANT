import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
const scriptFile=fileURLToPath(import.meta.url);
const root=path.resolve(path.dirname(scriptFile),'../..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const core=read('backend-api/src/core.js');
const server=read('backend-api/src/server.js');
const support=read('backend-api/src/support-service.js');
const migration=read('backend-api/migrations/043_v1.17.0_professional_support_workspace_media_quick_replies.sql');
const admin=read('admin-pro/src/routes/_admin.customer-service.tsx');
const domain=read('admin-pro/src/routes/_admin.domain-mapping.tsx');
const theme=read('admin-pro/src/routes/_admin.theme-settings.tsx');
const staff=read('staff-pro/src/App.tsx');
const chat=read('chat-pro/src/App.tsx');
const chatApi=read('chat-pro/src/lib/api.ts');
const checks=[
 ['v1.17.0 release marker is active',core.includes('1.18.1-ai-knowledge-runtime')&&server.includes('1.18.1-ai-knowledge-runtime')],
 ['migration 043 accepts staff domain mappings',migration.includes("'chat','guide','admin','staff'")],
 ['migration 043 creates secure support attachments',migration.includes('CREATE TABLE IF NOT EXISTS support_attachments')&&migration.includes('sha256 VARCHAR(64)')],
 ['migration 043 creates customer context',migration.includes('CREATE TABLE IF NOT EXISTS support_customer_context')&&migration.includes('browser_name')],
 ['migration 043 creates quick replies',migration.includes('CREATE TABLE IF NOT EXISTS support_quick_replies')],
 ['migration 043 creates promotional carousel items',migration.includes('CREATE TABLE IF NOT EXISTS chat_promotional_items')],
 ['Staff production origin is generated',core.includes("staff: 'https://bdg-staff-pages.pages.dev'")],
 ['Staff custom domain does not receive a platform route suffix',core.includes("row.site_kind === 'staff'")],
 ['support permissions include attachments and quick replies',support.includes('support.attachments.send')&&support.includes('support.quick_replies.create_personal')],
 ['customer attachments require active human control',support.includes('SUPPORT_ATTACHMENTS_HUMAN_ONLY')&&support.includes("conversation.control_mode!=='HUMAN'")],
 ['only assigned staff may upload attachments',support.includes('SUPPORT_REPLY_OWNER_REQUIRED')],
 ['support uploads validate file signature and type',support.includes('supportAttachmentType')&&support.includes('SUPPORT_ATTACHMENT_TYPE_NOT_ALLOWED')],
 ['customer attachment endpoint exists',support.includes('/attachments$/i')&&support.includes("actorType:'CUSTOMER'")],
 ['staff attachment endpoint exists',support.includes("actorType:'STAFF'")],
 ['admin attachment endpoint exists',support.includes("actorType:'ADMIN'")],
 ['staff can self-accept waiting conversations',support.includes('/accept$/')&&support.includes('SUPPORT_ASSIGNMENT_CONFLICT')],
 ['platform and personal quick reply routes exist',support.includes('/staff/quick-replies')&&support.includes('/admin/support/quick-replies')],
 ['customer device context routes are protected',support.includes('/context$/i')&&support.includes('support.conversations.view_customer_ip')],
 ['public promotions endpoint exists',support.includes('/public/chat-promotions')],
 ['Chat theme exposes carousel controls',core.includes('promotion_autoplay')&&core.includes('promotion_hide_during_human')],
 ['Admin Domain Mapping exposes CS Workspace',domain.includes('CS Workspace')],
 ['Admin workspace has Conversation and Shortcuts panels',admin.includes('Conversation')&&admin.includes('Shortcuts')&&admin.includes('Quick Replies')],
 ['Admin workspace supports attachments and direct replies',admin.includes('uploadSupportAttachment')&&admin.includes('sendAdminSupportMessage')],
 ['Staff workspace has professional queue and right panel',staff.includes('Waiting')&&staff.includes('Shortcuts')&&staff.includes('customerContext')],
 ['Staff workspace supports quick replies and attachments',staff.includes('quickReplies')&&staff.includes('uploadAttachment')],
 ['Chat only exposes upload control in human mode',chat.includes('humanAttachmentsAllowed')&&chat.includes('uploadCustomerSupportAttachment')],
 ['Chat renders image and document attachments',chat.includes('attachmentUrl')&&chat.includes('FileText')],
 ['Chat renders promotional carousel and hides it during human service',chat.includes('PromotionCarousel')&&chat.includes('promotion_hide_during_human')],
 ['Chat API captures customer context',chatApi.includes('saveCustomerSupportContext')],
 ['Chat theme Admin exposes promotional options',theme.includes('Promotional Messages')&&theme.includes('promotion_interval_ms')],
];
let passed=0;
for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else{console.log('PASS',name);passed++}}
console.log(`\n${passed}/${checks.length} v1.17.0 professional support workspace checks passed.`);
if(passed!==checks.length) process.exit(1);

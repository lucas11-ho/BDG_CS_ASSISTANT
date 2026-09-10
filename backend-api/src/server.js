import http from 'node:http';
import { randomUUID } from 'node:crypto';
import api, {
  closeDatabasePools,
  resolveVerifiedCustomHostnameCorsOrigin,
  readiness,
  verifySupportWebSocketToken,
  updateSupportWebSocketPresence,
  heartbeatSupportWebSocket,
  canSubscribeSupportConversation,
  processNextAiJob,
  syncSupportConversationMessages,
  markSupportMessageState,
} from './core.js';
import { attachSupportRealtimeGateway } from './support-realtime.js';
import { closeSupportEventBus } from './support-events.js';
import { startAiJobWorker } from './ai-job-worker.js';
import { allowedOrigin, databaseDescriptor, getRuntimeEnv, validateRuntimeEnv } from './env.js';
import { createR2Adapter } from './r2-adapter.js';
import { handleBulkContentRoute } from './bulk-content-studio.js';

const env = getRuntimeEnv();
const API_VERSION = '1.18.4-guide-faq-bulk-content';
const API_FEATURES = [
  'cs-workspace-shared-domain',
  'staff-self-profile-management',
  'separate-staff-chat-avatar',
  'managed-support-identities',
  'managed-customer-chat-menu',
  'rich-promotion-carousel',
  'customer-right-support-left',
  'authenticated-staff-sse',
  'luke-shared-hosting',
  'shared-platform-route-resolution',
  'dual-hosting-mode',
  'route-scoped-staff-console',
  'verified-domain-mapping-dynamic-cors',
  'exact-https-custom-origin-trust',
  'domain-cors-policy-toggle',
  'automatic-custom-origin-activation',
  'professional-support-workspace',
  'admin-support-sse-workspace',
  'staff-self-accept-queue',
  'human-only-support-attachments',
  'support-attachment-signature-validation',
  'support-customer-device-context',
  'platform-and-personal-quick-replies',
  'chat-promotional-carousel',
  'staff-domain-mapping',
  'customer-sse-stream',
  'staff-sse-message-stream',
  'sse-last-sequence-resume',
  'websocket-presence-and-typing-only',
  'one-time-realtime-tickets',
  'conversation-resume-key-rotation',
  'sse-with-http-catchup-fallback',
  'sequence-based-conversation-continuity',
  'localized-customer-system-messages',
  'neutral-customer-brand-status',
  'hybrid-menu-media-matching',
  'server-owned-media-attachment',
  'menu-match-diagnostics',
  'contact-information-intent-separation',
  'plain-text-deepseek-output',
  'postgresql-ai-job-queue',
  'ephemeral-ai-processing-message',
  'ordered-realtime-message-sequences',
  'sse-reconnect-catchup',
  'client-message-idempotency',
  'server-selected-approved-media',
  'automatic-return-to-ai',
  'tenant-core',
  'human-support-live-chat',
  'dedicated-staff-console',
  'authenticated-support-websocket-presence',
  'platform-scoped-support-staff',
  'support-presence-heartbeats',
  'manual-support-queue-assignment',
  'safe-conversation-transfer',
  'ai-to-human-handoff',
  'support-performance-reports',
  'support-audit-events',
  'platform-control-center',
  'platform-scoped-admin',
  'tenant-data-isolation',
  'platform-context-header',
  'platform-context-no-fallback',
  'platform-resolution-diagnostics',
  'platform-admin-users',
  'automatic-platform-access-links',
  'custom-domain-safety',
  'tenant-role-boundaries',
  'platform-domain-registry',
  'platform-feature-entitlements',
  'assistant-profile-menu-image-runtime',
  'fixed-prompt-image-source',
  'prompt-first-one-call',
  'immutable-prompt-runtime-versions',
  'compiled-prompt-hash',
  'prompt-aware-memory-reset',
  'fresh-admin-prompt-test',
  'prompt-runtime-diagnostics',
  'automatic-message-language-detection',
  'general-prompt-answers-allowed',
  'retired-ai-modules-410',
  'current-deepseek-v4-model',
  'matched-source-image-delivery',
  'live-provider-connectivity-test',
  'backend-keyword-scoring-disabled',
  'structured-rich-response-v2',
  'visual-guide-studio',
  'action-buttons',
  'durable-site-content-delete',
  'unified-content-versions',
  'chat-start-module',
  'experience-studio',
  'safe-animation-presets',
  'platform-chat-layout',
  'r2-s3-api',
  'operations-connector-gateway',
  'platform-connector-allowlist',
  'connector-test-connection',
  'connector-audit-trail',
  'luke-shop-commerce-connector-v2',
  'commerce-signed-customer-context',
  'commerce-read-only-ai-tools',
  'redacted-operation-logs',
  'owner-scoped-support-platform',
  'arbitrary-platform-locales',
  'local-brand-uploads',
  'one-platform-guard',
  'strict-public-platform-route',
  'neutral-route-presentation',
  'quick-reply-one-time',
  'production-domain-mapping',
  'generated-platform-routes',
  'custom-domain-verification',
  'ai-reliability-foundation',
  'bounded-provider-retries',
  'turn-deadline-budget',
  'local-conversation-safety',
  'customer-safe-degraded-response',
  'platform-rate-limits',
  'neutral-ai-fallback',
  'chat-platform-route-propagation',
  'chat-body-platform-context',
  'platform-context-mismatch-rejection',
  'byod-domain-mapping',
  'cloudflare-custom-hostnames',
  'custom-hostname-ssl-readiness',
  'hostname-platform-resolution',
  'dynamic-custom-hostname-cors',
  'single-image-delivery',
  'step-aware-image-rendering',
  'canonical-response-blocks',
  'legacy-image-fallback',
  'domain-id-validation',
  'cloudflare-configuration-guard',
  'guide-parent-publication-sync',
  'guide-derived-publication-status',
  'guide-platform-self-service-upload',
  'guide-publish-role-guard',
  'guide-media-ownership-audit',
  'guide-motion-media',
  'guide-gif-covers',
  'guide-video-autoplay-loop',
  'guide-safe-text-animation-presets',
  'guide-reduced-motion',
  'immutable-file-migrations',
  'server-rich-html-sanitization',
  'connector-dns-ssrf-guard',
  'postgres-api-integration-tests',
  'faq-guide-bulk-content-studio',
  'guide-embedded-cell-image-import'
];
validateRuntimeEnv(env);
env.GUIDE_IMAGES = createR2Adapter(env);

const counters = new Map();
const publicCachePaths = new Set(['/popular-help', '/public/popular-help', '/navigation', '/public/navigation', '/categories', '/public/categories', '/guides', '/public/guides', '/faqs', '/public/faqs', '/action-buttons', '/public/action-buttons']);

function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimit(req, path) {
  let limit = 0;
  if (path === '/chat') limit = env.RATE_LIMIT_CHAT;
  if (path === '/auth/login' || path === '/login' || path === '/api/login') limit = env.RATE_LIMIT_LOGIN;
  if (!limit) return null;
  const now = Date.now();
  const bucket = Math.floor(now / env.RATE_LIMIT_WINDOW_MS);
  const key = `${clientIp(req)}:${path}:${bucket}`;
  const count = (counters.get(key) || 0) + 1;
  counters.set(key, count);
  if (counters.size > 10_000) {
    for (const existing of counters.keys()) if (!existing.endsWith(`:${bucket}`)) counters.delete(existing);
  }
  return count > limit ? Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000) : null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > Math.max(env.MAX_REQUEST_BYTES, 22 * 1024 * 1024)) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function requestUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${env.PORT}`;
  return `${proto}://${host}${req.url || '/'}`;
}

function jsonResponse(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(payload));
}

async function handleHealth(path) {
  if (path === '/health/live') return { ok: true, service: env.APP_NAME, version: API_VERSION, features:API_FEATURES, runtime: 'render-node-neon', ...databaseDescriptor(env), timestamp: new Date().toISOString() };
  const db = await readiness(env);
  if (path === '/health/dependencies') {
    let r2 = env.R2_REQUIRED ? 'not_checked' : 'optional';
    if (env.GUIDE_IMAGES) {
      await env.GUIDE_IMAGES.health();
      r2 = 'ok';
    }
    return { ...db, version: API_VERSION, features:API_FEATURES, r2, deepseek: env.DEEPSEEK_API_KEY ? 'configured' : 'not_configured', timestamp: new Date().toISOString() };
  }
  return { ...db, version: API_VERSION, features:API_FEATURES, runtime: 'render-node-neon', timestamp: new Date().toISOString() };
}

async function authenticatedBulkResponse(request, env, url, path, requestHeaders, signal) {
  const contextUrl = new URL('/admin/platform-context', url.origin);
  const contextRequest = new Request(contextUrl, { method: 'GET', headers: requestHeaders, signal });
  const contextResponse = await api.fetch(contextRequest, env);
  if (!contextResponse.ok) return contextResponse;
  const context = await contextResponse.json();
  const platform = context?.platform || {};
  const access = context?.access || {};
  const scope = { ...platform, ...access };
  const isImport = request.method.toUpperCase() === 'POST' && path.endsWith('/import');
  if (isImport && access.can_write !== true) {
    return new Response(JSON.stringify({ ok: false, error: 'This platform membership is read-only', code: 'PLATFORM_WRITE_DENIED' }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (isImport && path.includes('/guide/') && access.can_upload_guides !== true) {
    return new Response(JSON.stringify({ ok: false, error: 'Guide upload permission is required for this platform', code: 'GUIDE_UPLOAD_DENIED' }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  return handleBulkContentRoute(request, env, scope);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const requestId = String(req.headers['x-request-id'] || randomUUID());
  const url = new URL(requestUrl(req));
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = String(req.headers.origin || '');
  let corsOrigin = allowedOrigin(env, origin);

  try {
    if (origin && !corsOrigin) {
      const customOrigin = await resolveVerifiedCustomHostnameCorsOrigin(env, origin);
      if (customOrigin.allowed) corsOrigin = customOrigin.origin;
      else return jsonResponse(res, 403, { ok: false, error: 'Origin is not allowed', code: 'CORS_ORIGIN_NOT_TRUSTED', request_id: requestId }, { 'X-Request-ID': requestId, Vary: 'Origin' });
    }
    const retryAfter = rateLimit(req, path);
    if (retryAfter) return jsonResponse(res, 429, { ok: false, error: 'Too many requests', request_id: requestId }, { 'Retry-After': String(retryAfter), 'X-Request-ID': requestId, ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}) });

    if (['/health', '/health/ready', '/health/live', '/health/dependencies'].includes(path)) {
      const payload = await handleHealth(path === '/health' ? '/health/ready' : path);
      return jsonResponse(res, 200, payload, { 'Cache-Control': 'no-store', 'X-Request-ID': requestId, 'X-API-Version': API_VERSION, ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' } : {}) });
    }

    const body = ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : await readBody(req);
    const requestHeaders = { ...req.headers, 'x-request-id': requestId };
    const requestAbort=new AbortController();
    const abortRequest=()=>{ if (!requestAbort.signal.aborted) requestAbort.abort(); };
    req.once('aborted',abortRequest);
    res.once('close',()=>{ if (!res.writableEnded) abortRequest(); });
    const request = new Request(url, {
      method: req.method,
      headers: requestHeaders,
      body,
      signal:requestAbort.signal,
      ...(body ? { duplex: 'half' } : {}),
    });
    const response = path.startsWith('/admin/content-bulk/')
      ? await authenticatedBulkResponse(request, env, url, path, requestHeaders, requestAbort.signal)
      : await api.fetch(request, env);
    if (!response) throw Object.assign(new Error('Bulk content route was not found'), { status: 404 });
    const headers = Object.fromEntries(response.headers.entries());
    headers['x-request-id'] = requestId;
    headers['x-api-version'] = API_VERSION;
    headers['vary'] = 'Origin, Accept-Encoding';
    if (corsOrigin) headers['access-control-allow-origin'] = corsOrigin;
    else delete headers['access-control-allow-origin'];
    const hasPlatformContext = url.searchParams.has('platform');
    if (req.method === 'GET' && !hasPlatformContext && (publicCachePaths.has(path) || path.startsWith('/guides/'))) {
      headers['cache-control'] = 'public, max-age=60, stale-while-revalidate=600, stale-if-error=86400';
    } else if (hasPlatformContext || path.startsWith('/admin/') || path.startsWith('/auth/') || path === '/chat' || path === '/guide/content' || path === '/public/guide-content') {
      headers['cache-control'] = 'no-store';
    }
    const contentType=String(headers['content-type'] || '');
    if (req.method !== 'HEAD' && contentType.includes('text/event-stream') && response.body) {
      res.writeHead(response.status, headers);
      const reader=response.body.getReader();
      try {
        while (true) {
          const { done, value }=await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) await new Promise((resolve)=>res.once('drain',resolve));
        }
      } catch (error) {
        if (!res.destroyed) console.warn(JSON.stringify({ level:'warn',event:'sse_stream_closed',request_id:requestId,message:error?.message || String(error) }));
      } finally {
        try { reader.releaseLock(); } catch {}
        if (!res.writableEnded) res.end();
      }
      return;
    }
    const responseBody = req.method === 'HEAD' ? null : Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(responseBody);
  } catch (error) {
    const status = Number(error.status || 500);
    jsonResponse(res, status, { ok: false, error: status >= 500 ? 'Service temporarily unavailable' : error.message, code: error.code || undefined, request_id: requestId, version: API_VERSION }, { 'Cache-Control': 'no-store', 'X-Request-ID': requestId, ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}) });
    console.error(JSON.stringify({ level: 'error', request_id: requestId, method: req.method, path, status, duration_ms: Date.now() - started, message: error.message, stack: error.stack }));
    return;
  } finally {
    console.log(JSON.stringify({ level: 'info', request_id: requestId, method: req.method, path, status: res.statusCode, duration_ms: Date.now() - started, ip: clientIp(req), version: API_VERSION, ...databaseDescriptor(env) }));
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 65_000;
server.listen(env.PORT, '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', event: 'server_started', port: env.PORT, version: API_VERSION, ...databaseDescriptor(env) })));

const supportGateway = await attachSupportRealtimeGateway({
  server,
  env,
  verifyAccess:verifySupportWebSocketToken,
  heartbeat:heartbeatSupportWebSocket,
  presence:updateSupportWebSocketPresence,
  canSubscribe:canSubscribeSupportConversation,
  syncConversation:syncSupportConversationMessages,
  markMessageState:markSupportMessageState,
});

const aiWorker = startAiJobWorker({ env, processNext:processNextAiJob, intervalMs:750, concurrency:1 });

async function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_started', signal }));
  server.close(async () => {
    await aiWorker.close().catch(() => undefined);
    await supportGateway.close().catch(() => undefined);
    await closeSupportEventBus().catch(() => undefined);
    await closeDatabasePools();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

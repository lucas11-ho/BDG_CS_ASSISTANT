const ACTIONS = new Set([
  'ask',
  'write',
  'write_section',
  'rewrite',
  'fix_grammar',
  'professional',
  'casual',
  'shorten',
  'expand',
  'summarize',
  'steps',
  'bullets',
  'table',
  'translate',
  'extend',
]);

const CREATIVE_ACTIONS = new Set(['ask', 'write', 'write_section', 'expand', 'extend']);

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const INLINE_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'textStyle', 'highlight']);
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'horizontalRule',
  'codeBlock',
]);

function bounded(value, max) {
  return String(value || '').trim().slice(0, max);
}

function instructionFor(action, prompt) {
  if (action === 'fix_grammar') return 'Correct grammar, spelling, punctuation, and clarity. Preserve meaning and factual claims. Keep useful formatting where appropriate.';
  if (action === 'professional') return 'Rewrite in a concise, professional customer-service tone. Preserve meaning and factual claims. Use clear visual formatting when it improves readability.';
  if (action === 'casual') return 'Rewrite in a natural, friendly, casual tone. Preserve meaning and factual claims.';
  if (action === 'summarize') return 'Summarize the supplied text without adding new facts. Use headings, bullets, or a small table only when they genuinely improve comprehension.';
  if (action === 'extend') return 'Continue the writing naturally using only information already present in the supplied text and context. Do not invent operational facts.';
  return bounded(prompt, 2400) || 'Improve the supplied writing while preserving its meaning and factual claims.';
}

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseComment(text = 'keep-alive') {
  return `: ${text}\n\n`;
}

function trimPartialClosingTag(value, closingTag) {
  let text = value;
  const max = Math.min(closingTag.length - 1, text.length);
  for (let size = max; size > 0; size -= 1) {
    const suffix = text.slice(-size);
    if (closingTag.startsWith(suffix)) return text.slice(0, -size);
  }
  return text;
}

function sectionText(raw, name, partial = false) {
  const open = `<${name}>`;
  const close = `</${name}>`;
  const start = raw.indexOf(open);
  if (start < 0) return '';
  const from = start + open.length;
  const end = raw.indexOf(close, from);
  if (end >= 0) return raw.slice(from, end);
  if (!partial) return '';
  return trimPartialClosingTag(raw.slice(from), close);
}

function normalizeMarks(marks) {
  if (!Array.isArray(marks)) return undefined;
  const normalized = [];
  for (const mark of marks) {
    const type = String(mark?.type || '');
    if (!INLINE_MARKS.has(type)) continue;
    if (type === 'textStyle') {
      const color = String(mark?.attrs?.color || '');
      if (COLOR_RE.test(color)) normalized.push({ type, attrs:{ color } });
      continue;
    }
    if (type === 'highlight') {
      const color = String(mark?.attrs?.color || '');
      if (COLOR_RE.test(color)) normalized.push({ type, attrs:{ color } });
      continue;
    }
    normalized.push({ type });
  }
  return normalized.length ? normalized : undefined;
}

function normalizeInline(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'text') {
    const text = String(node.text || '').slice(0, 20000);
    if (!text) return null;
    const marks = normalizeMarks(node.marks);
    return { type:'text', text, ...(marks ? { marks } : {}) };
  }
  if (node.type === 'hardBreak') return { type:'hardBreak' };
  return null;
}

function normalizeBlock(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 10) return null;
  const type = String(node.type || '');
  if (!BLOCK_TYPES.has(type)) return null;

  if (type === 'horizontalRule') return { type:'horizontalRule' };

  if (type === 'paragraph') {
    const content = Array.isArray(node.content) ? node.content.map(normalizeInline).filter(Boolean) : [];
    return { type, ...(content.length ? { content } : {}) };
  }

  if (type === 'heading') {
    const level = Math.max(1, Math.min(4, Number(node?.attrs?.level || 2)));
    const content = Array.isArray(node.content) ? node.content.map(normalizeInline).filter(Boolean) : [];
    return { type, attrs:{ level }, ...(content.length ? { content } : {}) };
  }

  if (type === 'codeBlock') {
    const text = Array.isArray(node.content)
      ? node.content.filter((item) => item?.type === 'text').map((item) => String(item.text || '')).join('').slice(0, 20000)
      : '';
    return { type, ...(text ? { content:[{ type:'text', text }] } : {}) };
  }

  if (type === 'blockquote') {
    const content = Array.isArray(node.content) ? node.content.map((item) => normalizeBlock(item, depth + 1)).filter(Boolean) : [];
    return content.length ? { type, content } : null;
  }

  if (type === 'bulletList' || type === 'orderedList') {
    const content = Array.isArray(node.content)
      ? node.content.filter((item) => item?.type === 'listItem').map((item) => normalizeBlock(item, depth + 1)).filter(Boolean)
      : [];
    const attrs = type === 'orderedList' ? { start:Math.max(1, Math.min(999, Number(node?.attrs?.start || 1))) } : undefined;
    return content.length ? { type, ...(attrs ? { attrs } : {}), content } : null;
  }

  if (type === 'listItem') {
    const content = Array.isArray(node.content)
      ? node.content.map((item) => normalizeBlock(item, depth + 1)).filter(Boolean)
      : [];
    return content.length ? { type, content } : null;
  }

  if (type === 'table') {
    const content = Array.isArray(node.content)
      ? node.content.filter((item) => item?.type === 'tableRow').map((item) => normalizeBlock(item, depth + 1)).filter(Boolean)
      : [];
    return content.length ? { type, content } : null;
  }

  if (type === 'tableRow') {
    const content = Array.isArray(node.content)
      ? node.content.filter((item) => item?.type === 'tableCell' || item?.type === 'tableHeader').map((item) => normalizeBlock(item, depth + 1)).filter(Boolean)
      : [];
    return content.length ? { type, content } : null;
  }

  if (type === 'tableCell' || type === 'tableHeader') {
    const content = Array.isArray(node.content)
      ? node.content.map((item) => normalizeBlock(item, depth + 1)).filter(Boolean)
      : [];
    const colspan = Math.max(1, Math.min(20, Number(node?.attrs?.colspan || 1)));
    const rowspan = Math.max(1, Math.min(100, Number(node?.attrs?.rowspan || 1)));
    return {
      type,
      attrs:{ colspan, rowspan, colwidth:null },
      content:content.length ? content : [{ type:'paragraph' }],
    };
  }

  return null;
}

function plainParagraph(text) {
  const value = String(text || '').trim().slice(0, 30000);
  return {
    type:'doc',
    content:[{
      type:'paragraph',
      ...(value ? { content:[{ type:'text', text:value }] } : {}),
    }],
  };
}

function normalizeRichDocument(value, fallbackText = '') {
  const source = value?.type === 'doc' ? value : { type:'doc', content:Array.isArray(value?.content) ? value.content : [] };
  const content = Array.isArray(source.content)
    ? source.content.map((item) => normalizeBlock(item, 0)).filter(Boolean).slice(0, 120)
    : [];
  return content.length ? { type:'doc', content } : plainParagraph(fallbackText);
}

function richPrompt(locale) {
  return [
    'Return exactly two sections and nothing else:',
    '<draft>',
    'A readable plain-text preview of the result. Do not include XML tags inside the draft.',
    '</draft>',
    '<rich>',
    'A single JSON object compatible with the TipTap/ProseMirror schema described below.',
    '</rich>',
    '',
    'The <rich> JSON must be: {"type":"doc","content":[...]}',
    'Allowed block node types: paragraph, heading, blockquote, bulletList, orderedList, listItem, table, tableRow, tableCell, tableHeader, horizontalRule, codeBlock.',
    'Allowed inline nodes: text, hardBreak.',
    'Allowed text marks: bold, italic, underline, strike, textStyle with attrs.color, highlight with attrs.color.',
    'Use 6-digit hexadecimal colors such as #1d4ed8 and #fff59d.',
    'Tables must use table > tableRow > tableHeader/tableCell > paragraph (or another allowed block).',
    'You may create tables, headings, lists, quotes, colored text, highlighted text, and combinations when requested.',
    'Do not output images, iframes, scripts, raw HTML, links, or unknown node/mark types.',
    'Do not use markdown fences around the JSON.',
    `Write in locale: ${locale}.`,
  ].join('\n');
}

export async function streamEditorAi(request, env) {
  if (String(env.AI_MODE_ENABLED).toLowerCase() === 'false' || !env.DEEPSEEK_API_KEY) {
    return new Response(JSON.stringify({ ok:false, error:'AI writing assistant is not configured', code:'EDITOR_AI_UNAVAILABLE' }), {
      status:503,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
    });
  }

  let payload = {};
  try { payload = await request.json(); }
  catch {
    return new Response(JSON.stringify({ ok:false, error:'Invalid JSON body', code:'EDITOR_AI_INVALID_BODY' }), {
      status:400,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
    });
  }

  const action = ACTIONS.has(String(payload.action || '')) ? String(payload.action) : 'ask';
  const selectedText = bounded(payload.text, 12000);
  const surroundingText = bounded(payload.context, 7000);
  const locale = bounded(payload.locale, 40) || 'en';
  if (!selectedText && action !== 'ask' && action !== 'extend') {
    return new Response(JSON.stringify({ ok:false, error:'Select text before using this AI action', code:'EDITOR_AI_TEXT_REQUIRED' }), {
      status:400,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
    });
  }

  const system = [
    'You are the native AI writing and formatting assistant inside the BDG Rich Editor.',
    'Never invent account, payment, bonus, policy, security, or operational facts.',
    'Use only facts present in the selected text or nearby document context.',
    'Follow the requested transformation and formatting precisely.',
    richPrompt(locale),
  ].join('\n\n');

  const user = [
    `Task: ${instructionFor(action, payload.prompt)}`,
    selectedText ? `Selected text:\n${selectedText}` : '',
    surroundingText ? `Nearby document context:\n${surroundingText}` : '',
  ].filter(Boolean).join('\n\n');

  const apiBase = String(env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort();
  request.signal?.addEventListener?.('abort', abortFromRequest, { once:true });

  const body = new ReadableStream({
    async start(output) {
      let provider;
      let reader;
      let heartbeat;
      let inactivity;
      let totalTimer;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try { output.close(); } catch {}
      };
      const send = (value) => {
        if (closed) return;
        try { output.enqueue(encoder.encode(value)); } catch { closed = true; }
      };
      const inactivityMs = Math.max(30000, Math.min(Number(env.DEEPSEEK_TIMEOUT_MS || 15000) * 3, 60000));
      const resetInactivity = () => {
        clearTimeout(inactivity);
        inactivity = setTimeout(() => controller.abort(), inactivityMs);
      };

      try {
        send(sseEvent('start', { action, mode:'rich' }));
        send(sseEvent('status', { message:'AI is preparing rich content' }));
        heartbeat = setInterval(() => send(sseComment()), 8000);
        totalTimer = setTimeout(() => controller.abort(), 120000);
        resetInactivity();

        provider = await fetch(`${apiBase}/chat/completions`, {
          method:'POST',
          signal:controller.signal,
          headers:{
            Authorization:`Bearer ${env.DEEPSEEK_API_KEY}`,
            'Content-Type':'application/json',
            Accept:'text/event-stream',
          },
          body:JSON.stringify({
            model:env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
            messages:[{ role:'system', content:system }, { role:'user', content:user }],
            temperature:action === 'casual' ? 0.4 : 0.18,
            max_tokens:2600,
            stream:true,
          }),
        });
        resetInactivity();

        if (!provider.ok || !provider.body) {
          const detail = await provider.text().catch(() => '');
          send(sseEvent('error', {
            error:`AI provider returned HTTP ${provider.status}`,
            detail:detail.slice(0,220),
            code:'EDITOR_AI_PROVIDER_ERROR',
          }));
          return;
        }

        reader = provider.body.getReader();
        let providerBuffer = '';
        let rawOutput = '';
        let emittedDraftLength = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetInactivity();
          providerBuffer += decoder.decode(value, { stream:true });
          const lines = providerBuffer.split(/\r?\n/);
          providerBuffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = String(parsed?.choices?.[0]?.delta?.content || '');
              if (!delta) continue;
              rawOutput += delta;
              const draft = sectionText(rawOutput, 'draft', true);
              if (draft.length > emittedDraftLength) {
                const text = draft.slice(emittedDraftLength);
                emittedDraftLength = draft.length;
                send(sseEvent('token', { text }));
              }
            } catch {
              // Ignore malformed provider frames and continue consuming the stream.
            }
          }
        }

        const finalDraft = sectionText(rawOutput, 'draft', false).trim() || bounded(rawOutput, 30000);
        const richText = sectionText(rawOutput, 'rich', false).trim();
        let document;
        let degraded = false;
        try {
          document = normalizeRichDocument(JSON.parse(richText), finalDraft);
        } catch {
          document = plainParagraph(finalDraft);
          degraded = true;
        }

        if (emittedDraftLength === 0 && finalDraft) {
          send(sseEvent('token', { text:finalDraft }));
        }
        send(sseEvent('result', {
          text:finalDraft,
          document,
          degraded,
        }));
        send(sseEvent('done', { ok:true, degraded }));
      } catch (error) {
        if (!request.signal?.aborted) {
          const timedOut = error?.name === 'AbortError';
          send(sseEvent('error', {
            error:timedOut ? 'AI generation timed out or became inactive. Please try again.' : (error?.message || 'AI stream failed'),
            code:timedOut ? 'EDITOR_AI_TIMEOUT' : 'EDITOR_AI_STREAM_FAILED',
          }));
        }
      } finally {
        clearInterval(heartbeat);
        clearTimeout(inactivity);
        clearTimeout(totalTimer);
        request.signal?.removeEventListener?.('abort', abortFromRequest);
        try { reader?.releaseLock(); } catch {}
        close();
      }
    },
    cancel() { controller.abort(); },
  });

  return new Response(body, {
    status:200,
    headers:{
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-store, no-transform',
      Connection:'keep-alive',
      'X-Accel-Buffering':'no',
    },
  });
}

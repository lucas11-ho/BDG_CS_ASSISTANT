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

function safeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const key of ['documentType', 'title', 'summary', 'platformName', 'languageLabel']) {
    const text = bounded(value[key], key === 'summary' ? 3000 : 600);
    if (text) out[key] = text;
  }
  for (const key of ['topics', 'tags']) {
    if (Array.isArray(value[key])) out[key] = value[key].map((item) => bounded(item, 180)).filter(Boolean).slice(0, 30);
  }
  return out;
}

function contextText(context) {
  const parts = [];
  if (context.documentType) parts.push('Document type: ' + context.documentType);
  if (context.title) parts.push('Title: ' + context.title);
  if (context.summary) parts.push('Summary: ' + context.summary);
  if (context.platformName) parts.push('Platform/brand: ' + context.platformName);
  if (context.languageLabel) parts.push('Language: ' + context.languageLabel);
  if (context.topics?.length) parts.push('Topics: ' + context.topics.join(', '));
  if (context.tags?.length) parts.push('Tags: ' + context.tags.join(', '));
  return parts.join('\n');
}

function tokenBudget(action, prompt, selectedText) {
  const longForm = /\b(complete|full|detailed|comprehensive|article|guide|tutorial|documentation|long|in-depth|multiple sections|10 sections|ten sections)\b/i.test(prompt);
  if (longForm) return 7000;
  if (['write', 'ask', 'write_section', 'expand', 'extend'].includes(action)) return selectedText.length > 7000 ? 5500 : 4800;
  return 2600;
}

function writerSystem(action, locale) {
  const creative = CREATIVE_ACTIONS.has(action);
  return [
    'You are the AI Writer inside a professional rich-document editor.',
    creative
      ? 'This is a creative writing task. Follow the user instruction and write original, complete, useful content. You may create structure, explanations, examples, headings, lists, comparisons, and tables when helpful.'
      : 'This is a transformation task. Preserve the supplied factual meaning and do not introduce unrelated claims.',
    'Do not fabricate platform-specific policies, payment rules, bonus amounts, URLs, eligibility requirements, guarantees, or operational facts that were not supplied by the user or document context.',
    'If exact platform-specific facts are missing, write around them without inventing them.',
    'Use clear Markdown-style structure for headings, lists, quotes, and tables when useful. Do not output JSON.',
    'Do not explain your process. Return only the content requested by the user.',
    'Write in locale: ' + locale + '.',
  ].join('\n');
}

function instructionFor(action, prompt) {
  const custom = bounded(prompt, 10000);
  if (action === 'write') return custom || 'Write polished, complete content from scratch for the requested purpose.';
  if (action === 'write_section') return custom || 'Write a polished section that fits naturally into the current document.';
  if (action === 'rewrite') return custom || 'Rewrite the selected content for clarity and quality while preserving its factual meaning.';
  if (action === 'fix_grammar') return 'Correct grammar, spelling, punctuation, wording, and clarity. Preserve factual meaning.';
  if (action === 'professional') return 'Rewrite in a concise, professional customer-service tone. Preserve factual meaning.';
  if (action === 'casual') return 'Rewrite in a natural, friendly, easy-to-read tone. Preserve factual meaning.';
  if (action === 'shorten') return 'Make the selected content shorter and clearer without losing important facts.';
  if (action === 'expand') return custom || 'Expand the content with helpful explanation, structure, and examples that do not invent platform-specific facts.';
  if (action === 'summarize') return 'Summarize the supplied content clearly without adding new factual claims.';
  if (action === 'steps') return 'Turn the supplied content into clear numbered steps. Preserve all important factual details.';
  if (action === 'bullets') return 'Turn the supplied content into concise, well-organized bullet points. Preserve factual details.';
  if (action === 'table') return custom || 'Turn the supplied content into a useful table with clear column headings. Preserve factual details.';
  if (action === 'translate') return custom || 'Translate the supplied content into the requested language while preserving meaning and structure.';
  if (action === 'extend') return custom || 'Continue writing naturally from the current document context.';
  return custom || 'Follow the user instruction and produce polished content suitable for the current document.';
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

function inlineFromText(text) {
  const value = String(text || '').trim();
  return value ? [{ type:'text', text:value.slice(0, 30000) }] : undefined;
}

function paragraph(text) {
  const content = inlineFromText(text);
  return { type:'paragraph', ...(content ? { content } : {}) };
}

function listItem(text) {
  return { type:'listItem', content:[paragraph(text)] };
}

function normalizeRichDocument(value) {
  const source = value?.type === 'doc' ? value : { type:'doc', content:Array.isArray(value?.content) ? value.content : [] };
  const content = Array.isArray(source.content)
    ? source.content.map((item) => normalizeBlock(item, 0)).filter(Boolean).slice(0, 180)
    : [];
  if (!content.length) throw new Error('Structured output did not contain usable editor blocks');
  return { type:'doc', content };
}

function markdownFallback(source) {
  const lines = String(source || '').replace(/\r/g, '').split('\n');
  const content = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      content.push({ type:'heading', attrs:{ level:heading[1].length }, content:inlineFromText(heading[2]) });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(listItem(lines[index].trim().replace(/^[-*]\s+/, '')));
        index += 1;
      }
      content.push({ type:'bulletList', content:items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(listItem(lines[index].trim().replace(/^\d+[.)]\s+/, '')));
        index += 1;
      }
      content.push({ type:'orderedList', attrs:{ start:1 }, content:items });
      continue;
    }

    if (line.startsWith('> ')) {
      const quote = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      content.push({ type:'blockquote', content:[paragraph(quote.join(' '))] });
      continue;
    }

    const parseCells = (value) => value.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    const next = index + 1 < lines.length ? lines[index + 1].trim() : '';
    if (line.includes('|') && /^\|?\s*:?-{3,}/.test(next) && next.includes('|')) {
      const header = parseCells(line);
      index += 2;
      const rows = [{
        type:'tableRow',
        content:header.map((cell) => ({ type:'tableHeader', attrs:{ colspan:1, rowspan:1, colwidth:null }, content:[paragraph(cell)] })),
      }];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const cells = parseCells(lines[index]);
        rows.push({
          type:'tableRow',
          content:header.map((_, cellIndex) => ({ type:'tableCell', attrs:{ colspan:1, rowspan:1, colwidth:null }, content:[paragraph(cells[cellIndex] || '')] })),
        });
        index += 1;
      }
      content.push({ type:'table', content:rows });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,4})\s+/.test(lines[index].trim())
      && !/^[-*]\s+/.test(lines[index].trim())
      && !/^\d+[.)]\s+/.test(lines[index].trim())
      && !lines[index].trim().startsWith('> ')
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    content.push(paragraph(paragraphLines.join(' ')));
  }
  return { type:'doc', content:content.length ? content.slice(0, 180) : [paragraph(source)] };
}

function extractJson(text) {
  let value = String(text || '').trim();
  value = value.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/i, '').trim();
  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  if (first >= 0 && last > first) value = value.slice(first, last + 1);
  return JSON.parse(value);
}

function formatterSystem(locale) {
  return [
    'Convert the supplied finished writing into a TipTap/ProseMirror JSON document.',
    'Return only one JSON object. No markdown fences, commentary, or XML.',
    'Root must be {"type":"doc","content":[...]}.',
    'Allowed block nodes: paragraph, heading, blockquote, bulletList, orderedList, listItem, table, tableRow, tableCell, tableHeader, horizontalRule, codeBlock.',
    'Allowed inline nodes: text, hardBreak.',
    'Allowed marks: bold, italic, underline, strike, textStyle, highlight.',
    'textStyle may contain attrs.color using a 6-digit hexadecimal color.',
    'highlight may contain attrs.color using a 6-digit hexadecimal color.',
    'Tables must be table > tableRow > tableHeader/tableCell > block content.',
    'Preserve all content and follow the user formatting instruction, including requested tables, headings, colors, highlights, lists, quotes, and emphasis.',
    'Do not create images, iframes, links, scripts, HTML, or unknown nodes.',
    'Write in locale: ' + locale + '.',
  ].join('\n');
}

async function providerJson(env, messages, maxTokens, signal) {
  const apiBase = String(env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');
  const response = await fetch(apiBase + '/chat/completions', {
    method:'POST',
    signal,
    headers:{ Authorization:'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({
      model:env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      messages,
      temperature:0.05,
      max_tokens:maxTokens,
      stream:false,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error('AI provider returned HTTP ' + response.status);
    error.status = response.status;
    error.detail = detail.slice(0, 240);
    throw error;
  }
  const payload = await response.json();
  return String(payload?.choices?.[0]?.message?.content || '');
}

async function formatRichDocument(env, generatedText, prompt, locale, signal, onStatus) {
  const user = [
    'Original user instruction:',
    bounded(prompt, 10000) || '(No additional formatting instruction)',
    '',
    'Finished writing to format:',
    bounded(generatedText, 50000),
  ].join('\n');

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) onStatus('AI is repairing rich formatting');
    try {
      const raw = await providerJson(
        env,
        [
          { role:'system', content:formatterSystem(locale) + (attempt ? '\nIMPORTANT: The previous structured response was invalid. Return strict valid JSON only.' : '') },
          { role:'user', content:user },
        ],
        Math.min(7500, Math.max(3500, Math.ceil(generatedText.length / 2.2))),
        signal,
      );
      return { document:normalizeRichDocument(extractJson(raw)), repaired:attempt > 0, degraded:false };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    document:markdownFallback(generatedText),
    repaired:false,
    degraded:true,
    formatError:lastError?.message || 'Structured formatting failed',
  };
}

async function openWriterStream(env, messages, maxTokens, signal) {
  const apiBase = String(env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(apiBase + '/chat/completions', {
        method:'POST',
        signal,
        headers:{
          Authorization:'Bearer ' + env.DEEPSEEK_API_KEY,
          'Content-Type':'application/json',
          Accept:'text/event-stream',
        },
        body:JSON.stringify({
          model:env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
          messages,
          temperature:0.35,
          max_tokens:maxTokens,
          stream:true,
        }),
      });
      if (response.ok && response.body) return response;
      const detail = await response.text().catch(() => '');
      const error = new Error('AI provider returned HTTP ' + response.status);
      error.status = response.status;
      error.detail = detail.slice(0, 240);
      lastError = error;
      if (![408, 409, 425, 429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw lastError || new Error('AI provider request failed');
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

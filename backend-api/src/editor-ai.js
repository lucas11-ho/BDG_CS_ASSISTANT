const ACTIONS = new Set([
  'ask',
  'fix_grammar',
  'professional',
  'casual',
  'summarize',
  'extend',
]);

function bounded(value, max) {
  return String(value || '').trim().slice(0, max);
}

function instructionFor(action, prompt) {
  if (action === 'fix_grammar') return 'Correct grammar, spelling, punctuation, and clarity. Preserve meaning and factual claims.';
  if (action === 'professional') return 'Rewrite in a concise, professional customer-service tone. Preserve meaning and factual claims.';
  if (action === 'casual') return 'Rewrite in a natural, friendly, casual tone. Preserve meaning and factual claims.';
  if (action === 'summarize') return 'Summarize the supplied text without adding new facts.';
  if (action === 'extend') return 'Continue the writing naturally using only information already present in the supplied text and context. Do not invent operational facts.';
  return bounded(prompt, 2000) || 'Improve the supplied writing while preserving its meaning and factual claims.';
}

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
  const surroundingText = bounded(payload.context, 6000);
  const locale = bounded(payload.locale, 40) || 'en';
  if (!selectedText && action !== 'ask' && action !== 'extend') {
    return new Response(JSON.stringify({ ok:false, error:'Select text before using this AI action', code:'EDITOR_AI_TEXT_REQUIRED' }), {
      status:400,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
    });
  }

  const system = [
    'You are the writing assistant inside the BDG content editor.',
    'Edit writing only. Never invent account, payment, bonus, policy, security, or operational facts.',
    'Return only the requested replacement/continuation text. Do not use markdown fences or explain your work.',
    `Write in locale: ${locale}.`,
  ].join('\n');

  const user = [
    `Task: ${instructionFor(action, payload.prompt)}`,
    selectedText ? `Selected text:\n${selectedText}` : '',
    surroundingText ? `Nearby document context:\n${surroundingText}` : '',
  ].filter(Boolean).join('\n\n');

  const apiBase = String(env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal?.addEventListener?.('abort', abort, { once:true });
  const timeout = setTimeout(abort, Math.max(5000, Math.min(Number(env.DEEPSEEK_TIMEOUT_MS || 15000) * 2, 45000)));

  let provider;
  try {
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
        temperature:action === 'casual' ? 0.45 : 0.2,
        max_tokens:1200,
        stream:true,
      }),
    });
  } catch (error) {
    clearTimeout(timeout);
    request.signal?.removeEventListener?.('abort', abort);
    return new Response(JSON.stringify({ ok:false, error:error?.name === 'AbortError' ? 'AI request timed out' : 'AI provider request failed', code:'EDITOR_AI_PROVIDER_ERROR' }), {
      status:502,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
    });
  }

  if (!provider.ok || !provider.body) {
    const detail = await provider.text().catch(() => '');
    clearTimeout(timeout);
    request.signal?.removeEventListener?.('abort', abort);
    return new Response(JSON.stringify({ ok:false, error:`AI provider returned HTTP ${provider.status}`, detail:detail.slice(0,220), code:'EDITOR_AI_PROVIDER_ERROR' }), {
      status:502,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const body = new ReadableStream({
    async start(output) {
      const reader = provider.body.getReader();
      let buffer = '';
      let emitted = '';
      try {
        output.enqueue(encoder.encode(sseEvent('start', { action })));
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream:true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const text = String(parsed?.choices?.[0]?.delta?.content || '');
              if (!text) continue;
              emitted += text;
              output.enqueue(encoder.encode(sseEvent('token', { text })));
            } catch {
              // Ignore malformed provider frames; the stream continues.
            }
          }
        }
        output.enqueue(encoder.encode(sseEvent('done', { text:emitted })));
      } catch (error) {
        if (!request.signal?.aborted) output.enqueue(encoder.encode(sseEvent('error', { error:error?.message || 'AI stream failed' })));
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener?.('abort', abort);
        try { reader.releaseLock(); } catch {}
        output.close();
      }
    },
    cancel() { abort(); },
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

const COMMON_STOPWORDS = new Set([
  'the','a','an','and','or','to','of','in','on','for','with','is','are','am','i','you','we','they','how','what','why','can','do','does','did','please','my','me','your','want','need','help','have','has','had','this','that','it','there','some','any',
]);

export function normalizePlainTextReply(value, maxLength = 12000) {
  let text = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/^```(?:text|markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!text) return '';
  if (text.length > maxLength) text = text.slice(0, maxLength).trimEnd();
  return text;
}

export function tokenizeForRetrieval(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length > 1 && !COMMON_STOPWORDS.has(token)) || [];
}

function normalizedPhrase(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'').trim();
}
function splitPhrases(value) {
  return String(value || '').split(/[\n|;,]+/).map((item)=>item.trim()).filter((item)=>item.length > 1);
}
function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed=JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}
function charNgrams(value, size = 3) {
  const text=normalizedPhrase(value);
  if (!text) return new Set();
  if (text.length <= size) return new Set([text]);
  const result=new Set();
  for (let index=0;index<=text.length-size;index+=1) result.add(text.slice(index,index+size));
  return result;
}
function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap=0;
  for (const item of left) if (right.has(item)) overlap+=1;
  return overlap / (left.size + right.size - overlap);
}
function localizedCandidateFields(row = {}) {
  const localized=parseObject(row.localized_fields_json);
  const aliases=parseObject(row.matching_aliases_json);
  const values=[];
  for (const entry of Object.values(localized)) {
    if (!entry || typeof entry !== 'object') continue;
    values.push(entry.positive_examples,entry.keywords,entry.title,entry.ai_instruction,entry.visual_knowledge);
  }
  for (const entry of Object.values(aliases)) {
    if (Array.isArray(entry)) values.push(entry.join('\n'));
    else values.push(entry);
  }
  return values.filter(Boolean).join('\n');
}
function candidateText(row = {}) {
  return [
    row.title,
    row.intent_key,
    row.category,
    row.positive_examples,
    row.keywords,
    row.faq_content,
    row.knowledge_content,
    row.example_answers,
    row.ai_instruction,
    localizedCandidateFields(row),
  ].filter(Boolean).join('\n');
}
function candidatePhrases(row = {}) {
  const localized=parseObject(row.localized_fields_json);
  const aliases=parseObject(row.matching_aliases_json);
  const values=[row.title,row.intent_key,row.category,row.positive_examples,row.keywords];
  for (const entry of Object.values(localized)) if (entry && typeof entry === 'object') values.push(entry.title,entry.positive_examples,entry.keywords);
  for (const entry of Object.values(aliases)) values.push(Array.isArray(entry) ? entry.join('\n') : entry);
  return [...new Set(values.flatMap(splitPhrases).map((value)=>value.trim()).filter(Boolean))];
}

function retrievalTokenRelated(left, right) {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  const short = left.length <= right.length ? left : right;
  const long = left.length <= right.length ? right : left;
  const prefix = short.slice(0, Math.min(6, short.length));
  return prefix.length >= 4 && long.startsWith(prefix) && Math.abs(left.length - right.length) <= 5;
}
function knowledgeAnswerPhrases(value) {
  return String(value || '').split(/[\n.!?。！？။]+/u).map((item) => item.trim()).filter((item) => item.length > 3).slice(0, 40);
}
function rankKnowledgeContentCandidate(message, row) {
  const answer = String(row.knowledge_content || row.content || '').trim();
  if (!answer) return null;
  const messageTokens = [...new Set(tokenizeForRetrieval(message))];
  if (!messageTokens.length) return null;
  const answerTokens = [...new Set(tokenizeForRetrieval(answer))];
  const matched = messageTokens.filter((token) => answerTokens.some((candidate) => retrievalTokenRelated(token, candidate)));
  const directOverlap = messageTokens.filter((token) => answerTokens.includes(token)).length;
  const messageCoverage = matched.length / messageTokens.length;
  const answerPhrases = knowledgeAnswerPhrases(answer);
  const messageNgrams = charNgrams(message);
  let bestSimilarity = 0;
  let matchedPhrase = '';
  for (const phrase of answerPhrases) {
    const similarity = jaccard(messageNgrams, charNgrams(phrase));
    if (similarity > bestSimilarity) { bestSimilarity = similarity; matchedPhrase = phrase; }
  }
  const typeTokens = tokenizeForRetrieval(row.keywords || row.category || '');
  const typeOverlap = messageTokens.filter((token) => typeTokens.some((candidate) => retrievalTokenRelated(token, candidate))).length;
  const titleTokens = tokenizeForRetrieval(row.title || '');
  const titleOverlap = messageTokens.filter((token) => titleTokens.some((candidate) => retrievalTokenRelated(token, candidate))).length;
  // Answer content is the routing evidence. Question/title and Type are only light context,
  // so an exact Question can never select unrelated knowledge by itself.
  if (!matched.length && bestSimilarity < 0.12) return null;
  const score = Math.min(100,
    messageCoverage * 62 +
    bestSimilarity * 28 +
    Math.min(2, typeOverlap) * 3 +
    Math.min(2, titleOverlap) * 2 +
    Math.min(2, directOverlap) * 2
  );
  const threshold = 18;
  if (score < threshold) return null;
  return {
    row,
    score:Number(score.toFixed(2)),
    threshold,
    method:'knowledge_content_semantic',
    matchedPhrase,
    overlap:matched.length,
    titleOverlap,
    tokenCoverage:Number(messageCoverage.toFixed(3)),
    phraseSimilarity:Number(bestSimilarity.toFixed(3)),
    titleSimilarity:Number(jaccard(messageNgrams, charNgrams(row.title || '')).toFixed(3)),
  };
}

export function rankApprovedMenuCandidates(message, rows = [], limit = 3) {
  const messageTokens = tokenizeForRetrieval(message);
  const messageSet = new Set(messageTokens);
  const messagePhrase=normalizedPhrase(message);
  const messageNgrams=charNgrams(message);
  if (!messagePhrase) return [];
  const ranked = [];
  for (const row of rows) {
    if (row?.source_type === 'knowledge') {
      const knowledgeRank = rankKnowledgeContentCandidate(message, row);
      if (knowledgeRank) ranked.push(knowledgeRank);
      continue;
    }
    const sourceText=candidateText(row);
    const sourceTokens = tokenizeForRetrieval(sourceText);
    const sourceSet = new Set(sourceTokens);
    let overlap = 0;
    for (const token of messageSet) if (sourceSet.has(token)) overlap += 1;
    const tokenCoverage=messageSet.size ? overlap/messageSet.size : 0;
    const sourceCoverage=sourceSet.size ? overlap/Math.min(sourceSet.size,Math.max(1,messageSet.size*4)) : 0;
    const titleTokens = tokenizeForRetrieval(row.title || '');
    const titleOverlap = titleTokens.filter((token) => messageSet.has(token)).length;
    const phrases=candidatePhrases(row);
    let exactPhrase=false, containedPhrase=false, bestPhraseSimilarity=0, matchedPhrase='';
    for (const phrase of phrases) {
      const normalized=normalizedPhrase(phrase);
      if (!normalized) continue;
      if (normalized === messagePhrase) { exactPhrase=true; matchedPhrase=phrase; bestPhraseSimilarity=1; break; }
      if (normalized.length >= 3 && (messagePhrase.includes(normalized) || normalized.includes(messagePhrase))) {
        containedPhrase=true;
        if (!matchedPhrase) matchedPhrase=phrase;
      }
      const similarity=jaccard(messageNgrams,charNgrams(phrase));
      if (similarity > bestPhraseSimilarity) { bestPhraseSimilarity=similarity; matchedPhrase=phrase; }
    }
    const negativePhrases=splitPhrases(row.negative_examples || '');
    const blocked=negativePhrases.some((phrase)=>{
      const normalized=normalizedPhrase(phrase);
      if (!normalized) return false;
      if (normalized === messagePhrase || messagePhrase.includes(normalized)) return true;
      return jaccard(messageNgrams,charNgrams(phrase)) >= 0.88;
    });
    if (blocked) continue;
    const titleSimilarity=jaccard(messageNgrams,charNgrams(row.title || ''));
    let score=0, method='none';
    if (exactPhrase) { score=100; method='exact_trigger'; }
    else if (containedPhrase) { score=88; method='contained_trigger'; }
    else {
      score=Math.min(87,
        tokenCoverage*48 +
        sourceCoverage*12 +
        Math.min(2,titleOverlap)*10 +
        titleSimilarity*18 +
        bestPhraseSimilarity*32
      );
      if (bestPhraseSimilarity >= 0.62) method='fuzzy_trigger';
      else if (titleOverlap || titleSimilarity >= 0.45) method='title_and_keyword';
      else if (overlap) method='keyword_overlap';
      else method='character_similarity';
    }
    score=Math.max(0,score-Number(row.priority || 100)/10000);
    const configuredThreshold=Number(row.confidence_threshold || 55);
    const threshold=Math.min(85,Math.max(25,configuredThreshold));
    if (score >= threshold) ranked.push({
      row,score:Number(score.toFixed(2)),threshold,method,matchedPhrase,
      overlap,titleOverlap,tokenCoverage:Number(tokenCoverage.toFixed(3)),phraseSimilarity:Number(bestPhraseSimilarity.toFixed(3)),titleSimilarity:Number(titleSimilarity.toFixed(3)),
    });
  }
  ranked.sort((a,b) => b.score - a.score || Number(a.row.priority || 100) - Number(b.row.priority || 100) || Number(a.row.id || 0) - Number(b.row.id || 0));
  return ranked.slice(0, Math.max(1, Math.min(10, Number(limit || 3))));
}

export function explainMenuCandidateRanking(message, rows = [], limit = 10) {
  const ranked=rankApprovedMenuCandidates(message,rows,limit);
  return {
    message:String(message || ''),
    selected:ranked[0] ? { id:Number(ranked[0].row.id),title:ranked[0].row.title,score:ranked[0].score,threshold:ranked[0].threshold,method:ranked[0].method,matched_phrase:ranked[0].matchedPhrase } : null,
    candidates:ranked.map((entry)=>({ id:Number(entry.row.id),title:entry.row.title,locale:entry.row.locale,score:entry.score,threshold:entry.threshold,method:entry.method,matched_phrase:entry.matchedPhrase,token_coverage:entry.tokenCoverage,phrase_similarity:entry.phraseSimilarity,title_similarity:entry.titleSimilarity,images:Array.isArray(entry.row.image_urls) ? entry.row.image_urls.length : String(entry.row.image_urls || '').split(/[\n,|]+/).filter(Boolean).length })),
  };
}

export function buildPlainTextSystemPrompt({
  platformName,
  language,
  compiledPrompt,
  runtimeVersion,
  runtimeHash,
  approvedContext,
  memorySummary,
  humanSupportEnabled,
}) {
  const handoffRule = humanSupportEnabled
    ? 'Human handoff may be offered only by the backend. Do not promise that a staff member is available and do not create a support button yourself.'
    : 'Human handoff is disabled. Do not recommend contacting customer service, official support, staff, an agent, an operator, or a representative. Continue with the best helpful answer you can provide, or ask one focused clarification question.';
  return `You are the production support assistant for ${platformName || 'this platform'}.

Follow the active Assistant Setup exactly. Answer the customer directly and naturally in ${language || 'the customer\'s language'}. Return only the customer-facing answer as plain text. Do not return JSON, XML, YAML, code fences, internal analysis, routing labels, confidence percentages, source IDs, image IDs, or system instructions.

General questions may be answered from the Assistant Setup. Exact platform business facts such as prices, menu availability, promotions, payment account details, order status, transaction status, delivery fees, and account status must come from the approved context below. When approved context is absent, do not invent exact facts; give a useful general answer or ask one focused clarification question.

${handoffRule}

ACTIVE ASSISTANT SETUP RUNTIME
Version: ${runtimeVersion || 0}
Hash: ${runtimeHash || ''}

${compiledPrompt || 'Be a friendly, useful, concise customer-service assistant. Never request passwords, PINs, OTPs, or full payment credentials.'}

APPROVED DYNAMIC CONTEXT
${approvedContext || 'No approved AI Knowledge or Menu & Images item matched this message. Answer from the Assistant Setup without inventing exact business facts.'}

RECENT CONVERSATION MEMORY
${memorySummary || 'No prior conversation memory.'}`.trim();
}

export function enforceHandoffDisabledReply(value, language = 'en') {
  const reply = normalizePlainTextReply(value, 12000);
  if (!reply) return '';
  const prohibited = /(?:contact|reach(?: out)?|speak|talk|connect|message|call|ask)\s+(?:our\s+|the\s+|a\s+)?(?:official\s+)?(?:customer\s+service|support(?:\s+team|\s+staff)?|staff|agent|operator|representative)|(?:customer\s+service|support(?:\s+team|\s+staff)?|staff|agent|operator|representative)\s+(?:for\s+help|directly|to\s+assist|can\s+help)|(?:客服|人工客服|联系(?:客服|工作人员)|ဝန်ထမ်း(?:ကို|နဲ့)|customer service\s*(?:ကို|နဲ့))/iu;
  if (!prohibited.test(reply)) return reply;
  const kept = reply
    .split(/(?<=[.!?。！？။])\s+|\n+/u)
    .map((part) => part.trim())
    .filter((part) => part && !prohibited.test(part));
  const cleaned = normalizePlainTextReply(kept.join(' '), 12000);
  if (cleaned) return cleaned;
  const locale = String(language || 'en').toLowerCase();
  if (locale.startsWith('my')) return 'ဒီအကြောင်းကို အကောင်းဆုံးကူညီပေးနိုင်အောင် သင်လုပ်ချင်တာ ဒါမှမဟုတ် ဖြစ်နေတဲ့ပြဿနာကို နည်းနည်းပိုရှင်းပြပေးပါနော်။';
  if (locale.startsWith('zh')) return '请再说明一下您想完成什么或遇到了什么问题，我会继续尽力帮助您。';
  if (locale.startsWith('hi')) return 'कृपया थोड़ा और बताइए कि आप क्या करना चाहते हैं या क्या समस्या आ रही है; मैं यहीं आपकी मदद जारी रखूँगा।';
  return 'Please tell me a little more about what you are trying to do or what went wrong, and I’ll keep helping you here.';
}

export function providerFailureCustomerText(language = 'en', configured = '') {
  const custom = normalizePlainTextReply(configured, 1200);
  if (custom) return custom;
  const locale = String(language || 'en').toLowerCase();
  if (locale.startsWith('my')) return 'အဖြေပြန်ပေးရန် နည်းနည်းကြာနေပါတယ်။ ထပ်မေးနိုင်သလို အခြားမေးခွန်းလည်း ပို့နိုင်ပါတယ်။';
  if (locale.startsWith('id')) return 'Jawaban membutuhkan waktu lebih lama dari biasanya. Anda dapat mencoba lagi atau mengirim pesan lain.';
  if (locale.startsWith('zh')) return '回复需要更长时间，您可以重试或发送其他消息。';
  if (locale.startsWith('hi')) return 'उत्तर में सामान्य से अधिक समय लग रहा है। आप पुनः प्रयास कर सकते हैं या दूसरा संदेश भेज सकते हैं।';
  return 'The response is taking longer than expected. You can retry or send another message.';
}

export function safeUnknownBusinessFactText(language = 'en') {
  const locale = String(language || 'en').toLowerCase();
  if (locale.startsWith('my')) return 'ဒီအချက်ရဲ့ အတိအကျအချက်အလက် မရှိသေးပေမယ့် သင်လုပ်ချင်တာကို နည်းနည်းရှင်းပြပေးရင် အကောင်းဆုံးနောက်တစ်ဆင့်ကို ကူညီပေးမယ်နော်။';
  if (locale.startsWith('zh')) return '我暂时没有这项业务信息的准确资料。请告诉我您想完成什么，我会尽量提供安全、实用的下一步。';
  if (locale.startsWith('hi')) return 'इस विशेष व्यावसायिक जानकारी की पुष्टि मेरे पास अभी नहीं है। आप क्या करना चाहते हैं, यह बताइए; मैं सुरक्षित अगला कदम समझाऊँगा।';
  return 'I don’t have confirmed details for that exact business information yet. Tell me what you are trying to do, and I’ll help with the safest next step.';
}

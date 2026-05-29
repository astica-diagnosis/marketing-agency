/**
 * aiClient.js — LLM API 호출 (Claude 기본, OpenAI 선택)
 * UrlFetchApp 사용. JSON 응답을 기대하는 호출에 특화.
 */

/**
 * 시스템 프롬프트 + 유저 메시지로 LLM을 호출하고 텍스트 응답을 반환합니다.
 * opts: { provider, model, maxTokens }
 */
function callAI_(systemPrompt, userMessage, opts) {
  opts = opts || {};
  const provider = opts.provider || cfg_('ai_provider', CONFIG.AI.PROVIDER);
  if (provider === 'openai') {
    return callOpenAI_(systemPrompt, userMessage, opts.model, opts.maxTokens);
  }
  return callAnthropic_(systemPrompt, userMessage, opts.model, opts.maxTokens);
}

/** Claude (Anthropic) 호출. model/maxTokens 지정 가능. */
function callAnthropic_(systemPrompt, userMessage, model, maxTokens) {
  const payload = {
    model: model || CONFIG.AI.ANTHROPIC_MODEL,
    max_tokens: maxTokens || CONFIG.AI.MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': getSecret_('ANTHROPIC_API_KEY'),
      'anthropic-version': CONFIG.AI.ANTHROPIC_VERSION
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  const resp = UrlFetchApp.fetch(CONFIG.AI.ANTHROPIC_URL, options);
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code !== 200) {
    throw new Error('Anthropic API ' + code + ': ' + body.substring(0, 300));
  }
  const data = JSON.parse(body);
  // content는 블록 배열. text 블록만 모음.
  const text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n');
  return text;
}

/** OpenAI 호출. model/maxTokens 지정 가능. */
function callOpenAI_(systemPrompt, userMessage, model, maxTokens) {
  const payload = {
    model: model || CONFIG.AI.OPENAI_MODEL,
    max_tokens: maxTokens || CONFIG.AI.MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + getSecret_('OPENAI_API_KEY') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  const resp = UrlFetchApp.fetch(CONFIG.AI.OPENAI_URL, options);
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code !== 200) {
    throw new Error('OpenAI API ' + code + ': ' + body.substring(0, 300));
  }
  const data = JSON.parse(body);
  return data.choices[0].message.content;
}

/**
 * JSON 응답을 기대하는 호출. 파싱까지 해서 객체를 반환합니다.
 * opts: { provider, model, maxTokens }
 * 1회 재시도 포함. 끝내 실패하면 ok:false + 원문 반환.
 */
function callAIForJson_(systemPrompt, userMessage, opts) {
  const maxRetries = parseInt(cfg_('max_retries', CONFIG.BATCH.MAX_RETRIES), 10);
  let lastText = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const msg = attempt === 0
      ? userMessage
      : userMessage + '\n\n(Return ONLY valid JSON. No prose, no code fences.)';
    lastText = callAI_(systemPrompt, msg, opts);
    const parsed = safeJsonParse_(lastText);
    if (parsed) return { ok: true, data: parsed, raw: lastText };
  }
  return { ok: false, data: null, raw: lastText };
}

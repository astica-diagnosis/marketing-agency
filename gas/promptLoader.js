/**
 * promptLoader.js — HARNESS 탭에서 활성 하네스를 읽습니다.
 * GAS 코드에는 하네스 텍스트가 없습니다. 전부 시트(HARNESS 탭)에서 가져옵니다.
 *
 * HARNESS 탭 컬럼:
 *   harness_id, harness_name, version, target, system_prompt,
 *   user_prompt_template, output_format, model, max_tokens, is_active, updated_at, notes
 *
 * 캐시: 같은 실행 안에서 반복 조회를 줄입니다.
 */

var _HARNESS_CACHE = {};

/**
 * target(예: 'CLASSIFY', 'GENERATE_THREADS')으로 is_active=TRUE 하네스를 찾습니다.
 * CONFIG 탭의 active_*_harness 와 harness_name이 일치하면 우선.
 * 반환: { system_prompt, user_prompt_template, model, max_tokens, output_format, harness_name, version }
 */
function getActiveHarness_(target) {
  if (_HARNESS_CACHE[target]) return _HARNESS_CACHE[target];

  const data = readSheetAsObjects_(CONFIG.SHEETS.HARNESS);
  let candidates = data.rows.filter(function (r) {
    return String(r.target) === target &&
           (r.is_active === true || String(r.is_active).toUpperCase() === 'TRUE');
  });

  if (candidates.length === 0) {
    throw new Error('활성 하네스 없음: target=' + target + ' (is_active=TRUE 필요)');
  }

  // CONFIG에서 지정한 harness_name이 있으면 그것 우선
  let preferName = null;
  if (target === 'CLASSIFY') preferName = cfg_('active_classify_harness', null);
  if (target === 'GENERATE_THREADS') preferName = cfg_('active_threads_harness', null);

  let chosen = null;
  if (preferName) {
    chosen = candidates.filter(function (r) { return String(r.harness_name) === preferName; })[0];
  }
  if (!chosen) chosen = candidates[candidates.length - 1]; // 없으면 마지막(최신)

  const result = {
    system_prompt: String(chosen.system_prompt || ''),
    user_prompt_template: String(chosen.user_prompt_template || '{{input_json}}'),
    model: String(chosen.model || cfg_('anthropic_model', CONFIG.AI.ANTHROPIC_MODEL)),
    max_tokens: parseInt(chosen.max_tokens, 10) || CONFIG.AI.MAX_TOKENS,
    output_format: String(chosen.output_format || 'JSON'),
    harness_name: String(chosen.harness_name || ''),
    version: String(chosen.version || '')
  };
  _HARNESS_CACHE[target] = result;
  return result;
}

/**
 * user_prompt_template의 플레이스홀더를 실제 값으로 치환합니다.
 *   {{raw_text}}   → rawText
 *   {{input_json}} → JSON.stringify(inputObj)
 */
function fillTemplate_(template, vars) {
  let out = String(template);
  if (vars.raw_text != null)   out = out.replace(/\{\{raw_text\}\}/g, vars.raw_text);
  if (vars.input_json != null) out = out.replace(/\{\{input_json\}\}/g, vars.input_json);
  return out;
}

/**
 * CLEAN_MASTER 한 행을 generate_threads 입력 JSON으로 변환합니다.
 * pillar / format / cta_level / compliance_level / target_awareness는
 * 분류 결과로부터 규칙 기반으로 자동 결정합니다. (LLM 없이 코드로)
 */
function rowToThreadsInput_(row) {
  // target_awareness: concern_type과 표현 난이도로 추정
  let awareness = 'cold';
  if (row.concern_type === 'FUNGAL_ACNE' || row.failure_signal === 'MULTIPLE_DOCTORS') {
    awareness = 'warm';
  }

  // pillar: failure_signal / confusion_type 기반 매핑
  let pillar = 'treatment_failure';
  if (row.confusion_type === 'UNKNOWN_CONDITION') pillar = 'wrong_assumption';
  else if (row.confusion_type === 'TREATMENT_MISMATCH') pillar = 'treatment_failure';
  else if (row.failure_signal === 'MISDIAGNOSIS') pillar = 'diagnostic_confusion';
  else if (row.concern_type === 'FUNGAL_ACNE') pillar = 'acne_vs_folliculitis';

  // format: emotion 기반 매핑
  let format = 'voc_mirror';
  if (row.emotion === 'FRUSTRATED') format = 'reframe_question';
  else if (row.failure_signal === 'LOOP' || row.failure_signal === 'TREATMENT_FAILURE') format = 'pattern_recognition';
  else if (row.emotion === 'HOPELESS' || row.emotion === 'CONFUSED') format = 'voc_mirror';

  // compliance: 의료 민감 신호면 conservative
  let compliance = 'standard';
  if (row.compliance_risk === 'HIGH' || awareness === 'cold') compliance = 'conservative';

  // cta_level: next_step_signal 기반
  let cta = 'soft';
  if (row.next_step_signal === 'SEEKING') cta = 'medium';
  else if (row.next_step_signal === 'RESIGNED') cta = 'none';
  if (compliance === 'conservative' && cta === 'direct') cta = 'soft';

  // extra_rules: concern_type + awareness 조합에 맞는 스니펫 주입
  const extra = getExtraRules_(row.concern_type, awareness);

  return {
    voc_hook: row.voc_hook || row.clean_text || '',
    concern_type: row.concern_type || 'UNCLEAR',
    failure_signal: row.failure_signal || 'NONE',
    emotion: row.emotion || 'NEUTRAL',
    pillar: pillar,
    format: format,
    target_awareness: awareness,
    cta_level: cta,
    compliance_level: compliance,
    extra_rules: extra
  };
}

/**
 * concern_type + awareness 조합에 따른 추가 규칙 스니펫.
 * reference 문서 §5의 핵심만 코드로 옮긴 것. (필요시만 주입 → 경량)
 */
function getExtraRules_(concernType, awareness) {
  const snippets = [];
  if (concernType === 'FUNGAL_ACNE' && awareness === 'cold') {
    snippets.push('Do not say fungal acne. Write "acne-like bumps that don\'t behave like regular acne". Use clues: same size, itch, sweat, same area, recurring.');
  }
  if (concernType === 'MIXED') {
    snippets.push('Emphasize that one clean label may not explain everything. Do not list multiple condition names for cold audience.');
  }
  if (concernType === 'DEMODEX' && awareness === 'cold') {
    snippets.push('Do not mention demodex or mites. Use "persistent facial bumps / redness pattern". No fear framing.');
  }
  if (concernType === 'OTHER') {
    snippets.push('Do not force ASTICA relevance. If severe/spreading/painful, gently suggest seeing a professional. Keep CTA low.');
  }
  return snippets.join(' ');
}

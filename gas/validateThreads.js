/**
 * validateThreads.js — LLM 출력에 대한 코드 기반 검수
 * 금지어는 BANNED_TERMS 탭에서 읽습니다. (하드코딩 제거)
 * 토큰 0. 100% 일관성. Vercel 이전 후에도 그대로 재사용.
 *
 * BANNED_TERMS 컬럼: term, rule_type(ABSOLUTE|RESTRICTED), applies_to(ALL|AD_HOOK|CONSERVATIVE|COLD), reason
 */

var _BANNED_CACHE = null;

/** BANNED_TERMS 탭을 읽어 분류별로 반환 */
function loadBannedTerms_() {
  if (_BANNED_CACHE) return _BANNED_CACHE;
  const result = { ALL: [], AD_HOOK: [], CONSERVATIVE: [], COLD: [] };
  try {
    const data = readSheetAsObjects_(CONFIG.SHEETS.BANNED_TERMS);
    data.rows.forEach(function (r) {
      const term = String(r.term || '').toLowerCase().trim();
      const applies = String(r.applies_to || 'ALL').toUpperCase().trim();
      if (term && result.hasOwnProperty(applies)) {
        result[applies].push(term);
      }
    });
  } catch (e) { /* 탭 없으면 빈 목록 */ }
  _BANNED_CACHE = result;
  return result;
}

/**
 * 출력 객체를 검사합니다.
 * 반환: { pass, issues:[...], requiresHumanReview, finalCtaLevel }
 */
function validateThreadsOutput_(output, input) {
  const issues = [];
  let requiresHumanReview = false;
  const banned = loadBannedTerms_();

  if (!output || typeof output !== 'object') {
    return { pass: false, issues: ['출력이 JSON 객체가 아님'], requiresHumanReview: true, finalCtaLevel: 'none' };
  }

  const post = String(output.thread_post || '');
  const lowerPost = post.toLowerCase();

  // 1) thread_post 존재
  if (!post.trim()) {
    issues.push('thread_post 비어있음');
    requiresHumanReview = true;
  }

  // 2) ALL 금지어 (post + 모든 reuse/reply 필드)
  const allText = [
    post,
    output.reuse_candidate && output.reuse_candidate.ad_hook,
    output.reuse_candidate && output.reuse_candidate.reel_script_intro,
    output.reuse_candidate && output.reuse_candidate.blog_intro_angle,
    output.reply_versions && output.reply_versions.empathetic_reply,
    output.reply_versions && output.reply_versions.pattern_reply,
    output.reply_versions && output.reply_versions.soft_cta_reply
  ].filter(Boolean).join(' ').toLowerCase();

  banned.ALL.forEach(function (term) {
    if (allText.indexOf(term) !== -1) {
      issues.push('금지어(ALL): "' + term + '"');
      requiresHumanReview = true;
    }
  });

  // 3) AD_HOOK 전용 금지어 — ad_hook 필드만 검사
  const adHook = String((output.reuse_candidate && output.reuse_candidate.ad_hook) || '').toLowerCase();
  banned.AD_HOOK.forEach(function (term) {
    if (adHook.indexOf(term) !== -1) {
      issues.push('ad_hook 금지어: "' + term + '"');
      requiresHumanReview = true;
    }
  });

  // 4) CONSERVATIVE 모드 금지어 — post 검사
  if (input && input.compliance_level === 'conservative') {
    banned.CONSERVATIVE.forEach(function (term) {
      if (lowerPost.indexOf(term) !== -1) {
        issues.push('conservative 금지어: "' + term + '"');
        requiresHumanReview = true;
      }
    });
    // conservative인데 RESTRICTED/COLD condition명도 막음
    banned.COLD.forEach(function (term) {
      if (lowerPost.indexOf(term) !== -1) {
        issues.push('conservative에서 condition명: "' + term + '"');
        requiresHumanReview = true;
      }
    });
  }

  // 5) COLD 대상 금지어 — post 검사
  if (input && input.target_awareness === 'cold') {
    banned.COLD.forEach(function (term) {
      if (lowerPost.indexOf(term) !== -1) {
        issues.push('cold 대상 금지어: "' + term + '"');
        requiresHumanReview = true;
      }
    });
  }

  // 6) CTA 충돌 — conservative면 direct 금지 → soft로 강등
  let finalCta = output.cta_type || 'none';
  if (input && input.compliance_level === 'conservative' && finalCta === 'direct') {
    finalCta = 'soft';
    issues.push('conservative: direct CTA를 soft로 강등');
  }

  // 7) 길이 체크 (CONFIG의 min/max)
  const minChar = parseInt(cfg_('post_min_char', 100), 10);
  const maxChar = parseInt(cfg_('post_max_char', 500), 10);
  const charCount = countChars_(post);
  if (charCount > 0 && (charCount < minChar || charCount > maxChar)) {
    issues.push('길이 범위 벗어남: ' + charCount + '자 (권장 ' + minChar + '~' + maxChar + ')');
  }

  // 8) LLM 자체 판단 반영
  if (output.risk_check && output.risk_check.requires_human_review === true) {
    requiresHumanReview = true;
  }

  return {
    pass: !requiresHumanReview,
    issues: issues,
    requiresHumanReview: requiresHumanReview,
    finalCtaLevel: finalCta
  };
}

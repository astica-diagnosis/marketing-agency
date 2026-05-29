/**
 * generateThreads.js — 메인 생성 로직
 * CLEAN_MASTER에서 READY 행을 읽어 Threads 후보를 생성하고
 * 검수 후 THREADS_OUTPUT에 저장 + 텔레그램으로 전송합니다.
 */

/**
 * 배치 실행: READY 행을 BATCH.SIZE 만큼 처리.
 */
function runGenerateThreadsBatch() {
  const data = readSheetAsObjects_(CONFIG.SHEETS.CLEAN_MASTER);
  const batchSize = parseInt(cfg_('batch_size', CONFIG.BATCH.SIZE), 10);

  // READY 상태 + astica_fit HIGH 우선
  const targets = data.rows.filter(function (r) {
    return String(r.status) === CONFIG.STATUS.READY;
  }).sort(function (a, b) {
    // HIGH 먼저
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (rank[a.astica_fit] || 9) - (rank[b.astica_fit] || 9);
  }).slice(0, batchSize);

  if (targets.length === 0) {
    logRun_('runGenerateThreadsBatch', 0, 0, 'READY 행 없음');
    return;
  }

  const harness = getActiveHarness_('GENERATE_THREADS');
  let processed = 0, skipped = 0;

  // 기존 OUTPUT ID 모음 (ID 생성용)
  const outData = readSheetAsObjects_(CONFIG.SHEETS.THREADS_OUTPUT);
  const existingIds = outData.rows.map(function (r) { return r.output_id; });

  targets.forEach(function (row) {
    try {
      const input = rowToThreadsInput_(row);
      const userMsg = fillTemplate_(harness.user_prompt_template, { input_json: JSON.stringify(input) });
      const result = callAIForJson_(harness.system_prompt, userMsg, {
        model: harness.model, maxTokens: harness.max_tokens
      });

      if (!result.ok) {
        logError_('runGenerateThreadsBatch', row.clean_id, 'JSON 파싱 실패: ' + result.raw.substring(0, 200));
        skipped++;
        return;
      }

      const output = result.data;
      const validation = validateThreadsOutput_(output, input);

      // ID 생성
      const outputId = makeNextId_('THR', existingIds);
      existingIds.push(outputId);

      // 메트릭 재계산 (코드로 — LLM 값 신뢰 안 함)
      const post = String(output.thread_post || '');
      const status = validation.requiresHumanReview ? CONFIG.STATUS.NEEDS_REVIEW : CONFIG.STATUS.PENDING;

      // OUTPUT 저장
      appendRow_(CONFIG.SHEETS.THREADS_OUTPUT, {
        output_id: outputId,
        clean_id: row.clean_id,
        thread_post: post,
        hook_line: output.hook_line || '',
        cta_type: validation.finalCtaLevel,
        char_count: countChars_(post),
        line_count: countLines_(post),
        ad_hook: (output.reuse_candidate && output.reuse_candidate.ad_hook) || '',
        empathetic_reply: (output.reply_versions && output.reply_versions.empathetic_reply) || '',
        pattern_reply: (output.reply_versions && output.reply_versions.pattern_reply) || '',
        soft_cta_reply: (output.reply_versions && output.reply_versions.soft_cta_reply) || '',
        validation_issues: validation.issues.join(' | '),
        status: status,
        created_at: nowStr_(),
        telegram_msg_id: ''
      });

      // CLEAN_MASTER status 업데이트
      updateCell_(CONFIG.SHEETS.CLEAN_MASTER, row._rowIndex, 'status', CONFIG.STATUS.GENERATED);

      // 텔레그램 전송 (검수 대기 건만)
      sendThreadForReview_(outputId, post, validation, input);

      processed++;
    } catch (e) {
      logError_('runGenerateThreadsBatch', row.clean_id, e.message);
      skipped++;
    }
  });

  logRun_('runGenerateThreadsBatch', processed, skipped, 'batch=' + targets.length);
}

/** 단일 행 테스트용 — 첫 번째 READY 행 1개만 처리 */
function testGenerateThreadsOneRow() {
  const saved = CONFIG.BATCH.SIZE;
  CONFIG.BATCH.SIZE = 1;
  runGenerateThreadsBatch();
  CONFIG.BATCH.SIZE = saved;
}

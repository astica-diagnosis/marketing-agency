/**
 * telegram.js — 텔레그램 양방향 검수 봇
 *
 * 흐름:
 *   1. 생성된 후보를 텔레그램으로 전송 (인라인 버튼 포함)
 *   2. 사용자가 버튼 클릭 또는 "수정: ..." 입력
 *   3. doPost(e) 웹훅이 받아서 처리
 *      - 승인 → status=APPROVED
 *      - 반려 → status=REJECTED
 *      - 수정 → AI 재생성 → 재전송
 *
 * 설정:
 *   1) BotFather로 봇 생성 → TELEGRAM_BOT_TOKEN 스크립트 속성에 저장
 *   2) 이 프로젝트를 웹앱으로 배포 (실행: 나, 액세스: 모든 사용자)
 *   3) setTelegramWebhook() 1회 실행 → 웹훅 등록
 *   4) 검수자가 봇에게 아무 메시지나 보내면 TELEGRAM_CHAT_ID 확인 가능
 */

/** 웹앱 진입점 — 텔레그램이 모든 업데이트를 여기로 POST */
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);

    // 1) 인라인 버튼 클릭 (callback_query)
    if (update.callback_query) {
      handleCallback_(update.callback_query);
      return ContentService.createTextOutput('ok');
    }

    // 2) 일반 메시지 (수정 피드백 등)
    if (update.message && update.message.text) {
      handleMessage_(update.message);
      return ContentService.createTextOutput('ok');
    }

    return ContentService.createTextOutput('ok');
  } catch (err) {
    logError_('doPost', '', err.message);
    return ContentService.createTextOutput('error');
  }
}

/** 검수용 후보를 텔레그램으로 전송 */
function sendThreadForReview_(outputId, post, validation, input) {
  const chatId = getSecret_('TELEGRAM_CHAT_ID');
  let text = '🧵 *새 Threads 후보* `' + outputId + '`\n';
  text += '────────────\n';
  text += escapeMd_(post) + '\n';
  text += '────────────\n';
  text += 'pillar: ' + input.pillar + ' | cta: ' + validation.finalCtaLevel + '\n';
  text += 'concern: ' + input.concern_type + ' | ' + input.target_awareness + '/' + input.compliance_level + '\n';
  if (validation.issues.length > 0) {
    text += '⚠️ ' + escapeMd_(validation.issues.join(' | ')) + '\n';
  }
  if (validation.requiresHumanReview) {
    text += '🔴 *검토 필요*\n';
  }

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ 승인', callback_data: 'approve:' + outputId },
      { text: '✏️ 수정', callback_data: 'edit:' + outputId },
      { text: '❌ 반려', callback_data: 'reject:' + outputId }
    ]]
  };

  const msgId = tgSend_(chatId, text, keyboard);
  if (msgId) updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, findRowByOutputId_(outputId), 'telegram_msg_id', msgId);
}

/** 인라인 버튼 처리 */
function handleCallback_(cq) {
  const parts = String(cq.data).split(':');
  const action = parts[0];
  const outputId = parts[1];
  const chatId = cq.message.chat.id;

  if (action === 'approve') {
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, findRowByOutputId_(outputId), 'status', CONFIG.STATUS.APPROVED);
    tgAnswerCallback_(cq.id, '승인됨');
    tgSend_(chatId, '✅ `' + outputId + '` 승인 → 게시 대기열에 추가됨');
  } else if (action === 'reject') {
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, findRowByOutputId_(outputId), 'status', CONFIG.STATUS.REJECTED);
    tgAnswerCallback_(cq.id, '반려됨');
    tgSend_(chatId, '❌ `' + outputId + '` 반려됨');
  } else if (action === 'edit') {
    // 수정 모드: 다음 메시지를 이 outputId의 피드백으로 받기 위해 상태 저장
    PropertiesService.getScriptProperties().setProperty('EDIT_PENDING', outputId);
    tgAnswerCallback_(cq.id, '수정 피드백 입력');
    tgSend_(chatId, '✏️ `' + outputId + '` 수정할 방향을 메시지로 보내세요.\n예: "톤을 더 공감형으로" / "더 짧게" / "CTA 빼고"');
  }
}

/** 일반 메시지 처리 (수정 피드백) */
function handleMessage_(message) {
  const chatId = message.chat.id;
  const text = String(message.text).trim();

  // chat_id 확인용
  if (text === '/id') {
    tgSend_(chatId, 'CHAT_ID: `' + chatId + '`');
    return;
  }

  // 수정 대기 중인 outputId가 있으면 재생성
  const pendingId = PropertiesService.getScriptProperties().getProperty('EDIT_PENDING');
  if (pendingId) {
    PropertiesService.getScriptProperties().deleteProperty('EDIT_PENDING');
    tgSend_(chatId, '🔄 `' + pendingId + '` 재생성 중...');
    regenerateThread_(pendingId, text, chatId);
    return;
  }

  tgSend_(chatId, '버튼을 누르거나, 수정 시 먼저 ✏️ 수정 버튼을 눌러주세요.');
}

/** 피드백 반영 재생성 */
function regenerateThread_(outputId, feedback, chatId) {
  try {
    const rowIndex = findRowByOutputId_(outputId);
    const outData = readSheetAsObjects_(CONFIG.SHEETS.THREADS_OUTPUT);
    const row = outData.rows.filter(function (r) { return r.output_id === outputId; })[0];
    if (!row) { tgSend_(chatId, '해당 후보를 찾을 수 없습니다.'); return; }

    // 원본 CLEAN_MASTER 행으로 입력 재구성
    const cmData = readSheetAsObjects_(CONFIG.SHEETS.CLEAN_MASTER);
    const cmRow = cmData.rows.filter(function (r) { return r.clean_id === row.clean_id; })[0];
    const input = cmRow ? rowToThreadsInput_(cmRow) : {};

    // 피드백을 extra_rules에 추가
    input.extra_rules = (input.extra_rules || '') +
      ' USER REVISION FEEDBACK (apply this): ' + feedback +
      ' Previous version was: ' + row.thread_post;

    const harness = getActiveHarness_('GENERATE_THREADS');
    const userMsg = fillTemplate_(harness.user_prompt_template, { input_json: JSON.stringify(input) });
    const result = callAIForJson_(harness.system_prompt, userMsg, {
      model: harness.model, maxTokens: harness.max_tokens
    });

    if (!result.ok) { tgSend_(chatId, '재생성 실패 (파싱 오류)'); return; }

    const output = result.data;
    const validation = validateThreadsOutput_(output, input);
    const post = String(output.thread_post || '');

    // 기존 행 업데이트 (덮어쓰기)
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, rowIndex, 'thread_post', post);
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, rowIndex, 'hook_line', output.hook_line || '');
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, rowIndex, 'cta_type', validation.finalCtaLevel);
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, rowIndex, 'char_count', countChars_(post));
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, rowIndex, 'ad_hook', (output.reuse_candidate && output.reuse_candidate.ad_hook) || '');
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, rowIndex, 'validation_issues', validation.issues.join(' | '));
    const status = validation.requiresHumanReview ? CONFIG.STATUS.NEEDS_REVIEW : CONFIG.STATUS.PENDING;
    updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, rowIndex, 'status', status);

    // 재전송
    sendThreadForReview_(outputId, post, validation, input);
  } catch (e) {
    logError_('regenerateThread_', outputId, e.message);
    tgSend_(chatId, '재생성 오류: ' + e.message);
  }
}

// ── 텔레그램 API 헬퍼 ──

function tgSend_(chatId, text, keyboard) {
  const token = getSecret_('TELEGRAM_BOT_TOKEN');
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);
  const resp = UrlFetchApp.fetch(CONFIG.TELEGRAM.API_BASE + token + '/sendMessage', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  try {
    const data = JSON.parse(resp.getContentText());
    return data.result ? data.result.message_id : null;
  } catch (e) { return null; }
}

function tgAnswerCallback_(callbackId, text) {
  const token = getSecret_('TELEGRAM_BOT_TOKEN');
  UrlFetchApp.fetch(CONFIG.TELEGRAM.API_BASE + token + '/answerCallbackQuery', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackId, text: text || '' }),
    muteHttpExceptions: true
  });
}

/** 웹훅 등록 — 웹앱 배포 후 1회 실행. URL은 배포 URL로 교체. */
function setTelegramWebhook() {
  const token = getSecret_('TELEGRAM_BOT_TOKEN');
  const webAppUrl = ScriptApp.getService().getUrl(); // 배포된 웹앱 URL
  const resp = UrlFetchApp.fetch(
    CONFIG.TELEGRAM.API_BASE + token + '/setWebhook?url=' + encodeURIComponent(webAppUrl),
    { muteHttpExceptions: true }
  );
  Logger.log(resp.getContentText());
}

function escapeMd_(text) {
  // Markdown 특수문자 최소 이스케이프
  return String(text).replace(/([_*`\[])/g, '\\$1');
}

function findRowByOutputId_(outputId) {
  const data = readSheetAsObjects_(CONFIG.SHEETS.THREADS_OUTPUT);
  const match = data.rows.filter(function (r) { return r.output_id === outputId; })[0];
  if (!match) throw new Error('output_id 없음: ' + outputId);
  return match._rowIndex;
}

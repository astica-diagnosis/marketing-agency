/**
 * postThreads.js — 승인된 콘텐츠를 Threads에 게시
 *
 * Threads는 Meta Graph API로 게시합니다. 2단계:
 *   1) 미디어 컨테이너 생성 (text post)
 *   2) 컨테이너 publish
 *
 * 설정 (스크립트 속성):
 *   THREADS_USER_ID      = Threads 계정 ID
 *   THREADS_ACCESS_TOKEN = 장기 액세스 토큰
 *
 * 주의: Threads API는 Meta 개발자 앱 + 권한 승인이 필요합니다.
 *       토큰 발급 전에는 이 함수가 동작하지 않습니다.
 *       그 전까지는 APPROVED 건을 텔레그램으로 받아 수동 게시해도 됩니다.
 */

var THREADS_API_BASE = 'https://graph.threads.net/v1.0';

/** APPROVED 상태 콘텐츠를 모두 게시 */
function postApprovedThreads() {
  const data = readSheetAsObjects_(CONFIG.SHEETS.THREADS_OUTPUT);
  const targets = data.rows.filter(function (r) {
    return String(r.status) === CONFIG.STATUS.APPROVED;
  });

  if (targets.length === 0) {
    logRun_('postApprovedThreads', 0, 0, 'APPROVED 없음');
    SpreadsheetApp.getUi().alert('게시할 승인 콘텐츠가 없습니다.');
    return;
  }

  let posted = 0, failed = 0;
  targets.forEach(function (row) {
    try {
      const permalink = publishToThreads_(row.thread_post);
      updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, row._rowIndex, 'status', CONFIG.STATUS.POSTED);
      updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, row._rowIndex, 'posted_at', nowStr_());
      updateCell_(CONFIG.SHEETS.THREADS_OUTPUT, row._rowIndex, 'permalink', permalink || '');
      posted++;
    } catch (e) {
      logError_('postApprovedThreads', row.output_id, e.message);
      failed++;
    }
  });

  logRun_('postApprovedThreads', posted, failed, 'APPROVED=' + targets.length);
  SpreadsheetApp.getUi().alert('게시 완료: ' + posted + '건, 실패: ' + failed + '건');
}

/** 단일 텍스트를 Threads에 게시하고 permalink 반환 */
function publishToThreads_(text) {
  const userId = getSecret_('THREADS_USER_ID');
  const token = getSecret_('THREADS_ACCESS_TOKEN');

  // 1) 컨테이너 생성
  const createUrl = THREADS_API_BASE + '/' + userId + '/threads';
  const createResp = UrlFetchApp.fetch(createUrl, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      media_type: 'TEXT',
      text: text,
      access_token: token
    }),
    muteHttpExceptions: true
  });
  if (createResp.getResponseCode() !== 200) {
    throw new Error('컨테이너 생성 실패: ' + createResp.getContentText().substring(0, 200));
  }
  const containerId = JSON.parse(createResp.getContentText()).id;

  // Threads는 컨테이너 생성 후 잠깐 대기 권장
  Utilities.sleep(2000);

  // 2) publish
  const publishUrl = THREADS_API_BASE + '/' + userId + '/threads_publish';
  const pubResp = UrlFetchApp.fetch(publishUrl, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      creation_id: containerId,
      access_token: token
    }),
    muteHttpExceptions: true
  });
  if (pubResp.getResponseCode() !== 200) {
    throw new Error('게시 실패: ' + pubResp.getContentText().substring(0, 200));
  }
  const mediaId = JSON.parse(pubResp.getContentText()).id;
  return 'https://www.threads.net/@_/post/' + mediaId; // 대략적 permalink
}

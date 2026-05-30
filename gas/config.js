/**
 * config.js — ASTICA Content Engine 전역 설정
 *
 * 모든 상수는 여기서 관리합니다.
 * API 키는 여기 넣지 않습니다. PropertiesService(스크립트 속성)에 저장합니다.
 *   설정 방법: Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성
 *     ANTHROPIC_API_KEY  = sk-ant-...
 *     OPENAI_API_KEY     = sk-...
 *     TELEGRAM_BOT_TOKEN = 123456:ABC...
 *     TELEGRAM_CHAT_ID   = (검수자 채팅 ID)
 */

const CONFIG = {
  // ── 스프레드시트 파일명 ──
  // 같은 스프레드시트 안에 모든 탭이 있다고 가정합니다.
  // RawData / Engine을 별도 파일로 운영하면 SpreadsheetApp.openById로 분리하세요.

  // ── 탭 이름 ── (실제 시트 탭 이름과 일치)
  SHEETS: {
    CLEAN_MASTER:   'CLEAN_MASTER',     // classify 결과 (생성 입력원)
    THREADS_OUTPUT: 'THREADS_OUTPUT',   // 생성 결과 저장
    HARNESS:        'HARNESS',          // 하네스 보관
    BANNED_TERMS:   'BANNED_TERMS',     // 금지어
    CONFIG:         'CONFIG',           // 운영 설정
    RUN_LOG:        'RUN_LOG',          // 실행 로그
    ERROR_LOG:      '99_ERROR_LOG'      // 에러 로그 (기존 탭 사용)
  },

  // ── 상태값 ──
  STATUS: {
    // CLEAN_MASTER.status
    READY:     'READY',       // 생성 대상
    GENERATED: 'GENERATED',   // 생성 완료
    // THREADS_OUTPUT.status
    PENDING:   'PENDING',     // 텔레그램 검수 대기
    APPROVED:  'APPROVED',    // 승인됨
    REJECTED:  'REJECTED',    // 반려됨
    POSTED:    'POSTED',      // 게시 완료
    NEEDS_REVIEW: 'NEEDS_REVIEW' // validator가 사람 검토 필요로 표시
  },

  // ── AI 모델 ──
  AI: {
    PROVIDER: 'anthropic',                  // 'anthropic' | 'openai'
    ANTHROPIC_MODEL: 'claude-sonnet-4-6',
    OPENAI_MODEL: 'gpt-4o',
    MAX_TOKENS: 1024,
    ANTHROPIC_URL: 'https://api.anthropic.com/v1/messages',
    OPENAI_URL: 'https://api.openai.com/v1/chat/completions',
    ANTHROPIC_VERSION: '2023-06-01'
  },

  // ── 배치 ──
  BATCH: {
    SIZE: 5,            // 1회 실행 시 처리할 행 수 (GAS 6분 제한 고려)
    MAX_RETRIES: 1      // API 실패 시 재시도 횟수
  },

  // ── 텔레그램 ──
  TELEGRAM: {
    API_BASE: 'https://api.telegram.org/bot'
  }
};

/** 스크립트 속성에서 비밀값을 읽습니다. */
function getSecret_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('스크립트 속성에 ' + key + ' 가 없습니다. 프로젝트 설정에서 추가하세요.');
  return v;
}

// ── CONFIG 탭에서 운영 설정 읽기 ──
// 코드 하드코딩 대신 시트에서 값을 가져옵니다. 같은 실행 안에서는 캐시.
var _CONFIG_CACHE = null;

/** CONFIG 탭을 { key: value } 객체로 읽습니다. */
function loadConfigSheet_() {
  if (_CONFIG_CACHE) return _CONFIG_CACHE;
  const map = {};
  try {
    const data = readSheetAsObjects_(CONFIG.SHEETS.CONFIG);
    data.rows.forEach(function (r) {
      if (r.key !== '' && r.key != null) map[String(r.key)] = r.value;
    });
  } catch (e) { /* CONFIG 탭 없으면 기본값 사용 */ }
  _CONFIG_CACHE = map;
  return map;
}

/** CONFIG 탭 값 조회. 없으면 fallback 반환. */
function cfg_(key, fallback) {
  const map = loadConfigSheet_();
  return (map.hasOwnProperty(key) && map[key] !== '') ? map[key] : fallback;
}

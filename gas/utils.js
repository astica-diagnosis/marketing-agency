/**
 * utils.js — 공통 유틸리티
 * 토큰을 쓰지 않는 순수 코드 작업(ID, 날짜, 파싱, 계산)은 전부 여기 모읍니다.
 */

/** 'PREFIX-0001' 형식 ID 생성. 시트의 마지막 ID 다음 번호를 만듭니다. */
function makeNextId_(prefix, existingIds) {
  let maxNum = 0;
  existingIds.forEach(function (id) {
    if (typeof id === 'string' && id.indexOf(prefix + '-') === 0) {
      const n = parseInt(id.split('-')[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  const next = (maxNum + 1).toString().padStart(4, '0');
  return prefix + '-' + next;
}

/** 현재 시각을 'yyyy-MM-dd HH:mm:ss' 로 반환 */
function nowStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * LLM 출력에서 JSON을 안전하게 파싱합니다.
 * 코드펜스(```json ... ```)나 앞뒤 텍스트가 섞여 와도 첫 { ~ 마지막 } 를 추출합니다.
 * 실패 시 null 반환.
 */
function safeJsonParse_(text) {
  if (!text) return null;
  let s = String(text).trim();
  // 코드펜스 제거
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  // 첫 { 부터 마지막 } 까지
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  const candidate = s.substring(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    return null;
  }
}

/** 글자 수 (공백 포함) */
function countChars_(text) {
  return text ? String(text).length : 0;
}

/** 단어 수 */
function countWords_(text) {
  if (!text) return 0;
  const m = String(text).trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** 줄 수 */
function countLines_(text) {
  if (!text) return 0;
  return String(text).split('\n').length;
}

/** 예상 읽기 시간(초). 분당 200단어 가정, 최소 3초 */
function estimateReadingSeconds_(text) {
  const words = countWords_(text);
  const sec = Math.round((words / 200) * 60);
  return Math.max(3, sec);
}

/**
 * 시트를 객체 배열로 읽습니다. (1행 = 헤더)
 * 반환: { headers: [...], rows: [{col:val,...}, ...], rawValues: [[...]] }
 * getValues 한 번만 호출 — GAS 성능 원칙 준수.
 */
function readSheetAsObjects_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('탭을 찾을 수 없습니다: ' + sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 1) return { headers: [], rows: [], rawValues: [], sheet: sheet };
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const obj = { _rowIndex: i + 1 }; // 실제 시트 행 번호 (1-based)
    headers.forEach(function (h, idx) { obj[h] = values[i][idx]; });
    rows.push(obj);
  }
  return { headers: headers, rows: rows, rawValues: values, sheet: sheet };
}

/** 특정 행의 특정 컬럼 값을 업데이트합니다. (헤더명 기준) */
function updateCell_(sheetName, rowIndex, headerName, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headers.indexOf(headerName);
  if (colIndex === -1) throw new Error(headerName + ' 컬럼이 ' + sheetName + ' 에 없습니다.');
  sheet.getRange(rowIndex, colIndex + 1).setValue(value);
}

/** 객체를 시트에 한 행 추가합니다. (헤더 순서에 맞춰 정렬) */
function appendRow_(sheetName, obj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sheet.appendRow(row);
}

/** RUN_LOG 기록 */
function logRun_(funcName, processed, skipped, note) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.RUN_LOG);
    if (!sheet) return;
    sheet.appendRow([nowStr_(), funcName, processed, skipped, note || '']);
  } catch (e) { /* 로깅 실패는 무시 */ }
}

/** ERROR_LOG 기록 (컬럼: error_id, run_at, function_name, input_id, error_msg, resolved) */
function logError_(funcName, inputId, errorMsg) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.ERROR_LOG);
    if (!sheet) return;
    const existing = sheet.getDataRange().getValues().map(function (r) { return r[0]; });
    const errId = makeNextId_('ERR', existing);
    sheet.appendRow([errId, nowStr_(), funcName, inputId || '', String(errorMsg), 'FALSE']);
  } catch (e) { /* 로깅 실패는 무시 */ }
}

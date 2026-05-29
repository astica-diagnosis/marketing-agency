/**
 * menu.js — Google Sheets 커스텀 메뉴
 * 시트를 열 때 'ASTICA Engine' 메뉴가 생깁니다.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ASTICA Engine')
    .addItem('① 테스트 (1개 생성)', 'testGenerateThreadsOneRow')
    .addItem('② Threads 배치 생성', 'runGenerateThreadsBatch')
    .addSeparator()
    .addItem('승인된 콘텐츠 게시', 'postApprovedThreads')
    .addSeparator()
    .addItem('[설정] 텔레그램 웹훅 등록', 'setTelegramWebhook')
    .addToUi();
}

# ASTICA Content Engine — GAS 셋업 가이드

## 1. 시트 준비

`Marketing_Engine` 스프레드시트에 아래 탭을 만듭니다.
(이미 있는 01_CLEAN_MASTER 외에 추가)

### 03_THREADS_OUTPUT
복붙용 헤더:
```
output_id	clean_id	thread_post	hook_line	cta_type	char_count	line_count	ad_hook	empathetic_reply	pattern_reply	soft_cta_reply	validation_issues	status	created_at	telegram_msg_id	posted_at	permalink
```
드롭다운:
- cta_type: none, soft, medium, direct, comment
- status: PENDING, APPROVED, REJECTED, POSTED, NEEDS_REVIEW

### 90_PROMPT_LIBRARY
```
prompt_key	version	content	active	updated_at	notes
```
- active: TRUE, FALSE
- 첫 행: generate_threads_core / 1.2 / (core 하네스 전문) / TRUE
- 둘째 행: classify / 3.0 / (classify_v3 시스템 프롬프트) / TRUE

### 92_RUN_LOG
```
run_at	function_name	processed	skipped	note
```

### 93_ERROR_LOG
```
run_at	function_name	input_id	error_msg
```

## 2. 스크립트 속성 설정

Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성:
```
ANTHROPIC_API_KEY    = sk-ant-...
OPENAI_API_KEY       = sk-...        (영상 분석 등 선택)
TELEGRAM_BOT_TOKEN   = 123456:ABC...
TELEGRAM_CHAT_ID     = (아래 3번에서 확인)
THREADS_USER_ID      = (Threads API 발급 후)
THREADS_ACCESS_TOKEN = (Threads API 발급 후)
```

## 3. 텔레그램 봇 세팅

1. 텔레그램에서 @BotFather 검색 → /newbot → 토큰 발급 → TELEGRAM_BOT_TOKEN 저장
2. Apps Script → 배포 → 새 배포 → 웹앱
   - 실행: 나
   - 액세스 권한: 모든 사용자
   - 배포 후 웹앱 URL 복사
3. `setTelegramWebhook()` 실행 (메뉴 또는 편집기)
4. 봇에게 아무 메시지나 보낸 뒤, 봇이 `/id` 응답하면 그 CHAT_ID를 TELEGRAM_CHAT_ID에 저장
   (또는 봇에게 `/id` 전송 → 봇이 CHAT_ID 회신)

## 4. 실행 순서

1. CLEAN_MASTER에 classify 결과가 status=READY로 들어있어야 함
2. 시트 메뉴 'ASTICA Engine' → ① 테스트 (1개 생성)
3. 텔레그램으로 후보 도착 → 승인/수정/반려
4. 승인 누적되면 → 메뉴 → 승인된 콘텐츠 게시

## 5. 파일 구조 (clasp push 대상)

```
gas/
  config.js
  utils.js
  aiClient.js
  promptLoader.js
  validateThreads.js
  generateThreads.js
  telegram.js
  postThreads.js
  menu.js
```

## 주의

- GAS 실행 6분 제한: BATCH.SIZE를 5~10으로 유지
- Threads API는 Meta 앱 승인 전까지 게시 불가 → 그 전엔 텔레그램 승인 후 수동 게시
- API 키는 절대 시트나 코드에 넣지 말 것 (PropertiesService만)

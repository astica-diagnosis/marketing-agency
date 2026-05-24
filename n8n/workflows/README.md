# n8n Workflows

Step 2 이후 동적 수집 자동화에 사용할 n8n 워크플로우 JSON 파일을 보관합니다.

## 예정 워크플로우

- `reddit_collect.json`     : Reddit API → RAW_REDDIT 시트 적재
- `trends_collect.json`     : Google Trends / TikTok → RAW_TRENDS 적재
- `competitor_collect.json` : Apify → RAW_COMPETITORS 적재
- `notion_export.json`      : NOTION_EXPORT 시트 → Notion API 전송

## 현재 상태

Step 1 (정적 데이터 기반) 단계에서는 GAS만 사용합니다.
n8n은 Step 2 동적 수집 자동화부터 투입합니다.

# ASTICA Harness

하네스는 LLM에 전달하는 프롬프트 템플릿입니다.
비즈니스 로직과 표현 원칙이 담겨 있으며,
GAS 및 n8n이 실행 시 이 파일을 읽어서 API에 주입합니다.

## 구조

- `classify/` : 원문 데이터를 분류 JSON으로 변환
- `generate/` : 분류 결과를 콘텐츠 카피로 변환

## 버전 관리

파일명에 버전을 포함합니다 (예: classify_v3.md).
활성 버전은 Google Sheet `Marketing_Engine`의
`99_FLOW_CONTROL` 탭 > `active_harness_version` 값과 일치해야 합니다.

## 수정 원칙

1. 기존 파일을 직접 수정하지 않습니다.
2. 새 버전 파일을 생성하고 FLOW_CONTROL을 업데이트합니다.
3. 변경 이유를 파일 상단 changelog에 기록합니다.

# Supertimeline

**사이트 바로 가기: https://hyeminieee.github.io/supertimeline/**

디지털포렌식 논문을 타임라인처럼 넘겨 보는 개인 피드입니다. 빌드 과정 없이 `index.html`을 열면 동작합니다.

## 데이터와 저작권

- 논문의 서지 정보(제목, 저자, 학술지, DOI, 인용 수)는 [OpenAlex](https://openalex.org)에서 받습니다. OpenAlex 데이터는 CC0입니다.
- 한국어 제목과 요약은 각 논문의 초록을 읽고 새로 쓴 것입니다. 번역문이 아니며, 정확한 내용은 원문을 확인해야 합니다.
- 초록 원문은 이 저장소에 싣지 않습니다. 사이트를 열면 방문자의 브라우저가 OpenAlex에서 직접 받아와 보여 줍니다.
- 모든 논문에는 원문으로 가는 DOI 링크가 붙어 있습니다. 논문의 저작권은 각 저자와 출판사에 있습니다.
- 아이콘은 [Lucide](https://lucide.dev)(ISC 라이선스), 글꼴은 Google Sans Flex와 IBM Plex Mono(SIL Open Font License)입니다.

## 파일

- `index.html`, `styles.css`, `app.js`: 화면
- `rules.js`: 주제 분류 규칙과 OpenAlex 검색식
- `seed.js`: 처음 열었을 때 보이는 논문 목록과 한국어 요약

좋아요와 의견은 방문자의 브라우저에만 저장됩니다.

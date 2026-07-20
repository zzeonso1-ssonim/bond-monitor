# 본드스프레드 모니터 (bond-spread-web)

한국 채권 크레딧스프레드 모니터링 정적 웹앱. 순수 바닐라 ES 모듈(HTML/CSS/JS)로만 구성되어
빌드 도구·외부 라이브러리·CDN 없이 동작한다.

## 데이터

- 소스: Supabase (PostgREST 읽기 전용, publishable key)
- 적재: [bond-spread-system](https://github.com/zzeonso1-ssonim/bond-spread-system) 파이프라인이
  KOFIA 채권시가평가기준수익률(평가사 평균)을 수집해 **매일 20:00 KST** 갱신
- 테이블
  - `bond_spread_daily` — `{trade_date, label, yield, vs_govt_bp}` (2025-05-30~)
  - `market_daily` — `{trade_date, symbol, value}`, symbol ∈ KOSPI / USDKRW / UST10Y
  - `bond_regime_stats` — 국면별 통계 `{kind: regime|rv|xcurve, label, bucket, ...}`
    (로컬 `run_daily` 실행 시 갱신 — `xcurve` 는 아직 빈 상태가 정상)

## 로컬 실행

```bash
cd bond-spread-web
python3 -m http.server 8000
# → http://localhost:8000
```

정적 서버라면 무엇이든 가능하다(ES 모듈이므로 `file://` 직접 열기는 불가).

## 화면

| 탭 | 내용 |
|---|---|
| 일간 모니터링 | 시장지표 타일(KOSPI/원달러/미국채10Y) + 30개 지표 요약 표(수익률·전일비, 스프레드·전일/1주/1개월/YTD). 행 클릭 시 1년 추이 차트, 수익률↔스프레드 토글 |
| 섹터 매트릭스 | 섹터(등급 사다리) × 만기(1/2/3/5/10년) 스프레드 히트맵 표. 값 크기에 비례한 배경 농도, 괄호는 전주비(5영업일 전 대비). 셀 클릭 시 1년 추이 |
| 이종커브 | 크레딧 단기물(2년) − 국고 3년 스프레드(bp). 채권 투자심리 지표. 타일 + 시계열 + 국면별 통계 |
| 상대가치 | 동일 만기 수익률차 4개 그룹 × 1/2/3년. 행 클릭 시 그룹 3개 만기 시계열 + 국면 통계 표 |
| 국면별 분석 | 기준금리 국면(시기/정책)별 스프레드 레인지 차트 + 전체 버킷 표(평균/고점/저점/평균수익률) |

색 관례: 상승(확대) = 빨강(`--up`), 하락(축소) = 파랑(`--dn`) — 국내 관례.
테마는 시스템 → 다크 → 라이트 순환 토글(우상단 ◐), localStorage 에 저장된다.

## 라벨 규약

`bond_spread_daily.label` 은 `"{섹터} {등급} {만기}년"` 형태이며 `js/config.js` 의 정의와
**문자열이 정확히 일치**해야 한다. 예: `특수채 AAA 5년`, `여전채 AA- 2년`, `회사채 BBB+ 10년`.
국고·통안(`국고채 3년`, `통안채 1년` 등)은 스프레드 기준이므로 `vs_govt_bp`=0.

- 매트릭스 표시명 ↔ 라벨 접두어 매핑 예: 공사채→`특수채`, 산금채→`특수은행채 AAA`, 중금채→`중금채 AAA`
- 매트릭스 라벨은 백필 진행 중일 수 있음 — 데이터 없는 셀은 자동으로 `—` 처리된다

## 파일 구조

```
index.html      셸(탭·섹션 골격)
css/style.css   전체 스타일(라이트/다크 CSS 변수)
js/config.js    Supabase 상수, 지표·그룹 정의 (MONITOR_GROUPS, MATRIX_GROUPS, XCURVE_DEFS, RV_DEFS, ...)
js/api.js       PostgREST 읽기 헬퍼(페이지네이션 포함)
js/charts.js    경량 SVG 차트(lineChart, regimeRangeChart)
js/app.js       화면 로직(5개 뷰 렌더링, 파생 계산)
```

## 확장 방법

- **모니터링 지표 추가**: `config.js` 의 `MONITOR_GROUPS` 에 그룹/라벨 추가 (파이프라인이 해당 라벨을 적재해야 함)
- **매트릭스 행 추가**: `MATRIX_GROUPS` 에 `{ sector, labelPrefix, mats }` 추가
- **이종커브/상대가치 지표 추가**: `XCURVE_DEFS` / `RV_DEFS` 에 라벨 쌍 추가 —
  국면 통계까지 보려면 bond-spread-system 의 `sync_supabase.py` 스펙에도 동일 라벨로 등록
- **국면 분석 지표 추가**: `REGIME_LABELS` 에 라벨 추가 (kind='regime' 통계가 있어야 표시)

데이터 문자열은 전부 `textContent` 로만 DOM 에 삽입한다(innerHTML 에 데이터 보간 금지).

# 본드모니터 (bond-monitor)

한국 채권 크레딧스프레드 모니터링 정적 웹앱. 순수 바닐라 ES 모듈(HTML/CSS/JS)로만 구성되어
빌드 도구·외부 라이브러리·CDN 없이 동작한다.


## 접속 주소

- Vercel (주): https://bond-monitor-kappa.vercel.app
- GitHub Pages (보조): https://zzeonso1-ssonim.github.io/bond-monitor/

`main` 브랜치에 push 하면 두 곳 모두 자동 재배포된다.

## 데이터

- 소스: Supabase (PostgREST 읽기 전용, publishable key)
- 적재: [bond-spread-system](https://github.com/zzeonso1-ssonim/bond-spread-system) 파이프라인이
  KOFIA 채권시가평가기준수익률(평가사 평균)을 수집해 **매일 20:00 KST** 갱신
- 테이블
  - `bond_spread_daily` — `{trade_date, label, yield, vs_govt_bp}` (2025-05-30~)
  - `market_daily` — `{trade_date, symbol, value}`, symbol ∈ KOSPI / USDKRW / UST10Y
  - `bond_regime_stats` — 국면별 통계 `{kind: regime|rv|xcurve, label, bucket, ...}`
    (로컬 `run_daily` 실행 시 갱신 — `xcurve` 는 아직 빈 상태가 정상)
  - `web_meta` — 화면 구성 메타 `{key: 'bond-monitor', payload jsonb}` (아래 참고)
  - `krx_futures_daily` / `krx_govt_daily` / `krx_corp_daily` — KRX 국채선물·장내 국채·일반채권시장 일별
  - `dart_offerings` — DART 채무증권 발행 공시 (DART_API_KEY 등록 후 적재)
  - `dart_offering_details` — 신고서 본문 파싱: 회차별 발행조건(등급·발행액·수요예측 밴드·주관사 등)
  - `kofia_investor_flows` — KOFIA 투자자별 거래현황 `{trade_date, trade_type, bond_class, 투자자 13컬럼}` (억원)
  - `kofia_issue_stats` — 발행/만기 일별 `{stat_date, bond_class(+특은채), issued, redeemed, net, outstanding, matured}` (만기 예정 +21일 포함)
  - `kofia_issue_monthly` — 발행통계 월별 집계 `{ym, bond_class, issued, redeemed, net}` (2006-01~)

## 화면 구성 소스 — 하드코딩 금지 원칙

지표 목록·그룹·순서는 **Supabase `web_meta` 테이블(key='bond-monitor')** 이 단일 소스다.
파이프라인의 `specs.py` → `build_web_meta()` 가 매일 payload(jsonb) 로 동기화하며, 웹앱은
로드 시 이를 읽어 `js/app.js` 의 `resolveConfig(meta)` 로 화면을 자동 구성한다.
**지표를 추가해도 웹 코드 수정이 필요 없다** — specs.py 만 고치면 된다.

- payload 필드: `monitor_groups` / `matrix_groups` / `xcurve_defs` / `rv_groups` / `regime_labels` / `market_groups`
- `web_meta` 테이블이 없거나(404) 행이 없으면 `loadWebMeta()` 가 null 을 반환하고,
  `js/config.js` 의 상수들이 **폴백 기본값** 으로 사용된다 (필드 단위로 폴백)
- 매트릭스 만기 열은 labels 에서 "N년" 을 파싱한 전체 그룹 합집합으로 동적 구성
- 심리지표 색은 인덱스 기반 자동 배정: 0→`--series-1`, 1→`--series-2`, 2→`--series-6`, 이후 `SLOT_VARS` 순환

## 로컬 실행

```bash
cd bond-monitor
python3 -m http.server 8000
# → http://localhost:8000
```

정적 서버라면 무엇이든 가능하다(ES 모듈이므로 `file://` 직접 열기는 불가).

## 화면

| 탭 | 내용 |
|---|---|
| 일간 모니터링 | 시장지표 타일(KOSPI/원달러/미국채10Y) + 시장지표 접이식 표(환율/주요지수/해외금리/상품 전 심볼 — 종가·전일비·주간변동률) + 30개 지표 요약 표(수익률·전일비, 스프레드·전일/1주/1개월/YTD). 행 클릭 시 1년 추이 차트, 수익률/스프레드/두 지표 차이(행 2개 클릭 → 커브 스프레드 bp) 토글 |
| 섹터 매트릭스 | 섹터(등급 사다리) × 만기(1/2/3/5/10년) 스프레드 히트맵 표. 값 크기에 비례한 배경 농도, 괄호는 전주비(5영업일 전 대비). 셀 클릭 시 1년 추이 |
| 심리지표 | 심리지표(이종커브) = 크레딧 단기물(2년) − 국고 3년 스프레드(bp) 3종(은행채/여전채/특은채). 채권 투자심리 지표. 타일 + 시계열 + 국면별 통계 |
| 상대가치 | 동일 만기 수익률차 4개 그룹 × 1/2/3년. 행 클릭 시 그룹 3개 만기 시계열(카드 제목에 선택 만기 표기) + 국면 통계 표 |
| 국면별 분석 | 기준금리 국면(시기/정책)별 스프레드 레인지 차트 + 전체 버킷 표(평균/고점/저점/평균수익률) |
| 거래현황 | KRX 일반채권시장 장내 체결 — 일간/주간(5영업일)/월간(21영업일) 선택, 여전채/회사채 거래대금 상위 10(기간 합산) + 수익률 변동 상위(일간, 강세/약세 10) |
| 수급동향 | **현물 수급**: KOFIA 투자자별 거래현황(장외 거래대금, 억원) — 주요 투자자 타일(당일+20일 누적) + 투자자×채권종류 순매수 표 + 투자주체별 주간/월간 순매수 막대그래프(채권종류 선택). **선물 수급**: 국채선물 근월물 표 + 외국인 순매수(당일·주간 타일 + 연초 누적 차트, `market_daily` 심볼 `KTB3F_FRG`/`KTB10F_FRG` — KRX 로그인 세션 필요라 자동 수집 아님, 갱신은 bond-spread-system `tools/krx_foreign_futures_bookmarklet.js` 북마클릿) |
| 발행·만기 | KOFIA 발행시장 — 발행통계(금주=달력 7일 합산 vs 전주, 은행채 아래 `└ 특은채/└ 은행채(일반)` 분해) + 만기통계(금주/다음주/다다음주, 특은채 분해) + 월별 순발행 차트(당월 vs 직전 3·5년 같은 달 평균, 채권종류 버튼, `kofia_issue_monthly` 2006~). ⚠상환은 주말·공휴일에도 기록되므로 일별 수집은 달력일 전체 기준 |
| 발행정보 | 수요예측·발행조건 표(신고서 파싱, **최근 1주일** — 회차·등급·발행액·상환기일·수요예측일·청약일·공모희망금리 밴드·**등급민평**·주관사, 회사명=DART 링크). 등급민평 = KOFIA 등급별 시가평가를 밴드 기준만기로 보간한 참고치(개별민평은 민평사 유료 상품이라 미제공). 공시 원문 목록은 미표시 |

색 관례: 상승(확대) = 빨강(`--up`), 하락(축소) = 파랑(`--dn`) — 국내 관례 (시장 데이터 한정).
UI 크롬은 DAAI(대신자산 AI리서치)와 같은 민트/틸 톤온톤. 테마는 시스템 → 다크 → 라이트 순환 토글(우상단 ◐).
**PDF 저장**: 우상단 "PDF 저장" 버튼(또는 Ctrl+P) → 현재 탭만 A4 가로로 인쇄. 인쇄 중에는 라이트 테마가 강제되고 표·카드가 잘리지 않게 페이지가 나뉜다.

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
js/config.js    Supabase 상수, 폴백 기본값(MONITOR_GROUPS, MATRIX_GROUPS, XCURVE_DEFS, RV_DEFS, ...)
js/api.js       PostgREST 읽기 헬퍼(loadWebMeta 포함, 페이지네이션 처리)
js/charts.js    경량 SVG 차트(lineChart, regimeRangeChart)
js/app.js       화면 로직(resolveConfig 구성 해석 + 5개 뷰 렌더링, 파생 계산)
```

## 확장 방법

**원칙: 지표 추가는 파이프라인의 `specs.py` 에서 한다.** `build_web_meta()` 가 `web_meta` 로
동기화하면 웹앱이 자동 반영한다 — 웹 코드 수정 불필요.

- 모니터링/매트릭스/심리지표/상대가치/국면/시장지표 모두 payload 의 해당 필드에 추가
- 국면 통계까지 보려면 `sync_supabase.py` 스펙에도 동일 라벨로 등록 (통계가 있어야 표시됨)
- `js/config.js` 의 상수는 `web_meta` 부재 시의 폴백일 뿐이다 — 신규 지표를 여기에 추가하지 말 것
  (메타가 있으면 무시된다)

데이터 문자열은 전부 `textContent` 로만 DOM 에 삽입한다(innerHTML 에 데이터 보간 금지).

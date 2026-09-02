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
  - `market_daily` — `{trade_date, symbol, value}`, 미국금리 `UST2Y` / `UST10Y` 포함
  - `bond_regime_stats` — 국면별 통계 `{kind: regime|rv|xcurve, label, bucket, ...}`
    (로컬 `run_daily` 실행 시 갱신 — `xcurve` 는 아직 빈 상태가 정상)
  - `web_meta` — 화면 구성 메타 `{key: 'bond-monitor', payload jsonb}` (아래 참고)
  - `krx_futures_daily` — KRX 국채선물 일별 (수급동향 탭 선물 수급에 표시)
  - `krx_govt_daily` — KRX 장내 국채 일별 (파이프라인이 계속 적재하나 웹 화면에서는 미표시)
  - `krx_corp_daily` — KRX 일반채권시장 일별 (파이프라인이 계속 적재하나 웹 화면에서는 미표시)
  - `dart_offerings` — DART 채무증권 발행 공시 (DART_API_KEY 등록 후 적재)
  - `dart_offering_details` — 신고서 본문 파싱: 회차별 발행조건(등급·발행액·수요예측 밴드·주관사 등)
  - `infomax_spot_flows` — 인포맥스 4668/IMDH 현물 순매수 `{trade_date, investor, market_scope, maturity_bucket, net_buy_krw_thousand}`. 현물 공식값이며 KOFIA로 폴백하지 않음
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
| 일간 모니터링 | 시장지표 타일(KOSPI/원달러/미국채2Y/10Y) + 미국 국채 2Y·10Y 금리(좌축)와 10Y−2Y 스프레드(우축)를 공통 거래일 기준으로 겹친 최근 1년 차트 + 시장지표 접이식 표(환율/주요지수/해외금리/상품 전 심볼 — 종가·전일비·주간변동률) + 30개 지표 요약 표(수익률·전일비, 스프레드·전일/1주/1개월/YTD). 행 클릭 시 1년 추이 차트, 수익률/스프레드/두 지표 차이(행 2개 클릭 → 커브 스프레드 bp) 토글 + 기준금리 대비 및 여전채-회사채 국면별 분석 차트·통계표 |
| 섹터 매트릭스 | 섹터(등급 사다리) × 만기(1/2/3/5/10년) 스프레드 히트맵 표. 값 크기에 비례한 배경 농도, 괄호는 전주비(5영업일 전 대비). 셀 클릭 시 1년 추이 |
| 심리지표 | 심리지표(이종커브) = 크레딧 단기물(2년) − 국고 3년 스프레드(bp) 3종(은행채/여전채/특은채). 채권 투자심리 지표. 타일 + 시계열 + 국면별 통계 |
| 상대가치 | 동일 만기 수익률차 4개 그룹 × 1/2/3년. 행 클릭 시 그룹 3개 만기 시계열(카드 제목에 선택 만기 표기) + 국면 통계 표 |
| 수급동향 | **외국인 잔고·환율**: 당월 금감원 외국인 상장채권 일별 잔고(좌축)와 같은 날 원/달러 환율(우축) 비교 차트. **현물 수급**: 인포맥스 4668/IMDH 월간 순매수 — 전체 타일, 순매수·순매도 집중 만기구간, 11개 만기구간 표, 최근 36개월 차트. 인포맥스 미연결 시 마지막 정상값만 유지하고 KOFIA 값으로 대체하지 않는다. **선물 수급**: 국채선물 근월물 표 + 외국인 순매수(당일·주간 타일 + 연초/기준월 누적 전환 차트, `market_daily` 심볼 `KTB3F_FRG`/`KTB10F_FRG` — KRX 로그인 세션 필요라 자동 수집 아님, 갱신은 bond-spread-system `tools/krx_foreign_futures_bookmarklet.js` 북마클릿) |
| 발행·만기 | KOFIA 발행시장 — 발행통계(금주=달력 7일 합산 vs 전주, 은행채 아래 `└ 특은채/└ 은행채(일반)` 분해) + 만기통계(금주/다음주/다다음주, 특은채 분해) + 월별 순발행 차트(당월 vs 직전 3·5년 같은 달 평균, 채권종류 버튼, `kofia_issue_monthly` 2006~). ⚠상환은 주말·공휴일에도 기록되므로 일별 수집은 달력일 전체 기준 |
| 발행정보 | 수요예측·발행조건 표(신고서 파싱, **최근 1주일** — 회차·등급·발행액·상환기일·수요예측일·청약일·공모희망금리 밴드·**등급민평**·주관사, 회사명=DART 링크). 등급민평 = KOFIA 등급별 시가평가를 밴드 기준만기로 보간한 참고치(개별민평은 민평사 유료 상품이라 미제공). 공시 원문 목록은 미표시 |

색 관례: 상승(확대) = 빨강(`--up`), 하락(축소) = 파랑(`--dn`) — 국내 관례 (시장 데이터 한정).
UI 크롬은 DAAI(대신자산 AI리서치)와 같은 민트/틸 톤온톤. 테마는 시스템 → 다크 → 라이트 순환 토글(우상단 ◐).
**PDF 저장**: 우상단 "PDF 저장" 버튼(또는 Ctrl+P) → 현재 탭만 A4 가로로 인쇄. 인쇄 중에는 라이트 테마가 강제되고 표·카드가 잘리지 않게 페이지가 나뉜다.
**주간 PDF**: 우상단 "주간 PDF" 버튼 → 현재 로드된 최신 데이터로 A4 가로 2쪽 PDF를 즉시 다운로드한다. 1쪽은 금리·주간변동, 주식/외환/해외 3개 시장 박스, 주간 수급표와 투자주체별 4주 순매수 차트로 구성한다. 해외 표에는 지표별 값 단위와 변동 단위를 분리해 표기하고 기준일보다 2영업일 이상 늦은 원천은 `*`로 표시한다. 미국 2년물과 호주 10년물은 주간 제작 시 무료 공개화면 두 곳을 사람이 대조한 `data/weekly-market-overrides.json`을 PDF에서 우선 적용한다. 주간 PDF는 일요일 제작을 기본으로 하며 직전 거래일 종가만 사용하고 장중 가격은 반영하지 않는다. 2쪽은 월별 순발행 막대, 크레딧 스프레드 전월·전주·현재 비교, 만기별 상대가치·등급간 스프레드 8개 차트다. 모든 추이 차트 상단에는 현재·기간 최고·기간 최저 요약표를 둔다. 인쇄용 화이트 Coinbase 양식이며, 통안 91일은 미적재라 제외한다.
**차트 이미지 저장**: 각 차트 우상단 `↓ PNG` 버튼 → 현재 테마와 차트 범례가 함께 반영된 2배 해상도 PNG 파일 다운로드.

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
js/report-pdf.js 주간 채권시장 2쪽 PDF(Canvas 렌더·직접 다운로드)
```

## 확장 방법

**원칙: 지표 추가는 파이프라인의 `specs.py` 에서 한다.** `build_web_meta()` 가 `web_meta` 로
동기화하면 웹앱이 자동 반영한다 — 웹 코드 수정 불필요.

- 모니터링/매트릭스/심리지표/상대가치/국면/시장지표 모두 payload 의 해당 필드에 추가
- 국면 통계까지 보려면 `sync_supabase.py` 스펙에도 동일 라벨로 등록 (통계가 있어야 표시됨)
- `js/config.js` 의 상수는 `web_meta` 부재 시의 폴백일 뿐이다 — 신규 지표를 여기에 추가하지 말 것
  (메타가 있으면 무시된다)

데이터 문자열은 전부 `textContent` 로만 DOM 에 삽입한다(innerHTML 에 데이터 보간 금지).

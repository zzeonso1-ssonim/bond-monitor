// 데이터 소스 및 지표 정의 — bond-spread-system(scripts/common.py)의 스펙과 라벨 동기 유지
export const SUPABASE_URL = "https://gdvhqfkftgnhqzgqbfmb.supabase.co";
export const SUPABASE_KEY = "sb_publishable_S_M8HbyW7nxBxQbnAGelBQ_v-KWIuUh"; // 읽기용 publishable key

// 일간 모니터링 30개 지표 — bond_spread_daily.label 그대로, 그룹핑용
export const MONITOR_GROUPS = [
  { name: "국고·통안", labels: ["통안채 1년", "통안채 2년", "국고채 3년", "국고채 5년", "국고채 10년", "국고채 20년", "국고채 30년"], govt: true },
  { name: "특수채 AAA", labels: ["특수채 AAA 1년", "특수채 AAA 2년", "특수채 AAA 3년", "특수채 AAA 5년", "특수채 AAA 10년"] },
  { name: "은행채 AAA", labels: ["은행채 AAA 1년", "은행채 AAA 2년", "은행채 AAA 3년"] },
  { name: "특수은행채 AAA (산금채)", labels: ["특수은행채 AAA 1년", "특수은행채 AAA 2년", "특수은행채 AAA 3년"] },
  { name: "여전채 AA-", labels: ["여전채 AA- 1년", "여전채 AA- 2년", "여전채 AA- 3년"] },
  { name: "여전채 A+", labels: ["여전채 A+ 1년", "여전채 A+ 2년", "여전채 A+ 3년"] },
  { name: "회사채 AA-", labels: ["회사채 AA- 1년", "회사채 AA- 2년", "회사채 AA- 3년"] },
  { name: "회사채 A+", labels: ["회사채 A+ 1년", "회사채 A+ 2년", "회사채 A+ 3년"] },
];

export const ALL_LABELS = MONITOR_GROUPS.flatMap((g) => g.labels);

// 섹터 매트릭스 — 등급 사다리 × 만기. label = `${labelPrefix} ${만기}년` (bond_spread_daily.label 과 일치)
export const MATRIX_MATS = [1, 2, 3, 5, 10];
export const MATRIX_GROUPS = [
  { sector: "공사채 AAA", labelPrefix: "특수채 AAA", mats: [1, 2, 3, 5, 10] },
  { sector: "공사채 AA+", labelPrefix: "특수채 AA+", mats: [1, 2, 3, 5, 10] },
  { sector: "산금채", labelPrefix: "특수은행채 AAA", mats: [1, 2, 3, 5, 10] },
  { sector: "중금채", labelPrefix: "중금채 AAA", mats: [1, 2, 3, 5, 10] },
  { sector: "은행채 AAA", labelPrefix: "은행채 AAA", mats: [1, 2, 3, 5, 10] },
  { sector: "여전채 AA+", labelPrefix: "여전채 AA+", mats: [1, 2, 3, 5, 10] },
  { sector: "여전채 AA0", labelPrefix: "여전채 AA0", mats: [1, 2, 3, 5, 10] },
  { sector: "여전채 AA-", labelPrefix: "여전채 AA-", mats: [1, 2, 3, 5, 10] },
  { sector: "여전채 A+", labelPrefix: "여전채 A+", mats: [1, 2, 3, 5, 10] },
  { sector: "여전채 A0", labelPrefix: "여전채 A0", mats: [1, 2, 3, 5, 10] },
  { sector: "여전채 A-", labelPrefix: "여전채 A-", mats: [1, 2, 3, 5, 10] },
  { sector: "여전채 BBB", labelPrefix: "여전채 BBB", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 AAA", labelPrefix: "회사채 AAA", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 AA+", labelPrefix: "회사채 AA+", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 AA0", labelPrefix: "회사채 AA0", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 AA-", labelPrefix: "회사채 AA-", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 A+", labelPrefix: "회사채 A+", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 A0", labelPrefix: "회사채 A0", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 A-", labelPrefix: "회사채 A-", mats: [1, 2, 3, 5, 10] },
  { sector: "회사채 BBB+", labelPrefix: "회사채 BBB+", mats: [1, 2, 3, 5, 10] },
];

// 심리지표(이종커브) — 크레딧 단기물 vs 국고 3년 (만기 이종 수익률차, bp). 채권 투자심리 지표.
// slot 은 SLOT_VARS 인덱스: 은행채=파랑(--series-1), 여전채=오렌지(--series-6), 특은채=녹색(--series-2)
export const XCURVE_DEFS = [
  { label: "은행채 AAA 2년 − 국고 3년", a: "은행채 AAA 2년", b: "국고채 3년", slot: 0 },
  { label: "여전채 AA- 2년 − 국고 3년", a: "여전채 AA- 2년", b: "국고채 3년", slot: 5 },
  { label: "특은채 AAA 2년 − 국고 3년", a: "특수은행채 AAA 2년", b: "국고채 3년", slot: 1 },
];

// 상대가치 12종 — 동일 만기 수익률차(bp)
export const RV_DEFS = [
  { group: "여전채-회사채 AA-", pairs: [
    { label: "여전채-회사채 AA- 1년", a: "여전채 AA- 1년", b: "회사채 AA- 1년" },
    { label: "여전채-회사채 AA- 2년", a: "여전채 AA- 2년", b: "회사채 AA- 2년" },
    { label: "여전채-회사채 AA- 3년", a: "여전채 AA- 3년", b: "회사채 AA- 3년" } ] },
  { group: "회사채 A+−AA-", pairs: [
    { label: "회사채 A+−AA- 1년", a: "회사채 A+ 1년", b: "회사채 AA- 1년" },
    { label: "회사채 A+−AA- 2년", a: "회사채 A+ 2년", b: "회사채 AA- 2년" },
    { label: "회사채 A+−AA- 3년", a: "회사채 A+ 3년", b: "회사채 AA- 3년" } ] },
  { group: "은행채−특수채 AAA", pairs: [
    { label: "은행채−특수채 AAA 1년", a: "은행채 AAA 1년", b: "특수채 AAA 1년" },
    { label: "은행채−특수채 AAA 2년", a: "은행채 AAA 2년", b: "특수채 AAA 2년" },
    { label: "은행채−특수채 AAA 3년", a: "은행채 AAA 3년", b: "특수채 AAA 3년" } ] },
  { group: "은행채−특수은행채 AAA", pairs: [
    { label: "은행채−특수은행채 AAA 1년", a: "은행채 AAA 1년", b: "특수은행채 AAA 1년" },
    { label: "은행채−특수은행채 AAA 2년", a: "은행채 AAA 2년", b: "특수은행채 AAA 2년" },
    { label: "은행채−특수은행채 AAA 3년", a: "은행채 AAA 3년", b: "특수은행채 AAA 3년" } ] },
];

// 국면별 분석 지표(kind='regime') — sync_supabase.py REGIME_SPECS 순서
export const REGIME_LABELS = [
  "국고채 3년", "국고채 10년", "국고채 30년",
  "특수채 AAA 3년", "은행채 AAA 2년", "여전채 AA- 3년", "회사채 AA- 3년",
];

export const MARKET_SYMBOLS = [
  { symbol: "KOSPI", name: "KOSPI", digits: 2 },
  { symbol: "USDKRW", name: "원/달러", digits: 1 },
  { symbol: "UST2Y", name: "미국채 2Y", digits: 3, unit: "%" },
  { symbol: "UST10Y", name: "미국채 10Y", digits: 3, unit: "%" },
];

// 시장지표 접이식 표 — market_daily 전체 심볼(그룹별). rate=true 는 금리(%): 변화를 %p 절대치로 표시
export const MARKET_TABLE = [
  { group: "환율", items: [
    { symbol: "USDKRW", name: "원/달러", digits: 1 },
    { symbol: "USDJPY", name: "달러/엔", digits: 2 },
    { symbol: "EURUSD", name: "유로/달러", digits: 4 },
    { symbol: "AUDUSD", name: "호주달러", digits: 4 },
    { symbol: "GBPUSD", name: "파운드", digits: 4 },
    { symbol: "USDCNY", name: "달러/위안", digits: 4 },
    { symbol: "DXY", name: "달러인덱스", digits: 2 },
  ] },
  { group: "주요지수", items: [
    { symbol: "KOSPI", name: "KOSPI", digits: 2 },
    { symbol: "SP500", name: "S&P500", digits: 2 },
    { symbol: "NASDAQ", name: "나스닥", digits: 2 },
    { symbol: "SSE", name: "상해종합", digits: 2 },
    { symbol: "NIKKEI", name: "니케이225", digits: 2 },
    { symbol: "HSCEI", name: "항셍H", digits: 2 },
    { symbol: "SX5E", name: "유로스톡스50", digits: 2 },
  ] },
  { group: "해외금리(%)", items: [
    { symbol: "UST2Y", name: "미국채 2Y", digits: 3, rate: true },
    { symbol: "UST10Y", name: "미국채 10Y", digits: 3, rate: true },
    { symbol: "DE10Y", name: "독일채 10Y", digits: 3, rate: true },
    { symbol: "GB10Y", name: "영국채 10Y", digits: 3, rate: true },
    { symbol: "AU10Y", name: "호주채 10Y", digits: 3, rate: true },
  ] },
  { group: "상품", items: [
    { symbol: "GSCI", name: "GSCI", digits: 2 },
    { symbol: "WTI", name: "WTI", digits: 2 },
    { symbol: "NATGAS", name: "천연가스", digits: 3 },
    { symbol: "COPPER", name: "구리", digits: 3 },
    { symbol: "GOLD", name: "금", digits: 1 },
    { symbol: "WHEAT", name: "소맥", digits: 2 },
    { symbol: "BTC", name: "비트코인", digits: 0 },
  ] },
];

// 카테고리 색상 슬롯(고정 순서 — 필터와 무관하게 지표당 고정)
export const SLOT_VARS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6"];

// 수급동향 — kofia_investor_flows 컬럼 ↔ 표시명 (표 행 순서).
// DB 스키마 매핑이므로 web_meta 대상 아님. chart=true 는 누적 추이 차트 기본 표시 투자자.
export const FLOW_INVESTORS = [
  { key: "bank", name: "은행", chart: true },
  { key: "amc_public", name: "자산운용(공모)", chart: true },
  { key: "amc_private", name: "자산운용(사모)" },
  { key: "insurance", name: "보험", chart: true },
  { key: "fund_pension", name: "기금·공제", chart: true },
  { key: "foreigner", name: "외국인", chart: true },
  { key: "merchant_mutual", name: "종금·상호" },
  { key: "futures_co", name: "선물" },
  { key: "government", name: "국가·지자체" },
  { key: "other_corp", name: "기타법인" },
  { key: "individual", name: "개인" },
];
// 매트릭스 표 열 순서 (kofia_investor_flows.bond_class 값 그대로)
export const FLOW_CLASSES = ["합계", "국채", "통안증권", "지방채", "특수채", "은행채", "기타금융채", "회사채", "ABS"];

// ── 금융통화위원회 통화정책방향 결정회의 ────────────────────────────────
// 국면별 외국인 선물 수급 차트의 세로줄·구간 분해에 쓴다. date 는 **회의 개최일**
// (기준금리 효력 시작일과 다를 수 있다 — 예: 2020-03-16 임시 금통위, 효력 3/17).
// bond-spread-system/scripts/common.py 의 BOK_BASE_RATE 는 효력일 기준이라 목적이 다르다.
// 출처: 한국은행 통화정책방향 결정회의 목록(bok.or.kr) — 수집 2026-08-05, 아래 MPC_MEETINGS_META 참조.
// **2017년 이전은 연 12회(매월), 2017년부터 연 8회 체계**다 — 건수가 연 8건으로 보이면 누락이다.
// 검증 상태(2026-08-05 수집):
//   · 2010~2016 (84건, 연 12건씩): 한은 공식 회의목록에서 직접 확인. 금리변경 13건이 저장소
//     BOK_BASE_RATE 와 전건 일치했고 개최일=효력일이었다. 동결 회의 금리는 직전 변경치 유지로 채움.
//   · 2017~2024: 한은 공식 회의목록에서 직접 확인, 금리변경 8건은 위키백과 이력과 교차 대조.
//   · 2025-07 이후 동결 6건과 2026-07-16 인상: 언론 보도(연속 동결 회차 역산)로 확인 —
//     한은 개별 통방문 대조는 미완.
// 2026-08-27 / 10-22 / 11-26 은 예정일이라 넣지 않았다(개최 후 추가).
export const MPC_MEETINGS_META = {
  source: "한국은행 통화정책방향 결정회의 목록 (bok.or.kr) + 금리변경분 언론 교차확인",
  as_of: "2026-08-05",
  caveat: "2025-07 이후 동결 6건·2026-07-16 인상은 언론 확인분(한은 통방문 개별 대조 미완)",
};
export const MPC_MEETINGS = [
  // { date: 회의 개최일, decision: 인상|인하|동결, rate: 결정 후 기준금리(%), type?: "임시" }
  { date: "2010-01-08", decision: "동결", rate: 2.0 },
  { date: "2010-02-11", decision: "동결", rate: 2.0 },
  { date: "2010-03-11", decision: "동결", rate: 2.0 },
  { date: "2010-04-09", decision: "동결", rate: 2.0 },
  { date: "2010-05-12", decision: "동결", rate: 2.0 },
  { date: "2010-06-10", decision: "동결", rate: 2.0 },
  { date: "2010-07-09", decision: "인상", rate: 2.25 },
  { date: "2010-08-12", decision: "동결", rate: 2.25 },
  { date: "2010-09-09", decision: "동결", rate: 2.25 },
  { date: "2010-10-14", decision: "동결", rate: 2.25 },
  { date: "2010-11-16", decision: "인상", rate: 2.5 },
  { date: "2010-12-09", decision: "동결", rate: 2.5 },
  { date: "2011-01-13", decision: "인상", rate: 2.75 },
  { date: "2011-02-11", decision: "동결", rate: 2.75 },
  { date: "2011-03-10", decision: "인상", rate: 3.0 },
  { date: "2011-04-12", decision: "동결", rate: 3.0 },
  { date: "2011-05-13", decision: "동결", rate: 3.0 },
  { date: "2011-06-10", decision: "인상", rate: 3.25 },
  { date: "2011-07-14", decision: "동결", rate: 3.25 },
  { date: "2011-08-11", decision: "동결", rate: 3.25 },
  { date: "2011-09-08", decision: "동결", rate: 3.25 },
  { date: "2011-10-13", decision: "동결", rate: 3.25 },
  { date: "2011-11-11", decision: "동결", rate: 3.25 },
  { date: "2011-12-08", decision: "동결", rate: 3.25 },
  { date: "2012-01-13", decision: "동결", rate: 3.25 },
  { date: "2012-02-09", decision: "동결", rate: 3.25 },
  { date: "2012-03-08", decision: "동결", rate: 3.25 },
  { date: "2012-04-13", decision: "동결", rate: 3.25 },
  { date: "2012-05-10", decision: "동결", rate: 3.25 },
  { date: "2012-06-08", decision: "동결", rate: 3.25 },
  { date: "2012-07-12", decision: "인하", rate: 3.0 },
  { date: "2012-08-09", decision: "동결", rate: 3.0 },
  { date: "2012-09-13", decision: "동결", rate: 3.0 },
  { date: "2012-10-11", decision: "인하", rate: 2.75 },
  { date: "2012-11-09", decision: "동결", rate: 2.75 },
  { date: "2012-12-13", decision: "동결", rate: 2.75 },
  { date: "2013-01-11", decision: "동결", rate: 2.75 },
  { date: "2013-02-14", decision: "동결", rate: 2.75 },
  { date: "2013-03-14", decision: "동결", rate: 2.75 },
  { date: "2013-04-11", decision: "동결", rate: 2.75 },
  { date: "2013-05-09", decision: "인하", rate: 2.5 },
  { date: "2013-06-13", decision: "동결", rate: 2.5 },
  { date: "2013-07-11", decision: "동결", rate: 2.5 },
  { date: "2013-08-08", decision: "동결", rate: 2.5 },
  { date: "2013-09-12", decision: "동결", rate: 2.5 },
  { date: "2013-10-10", decision: "동결", rate: 2.5 },
  { date: "2013-11-14", decision: "동결", rate: 2.5 },
  { date: "2013-12-12", decision: "동결", rate: 2.5 },
  { date: "2014-01-09", decision: "동결", rate: 2.5 },
  { date: "2014-02-13", decision: "동결", rate: 2.5 },
  { date: "2014-03-13", decision: "동결", rate: 2.5 },
  { date: "2014-04-10", decision: "동결", rate: 2.5 },
  { date: "2014-05-09", decision: "동결", rate: 2.5 },
  { date: "2014-06-12", decision: "동결", rate: 2.5 },
  { date: "2014-07-10", decision: "동결", rate: 2.5 },
  { date: "2014-08-14", decision: "인하", rate: 2.25 },
  { date: "2014-09-12", decision: "동결", rate: 2.25 },
  { date: "2014-10-15", decision: "인하", rate: 2.0 },
  { date: "2014-11-13", decision: "동결", rate: 2.0 },
  { date: "2014-12-11", decision: "동결", rate: 2.0 },
  { date: "2015-01-15", decision: "동결", rate: 2.0 },
  { date: "2015-02-17", decision: "동결", rate: 2.0 },
  { date: "2015-03-12", decision: "인하", rate: 1.75 },
  { date: "2015-04-09", decision: "동결", rate: 1.75 },
  { date: "2015-05-15", decision: "동결", rate: 1.75 },
  { date: "2015-06-11", decision: "인하", rate: 1.5 },
  { date: "2015-07-09", decision: "동결", rate: 1.5 },
  { date: "2015-08-13", decision: "동결", rate: 1.5 },
  { date: "2015-09-11", decision: "동결", rate: 1.5 },
  { date: "2015-10-15", decision: "동결", rate: 1.5 },
  { date: "2015-11-12", decision: "동결", rate: 1.5 },
  { date: "2015-12-10", decision: "동결", rate: 1.5 },
  { date: "2016-01-14", decision: "동결", rate: 1.5 },
  { date: "2016-02-16", decision: "동결", rate: 1.5 },
  { date: "2016-03-10", decision: "동결", rate: 1.5 },
  { date: "2016-04-19", decision: "동결", rate: 1.5 },
  { date: "2016-05-13", decision: "동결", rate: 1.5 },
  { date: "2016-06-09", decision: "인하", rate: 1.25 },
  { date: "2016-07-14", decision: "동결", rate: 1.25 },
  { date: "2016-08-11", decision: "동결", rate: 1.25 },
  { date: "2016-09-09", decision: "동결", rate: 1.25 },
  { date: "2016-10-13", decision: "동결", rate: 1.25 },
  { date: "2016-11-11", decision: "동결", rate: 1.25 },
  { date: "2016-12-15", decision: "동결", rate: 1.25 },
  { date: "2017-01-13", decision: "동결", rate: 1.25 },
  { date: "2017-02-23", decision: "동결", rate: 1.25 },
  { date: "2017-04-13", decision: "동결", rate: 1.25 },
  { date: "2017-05-25", decision: "동결", rate: 1.25 },
  { date: "2017-07-13", decision: "동결", rate: 1.25 },
  { date: "2017-08-31", decision: "동결", rate: 1.25 },
  { date: "2017-10-19", decision: "동결", rate: 1.25 },
  { date: "2017-11-30", decision: "인상", rate: 1.50 },
  { date: "2018-01-18", decision: "동결", rate: 1.50 },
  { date: "2018-02-27", decision: "동결", rate: 1.50 },
  { date: "2018-04-12", decision: "동결", rate: 1.50 },
  { date: "2018-05-24", decision: "동결", rate: 1.50 },
  { date: "2018-07-12", decision: "동결", rate: 1.50 },
  { date: "2018-08-31", decision: "동결", rate: 1.50 },
  { date: "2018-10-18", decision: "동결", rate: 1.50 },
  { date: "2018-11-30", decision: "인상", rate: 1.75 },
  { date: "2019-01-24", decision: "동결", rate: 1.75 },
  { date: "2019-02-28", decision: "동결", rate: 1.75 },
  { date: "2019-04-18", decision: "동결", rate: 1.75 },
  { date: "2019-05-31", decision: "동결", rate: 1.75 },
  { date: "2019-07-18", decision: "인하", rate: 1.50 },
  { date: "2019-08-30", decision: "동결", rate: 1.50 },
  { date: "2019-10-16", decision: "인하", rate: 1.25 },
  { date: "2019-11-29", decision: "동결", rate: 1.25 },
  { date: "2020-01-17", decision: "동결", rate: 1.25 },
  { date: "2020-02-27", decision: "동결", rate: 1.25 },
  { date: "2020-03-16", decision: "인하", rate: 0.75, type: "임시" }, // 효력 3/17 — 여기는 회의 개최일 기준
  { date: "2020-04-09", decision: "동결", rate: 0.75 },
  { date: "2020-05-28", decision: "인하", rate: 0.50 },
  { date: "2020-07-16", decision: "동결", rate: 0.50 },
  { date: "2020-08-27", decision: "동결", rate: 0.50 },
  { date: "2020-10-14", decision: "동결", rate: 0.50 },
  { date: "2020-11-26", decision: "동결", rate: 0.50 },
  { date: "2021-01-15", decision: "동결", rate: 0.50 },
  { date: "2021-02-25", decision: "동결", rate: 0.50 },
  { date: "2021-04-15", decision: "동결", rate: 0.50 },
  { date: "2021-05-27", decision: "동결", rate: 0.50 },
  { date: "2021-07-15", decision: "동결", rate: 0.50 },
  { date: "2021-08-26", decision: "인상", rate: 0.75 },
  { date: "2021-10-12", decision: "동결", rate: 0.75 },
  { date: "2021-11-25", decision: "인상", rate: 1.00 },
  { date: "2022-01-14", decision: "인상", rate: 1.25 },
  { date: "2022-02-24", decision: "동결", rate: 1.25 },
  { date: "2022-04-14", decision: "인상", rate: 1.50 },
  { date: "2022-05-26", decision: "인상", rate: 1.75 },
  { date: "2022-07-13", decision: "인상", rate: 2.25 },
  { date: "2022-08-25", decision: "인상", rate: 2.50 },
  { date: "2022-10-12", decision: "인상", rate: 3.00 },
  { date: "2022-11-24", decision: "인상", rate: 3.25 },
  { date: "2023-01-13", decision: "인상", rate: 3.50 },
  { date: "2023-02-23", decision: "동결", rate: 3.50 },
  { date: "2023-04-11", decision: "동결", rate: 3.50 },
  { date: "2023-05-25", decision: "동결", rate: 3.50 },
  { date: "2023-07-13", decision: "동결", rate: 3.50 },
  { date: "2023-08-24", decision: "동결", rate: 3.50 },
  { date: "2023-10-19", decision: "동결", rate: 3.50 },
  { date: "2023-11-30", decision: "동결", rate: 3.50 },
  { date: "2024-01-11", decision: "동결", rate: 3.50 },
  { date: "2024-02-22", decision: "동결", rate: 3.50 },
  { date: "2024-04-12", decision: "동결", rate: 3.50 },
  { date: "2024-05-23", decision: "동결", rate: 3.50 },
  { date: "2024-07-11", decision: "동결", rate: 3.50 },
  { date: "2024-08-22", decision: "동결", rate: 3.50 },
  { date: "2024-10-11", decision: "인하", rate: 3.25 },
  { date: "2024-11-28", decision: "인하", rate: 3.00 },
  { date: "2025-01-16", decision: "동결", rate: 3.00 },
  { date: "2025-02-25", decision: "인하", rate: 2.75 },
  { date: "2025-04-17", decision: "동결", rate: 2.75 },
  { date: "2025-05-29", decision: "인하", rate: 2.50 },
  { date: "2025-07-10", decision: "동결", rate: 2.50 },
  { date: "2025-08-28", decision: "동결", rate: 2.50 },
  { date: "2025-10-23", decision: "동결", rate: 2.50 },
  { date: "2025-11-27", decision: "동결", rate: 2.50 },
  { date: "2026-01-15", decision: "동결", rate: 2.50 },
  { date: "2026-02-26", decision: "동결", rate: 2.50 },
  { date: "2026-04-10", decision: "동결", rate: 2.50 },
  { date: "2026-05-28", decision: "동결", rate: 2.50 },
  { date: "2026-07-16", decision: "인상", rate: 2.75 },
];

// 국면별 누적순매수 분석 대상 — 정책 방향이 바뀐 국면만(동결기 제외).
// 구간은 "첫 정책변경 회의의 LEAD_MONTHS 개월 전 ~ 마지막 정책변경 회의"로 잡는다.
// 국면 목록은 하드코딩하지 않고 위 MPC_MEETINGS 에서 파생한다(app.js policyCycles) —
// 같은 방향 정책변경이 이어지는 동안이 한 사이클, 반대 방향이 나오면 종료. 회의만 추가하면 국면이 따라온다.
export const REGIME_FLOW_LEAD_MONTHS = 3;
export const REGIME_FLOW_POLICIES = ["인상", "인하"];

// 같은 방향이어도 정책변경 사이가 이 개월 수를 **초과**해 벌어지면 별개 사이클로 끊는다.
// 12로 잡은 근거(2026-08-05 실측): 사이클 내부 공백이 가장 컸던 것이 인상기(17.11~18.11)의
// 2017-11-30 → 2018-11-30 = 정확히 12개월이라 이건 유지해야 하고, 끊어야 할 구간은
// 2013-05-09 → 2014-08-14 = 15개월이다. 두 값 사이에서 "12개월 초과"가 유일하게 둘 다 만족한다.
// (이 값을 13 이상으로 올리면 15개월 구간이 다시 붙고, 12 미만으로 내리면 17~18 인상기가 쪼개진다.)
export const REGIME_FLOW_GAP_MONTHS = 12;

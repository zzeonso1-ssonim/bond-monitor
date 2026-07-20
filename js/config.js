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

// 이종커브 — 크레딧 단기물 vs 국고 3년 (만기 이종 수익률차, bp). 채권 투자심리 지표.
export const XCURVE_DEFS = [
  { label: "은행채 AAA 2년 − 국고 3년", a: "은행채 AAA 2년", b: "국고채 3년", slot: 1 },
  { label: "여전채 AA- 2년 − 국고 3년", a: "여전채 AA- 2년", b: "국고채 3년", slot: 3 },
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
  { symbol: "UST10Y", name: "미국채 10Y", digits: 3, unit: "%" },
];

// 카테고리 색상 슬롯(고정 순서 — 필터와 무관하게 지표당 고정)
export const SLOT_VARS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6"];

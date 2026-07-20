// Supabase REST(PostgREST) 읽기 헬퍼 — 페이지네이션 포함
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
const PAGE = 1000; // PostgREST 기본 max-rows 안전값

async function fetchPaged(path) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...HEADERS, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${path}`);
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

// web_meta 화면 구성 메타 (key='bond-monitor', 파이프라인 specs.py 가 단일 소스)
// 테이블 미생성(404)·행 없음·네트워크 오류 시 null 반환 → 호출부가 config.js 폴백 사용
export async function loadWebMeta() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/web_meta?select=payload&key=eq.bond-monitor`, { headers: HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.payload ?? null;
  } catch {
    return null;
  }
}

// bond_spread_daily 전체(2025-05-30~) → Map(label -> [{d, y, bp}] 날짜 오름차순)
export async function loadSpreadSeries() {
  const rows = await fetchPaged(
    "bond_spread_daily?select=trade_date,label,yield,vs_govt_bp&order=trade_date.asc,label.asc"
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.label)) map.set(r.label, []);
    map.get(r.label).push({ d: r.trade_date, y: r.yield, bp: r.vs_govt_bp });
  }
  return map;
}

// market_daily 최근 시세 → Map(symbol -> rows[날짜 내림차순])
export async function loadMarket() {
  // 최근 15일 범위 — 22개 심볼 전체의 전일·1주 계산에 충분 (페이지네이션은 fetchPaged 가 처리)
  const from = new Date(Date.now() - 15 * 86400 * 1000).toISOString().slice(0, 10);
  const rows = await fetchPaged(
    `market_daily?select=trade_date,symbol,value&trade_date=gte.${from}&order=trade_date.desc`
  );
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.symbol)) by.set(r.symbol, []);
    by.get(r.symbol).push(r); // 내림차순
  }
  return by;
}

// 최근 N일 범위 조회 공통 — 실패·테이블 미생성 시 빈 배열 (콘솔 에러 없이 폴백)
async function fetchRecentSafe(path) {
  try {
    return await fetchPaged(path);
  } catch {
    return [];
  }
}
const sinceISO = (days) => new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);

// KRX 국채선물 일별 (근월물 판별은 화면에서 volume 기준)
export function loadKrxFutures(days = 30) {
  return fetchRecentSafe(
    "krx_futures_daily?select=trade_date,isu_cd,isu_nm,prod,close_price,change,settle,open_int,volume" +
      `&trade_date=gte.${sinceISO(days)}&order=trade_date.asc`
  );
}

// KRX 장내 국고채 일별 (지표물·물가채 포함)
export function loadKrxGovt(days = 30) {
  return fetchRecentSafe(
    "krx_govt_daily?select=trade_date,isu_cd,isu_nm,tenor,bench_type,is_inflation,close_yield,volume" +
      `&trade_date=gte.${sinceISO(days)}&order=trade_date.asc`
  );
}

// KRX 일반채권시장 전 종목 일별 (회사채·여전채 체결)
export function loadKrxCorp(days = 10) {
  return fetchRecentSafe(
    "krx_corp_daily?select=trade_date,isu_cd,isu_nm,close_yield,high_yield,low_yield,close_price,volume,value" +
      `&trade_date=gte.${sinceISO(days)}&order=trade_date.asc`
  );
}

// KOFIA 투자자별 거래현황(수급동향, 억원) — 테이블 미생성·미적재 시 빈 배열
export function loadInvestorFlows(days = 95) {
  return fetchRecentSafe(
    "kofia_investor_flows?select=trade_date,trade_type,bond_class,total,brokered,bank," +
      "amc_public,amc_private,futures_co,insurance,merchant_mutual,fund_pension," +
      "foreigner,government,other_corp,individual" +
      `&trade_date=gte.${sinceISO(days)}&order=trade_date.asc`
  );
}

// KOFIA 발행·만기 통계(억원) — 최근 8주 + 만기 예정(미래 3주). 테이블 미생성 시 빈 배열
export function loadIssueStats() {
  const from = sinceISO(56);
  const to = new Date(Date.now() + 21 * 86400 * 1000).toISOString().slice(0, 10);
  return fetchRecentSafe(
    "kofia_issue_stats?select=stat_date,bond_class,issued,redeemed,net,outstanding,matured" +
      `&stat_date=gte.${from}&stat_date=lte.${to}&order=stat_date.asc`
  );
}

// 외국인 국채선물 일별 순매수(계약) — market_daily 심볼 KTB3F_FRG(3년)/KTB10F_FRG(10년), 연초부터
// 소스: KRX 정보데이터시스템 통계(로그인 세션 필요) → 수집 절차는 bond-spread-system WORKLOG 참조
export function loadFuturesForeign() {
  const jan1 = `${new Date().getFullYear()}-01-01`;
  return fetchRecentSafe(
    "market_daily?select=trade_date,symbol,value&symbol=in.(KTB3F_FRG,KTB10F_FRG)" +
      `&trade_date=gte.${jan1}&order=trade_date.asc`
  );
}

// DART 채무증권 발행 공시 (rcept_dt 내림차순) — 테이블이 비어 있으면 빈 배열
export function loadDartOfferings(days = 90) {
  return fetchRecentSafe(
    "dart_offerings?select=rcept_no,corp_name,corp_cls,report_nm,rcept_dt,url" +
      `&rcept_dt=gte.${sinceISO(days).replace(/-/g, "")}&order=rcept_dt.desc`
  );
}

// DART 신고서 파싱 결과 — 회차별 발행조건 (테이블 미생성·미적재 시 빈 배열)
export function loadDartDetails(days = 90) {
  return fetchRecentSafe(
    "dart_offering_details?select=rcept_no,tranche,corp_name,rcept_dt,amount,coupon," +
      "maturity_date,sub_date,pay_date,demand_date,band,rating,underwriters" +
      `&rcept_dt=gte.${sinceISO(days)}&order=rcept_dt.desc,rcept_no.desc,tranche.asc`
  );
}

// bond_regime_stats → kind별 Map(label -> rows[bucket_order 오름차순])
export async function loadRegimeStats() {
  const rows = await fetchPaged(
    "bond_regime_stats?select=kind,label,label_order,bucket,bucket_type,bucket_order," +
      "avg_bp,hi_bp,lo_bp,avg_yield,pctile,regime_start,regime_end,policy,asof" +
      "&order=label_order.asc,bucket_order.asc"
  );
  const out = { regime: new Map(), rv: new Map(), xcurve: new Map() };
  for (const r of rows) {
    const bucketMap = out[r.kind];
    if (!bucketMap) continue;
    if (!bucketMap.has(r.label)) bucketMap.set(r.label, []);
    bucketMap.get(r.label).push(r);
  }
  return out;
}

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

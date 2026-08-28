// 본드모니터 — 화면 로직 (순수 바닐라 ES 모듈, 외부 의존 없음)
import {
  MONITOR_GROUPS, MATRIX_GROUPS, XCURVE_DEFS, RV_DEFS,
  REGIME_LABELS, MARKET_SYMBOLS, MARKET_TABLE, SLOT_VARS,
  FLOW_INVESTORS, FLOW_CLASSES,
  MPC_MEETINGS, MPC_MEETINGS_META, REGIME_FLOW_LEAD_MONTHS, REGIME_FLOW_POLICIES,
  REGIME_FLOW_GAP_MONTHS,
} from "./config.js";
import {
  loadSpreadSeries, loadMarket, loadRegimeStats, loadWebMeta,
  loadKrxFutures, loadDartOfferings, loadDartDetails,
  loadInvestorFlows, loadFuturesForeign, loadFuturesForeignRange,
  loadIssueStats, loadIssueMonthly,
} from "./api.js";
import { lineChart, regimeRangeChart, dualLineChart, dualSpreadChart, barChart } from "./charts.js";
import { downloadWeeklyReportPdf } from "./report-pdf.js";

const $ = (sel, root = document) => root.querySelector(sel);

// 전역 상태 — 로드된 데이터
const S = {
  series: new Map(), market: new Map(),
  stats: { regime: new Map(), rv: new Map(), xcurve: new Map() },
  futures: [], dart: [], dartDetails: [], flows: [], futFrg: [], issue: [], issueMonthly: [],
  regimeFrg: new Map(),        // 국면 bucket → 그 구간 외국인 선물 순매수 행 (lazy 캐시)
  asof: "",
};

/* ══ 화면 구성 해석 계층 — 단일 소스: Supabase web_meta(specs.py), 없으면 config.js 폴백 ══ */
// 모든 화면은 CFG 만 참조한다 — 지표 추가 시 웹 코드 수정 불필요
let CFG = null;

// 라벨 끝의 만기(년) 파싱: "특수채 AAA 5년" → 5
function parseMat(label) {
  const m = /(\d+)년$/.exec(label || "");
  return m ? +m[1] : null;
}

// 심리지표 색 슬롯 — 메타에 색 정보가 없으므로 인덱스 기반 자동 배정
function xcurveVar(i) {
  if (i === 0) return "--series-1";
  if (i === 1) return "--series-2";
  if (i === 2) return "--series-6";
  return SLOT_VARS[i % SLOT_VARS.length];
}

// web_meta payload → 화면 구성 객체 (필드별로 메타 우선, 비면 config.js 폴백)
export function resolveConfig(meta) {
  const m = meta || {};

  const monitorGroups = Array.isArray(m.monitor_groups) && m.monitor_groups.length
    ? m.monitor_groups : MONITOR_GROUPS;

  // 매트릭스 — 메타는 {sector, labels}, 폴백은 {sector, labelPrefix, mats} → {sector, cells:[{label, mat}]} 로 정규화
  const rawMatrix = Array.isArray(m.matrix_groups) && m.matrix_groups.length
    ? m.matrix_groups
    : MATRIX_GROUPS.map((g) => ({ sector: g.sector, labels: g.mats.map((mt) => `${g.labelPrefix} ${mt}년`) }));
  const matrixGroups = rawMatrix.map((g) => ({
    sector: g.sector,
    cells: (g.labels || []).map((l) => ({ label: l, mat: parseMat(l) })).filter((c) => c.mat != null),
  }));
  // 열 = 전체 그룹 만기의 합집합 (그룹별 labels 길이가 달라도 동작)
  const matSet = new Set();
  for (const g of matrixGroups) for (const c of g.cells) matSet.add(c.mat);
  const matrixMats = [...matSet].sort((a, b) => a - b);

  const xcurveDefs = (Array.isArray(m.xcurve_defs) && m.xcurve_defs.length ? m.xcurve_defs : XCURVE_DEFS)
    .map((d, i) => ({ label: d.label, a: d.a, b: d.b, cssVar: xcurveVar(i) }));

  const rvGroups = Array.isArray(m.rv_groups) && m.rv_groups.length ? m.rv_groups : RV_DEFS;

  const regimeLabels = Array.isArray(m.regime_labels) && m.regime_labels.length
    ? m.regime_labels : REGIME_LABELS;

  // 시장지표 — 메타는 {name, items}, 폴백은 {group, items} → name 으로 통일
  const marketGroups = (Array.isArray(m.market_groups) && m.market_groups.length ? m.market_groups : MARKET_TABLE)
    .map((g) => ({ name: g.name ?? g.group, items: g.items || [] }));

  return { monitorGroups, matrixGroups, matrixMats, xcurveDefs, rvGroups, regimeLabels, marketGroups };
}

// 메타 적용 + 전 화면 렌더 (재호출 안전 — 뷰는 innerHTML 로 재구성됨)
export function applyMeta(meta) {
  CFG = resolveConfig(meta);
  GOVT_SET = new Set(CFG.monitorGroups.filter((g) => g.govt).flatMap((g) => g.labels || []));
  renderMonitor();
  renderMatrix();
  renderXcurve();
  renderRv();
  renderRegime();
  renderIssue();
  renderOfferings();
  renderFlows();
}

/* ══ 테마 토글: 없음(시스템) → dark → light 순환, localStorage 유지 ══ */
(function initTheme() {
  const saved = localStorage.getItem("bsm-theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  $("#themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur == null ? "dark" : cur === "dark" ? "light" : null;
    if (next) {
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("bsm-theme", next);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("bsm-theme");
    }
  });
})();

/* ══ 탭 전환 ══ */
$("#tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t === btn);
  for (const v of document.querySelectorAll(".view")) v.classList.toggle("active", v.id === `view-${btn.dataset.view}`);
});

/* ══ PDF — 버튼은 최신 데이터로 주간 2쪽 파일 직다운로드. Ctrl+P는 현재 탭 인쇄 유지 ══ */
(function initPdf() {
  let saved = null, forced = false;
  window.addEventListener("beforeprint", () => {
    const active = document.querySelector(".tab.active");
    $("#printHeader").textContent =
      `본드모니터 — ${active ? active.textContent : ""}${S.asof ? ` · 기준일 ${S.asof}` : ""}`;
    saved = document.documentElement.getAttribute("data-theme");
    forced = true;
    document.documentElement.setAttribute("data-theme", "light");
  });
  window.addEventListener("afterprint", () => {
    if (!forced) return;
    forced = false;
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    else document.documentElement.removeAttribute("data-theme");
  });
  $("#pdfBtn").addEventListener("click", async () => {
    const btn = $("#pdfBtn");
    if (btn.disabled) return;
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "PDF 생성 중…";
    try {
      await downloadWeeklyReportPdf(S);
    } catch (err) {
      console.error(err);
      alert(`PDF 생성 실패: ${err.message}`);
    } finally {
      btn.textContent = old;
      btn.disabled = false;
    }
  });
})();

/* ══ 데이터 파생 유틸 ══ */
function seriesOf(label) { return S.series.get(label) || []; }
const yPoints = (arr) => arr.filter((p) => p.y != null).map((p) => ({ d: p.d, v: p.y }));
const bpPoints = (arr) => arr.filter((p) => p.bp != null).map((p) => ({ d: p.d, v: p.bp }));
const marketPoints = (symbol) => [...(S.market.get(symbol) || [])]
  .reverse()
  .filter((r) => r.value != null)
  .map((r) => ({ d: r.trade_date, v: r.value }));

// 두 라벨의 수익률차 시계열 ×100 (bp) — 교집합 날짜만
function diffPoints(aLabel, bLabel) {
  const b = new Map(seriesOf(bLabel).filter((p) => p.y != null).map((p) => [p.d, p.y]));
  const out = [];
  for (const p of seriesOf(aLabel)) {
    if (p.y != null && b.has(p.d)) out.push({ d: p.d, v: (p.y - b.get(p.d)) * 100 });
  }
  return out;
}

// 두 시장금리 심볼의 차이 ×100 (bp) — 교집합 날짜만
function marketDiffPoints(aSymbol, bSymbol) {
  const b = new Map(marketPoints(bSymbol).map((p) => [p.d, p.v]));
  return marketPoints(aSymbol)
    .filter((p) => b.has(p.d))
    .map((p) => ({ d: p.d, v: (p.v - b.get(p.d)) * 100 }));
}

function addDaysISO(iso, days) {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function addMonthsISO(iso, months) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
  const dt = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}
// iso 이하 가장 가까운 날짜의 포인트
function pointOnOrBefore(pts, iso) {
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].d <= iso) return pts[i];
  return null;
}
// 최근 1년 구간
function lastYear(pts) {
  if (!pts.length) return pts;
  const cutoff = addDaysISO(pts[pts.length - 1].d, -365);
  return pts.filter((p) => p.d >= cutoff);
}

// 변화 계산 — 기준일(시리즈 마지막)에서 직전 영업일 / 7일 전 이하 / 1개월 전 이하 / 당해 첫 영업일 대비
function calcChanges(pts) {
  if (!pts.length) return { cur: null, d1: null, w1: null, m1: null, ytd: null };
  const last = pts[pts.length - 1];
  const prev = pts.length > 1 ? pts[pts.length - 2] : null;
  const wk = pointOnOrBefore(pts, addDaysISO(last.d, -7));
  const mo = pointOnOrBefore(pts, addMonthsISO(last.d, -1));
  const y0 = pts.find((p) => p.d >= `${last.d.slice(0, 4)}-01-01`) || null;
  const diff = (p) => (p && p.d !== last.d ? last.v - p.v : null);
  return { cur: last.v, d1: prev ? last.v - prev.v : null, w1: diff(wk), m1: diff(mo), ytd: diff(y0) };
}

/* ══ 포맷 유틸 ══ */
const fmt = (v, digits = 1) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(digits));
function fmtSigned(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return "—";
  if (v > 0) return `+${v.toFixed(digits)}`;
  if (v < 0) return `−${Math.abs(v).toFixed(digits)}`;
  return (0).toFixed(digits);
}
function numTd(v, { digits = 1, signed = false } = {}) {
  const td = document.createElement("td");
  td.textContent = signed ? fmtSigned(v, digits) : fmt(v, digits);
  if (signed && v != null && !Number.isNaN(v)) {
    if (v > 0) td.className = "pos";
    else if (v < 0) td.className = "neg";
  }
  return td;
}
function dashTd() {
  const td = document.createElement("td");
  td.textContent = "—";
  return td;
}
// 색 있는 변화 스팬 (타일 보조 텍스트용)
function deltaSpan(v, digits = 1) {
  const sp = document.createElement("span");
  sp.textContent = fmtSigned(v, digits);
  if (v != null && v > 0) sp.className = "delta-up";
  else if (v != null && v < 0) sp.className = "delta-dn";
  return sp;
}

/* ══════════════ 일간 모니터링 ══════════════ */
let GOVT_SET = new Set(); // applyMeta 에서 CFG.monitorGroups 기준으로 재계산
// a/b: "두 지표 차이" 모드의 선택 라벨 2개 (B − A = 나중 클릭 − 먼저 클릭)
const mon = { label: null, govt: false, mode: "y", a: null, b: null };

function renderMonitor() {
  // 재렌더 대비 상태 초기화
  mon.mode = "y";
  mon.a = mon.b = null;
  const root = $("#view-monitor");
  root.innerHTML = `
    <div class="tile-row" id="mon-tiles"></div>
    <div class="card">
      <div class="card-head">
        <h2>미국 국채 2Y · 10Y 금리와 스프레드</h2>
        <span class="hint" id="ust-hint">최근 1년 · 공통 거래일 기준</span>
      </div>
      <div id="ust-chart"></div>
    </div>
    <details class="mkt-details">
      <summary>시장지표 (환율·지수·해외금리·상품)</summary>
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th>지표</th><th>종가</th><th>전일비</th><th>주간변동</th></tr></thead>
          <tbody id="mon-mkt-body"></tbody>
        </table>
      </div>
    </details>
    <div class="card">
      <div class="card-head">
        <h2 id="mon-title"></h2><span class="hint" id="mon-hint">최근 1년</span><span class="spacer"></span>
        <div class="seg" id="mon-seg">
          <button data-mode="y" class="active">수익률</button>
          <button data-mode="bp">스프레드</button>
          <button data-mode="diff">두 지표 차이</button>
        </div>
      </div>
      <div id="mon-chart"></div>
    </div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr>
          <th>지표</th><th>수익률(%)</th><th>전일(bp)</th>
          <th>스프레드(bp)</th><th>전일(bp)</th><th>1주(bp)</th><th>1개월(bp)</th><th>YTD(bp)</th>
        </tr></thead>
        <tbody id="mon-body"></tbody>
      </table>
    </div>
    <div class="section-title">국면별 분석</div>
    <div id="mon-regime"></div>`;

  // 시장지표 스탯 타일 — market_daily 최신값 + 전일비
  const tiles = $("#mon-tiles", root);
  for (const ms of MARKET_SYMBOLS) {
    const rows = S.market.get(ms.symbol) || []; // 날짜 내림차순
    const cur = rows[0]?.value ?? null;
    const prev = rows[1]?.value ?? null;
    const tile = document.createElement("div");
    tile.className = "tile";
    const lab = document.createElement("div");
    lab.className = "t-label";
    lab.textContent = ms.name;
    const val = document.createElement("div");
    val.className = "t-value";
    val.textContent = cur == null ? "—"
      : cur.toLocaleString("ko-KR", { minimumFractionDigits: ms.digits, maximumFractionDigits: ms.digits });
    if (cur != null && ms.unit) {
      const u = document.createElement("span");
      u.className = "unit";
      u.textContent = ms.unit;
      val.appendChild(u);
    }
    const del = document.createElement("div");
    del.className = "t-delta";
    del.append("전일 ", deltaSpan(cur != null && prev != null ? cur - prev : null, ms.digits));
    tile.append(lab, val, del);
    tiles.appendChild(tile);
  }

  // 시장지표 접이식 표 — 전 심볼 종가·전일비·주간변동률
  buildMarketTable($("#mon-mkt-body", root));
  renderUsTreasuryChart(root);

  // 지표 요약 표 — 그룹·순서·govt 판정 모두 CFG 기반
  const body = $("#mon-body", root);
  for (const g of CFG.monitorGroups) {
    const gr = document.createElement("tr");
    gr.className = "group-row";
    const gtd = document.createElement("td");
    gtd.colSpan = 8;
    gtd.textContent = g.name;
    gr.appendChild(gtd);
    body.appendChild(gr);

    for (const label of g.labels || []) {
      const arr = seriesOf(label);
      const yc = calcChanges(yPoints(arr));
      const tr = document.createElement("tr");
      tr.className = "sel-row";
      tr.dataset.label = label;
      tr.dataset.govt = g.govt ? "1" : "";
      const name = document.createElement("td");
      name.textContent = label;
      tr.appendChild(name);
      tr.appendChild(numTd(yc.cur, { digits: 3 }));
      tr.appendChild(numTd(yc.d1 == null ? null : yc.d1 * 100, { signed: true }));
      if (g.govt) {
        // 국고·통안은 스프레드 기준 자체(=0) — 스프레드 열은 표시하지 않음
        for (let i = 0; i < 5; i++) tr.appendChild(dashTd());
      } else {
        const bc = calcChanges(bpPoints(arr));
        tr.appendChild(numTd(bc.cur));
        tr.appendChild(numTd(bc.d1, { signed: true }));
        tr.appendChild(numTd(bc.w1, { signed: true }));
        tr.appendChild(numTd(bc.m1, { signed: true }));
        tr.appendChild(numTd(bc.ytd, { signed: true }));
      }
      body.appendChild(tr);
    }
  }

  // 행 클릭 → 카드 차트 (두 지표 차이 모드는 2개 선택)
  body.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.sel-row");
    if (!tr) return;
    if (mon.mode === "diff") pickDiffRow(tr.dataset.label);
    else selectMonitor(tr.dataset.label, tr.dataset.govt === "1");
  });

  // 세그먼트 토글 (수익률|스프레드|두 지표 차이)
  $("#mon-seg", root).addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled || btn.dataset.mode === mon.mode) return;
    mon.mode = btn.dataset.mode;
    for (const b of $("#mon-seg").querySelectorAll("button")) b.classList.toggle("active", b === btn);
    if (mon.mode === "diff") {
      // 진입 시 현재 선택 행을 A 로 승계, B 는 새로 클릭
      mon.a = mon.label;
      mon.b = null;
      $('#mon-seg button[data-mode="bp"]').disabled = false;
      updateMonitorHighlights();
      updateMonitorChart();
    } else {
      // 단일 모드 복귀 — 마지막 클릭 행 하나
      const last = mon.b ?? mon.a ?? mon.label;
      selectMonitor(last, GOVT_SET.has(last));
    }
  });

  // 기본 선택: 첫 지표
  const first = CFG.monitorGroups.find((g) => g.labels?.length);
  if (first) selectMonitor(first.labels[0], !!first.govt);
}

function renderUsTreasuryChart(root) {
  const p2 = marketPoints("UST2Y");
  const p10 = marketPoints("UST10Y");
  const spread = marketDiffPoints("UST10Y", "UST2Y");
  const commonDates = new Set(spread.map((p) => p.d));
  const common2 = p2.filter((p) => commonDates.has(p.d));
  const common10 = p10.filter((p) => commonDates.has(p.d));
  const commonAsOf = spread[spread.length - 1]?.d ?? "—";

  $("#ust-hint", root).textContent = `최근 1년 · 공통 기준일 ${commonAsOf}`;
  dualSpreadChart($("#ust-chart", root), {
    a: { name: "미국채 2Y (좌, %)", points: common2 },
    b: { name: "미국채 10Y (좌, %)", points: common10 },
    spread: { name: "10Y−2Y (우, bp)", points: spread },
  });
}

// 시장지표 표 — 전일비는 절대변화(금리는 %p), 주간변동률은 (현재/1주전−1)×100 %, 금리만 주간도 %p 절대변화
function buildMarketTable(body) {
  for (const g of CFG.marketGroups) {
    const gr = document.createElement("tr");
    gr.className = "group-row";
    const gtd = document.createElement("td");
    gtd.colSpan = 4;
    gtd.textContent = g.name;
    gr.appendChild(gtd);
    body.appendChild(gr);

    for (const it of g.items) {
      const rows = S.market.get(it.symbol) || []; // 날짜 내림차순
      const cur = rows[0] ?? null;
      const prev = rows[1] ?? null;
      // 1주전 — 기준일 7일 전 이하 가장 가까운 날
      let wk = null;
      if (cur) {
        const cutoff = addDaysISO(cur.trade_date, -7);
        wk = rows.find((r) => r.trade_date <= cutoff) ?? null;
      }
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = it.name;
      tr.appendChild(name);
      const vtd = document.createElement("td");
      vtd.textContent = cur == null ? "—"
        : cur.value.toLocaleString("ko-KR", { minimumFractionDigits: it.digits, maximumFractionDigits: it.digits });
      tr.appendChild(vtd);
      tr.appendChild(numTd(cur != null && prev != null ? cur.value - prev.value : null, { digits: it.digits, signed: true }));
      // 주간: 금리는 %p 절대변화, 나머지는 변동률(%)
      const wkVal = cur != null && wk != null
        ? (it.rate ? cur.value - wk.value : (cur.value / wk.value - 1) * 100)
        : null;
      tr.appendChild(numTd(wkVal, { digits: it.rate ? it.digits : 2, signed: true }));
      body.appendChild(tr);
    }
  }
}

function selectMonitor(label, govt) {
  mon.label = label;
  mon.govt = govt;
  if (govt && mon.mode === "bp") mon.mode = "y"; // 국고·통안은 수익률만
  $('#mon-seg button[data-mode="bp"]').disabled = govt;
  for (const b of $("#mon-seg").querySelectorAll("button")) b.classList.toggle("active", b.dataset.mode === mon.mode);
  updateMonitorHighlights();
  updateMonitorChart();
}

// 두 지표 차이 모드 — 행 2개 선택, 세 번째 클릭부터는 최근 2개 유지(B → A 로 밀림)
function pickDiffRow(label) {
  if (mon.b == null) {
    if (label === mon.a) return;
    if (mon.a == null) mon.a = label;
    else mon.b = label;
  } else {
    if (label === mon.b) return;
    mon.a = mon.b;
    mon.b = label;
  }
  updateMonitorHighlights();
  updateMonitorChart();
}

// 표 행 하이라이트 — 단일 모드: 선택 1행 / 차이 모드: A·B 2행(뱃지 포함)
function updateMonitorHighlights() {
  for (const tr of document.querySelectorAll("#mon-body tr.sel-row")) {
    tr.classList.remove("selected", "sel-b");
    const old = tr.querySelector(".ab-badge");
    if (old) old.remove();
    const l = tr.dataset.label;
    if (mon.mode === "diff") {
      if (l !== mon.a && l !== mon.b) continue;
      tr.classList.add("selected");
      if (l === mon.b) tr.classList.add("sel-b");
      const badge = document.createElement("span");
      badge.className = "ab-badge" + (l === mon.b ? " b" : "");
      badge.textContent = l === mon.a ? "A" : "B";
      tr.cells[0].appendChild(badge);
    } else if (l === mon.label) {
      tr.classList.add("selected");
    }
  }
}

function updateMonitorChart() {
  const hint = $("#mon-hint");
  if (mon.mode === "diff") {
    hint.textContent = "행 두 개를 차례로 클릭하세요 · 최근 1년";
    const box = $("#mon-chart");
    if (!mon.a || !mon.b) {
      $("#mon-title").textContent = "두 지표 차이 (bp)";
      box.textContent = "";
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "행 두 개를 차례로 클릭하세요";
      box.appendChild(p);
      return;
    }
    // 채권 리서치 관례 이축 차트 — 좌축: A·B 금리(%), 우축: 스프레드 B−A(bp) 영역형
    $("#mon-title").textContent = `${mon.b} − ${mon.a} (bp)`;
    dualSpreadChart(box, {
      a: { name: mon.a, points: lastYear(yPoints(seriesOf(mon.a))) },
      b: { name: mon.b, points: lastYear(yPoints(seriesOf(mon.b))) },
      spread: { name: "스프레드(우, bp)", points: lastYear(diffPoints(mon.b, mon.a)) },
    });
    return;
  }
  hint.textContent = "최근 1년";
  const isY = mon.mode === "y";
  $("#mon-title").textContent = `${mon.label} ${isY ? "수익률(%)" : "스프레드(bp)"}`;
  const arr = seriesOf(mon.label);
  const pts = lastYear(isY ? yPoints(arr) : bpPoints(arr));
  lineChart($("#mon-chart"), [{ name: mon.label, cssVar: SLOT_VARS[0], points: pts }],
    isY ? { unit: "%", digits: 3, showLegend: true } : { unit: "bp", digits: 1, showLegend: true });
}

/* ══════════════ 섹터 매트릭스 ══════════════ */
function renderMatrix() {
  const root = $("#view-matrix");
  root.innerHTML = `
    <p class="section-sub" id="mx-caption"></p>
    <div class="card">
      <div class="card-head"><h2 id="mx-title">셀을 클릭하면 추이가 표시됩니다</h2><span class="hint">최근 1년, 스프레드(bp)</span></div>
      <div id="mx-chart"></div>
    </div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr id="mx-head"></tr></thead>
        <tbody id="mx-body"></tbody>
      </table>
    </div>`;

  $("#mx-caption", root).textContent =
    `기준일 ${S.asof || "—"} · 국고채 동일만기 대비, bp · 괄호는 전주비(5영업일 전 대비)`;

  const head = $("#mx-head", root);
  const th0 = document.createElement("th");
  th0.textContent = "섹터";
  head.appendChild(th0);
  // 만기 열 — CFG.matrixMats (전체 그룹 라벨에서 파싱한 만기의 합집합, 동적)
  for (const m of CFG.matrixMats) {
    const th = document.createElement("th");
    th.textContent = `${m}년`;
    head.appendChild(th);
  }

  // 셀 값 계산 (히트맵 농도 산정용 최댓값 포함)
  const rows = [];
  let maxV = 0;
  for (const g of CFG.matrixGroups) {
    const byMat = new Map(g.cells.map((c) => [c.mat, c]));
    const items = [];
    for (const m of CFG.matrixMats) {
      const cell = byMat.get(m);
      if (!cell) { items.push(null); continue; } // 이 그룹에 없는 만기 열
      const pts = bpPoints(seriesOf(cell.label));
      const cur = pts.length ? pts[pts.length - 1].v : null;
      const prev5 = pts.length > 5 ? pts[pts.length - 6].v : null; // 5영업일 전
      items.push({ label: cell.label, mat: m, cur, chg: cur != null && prev5 != null ? cur - prev5 : null });
      if (cur != null && cur > maxV) maxV = cur;
    }
    rows.push({ g, items });
  }

  const body = $("#mx-body", root);
  let firstCell = null;
  for (const { g, items } of rows) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = g.sector;
    tr.appendChild(name);
    for (const it of items) {
      const td = document.createElement("td");
      if (!it || it.cur == null) {
        td.textContent = "—"; // 데이터 없음(백필 진행 중) — 조용히 처리
      } else {
        td.className = "mx-cell";
        td.dataset.label = it.label;
        td.dataset.title = `${g.sector} ${it.mat}년`;
        const v = document.createElement("span");
        v.textContent = it.cur.toFixed(1);
        td.appendChild(v);
        if (it.chg != null) {
          const sub = document.createElement("span");
          sub.className = "mx-sub" + (it.chg > 0 ? " delta-up" : it.chg < 0 ? " delta-dn" : "");
          sub.textContent = it.chg > 0 ? `(▲${it.chg.toFixed(1)})`
            : it.chg < 0 ? `(▼${Math.abs(it.chg).toFixed(1)})` : "(0.0)";
          td.appendChild(sub);
        }
        // 히트맵 wash — 값 비례 --series-1 투명도 0~35% (글자색은 텍스트 토큰 유지)
        const alpha = maxV > 0 ? Math.max(0, Math.min(0.35, (0.35 * it.cur) / maxV)) : 0;
        td.style.background = `color-mix(in srgb, var(--series-1) ${Math.round(alpha * 100)}%, transparent)`;
        if (!firstCell) firstCell = td;
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }

  body.addEventListener("click", (e) => {
    const td = e.target.closest("td.mx-cell");
    if (!td) return;
    selectMatrixCell(td);
  });

  if (firstCell) selectMatrixCell(firstCell);
}

function selectMatrixCell(td) {
  for (const c of document.querySelectorAll("#mx-body td.mx-cell")) c.classList.toggle("selected", c === td);
  $("#mx-title").textContent = `${td.dataset.title} 스프레드(bp)`;
  const pts = lastYear(bpPoints(seriesOf(td.dataset.label)));
  lineChart($("#mx-chart"), [{ name: td.dataset.title, cssVar: SLOT_VARS[0], points: pts }], { unit: "bp", digits: 1 });
}

/* ══════════════ 심리지표(이종커브) ══════════════ */
function renderXcurve() {
  const root = $("#view-xcurve");
  root.innerHTML = `
    <div class="tile-row" id="xc-tiles"></div>
    <div class="card">
      <div class="card-head"><h2>심리지표 추이</h2><span class="hint">bp</span></div>
      <div id="xc-chart"></div>
    </div>
    <div class="section-title">국면별 통계</div>
    <div id="xc-regime"></div>`;

  // 스탯 타일 — 현재 bp, 전일비·1주비
  const tiles = $("#xc-tiles", root);
  const chartSeries = [];
  for (const def of CFG.xcurveDefs) {
    const pts = diffPoints(def.a, def.b);
    chartSeries.push({ name: def.label, cssVar: def.cssVar, points: pts });
    const c = calcChanges(pts);
    const tile = document.createElement("div");
    tile.className = "tile";
    const lab = document.createElement("div");
    lab.className = "t-label";
    lab.textContent = def.label;
    const val = document.createElement("div");
    val.className = "t-value";
    val.textContent = fmt(c.cur);
    if (c.cur != null) {
      const u = document.createElement("span");
      u.className = "unit";
      u.textContent = "bp";
      val.appendChild(u);
    }
    const del = document.createElement("div");
    del.className = "t-delta";
    del.append("전일 ", deltaSpan(c.d1), " · 1주 ", deltaSpan(c.w1));
    tile.append(lab, val, del);
    tiles.appendChild(tile);
  }

  lineChart($("#xc-chart", root), chartSeries, { unit: "bp", digits: 1, zeroLine: true });

  // 국면별 통계 — xcurve 는 아직 빈 상태가 정상
  const rg = $("#xc-regime", root);
  const labels = [...S.stats.xcurve.keys()];
  if (!labels.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "국면별 통계는 로컬 run_daily 실행 후 제공됩니다";
    rg.appendChild(p);
    return;
  }
  rg.innerHTML = `
    <div class="controls"><select class="ctl" id="xc-select"></select></div>
    <div class="card"><div id="xc-regime-chart"></div></div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr><th>버킷</th><th>평균(bp)</th><th>고점(bp)</th><th>저점(bp)</th></tr></thead>
        <tbody id="xc-regime-body"></tbody>
      </table>
    </div>`;
  const sel = $("#xc-select", rg);
  for (const l of labels) {
    const op = document.createElement("option");
    op.value = l;
    op.textContent = l;
    sel.appendChild(op);
  }
  const draw = () => {
    const rows = S.stats.xcurve.get(sel.value) || [];
    regimeRangeChart($("#xc-regime-chart"), rows, { unit: "bp" });
    const body = $("#xc-regime-body");
    body.textContent = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const b = document.createElement("td");
      b.textContent = r.bucket;
      tr.appendChild(b);
      tr.appendChild(numTd(r.avg_bp));
      tr.appendChild(numTd(r.hi_bp));
      tr.appendChild(numTd(r.lo_bp));
      body.appendChild(tr);
    }
  };
  sel.addEventListener("change", draw);
  draw();
}

/* ══════════════ 상대가치 ══════════════ */
let rvGroup = null;

function renderRv() {
  const root = $("#view-rv");
  root.innerHTML = `
    <p class="section-sub">동일 만기 수익률차(bp) · 행을 클릭하면 그룹 추이가 표시됩니다</p>
    <div class="card">
      <div class="card-head"><h2 id="rv-title"></h2><span class="hint">1·2·3년, bp</span></div>
      <div id="rv-chart"></div>
    </div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr><th>지표</th><th>현재(bp)</th><th>전일(bp)</th><th>1주(bp)</th><th>1개월(bp)</th></tr></thead>
        <tbody id="rv-body"></tbody>
      </table>
    </div>
    <div id="rv-regime"></div>`;

  const body = $("#rv-body", root);
  for (const g of CFG.rvGroups) {
    const gr = document.createElement("tr");
    gr.className = "group-row";
    const gtd = document.createElement("td");
    gtd.colSpan = 5;
    gtd.textContent = g.group;
    gr.appendChild(gtd);
    body.appendChild(gr);

    for (const pair of g.pairs) {
      const c = calcChanges(diffPoints(pair.a, pair.b));
      const tr = document.createElement("tr");
      tr.className = "sel-row";
      tr.dataset.group = g.group;
      tr.dataset.pair = pair.label;
      const name = document.createElement("td");
      name.textContent = pair.label;
      tr.appendChild(name);
      tr.appendChild(numTd(c.cur));
      tr.appendChild(numTd(c.d1, { signed: true }));
      tr.appendChild(numTd(c.w1, { signed: true }));
      tr.appendChild(numTd(c.m1, { signed: true }));
      body.appendChild(tr);
    }
  }

  body.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.sel-row");
    if (!tr) return;
    selectRvGroup(tr.dataset.group, tr.dataset.pair);
  });

  const firstG = CFG.rvGroups.find((g) => g.pairs?.length);
  if (firstG) selectRvGroup(firstG.group, firstG.pairs[0].label);
}

function selectRvGroup(groupName, pairLabel) {
  rvGroup = CFG.rvGroups.find((g) => g.group === groupName) || CFG.rvGroups[0];
  if (!rvGroup?.pairs?.length) return;
  const pair = rvGroup.pairs.find((p) => p.label === pairLabel) || rvGroup.pairs[0];
  const mat = pair.label.split(" ").pop(); // 라벨 끝의 만기 ("1년" 등)
  for (const tr of document.querySelectorAll("#rv-body tr.sel-row")) tr.classList.toggle("selected", tr.dataset.pair === pair.label);
  $("#rv-title").textContent = `${rvGroup.group} · 선택: ${mat}`;

  // 그룹 3개 만기 시리즈를 한 차트에 (동일 단위 bp)
  const series = rvGroup.pairs.map((pair, i) => ({
    name: pair.label, cssVar: SLOT_VARS[i], points: diffPoints(pair.a, pair.b),
  }));
  lineChart($("#rv-chart"), series, { unit: "bp", digits: 1, zeroLine: true });

  // 매칭되는 국면 통계 표 (bond_regime_stats kind='rv', 라벨 동일)
  const rg = $("#rv-regime");
  rg.textContent = "";
  for (const pair of rvGroup.pairs) {
    const rows = S.stats.rv.get(pair.label);
    if (!rows || !rows.length) continue;
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = `${pair.label} — 국면별 통계`;
    rg.appendChild(title);
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "data";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    for (const h of ["버킷", "평균(bp)", "고점(bp)", "저점(bp)"]) {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    for (const r of rows) {
      const tr = document.createElement("tr");
      const b = document.createElement("td");
      b.textContent = r.bucket;
      tr.appendChild(b);
      tr.appendChild(numTd(r.avg_bp));
      tr.appendChild(numTd(r.hi_bp));
      tr.appendChild(numTd(r.lo_bp));
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    scroll.appendChild(table);
    rg.appendChild(scroll);
  }
}

/* ══════════════ 국면별 분석 ══════════════ */
function renderRegime() {
  const root = $("#mon-regime");
  const entries = CFG.regimeLabels
    .filter((label) => S.stats.regime.has(label))
    .map((label) => ({ kind: "regime", label }));
  const cardCorpGroup = CFG.rvGroups.find((g) => g.group.includes("여전채-회사채"));
  for (const pair of cardCorpGroup?.pairs || []) {
    if (S.stats.rv.has(pair.label)) entries.push({ kind: "rv", label: pair.label });
  }
  if (!entries.length) {
    root.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "국면별 통계는 로컬 run_daily 실행 후 제공됩니다";
    root.appendChild(p);
    return;
  }
  root.innerHTML = `
    <p class="section-sub" id="rg-caption"></p>
    <div class="controls"><select class="ctl" id="rg-select"></select></div>
    <div class="card"><div id="rg-chart"></div></div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr><th>구간</th><th>정책</th><th>평균(bp)</th><th>고점(bp)</th><th>저점(bp)</th><th>평균수익률(%)</th></tr></thead>
        <tbody id="rg-body"></tbody>
      </table>
    </div>`;

  const sel = $("#rg-select", root);
  let group = null;
  for (const entry of entries) {
    const groupLabel = entry.kind === "rv" ? "여전채-회사채" : "기준금리 대비";
    if (!group || group.label !== groupLabel) {
      group = document.createElement("optgroup");
      group.label = groupLabel;
      sel.appendChild(group);
    }
    const op = document.createElement("option");
    op.value = entry.label;
    op.dataset.kind = entry.kind;
    op.textContent = entry.label;
    group.appendChild(op);
  }
  const draw = () => {
    const kind = sel.selectedOptions[0]?.dataset.kind || "regime";
    const rows = S.stats[kind].get(sel.value) || [];
    $("#rg-caption", root).textContent = kind === "rv"
      ? "여전채 AA- − 회사채 AA- 동일 만기 수익률차(bp), 전체 기간 통계"
      : "기준금리 대비 스프레드(bp), 전체 기간 통계";
    regimeRangeChart($("#rg-chart"), rows, { unit: "bp" });
    const body = $("#rg-body");
    body.textContent = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const b = document.createElement("td");
      b.textContent = r.bucket_type === "current" ? `${r.bucket} (현재)` : r.bucket;
      tr.appendChild(b);
      const pol = document.createElement("td");
      pol.textContent = r.policy || "—";
      tr.appendChild(pol);
      tr.appendChild(numTd(r.avg_bp));
      tr.appendChild(numTd(r.hi_bp));
      tr.appendChild(numTd(r.lo_bp));
      tr.appendChild(numTd(r.avg_yield, { digits: 3 }));
      body.appendChild(tr);
    }
  };
  sel.addEventListener("change", draw);
  draw();
}

/* ══════════════ 주간 채권시장 ══════════════ */
const intFmt = (v) => (v == null || Number.isNaN(v) ? "—" : Math.round(v).toLocaleString("ko-KR"));
// tbody 에 "데이터 없음" 안내 행
function hintRow(tbody, colSpan, text) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = colSpan;
  td.textContent = text;
  td.className = "";
  td.style.textAlign = "left";
  tr.appendChild(td);
  tbody.appendChild(tr);
}
// 배열에서 고유 날짜(오름차순)
function distinctDates(rows) {
  return [...new Set(rows.map((r) => r.trade_date))].sort();
}

const FUT_NAMES = { KTB3: "3년 국채선물", KTB5: "5년 국채선물", KTB10: "10년 국채선물", KTB30: "30년 국채선물" };

function renderIssue() {
  const root = $("#view-issue");
  root.innerHTML = `
    <p class="hint">KOFIA 발행시장 통계 · 단위 억원 · 매일 20:00 갱신</p>
    <div class="section-title">발행통계 (금주)</div>
    <p class="section-sub" id="wk-iss-sub">억원 · 최근 5영업일 합산, 전주 = 그 직전 5영업일</p>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>채권종류</th><th>발행액</th><th>상환액</th><th>순발행</th><th>전주 순발행</th></tr></thead>
      <tbody id="wk-iss"></tbody></table></div>
    <div class="section-title">만기통계 (만기도래·예정)</div>
    <p class="section-sub" id="wk-mat-sub">억원 · 금주 실적 + 향후 2주 예정 · 특은채 만기 분해는 2026-07-21부터 축적(초기엔 금주 일부 누락 가능)</p>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>채권종류</th><th>금주</th><th>다음주</th><th>다다음주</th></tr></thead>
      <tbody id="wk-mat"></tbody></table></div>
    <div class="card">
      <div class="card-head"><h2 id="is-chart-title">월별 순발행 (최근 1년)</h2><span class="hint">억원 · 당월은 진행분</span></div>
      <div class="controls"><div class="seg wrap" id="is-cls"></div></div>
      <div id="is-chart"></div>
    </div>`;

  // 4) 발행통계(금주 vs 전주) + 만기통계(금주·향후 2주) — kofia_issue_stats
  {
    const CLASSES = ["국채", "지방채", "특수채", "통안증권", "은행채", "기타금융채", "회사채", "ABS", "계"];
    const issBody = $("#wk-iss", root);
    const matBody = $("#wk-mat", root);
    if (!S.issue.length) {
      hintRow(issBody, 5, "데이터 적재 준비 중 (sync_issue_stats 실행 후 표시됩니다)");
      hintRow(matBody, 4, "데이터 적재 준비 중");
    } else {
      // 발행 — 상환은 주말·공휴일에도 기록되므로 달력일 7일 창으로 합산
      // (이 테이블은 trade_date 가 아니라 stat_date — distinctDates 사용 불가)
      const issDates = [...new Set(S.issue.filter((r) => r.issued != null).map((r) => r.stat_date))].sort();
      const latestIss = issDates[issDates.length - 1];
      const inRange = (d, from, to) => d >= from && d <= to;
      const w1from = addDaysISO(latestIss, -6), w0to = addDaysISO(latestIss, -7), w0from = addDaysISO(latestIss, -13);
      const wk1 = new Set(issDates.filter((d) => inRange(d, w1from, latestIss)));
      const wk0 = new Set(issDates.filter((d) => inRange(d, w0from, w0to)));
      const sum = (dates, cls, field) => {
        let v = 0, has = false;
        for (const r of S.issue) {
          if (dates.has(r.stat_date) && r.bond_class === cls && r[field] != null) { v += r[field]; has = true; }
        }
        return has ? v : null;
      };
      if (latestIss) $("#wk-iss-sub", root).textContent =
        `KOFIA 발행시장 · 억원 · 금주 ${w1from} ~ ${latestIss} 합산(달력 7일) · 전주 = 직전 7일`;
      const issRow = (label, issued, redeemed, net, prevNet) => {
        const tr = document.createElement("tr");
        const nm = document.createElement("td");
        nm.textContent = label;
        tr.appendChild(nm);
        const td1 = document.createElement("td");
        td1.textContent = issued == null ? "—" : Math.round(issued).toLocaleString("ko-KR");
        const td2 = document.createElement("td");
        td2.textContent = redeemed == null ? "—" : Math.round(redeemed).toLocaleString("ko-KR");
        tr.append(td1, td2);
        tr.appendChild(intTd(net));
        tr.appendChild(intTd(prevNet));
        issBody.appendChild(tr);
      };
      for (const cls of CLASSES) {
        issRow(cls === "계" ? "전체" : cls,
          sum(wk1, cls, "issued"), sum(wk1, cls, "redeemed"),
          sum(wk1, cls, "net"), sum(wk0, cls, "net"));
        // 은행채 하위 분해 — 특은채(산금·중금·수출입·농협·수협) 발행분 분리 (발행액만 집계)
        if (cls === "은행채") {
          const sb1 = sum(wk1, "특은채", "issued");
          const bank1 = sum(wk1, "은행채", "issued");
          issRow("└ 특은채", sb1, null, null, null);
          issRow("└ 은행채(일반)", sb1 != null && bank1 != null ? bank1 - sb1 : null, null, null, null);
        }
      }

      // 만기 — 달력 주(월~일) 기준: 금주 / 다음주 / 다다음주
      const weekStart = (iso) => {
        const d = new Date(iso + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
        return d.toISOString().slice(0, 10);
      };
      const thisWeek = weekStart(new Date().toISOString().slice(0, 10));
      const wkIdx = (iso) => Math.round((new Date(weekStart(iso)) - new Date(thisWeek)) / (7 * 86400000));
      const matSum = new Map(); // cls -> [금주, 차주, 차차주]
      for (const r of S.issue) {
        if (r.matured == null) continue;
        const idx = wkIdx(r.stat_date);
        if (idx < 0 || idx > 2) continue;
        const arr = matSum.get(r.bond_class) ?? [null, null, null];
        arr[idx] = (arr[idx] ?? 0) + r.matured;
        matSum.set(r.bond_class, arr);
      }
      const matRow = (label, arr) => {
        const tr = document.createElement("tr");
        const nm = document.createElement("td");
        nm.textContent = label;
        tr.appendChild(nm);
        for (const v of arr) {
          const td = document.createElement("td");
          td.textContent = v == null ? "—" : Math.round(v).toLocaleString("ko-KR");
          tr.appendChild(td);
        }
        matBody.appendChild(tr);
      };
      for (const cls of CLASSES) {
        matRow(cls === "계" ? "전체" : cls, matSum.get(cls) ?? [null, null, null]);
        if (cls === "은행채") {
          const bank = matSum.get("은행채") ?? [null, null, null];
          const sb = matSum.get("특은채") ?? [null, null, null];
          matRow("└ 특은채", sb);
          matRow("└ 은행채(일반)", bank.map((v, i) => (v != null && sb[i] != null ? v - sb[i] : null)));
        }
      }
    }
  }

  // 월별 순발행 막대그래프 (최근 1년) — 채권종류 세그 버튼으로 전환
  {
    const CLS_BTNS = ["계", "국채", "지방채", "특수채", "통안증권", "은행채", "기타금융채", "회사채", "ABS"];
    const seg = $("#is-cls", root);
    for (const cls of CLS_BTNS) {
      const b = document.createElement("button");
      b.dataset.cls = cls;
      b.textContent = cls === "계" ? "전체" : cls;
      if (cls === "계") b.className = "active";
      seg.appendChild(b);
    }
    const draw = (cls) => {
      // ym -> net (kofia_issue_monthly, 월 집계)
      const byYm = new Map();
      for (const r of S.issueMonthly) {
        if (r.bond_class === cls && r.net != null) byYm.set(r.ym, r.net);
      }
      const keys = [...byYm.keys()].sort().slice(-12);
      const cats = keys.map((k) => `${k.slice(2, 4)}.${k.slice(5, 7)}`);
      // 같은 달의 직전 N개년 평균 (있는 연도만 — 백필 범위 밖이면 표본에서 제외)
      const avgN = (ym, n) => {
        const y = +ym.slice(0, 4), mm = ym.slice(5, 7);
        const vals = [];
        for (let i = 1; i <= n; i++) {
          const v = byYm.get(`${y - i}-${mm}`);
          if (v != null) vals.push(v);
        }
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };
      $("#is-chart-title", root).textContent =
        `월별 순발행 — ${cls === "계" ? "전체" : cls} (당월 vs 과거 3·5년 같은 달 평균)`;
      barChart($("#is-chart", root), cats, [
        { name: "당월", cssVar: "--series-2", values: keys.map((k) => byYm.get(k)) },
        { name: "직전 3년 평균", cssVar: "--series-1", values: keys.map((k) => avgN(k, 3)) },
        { name: "직전 5년 평균", cssVar: "--series-6", values: keys.map((k) => avgN(k, 5)) },
      ], { unit: "억" });
    };
    if (!S.issueMonthly.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "데이터 적재 준비 중";
      $("#is-chart", root).appendChild(p);
    } else {
      seg.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        for (const b of seg.querySelectorAll("button")) b.classList.toggle("active", b === btn);
        draw(btn.dataset.cls);
      });
      draw("계");
    }
  }
}

/* ══════════════ 발행정보 (DART 채무증권 공시) ══════════════ */
// rcept_dt "20260718" | "2026-07-18" → "2026-07-18"
function fmtRceptDt(v) {
  const s = String(v || "");
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10) || "—";
}

function renderOfferings() {
  const root = $("#view-offerings");
  root.innerHTML = `
    <div class="section-title">수요예측·발행조건 (신고서 파싱)</div>
    <p class="section-sub">증권신고서(채무증권) 회차별 · 최근 1주일 · 발행액 억원 ·
      등급민평 = KOFIA 등급별 시가평가(4사 평균)를 기준만기로 보간한 값 — 개별민평(유료) 대체 참고치</p>
    <div id="of-details"></div>`;

  // ── 파싱 상세 표 (dart_offering_details) ──
  const det = $("#of-details", root);
  if (!S.dartDetails.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "신고서 파싱 데이터 적재 준비 중 (sync_dart_details 실행 후 표시됩니다)";
    det.appendChild(p);
  } else {
    // 등급민평 — 등급·기준만기에 해당하는 KOFIA 등급별 시가평가(4사 평균)를 만기 선형보간.
    // 개별민평(민평사 유료 상품) 대신 쓰는 참고치. 기준만기는 밴드 문구 → 없으면 잔존만기.
    const gradeMineval = (r) => {
      const gm = /(?:회사채|무보증사채)\s+([A-D]{1,3}[0+\-]?)/.exec(r.rating || "");
      if (!gm) return null;
      const prefix = `${/카드|캐피탈/.test(r.corp_name || "") ? "여전채" : "회사채"} ${gm[1]}`;
      let t = null;
      const bm = /\(([\d.]+)\s*(년|개월)/.exec(r.band || "");
      if (bm) t = bm[2] === "개월" ? parseFloat(bm[1]) / 12 : parseFloat(bm[1]);
      else if (r.maturity_date && r.rcept_dt) {
        t = (new Date(r.maturity_date) - new Date(r.rcept_dt)) / 31557600000;
      }
      if (!t || t <= 0) return null;
      const pts = [];
      for (const [label, arr] of S.series) {
        if (!label.startsWith(prefix + " ")) continue;
        const mt = /(\d+)년$/.exec(label);
        const last = arr[arr.length - 1];
        if (mt && last && last.y != null) pts.push({ t: +mt[1], y: last.y });
      }
      pts.sort((a, b) => a.t - b.t);
      if (!pts.length) return null;
      if (t <= pts[0].t) return pts[0].y;
      if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].y;
      for (let i = 0; i < pts.length - 1; i++) {
        if (t >= pts[i].t && t <= pts[i + 1].t) {
          const w = (t - pts[i].t) / (pts[i + 1].t - pts[i].t);
          return pts[i].y + w * (pts[i + 1].y - pts[i].y);
        }
      }
      return null;
    };

    const urlByRcept = new Map(S.dart.map((r) => [r.rcept_no, r.url]));
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "data";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    for (const h of ["접수일", "회사명", "회차", "등급", "발행액(억)", "상환기일", "수요예측일", "청약일", "공모희망금리", "등급민평(%)", "주관·인수"]) {
      const th = document.createElement("th");
      th.textContent = h;
      if (h === "등급민평(%)") th.title = "KOFIA 등급별 시가평가(4사 평균) 기준만기 보간 — 개별민평(유료) 대체 참고치";
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    for (const r of S.dartDetails) {
      const tr = document.createElement("tr");
      const dt = document.createElement("td");
      dt.textContent = fmtRceptDt(r.rcept_dt);
      tr.appendChild(dt);
      const nm = document.createElement("td");
      const url = String(urlByRcept.get(r.rcept_no) || "");
      if (/^https?:\/\//.test(url)) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = r.corp_name ?? "—";
        nm.appendChild(a);
      } else {
        nm.textContent = r.corp_name ?? "—";
      }
      tr.appendChild(nm);
      for (const v of [r.tranche, r.rating]) {
        const td = document.createElement("td");
        td.textContent = v ?? "—";
        tr.appendChild(td);
      }
      const amt = document.createElement("td");
      amt.textContent = r.amount == null ? "—"
        : (r.amount / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
      tr.appendChild(amt);
      for (const v of [r.maturity_date, r.demand_date, r.sub_date, r.band]) {
        const td = document.createElement("td");
        td.textContent = v ?? "—";
        tr.appendChild(td);
      }
      tr.appendChild(numTd(gradeMineval(r), { digits: 3 }));
      // 주관·인수 — 3사 초과는 "외 n" 축약 (전체는 title 툴팁)
      const uw = document.createElement("td");
      const names = (r.underwriters || "").split(",").map((s) => s.trim()).filter(Boolean);
      uw.textContent = !names.length ? "—"
        : names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}`;
      if (names.length > 3) uw.title = names.join(", ");
      tr.appendChild(uw);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    scroll.appendChild(table);
    det.appendChild(scroll);
  }
  // 발행 공시 목록(DART raw list)은 사용자 요청으로 미표시 — S.dart 는 회사명 DART 링크용으로만 사용
}

/* ══════════════ 수급동향 (KOFIA 투자자별 거래현황) ══════════════ */
const intSigned = (v) => {
  if (v == null || Number.isNaN(v)) return "—";
  const s = Math.round(Math.abs(v)).toLocaleString("ko-KR");
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : "0";
};
// 부호 색·콤마 있는 정수 셀 (억원)
function intTd(v) {
  const td = document.createElement("td");
  td.textContent = intSigned(v);
  if (v != null && v > 0) td.className = "pos";
  else if (v != null && v < 0) td.className = "neg";
  return td;
}
// 부호 색·콤마 있는 정수 스팬 (타일 보조 텍스트용)
function intDeltaSpan(v) {
  const sp = document.createElement("span");
  sp.textContent = intSigned(v);
  if (v != null && v > 0) sp.className = "delta-up";
  else if (v != null && v < 0) sp.className = "delta-dn";
  return sp;
}

const LIQUIDITY_DEFS = [
  {
    symbol: "FUND_STOCK_AUM",
    name: "주식형",
    url: "https://freesis.kofia.or.kr/stat/FreeSIS.do?parentDivId=MSIS40100000000000&serviceId=STATFND0100100130",
    cssVar: "--series-1",
  },
  {
    symbol: "FUND_BOND_AUM",
    name: "채권형",
    url: "https://freesis.kofia.or.kr/stat/FreeSIS.do?parentDivId=MSIS40100000000000&serviceId=STATFND0100100130",
    cssVar: "--series-6",
  },
  {
    symbol: "MMF_AUM",
    name: "MMF",
    url: "https://freesis.kofia.or.kr/stat/FreeSIS.do?parentDivId=MSIS40300000000000&serviceId=STATFND0400000050",
    cssVar: "--series-2",
  },
];

const FOREIGN_BALANCE_DEF = {
  symbol: "FOREIGN_LISTED_BOND_BAL",
  name: "외국인 상장채권잔고",
  url: "https://www.fss.or.kr/fss/bbs/B0000192/list.do?menuNo=200224",
  cssVar: "--series-6",
};

// 서로 다른 빈도의 펀드 시계열을 같은 월말 축으로 맞춘다.
// 월별 시계열은 해당 월 관측치, 일별 MMF는 해당 월 마지막 관측치를 사용한다.
function monthlyMarketPoints(symbol) {
  const byMonth = new Map();
  for (const point of marketPoints(symbol)) byMonth.set(point.d.slice(0, 7), point);
  return [...byMonth.entries()].map(([ym, point]) => {
    const [year, month] = ym.split("-").map(Number);
    const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { d: `${ym}-${String(day).padStart(2, "0")}`, v: point.v };
  });
}

function renderLiquidity(root) {
  const seg = $("#liq-seg", root);
  for (const def of LIQUIDITY_DEFS) {
    const button = document.createElement("button");
    button.dataset.symbol = def.symbol;
    button.textContent = def.name;
    button.className = "active";
    button.setAttribute("aria-pressed", "true");
    seg.appendChild(button);
  }

  const draw = () => {
    const active = new Set(
      [...seg.querySelectorAll("button.active")].map((button) => button.dataset.symbol)
    );
    const selected = LIQUIDITY_DEFS.filter((def) => active.has(def.symbol));
    const prepared = selected.map((def) => ({ ...def, points: monthlyMarketPoints(def.symbol) }));
    $("#liq-title", root).textContent =
      selected.length === 1 ? `${selected[0].name} 수탁고 추이` : "펀드 유형별 수탁고 비교";

    const tiles = $("#liq-tiles", root);
    tiles.textContent = "";
    for (const item of prepared) {
      const last = item.points[item.points.length - 1] || null;
      const prev = item.points.length > 1 ? item.points[item.points.length - 2] : null;
      const tile = document.createElement("div");
      tile.className = "tile";
      const label = document.createElement("div");
      label.className = "t-label";
      label.textContent = last ? `${item.name} · ${last.d.slice(0, 7)}` : item.name;
      const value = document.createElement("div");
      value.className = "t-value";
      value.textContent = last ? last.v.toFixed(1) : "—";
      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = "조원";
      value.appendChild(unit);
      const delta = document.createElement("div");
      delta.className = "t-delta";
      delta.append("전월 대비 ", deltaSpan(last && prev ? last.v - prev.v : null, 1), "조원");
      tile.append(label, value, delta);
      tiles.appendChild(tile);
    }

    lineChart($("#liq-chart", root), prepared
      .filter((item) => item.points.length)
      .map((item) => ({ name: item.name, cssVar: item.cssVar, points: item.points })),
    { unit: "조원", digits: 1, showLegend: true });

    const monthSet = new Set();
    const valueMaps = new Map();
    for (const item of prepared) {
      valueMaps.set(item.symbol, new Map(item.points.map((point) => [point.d.slice(0, 7), point.v])));
      for (const point of item.points) monthSet.add(point.d.slice(0, 7));
    }
    const months = [...monthSet].sort().reverse().slice(0, 12);
    const head = $("#liq-table-head", root);
    const body = $("#liq-table-body", root);
    head.textContent = "";
    body.textContent = "";
    const headerRow = document.createElement("tr");
    for (const label of ["월말", ...selected.map((def) => `${def.name}(조원)`)]) {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    }
    head.appendChild(headerRow);
    for (const month of months) {
      const tr = document.createElement("tr");
      const dateCell = document.createElement("td");
      dateCell.textContent = month;
      tr.appendChild(dateCell);
      for (const def of selected) tr.appendChild(numTd(valueMaps.get(def.symbol)?.get(month), { digits: 1 }));
      body.appendChild(tr);
    }
  };

  seg.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const buttons = [...seg.querySelectorAll("button")];
    if (button.classList.contains("active") && buttons.filter((item) => item.classList.contains("active")).length === 1) {
      return;
    }
    button.classList.toggle("active");
    button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    draw();
  });
  draw();
}

function renderForeignBalance(root) {
  const points = marketPoints(FOREIGN_BALANCE_DEF.symbol);
  const last = points[points.length - 1] || null;
  const prev = points.length > 1 ? points[points.length - 2] : null;
  $("#foreign-balance-current", root).textContent = last ? last.v.toFixed(1) : "—";
  $("#foreign-balance-date", root).textContent = last ? `최신 ${last.d}` : "최신";
  const change = last && prev ? last.v - prev.v : null;
  const changeEl = $("#foreign-balance-change", root);
  changeEl.textContent = change == null ? "—" : `${fmtSigned(change, 1)}조원`;
  changeEl.className = "t-value";
  if (change > 0) changeEl.classList.add("delta-up");
  else if (change < 0) changeEl.classList.add("delta-dn");
  const latestMonth = last?.d.slice(0, 7) || "";
  const balancePoints = points.filter((point) => point.d.startsWith(latestMonth));
  const fxByDate = new Map();
  for (const point of marketPoints("USDKRW")) fxByDate.set(point.d, point.v);
  const fxPoints = balancePoints
    .filter((point) => fxByDate.has(point.d))
    .map((point) => ({ d: point.d, v: fxByDate.get(point.d) }));
  dualLineChart($("#foreign-balance-chart", root), {
    left: { name: "잔고(좌)", cssVar: FOREIGN_BALANCE_DEF.cssVar, points: balancePoints },
    right: { name: "원/달러(우)", cssVar: "--series-1", points: fxPoints },
  }, { leftUnit: "조원", rightUnit: "원", leftDigits: 1, rightDigits: 1 });
}


/* 수급동향 탭의 '선물 수급' 블록 — 국채선물 근월물 표 + 외국인 순매수(주간 타일·연초 누적 차트) */
function renderFlowsFutures(root) {
  // 선물 수급 1) 국채선물 시세 — 최신 영업일, prod 별 근월물(거래량 최대). 주간변동은 같은 종목코드의 5영업일 전 종가 대비
  const futBody = $("#fl-fut", root);
  const foreignSymbolByProduct = { KTB3: "KTB3F_FRG", KTB10: "KTB10F_FRG" };
  const latestForeign = new Map();
  for (const row of S.futFrg) latestForeign.set(row.symbol, row);
  if (!S.futures.length) {
    hintRow(futBody, 8, "데이터 적재 중");
  } else {
    const fDates = distinctDates(S.futures);
    const latest = fDates[fDates.length - 1];
    const wkDate = fDates.length > 5 ? fDates[fDates.length - 6] : null;
    const foreignDate = S.futFrg[S.futFrg.length - 1]?.trade_date || "—";
    $("#fl-fut-sub", root).textContent =
      `시세 기준일 ${latest} · 근월물(거래량 최대) · 외국인 순매수 기준일 ${foreignDate}`;
    const todays = S.futures.filter((r) => r.trade_date === latest);
    const wkRows = wkDate ? S.futures.filter((r) => r.trade_date === wkDate) : [];
    for (const prod of Object.keys(FUT_NAMES)) {
      const cands = todays.filter((r) => r.prod === prod);
      if (!cands.length) continue;
      const front = cands.reduce((a, b) => ((b.volume ?? 0) > (a.volume ?? 0) ? b : a));
      const wkSame = wkRows.find((r) => r.isu_cd === front.isu_cd) ?? null;
      const tr = document.createElement("tr");
      const p = document.createElement("td");
      p.textContent = FUT_NAMES[prod];
      tr.appendChild(p);
      const nm = document.createElement("td");
      nm.textContent = front.isu_nm ?? "—";
      tr.appendChild(nm);
      tr.appendChild(numTd(front.close_price, { digits: 2 }));
      tr.appendChild(numTd(front.change, { digits: 2, signed: true }));
      tr.appendChild(numTd(wkSame && front.close_price != null && wkSame.close_price != null
        ? front.close_price - wkSame.close_price : null, { digits: 2, signed: true }));
      const oi = document.createElement("td");
      oi.textContent = intFmt(front.open_int);
      tr.appendChild(oi);
      const vol = document.createElement("td");
      vol.textContent = intFmt(front.volume);
      tr.appendChild(vol);
      const foreign = latestForeign.get(foreignSymbolByProduct[prod]) || null;
      const foreignCell = foreign ? intTd(foreign.value) : dashTd();
      if (foreign) foreignCell.title = `외국인 일간 순매수 · ${foreign.trade_date}`;
      tr.appendChild(foreignCell);
      futBody.appendChild(tr);
    }
    if (!futBody.children.length) hintRow(futBody, 8, "데이터 적재 중");
  }

  // 선물 수급 2) 외국인 순매수 — 일별(계약) 타일 + 연초 누적 라인차트
  {
    const bySym = new Map();
    for (const r of S.futFrg) {
      if (!bySym.has(r.symbol)) bySym.set(r.symbol, []);
      bySym.get(r.symbol).push(r); // trade_date 오름차순 로드
    }
    const tiles = $("#fl-frg-tiles", root);
    const chartSeries = [];
    const defs = [
      { sym: "KTB3F_FRG", name: "3년 국채선물", cssVar: "--series-1" },
      { sym: "KTB10F_FRG", name: "10년 국채선물", cssVar: "--series-6" },
    ];
    let hasAny = false;
    for (const def of defs) {
      const rows = bySym.get(def.sym) || [];
      if (!rows.length) continue;
      hasAny = true;
      const last = rows[rows.length - 1];
      let cum = 0;
      const points = rows.map((r) => ({ d: r.trade_date, v: (cum += r.value) }));
      chartSeries.push({ name: def.name, cssVar: def.cssVar, points });
      // 주간 = 최근 5영업일 순매수 합 (연초 누적은 차트로만)
      const wk = rows.slice(-5).reduce((s, r) => s + r.value, 0);
      const tile = document.createElement("div");
      tile.className = "tile";
      const lab = document.createElement("div");
      lab.className = "t-label";
      lab.textContent = `${def.name} (${last.trade_date.slice(5).replace("-", "/")})`;
      const val = document.createElement("div");
      val.className = "t-value";
      val.textContent = intSigned(last.value);
      const u = document.createElement("span");
      u.className = "unit";
      u.textContent = "계약";
      val.appendChild(u);
      const del = document.createElement("div");
      del.className = "t-delta";
      del.append("주간(5영업일) ", intDeltaSpan(wk));
      tile.append(lab, val, del);
      tiles.appendChild(tile);
    }
    if (hasAny) {
      const latest = S.futFrg[S.futFrg.length - 1]?.trade_date;
      // 이 두 심볼만 KRX 로그인 화면에서 와서 서버 자동수집이 안 된다(북마클릿 수동 갱신).
      // 조용히 낡는 것이 제일 위험하므로, 시장 데이터 최신일과 비교해 지연 영업일을 드러낸다.
      // 기준은 KOSPI 거래일 — 같은 국내 영업일 달력이면서 자동 수집되는 계열.
      const bizDays = (S.market.get("KOSPI") || []).map((r) => r.trade_date);
      const lag = latest ? bizDays.filter((d) => d > latest).length : null;
      const sub = $("#fl-frg-sub", root);
      sub.textContent = `KRX 파생 투자자별 거래실적 · 계약 수 기준 · 기준일 ${latest}`;
      if (lag) {
        const warn = document.createElement("span");
        warn.className = "stale-warn";
        warn.textContent =
          ` · ${lag}영업일 지연 (KRX 로그인이 필요해 자동수집 불가 — ` +
          `bond-spread-system/tools 의 북마클릿·백필 스크립트로 갱신)`;
        sub.appendChild(warn);
      }
      lineChart($("#fl-frg-chart", root), chartSeries, { unit: "계약", digits: 0, zeroLine: true });
    } else {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "데이터 적재 준비 중";
      tiles.appendChild(p);
    }
  }
}

/* ══ 국면별 외국인 국채선물 누적 순매수 ══
   구간 = 그 국면의 첫 정책변경 금통위 3개월 전 ~ 마지막 정책변경 금통위.
   누적은 구간 시작에서 0으로 리베이스한다 — 그래야 국면끼리 크기를 비교할 수 있다.
   국면 목록은 bond_regime_stats(era), 회의일은 config.MPC_MEETINGS 가 단일 소스. */
const FRG_DEFS = [
  { sym: "KTB3F_FRG", name: "3년 국채선물", cssVar: "--series-1" },
  { sym: "KTB10F_FRG", name: "10년 국채선물", cssVar: "--series-6" },
];

// 정책 사이클을 금통위 결정 이력에서 직접 파생한다. 같은 방향의 정책변경이 이어지는 동안이
// 한 사이클이고, 반대 방향 변경이 나오면 거기서 끝난다. 마지막 사이클은 아직 반대 방향 변경이
// 없으므로 진행 중으로 본다 — 새 인상·인하가 생기면 회의만 추가하면 국면이 따라 생긴다.
// bond_regime_stats(era)를 쓰지 않는 이유: 그쪽은 회사 PC run_daily.py 산출물이라 갱신이 늦고,
// 스프레드 통계용 버킷이라 동결기까지 포함해 이 화면의 목적과 경계가 다르다.
const ymLabel = (iso) => `${iso.slice(2, 4)}.${+iso.slice(5, 7)}`;

function policyCycles() {
  const out = [];
  for (const m of MPC_MEETINGS) {
    if (!REGIME_FLOW_POLICIES.includes(m.decision)) continue;
    const cur = out[out.length - 1];
    // 방향이 같아도 직전 변경에서 너무 오래 벌어졌으면(장기 동결) 별개 사이클로 끊는다.
    const stale = cur && addMonthsISO(cur.last, REGIME_FLOW_GAP_MONTHS) < m.date;
    if (cur && cur.policy === m.decision && !stale) cur.last = m.date;
    else out.push({ policy: m.decision, first: m.date, last: m.date });
  }
  return out.map((c, i) => ({
    ...c,
    ongoing: i === out.length - 1,
    bucket: `${c.policy}기(${ymLabel(c.first)}~${i === out.length - 1 ? "현재" : ymLabel(c.last)})`,
  }));
}

// 사이클 → 분석 구간. 첫 정책변경 회의의 LEAD_MONTHS 개월 전부터,
// 끝난 사이클은 마지막 정책변경 회의까지, 진행 중이면 최신 데이터까지.
function cycleWindow(cyc) {
  const from = addMonthsISO(cyc.first, -REGIME_FLOW_LEAD_MONTHS);
  const to = cyc.ongoing ? (S.asof || new Date().toISOString().slice(0, 10)) : cyc.last;
  return { from, to, first: cyc.first, last: cyc.last, ongoing: cyc.ongoing,
    meetings: MPC_MEETINGS.filter((m) => m.date >= from && m.date <= to) };
}

// 화면에 띄울 국면 목록 (최신이 먼저)
function flowCycles() {
  return policyCycles().map((c) => ({ regime: c, win: cycleWindow(c) })).reverse();
}

let regimeFrgPick = null; // 선택된 국면 bucket 명

function renderRegimeFutures(root) {
  const seg = $("#rf-seg", root);
  const cycles = flowCycles();
  if (!cycles.length) {
    $("#rf-note", root).textContent =
      "금통위 회의일 목록이 비어 있어 국면 구간을 계산할 수 없습니다 (config.js MPC_MEETINGS).";
    return;
  }
  if (!cycles.some((c) => c.regime.bucket === regimeFrgPick)) regimeFrgPick = cycles[0].regime.bucket;

  seg.textContent = "";
  for (const c of cycles) {
    const b = document.createElement("button");
    b.textContent = c.regime.bucket;
    b.dataset.bucket = c.regime.bucket;
    b.classList.toggle("active", c.regime.bucket === regimeFrgPick);
    seg.appendChild(b);
  }
  seg.onclick = (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    regimeFrgPick = btn.dataset.bucket;
    for (const b of seg.querySelectorAll("button")) b.classList.toggle("active", b === btn);
    drawRegimeFutures(root);
  };
  drawRegimeFutures(root);
}

async function drawRegimeFutures(root) {
  const cyc = flowCycles().find((c) => c.regime.bucket === regimeFrgPick);
  if (!cyc) return;
  const { win, regime } = cyc;

  $("#rf-note", root).textContent =
    `${regime.bucket} · 첫 ${regime.policy} ${win.first} → ` +
    (win.ongoing ? `진행 중 (직전 ${regime.policy} ${win.last})` : `마지막 ${regime.policy} ${win.last}`) +
    ` · 구간 ${win.from} ~ ${win.to} (첫 ${regime.policy} ${REGIME_FLOW_LEAD_MONTHS}개월 전부터) · ` +
    `누적은 구간 시작 0 기준 · 단위 계약`;

  const chartBox = $("#rf-chart", root);
  const tbody = $("#rf-table", root);
  chartBox.textContent = "불러오는 중…";
  tbody.textContent = "";

  // 구간 데이터 lazy 로드 (국면 단위 캐시 — 전 구간을 첫 화면에서 받으면 초기 로딩이 무거워진다)
  let rows = S.regimeFrg.get(regime.bucket);
  if (!rows) {
    rows = await loadFuturesForeignRange(win.from, win.to);
    S.regimeFrg.set(regime.bucket, rows);
  }
  if (regimeFrgPick !== regime.bucket) return; // 로딩 중 다른 국면으로 바뀌었으면 버린다

  const bySym = new Map(FRG_DEFS.map((d) => [d.sym, []]));
  for (const r of rows) bySym.get(r.symbol)?.push(r);

  if (![...bySym.values()].some((a) => a.length)) {
    chartBox.textContent = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent =
      `이 구간(${win.from} ~ ${win.to})의 외국인 선물 순매수 데이터가 없습니다. ` +
      "bond-spread-system/tools/krx_foreign_futures_backfill.js 로 백필해야 표시됩니다.";
    chartBox.appendChild(p);
    return;
  }

  // 누적 시계열 (구간 시작 0 리베이스)
  const series = [];
  const cumBySym = new Map();
  for (const def of FRG_DEFS) {
    const arr = bySym.get(def.sym) || [];
    if (!arr.length) continue;
    let cum = 0;
    const pts = arr.map((r) => ({ d: r.trade_date, v: (cum += r.value) }));
    series.push({ name: def.name, cssVar: def.cssVar, points: pts });
    cumBySym.set(def.sym, pts);
  }

  // 차트 — 금통위 세로줄(정책변경 회의는 강조)
  const vlines = win.meetings.map((m) => ({
    d: m.date,
    label: m.decision === "동결" ? "" : m.decision,
    emphasis: m.decision !== "동결",
    tooltip: `금통위 ${m.decision}${m.rate != null ? ` ${m.rate.toFixed(2)}%` : ""}${m.type === "임시" ? " (임시)" : ""}`,
  }));
  chartBox.textContent = "";
  lineChart(chartBox, series, { unit: "계약", digits: 0, zeroLine: false, vlines, showLegend: true });

  // 데이터 범위가 요청 구간에 못 미치면 반드시 드러낸다. 특히 **앞쪽이 잘리면**
  // 누적 0 기점이 국면 시작이 아니게 되어 국면끼리 비교가 성립하지 않는다
  // (KRX 투자자별은 3년물 2010-09-06, 10년물 2010-10-25 이전이 아예 없다).
  const dataStartAll = rows[0]?.trade_date;
  const dataEndAll = rows[rows.length - 1]?.trade_date;
  const gaps = [];
  if (dataStartAll && dataStartAll > win.from) {
    const late = dataStartAll > win.first;   // 첫 정책변경일보다도 늦으면 국면 자체가 반쪽이다
    gaps.push(`구간 시작은 ${win.from} 인데 데이터는 <span class="stale-warn">${dataStartAll}</span> 부터입니다` +
      (late ? ` — 첫 ${regime.policy}(${win.first}) 이전이 통째로 없어 누적 기점이 국면 시작과 다릅니다`
            : ` (사전 ${REGIME_FLOW_LEAD_MONTHS}개월이 일부 빕니다)`));
  }
  if (dataEndAll && dataEndAll < win.to) {
    gaps.push(`구간 끝은 ${win.to} 인데 데이터는 <span class="stale-warn">${dataEndAll}</span> 까지만 있습니다`);
  }
  if (gaps.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.innerHTML = `⚠ ${gaps.join(" · ")}`;
    chartBox.appendChild(p);
  }

  // 표 — 금통위 구간별 분해. 각 행 = 직전 회의 다음날 ~ 그 회의일까지의 순매수 합과 구간 시작 이후 누적.
  const sumBetween = (sym, a, b) =>
    (bySym.get(sym) || []).reduce((s, r) => (r.trade_date >= a && r.trade_date <= b ? s + r.value : s), 0);
  const cumAt = (sym, d) => {
    const pts = cumBySym.get(sym);
    if (!pts) return null;
    const p = pointOnOrBefore(pts, d);
    return p ? p.v : null;
  };

  const segs = [];
  win.meetings.forEach((m, i) => {
    if (i === 0) {
      segs.push({ from: win.from, to: m.date, m, label: `사전 ${REGIME_FLOW_LEAD_MONTHS}개월 → ${m.date}` });
    } else {
      segs.push({ from: addDaysISO(win.meetings[i - 1].date, 1), to: m.date, label: `→ ${m.date}`, m });
    }
  });
  // 진행 중 사이클은 마지막 회의 이후 구간이 남는다 — 그 몫을 따로 한 줄로 보여준다.
  // 라벨에는 요청 구간 끝이 아니라 **실제 데이터가 있는 마지막 날**을 쓴다 — 이 계열은 수동 갱신이라
  // 뒤처져 있을 수 있고, 없는 날까지 집계한 것처럼 보이면 안 된다.
  const dataEnd = rows.length ? rows[rows.length - 1].trade_date : null;
  const lastMtg = win.meetings[win.meetings.length - 1];
  if (lastMtg && dataEnd && lastMtg.date < dataEnd) {
    segs.push({ from: addDaysISO(lastMtg.date, 1), to: dataEnd, label: `→ ${dataEnd} (다음 금통위 전)`, m: {} });
  }

  for (const s of segs) {
    // 데이터 시작 이전 구간은 0이 아니라 "—"로 둔다 — 0 은 "순매수 0"으로 읽혀 위험하다.
    const noData = dataStartAll && s.to < dataStartAll;
    const partial = dataStartAll && s.from < dataStartAll && s.to >= dataStartAll;
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = s.label + (noData ? " · 데이터 없음" : partial ? ` · ${dataStartAll}부터` : "");
    if (noData) th.className = "muted-row";
    tr.appendChild(th);
    const dec = document.createElement("td");
    dec.textContent = s.m.decision ? s.m.decision + (s.m.type === "임시" ? " (임시)" : "") : "—";
    if (s.m.decision === "인상") dec.className = "pos";
    else if (s.m.decision === "인하") dec.className = "neg";
    tr.appendChild(dec);
    tr.appendChild(numTd(s.m.rate ?? null, { digits: 2 }));
    for (const def of FRG_DEFS) {
      const has = !noData && bySym.get(def.sym)?.length;
      tr.appendChild(has ? intTd(sumBetween(def.sym, s.from, s.to)) : dashTd());
      tr.appendChild(has ? intTd(cumAt(def.sym, s.to)) : dashTd());
    }
    tbody.appendChild(tr);
  }

  // 합계 행 — 구간 전체
  const tot = document.createElement("tr");
  tot.className = "total";
  const tl = document.createElement("td");
  tl.textContent = `구간 전체 (${dataStartAll && dataStartAll > win.from ? dataStartAll : win.from} ~ ${dataEnd || win.to})`;
  tot.appendChild(tl);
  tot.appendChild(document.createElement("td"));
  tot.appendChild(document.createElement("td"));
  for (const def of FRG_DEFS) {
    const pts = cumBySym.get(def.sym);
    tot.appendChild(pts ? intTd(pts[pts.length - 1].v) : dashTd());
    tot.appendChild(dashTd());
  }
  tbody.appendChild(tot);
}

function renderFlows() {
  const root = $("#view-flows");
  root.innerHTML = `
    <div class="section-title">자금·보유잔고 추이</div>
    <div class="card">
      <div class="card-head"><h2>외국인 채권잔고·원/달러 환율 일간 추이</h2><span class="hint">당월 일별</span></div>
      <div class="tile-row">
        <div class="tile">
          <div class="t-label" id="foreign-balance-date">최신</div>
          <div class="t-value"><span id="foreign-balance-current">—</span><span class="unit">조원</span></div>
        </div>
        <div class="tile">
          <div class="t-label">전일 대비</div><div class="t-value" id="foreign-balance-change">—</div>
        </div>
      </div>
      <div id="foreign-balance-chart"></div>
      <p class="hint">금감원 상장채권 결제일 기준 일별 잔고와 같은 날 환율 비교 · 좌축 잔고(조원), 우축 원/달러(원) · <a href="${FOREIGN_BALANCE_DEF.url}" target="_blank" rel="noopener">금융감독원 일일 금융시장 동향 원자료 ↗</a></p>
    </div>
    <div class="card">
      <div class="card-head">
        <h2 id="liq-title">펀드 유형별 수탁고 비교</h2><span class="hint">조원</span><span class="spacer"></span>
        <div class="seg wrap" id="liq-seg"></div>
      </div>
      <p class="hint">주식형·채권형은 월말 설정원본, MMF는 일별 설정원본의 월 마지막 관측치 · 버튼을 눌러 단독 또는 중첩 비교</p>
      <div class="tile-row" id="liq-tiles"></div>
      <div id="liq-chart"></div>
      <div class="section-title">월말 수탁고 표</div>
      <p class="hint">최근 12개월 · 선택한 유형만 표시 · 단위 조원</p>
      <div class="table-scroll"><table class="data">
        <thead id="liq-table-head"></thead><tbody id="liq-table-body"></tbody>
      </table></div>
      <p class="hint">
        <a href="${LIQUIDITY_DEFS[0].url}" target="_blank" rel="noopener">주식형·채권형 FreeSIS 원자료 ↗</a>
        · <a href="${LIQUIDITY_DEFS[2].url}" target="_blank" rel="noopener">MMF FreeSIS 원자료 ↗</a>
      </p>
    </div>
    <div class="section-title">현물 수급 (장외 투자자별 거래)</div>
    <p class="section-sub" id="fl-sub"></p>
    <p class="hint">KOFIA 채권정보센터 투자자별 거래현황(장외) · 거래대금 순매수 기준 · 단위 억원</p>
    <div class="tile-row" id="fl-tiles"></div>
    <div class="section-title">투자자 × 채권종류 일간 순매수</div>
    <p class="hint" id="fl-matrix-sub">최신 기준일 하루(1영업일) · 단위 억원</p>
    <div class="table-scroll" id="fl-matrix"></div>
    <div class="card">
      <div class="card-head">
        <h2 id="fl-chart-title">투자주체별 주간 순매수</h2><span class="hint">억원</span><span class="spacer"></span>
        <div class="seg" id="fl-seg">
          <button data-agg="w" class="active">주간</button>
          <button data-agg="m">월간</button>
        </div>
        <div class="controls"><select class="ctl" id="fl-class"></select></div>
      </div>
      <div id="fl-chart"></div>
    </div>
    <div class="section-title">선물 수급 (KRX 국채선물)</div>
    <p class="section-sub" id="fl-fut-sub">근월물(거래량 최대) 기준</p>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>상품</th><th>종목</th><th>종가</th><th>전일비</th><th>주간변동</th><th>미결제약정</th><th>거래량</th><th>외국인 순매수(계약)</th></tr></thead>
      <tbody id="fl-fut"></tbody></table></div>
    <div class="section-title">외국인 국채선물 순매수</div>
    <p class="section-sub" id="fl-frg-sub">KRX 파생 투자자별 거래실적 · 계약 수 기준</p>
    <div class="tile-row" id="fl-frg-tiles"></div>
    <div class="card">
      <div class="card-head"><h2>연초 이후 누적 순매수</h2><span class="hint">계약</span></div>
      <div id="fl-frg-chart"></div>
    </div>
    <div class="section-title">국면별 누적 순매수 (통화정책 사이클)</div>
    <p class="section-sub" id="rf-note">국면을 선택하세요</p>
    <div class="card">
      <div class="card-head">
        <h2>국면별 외국인 국채선물 누적 순매수</h2><span class="hint">계약</span><span class="spacer"></span>
        <div class="seg wrap" id="rf-seg"></div>
      </div>
      <p class="hint">세로줄은 금융통화위원회 통화정책방향 결정회의 · 실선(라벨 표시)은 기준금리를 변경한 회의</p>
      <div id="rf-chart"></div>
      <div class="table-scroll"><table class="data">
        <thead><tr>
          <th>구간 (직전 금통위 다음날 ~ 해당 금통위일)</th><th>결정</th><th>기준금리(%)</th>
          <th>3년 구간 순매수</th><th>3년 누적</th><th>10년 구간 순매수</th><th>10년 누적</th>
        </tr></thead>
        <tbody id="rf-table"></tbody>
      </table></div>
      <p class="hint">회의일 출처: ${MPC_MEETINGS_META.source} · 수집 ${MPC_MEETINGS_META.as_of}
        · ${MPC_MEETINGS_META.caveat}</p>
    </div>`;

  renderLiquidity(root);
  renderForeignBalance(root);

  const net = S.flows.filter((r) => r.trade_type === "순매수");
  if (!net.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "데이터 적재 준비 중 (bond-spread-system sync_investor_flows 실행 후 표시됩니다)";
    $("#fl-matrix", root).appendChild(p);
    renderFlowsFutures(root);
    renderRegimeFutures(root);
    return;
  }

  const dates = distinctDates(net);
  const latest = dates[dates.length - 1];
  $("#fl-sub", root).textContent = `기준일 ${latest}`;
  $("#fl-matrix-sub", root).textContent = `기준일 ${latest} 하루(1영업일) · 단위 억원`;
  const todays = net.filter((r) => r.trade_date === latest);
  const byClassToday = new Map(todays.map((r) => [r.bond_class, r]));

  // 합계(전 채권종류) 일별 시계열 — 타일·차트 공용
  const sumSeries = net.filter((r) => r.bond_class === "합계");

  // 타일: 주요 투자자 당일 순매수 + 기준일이 속한 달의 월초 이후 누적
  const tiles = $("#fl-tiles", root);
  const latestMonth = latest.slice(0, 7);
  const monthDates = new Set(dates.filter((d) => d.startsWith(latestMonth)));
  const monthLabel = `${Number(latest.slice(5, 7))}월 누적 `;
  for (const inv of FLOW_INVESTORS.filter((i) => i.chart)) {
    const cur = byClassToday.get("합계")?.[inv.key] ?? null;
    let cum = 0, has = false;
    for (const r of sumSeries) {
      if (monthDates.has(r.trade_date) && r[inv.key] != null) { cum += r[inv.key]; has = true; }
    }
    const tile = document.createElement("div");
    tile.className = "tile";
    const lab = document.createElement("div");
    lab.className = "t-label";
    lab.textContent = inv.name;
    const val = document.createElement("div");
    val.className = "t-value";
    val.textContent = intSigned(cur);
    if (cur != null) {
      const u = document.createElement("span");
      u.className = "unit";
      u.textContent = "억";
      val.appendChild(u);
    }
    const del = document.createElement("div");
    del.className = "t-delta";
    del.append(monthLabel, intDeltaSpan(has ? cum : null));
    tile.append(lab, val, del);
    tiles.appendChild(tile);
  }

  // 매트릭스 표: 행=투자자(+전체), 열=채권종류 — 기준일 하루(1영업일) 순매수(억원)
  const table = document.createElement("table");
  table.className = "data";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const h of ["투자자", ...FLOW_CLASSES]) {
    const th = document.createElement("th");
    th.textContent = h;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  const tbody = document.createElement("tbody");
  const addRow = (name, get) => {
    const tr = document.createElement("tr");
    const nm = document.createElement("td");
    nm.textContent = name;
    tr.appendChild(nm);
    for (const cls of FLOW_CLASSES) {
      const r = byClassToday.get(cls);
      tr.appendChild(intTd(r ? get(r) : null));
    }
    tbody.appendChild(tr);
  };
  for (const inv of FLOW_INVESTORS) addRow(inv.name, (r) => r[inv.key]);
  addRow("전체", (r) => r.total);
  table.append(thead, tbody);
  $("#fl-matrix", root).appendChild(table);

  // 투자주체별 주간/월간 순매수 막대그래프 — 채권종류 선택(기본 합계) 유지
  const sel = $("#fl-class", root);
  for (const cls of FLOW_CLASSES) {
    const op = document.createElement("option");
    op.value = cls;
    op.textContent = cls === "합계" ? "전체 채권" : cls;
    sel.appendChild(op);
  }
  let agg = "w"; // w=주간(월~금), m=월간(달력월)
  // 주간 키: 해당 주 월요일(ISO), 라벨은 그 주의 마지막 거래일
  const weekKey = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    const wd = (d.getUTCDay() + 6) % 7; // 월=0
    d.setUTCDate(d.getUTCDate() - wd);
    return d.toISOString().slice(0, 10);
  };
  const drawChart = () => {
    const rows = net.filter((r) => r.bond_class === sel.value);
    const keyOf = agg === "w" ? (d) => weekKey(d) : (d) => d.slice(0, 7);
    const buckets = new Map(); // key -> {lastDate, sums:{invKey:num}}
    for (const r of rows) {
      const k = keyOf(r.trade_date);
      const b = buckets.get(k) ?? { lastDate: r.trade_date, sums: {} };
      if (r.trade_date > b.lastDate) b.lastDate = r.trade_date;
      for (const inv of FLOW_INVESTORS) {
        if (r[inv.key] != null) b.sums[inv.key] = (b.sums[inv.key] ?? 0) + r[inv.key];
      }
      buckets.set(k, b);
    }
    const keys = [...buckets.keys()].sort().slice(agg === "w" ? -13 : -7);
    const cats = keys.map((k) => {
      const b = buckets.get(k);
      return agg === "w" ? `~${b.lastDate.slice(5).replace("-", "/")}` : `${+k.slice(5, 7)}월`;
    });
    const series = FLOW_INVESTORS.filter((i) => i.chart).map((inv, idx) => ({
      name: inv.name, cssVar: SLOT_VARS[idx % SLOT_VARS.length],
      values: keys.map((k) => buckets.get(k).sums[inv.key] ?? null),
    }));
    $("#fl-chart-title", root).textContent = `투자주체별 ${agg === "w" ? "주간" : "월간"} 순매수`;
    barChart($("#fl-chart", root), cats, series, { unit: "억" });
  };
  $("#fl-seg", root).addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    agg = btn.dataset.agg;
    for (const b of $("#fl-seg", root).querySelectorAll("button")) b.classList.toggle("active", b === btn);
    drawChart();
  });
  sel.addEventListener("change", drawChart);
  drawChart();

  renderFlowsFutures(root);
  renderRegimeFutures(root);
}

/* ══════════════ 부트스트랩 ══════════════ */
// 로딩을 두 단계로 나눈다. 예전에는 11개 호출을 Promise.all 로 묶어 가장 느린 하나가
// 전 화면을 붙잡았다. 1단계는 첫 화면(일간 모니터링·매트릭스·심리지표·상대가치·국면)에
// 필요한 것만 기다려 바로 그리고, 늦게 오는 탭 데이터는 도착하는 대로 그 탭만 다시 그린다.
// 2단계 로더는 실패 시 빈 배열을 주므로(api.js fetchRecentSafe) 빈 상태로 먼저 그려도 안전하다.
// 2단계 필드(futures·dart·dartDetails·flows·futFrg·issue·issueMonthly)를 새 화면에서 쓰려면
// 그 화면의 렌더러를 아래 fill() 에 함께 물려야 한다 — 1단계 렌더에는 아직 비어 있다.
async function main() {
  // 2단계 요청도 지금 바로 띄운다 — 1단계 대기와 동시에 진행된다
  const pFutures = loadKrxFutures(30);
  const pFlows = loadInvestorFlows(200);
  const pFutFrg = loadFuturesForeign();
  const pIssue = loadIssueStats();
  const pIssueMonthly = loadIssueMonthly();
  const pDart = loadDartOfferings(90);
  const pDartDetails = loadDartDetails(7);

  try {
    const [series, market, stats, meta] = await Promise.all([
      loadSpreadSeries(), loadMarket(), loadRegimeStats(), loadWebMeta(),
    ]);
    S.series = series;
    S.market = market;
    S.stats = stats;

    // 기준일 — 스프레드 데이터 최신 일자 (없으면 시장지표 최신 일자)
    let asof = "";
    for (const arr of series.values()) {
      const last = arr[arr.length - 1];
      if (last && last.d > asof) asof = last.d;
    }
    if (!asof) {
      for (const rows of market.values()) if (rows[0] && rows[0].trade_date > asof) asof = rows[0].trade_date;
    }
    S.asof = asof;
    $("#asof").textContent = asof ? `기준일 ${asof}` : "";
    $("#loading").style.display = "none";

    // 화면 구성: web_meta 있으면 메타, 없으면(null) config.js 폴백 — applyMeta 가 전 화면 렌더
    applyMeta(meta);
    $("#pdfBtn").disabled = false;
  } catch (err) {
    $("#loading").textContent = `데이터 로드 실패: ${err.message}`;
    return;
  }

  // 2단계 — 탭 단위로 데이터가 다 모이면 그 탭만 다시 렌더 (CFG 는 applyMeta 에서 이미 설정됨)
  const fill = (promises, assign, render) =>
    Promise.all(promises).then((vals) => { assign(...vals); render(); }).catch(() => {});

  fill([pFlows, pFutures, pFutFrg],
    (flows, futures, futFrg) => { S.flows = flows; S.futures = futures; S.futFrg = futFrg; },
    renderFlows);
  fill([pIssue, pIssueMonthly],
    (issue, issueMonthly) => { S.issue = issue; S.issueMonthly = issueMonthly; },
    renderIssue);
  fill([pDart, pDartDetails],
    (dart, dartDetails) => { S.dart = dart; S.dartDetails = dartDetails; },
    renderOfferings);
}
main();

// 본드모니터 — 화면 로직 (순수 바닐라 ES 모듈, 외부 의존 없음)
import {
  MONITOR_GROUPS, MATRIX_GROUPS, XCURVE_DEFS, RV_DEFS,
  REGIME_LABELS, MARKET_SYMBOLS, MARKET_TABLE, SLOT_VARS,
} from "./config.js";
import {
  loadSpreadSeries, loadMarket, loadRegimeStats, loadWebMeta,
  loadKrxFutures, loadKrxGovt, loadKrxCorp, loadDartOfferings,
} from "./api.js";
import { lineChart, regimeRangeChart, dualSpreadChart } from "./charts.js";

const $ = (sel, root = document) => root.querySelector(sel);

// 전역 상태 — 로드된 데이터
const S = {
  series: new Map(), market: new Map(),
  stats: { regime: new Map(), rv: new Map(), xcurve: new Map() },
  futures: [], govt: [], corp: [], dart: [],
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
  renderWeekly();
  renderTrades();
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

/* ══ 데이터 파생 유틸 ══ */
function seriesOf(label) { return S.series.get(label) || []; }
const yPoints = (arr) => arr.filter((p) => p.y != null).map((p) => ({ d: p.d, v: p.y }));
const bpPoints = (arr) => arr.filter((p) => p.bp != null).map((p) => ({ d: p.d, v: p.bp }));

// 두 라벨의 수익률차 시계열 ×100 (bp) — 교집합 날짜만
function diffPoints(aLabel, bLabel) {
  const b = new Map(seriesOf(bLabel).filter((p) => p.y != null).map((p) => [p.d, p.y]));
  const out = [];
  for (const p of seriesOf(aLabel)) {
    if (p.y != null && b.has(p.d)) out.push({ d: p.d, v: (p.y - b.get(p.d)) * 100 });
  }
  return out;
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
    <details class="mkt-details">
      <summary>시장지표</summary>
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th>지표</th><th>종가</th><th>전일비</th><th>주간변동률(%)</th></tr></thead>
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
    </div>`;

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
    isY ? { unit: "%", digits: 3 } : { unit: "bp", digits: 1 });
}

/* ══════════════ 섹터 매트릭스 ══════════════ */
function renderMatrix() {
  const root = $("#view-matrix");
  root.innerHTML = `
    <p class="section-sub" id="mx-caption"></p>
    <div class="table-scroll">
      <table class="data">
        <thead><tr id="mx-head"></tr></thead>
        <tbody id="mx-body"></tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-head"><h2 id="mx-title">셀을 클릭하면 추이가 표시됩니다</h2><span class="hint">최근 1년, 스프레드(bp)</span></div>
      <div id="mx-chart"></div>
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
  const root = $("#view-regime");
  const labels = CFG.regimeLabels.filter((l) => S.stats.regime.has(l));
  if (!labels.length) {
    root.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "국면별 통계는 로컬 run_daily 실행 후 제공됩니다";
    root.appendChild(p);
    return;
  }
  root.innerHTML = `
    <p class="section-sub">기준금리 대비 스프레드(bp), 전체 기간 통계</p>
    <div class="controls"><select class="ctl" id="rg-select"></select></div>
    <div class="card"><div id="rg-chart"></div></div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr><th>구간</th><th>정책</th><th>평균(bp)</th><th>고점(bp)</th><th>저점(bp)</th><th>평균수익률(%)</th></tr></thead>
        <tbody id="rg-body"></tbody>
      </table>
    </div>`;

  const sel = $("#rg-select", root);
  for (const l of labels) {
    const op = document.createElement("option");
    op.value = l;
    op.textContent = l;
    sel.appendChild(op);
  }
  const draw = () => {
    const rows = S.stats.regime.get(sel.value) || [];
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

function renderWeekly() {
  const root = $("#view-weekly");
  root.innerHTML = `
    <div class="section-title">채권시장종합</div>
    <p class="section-sub">국고·통안 수익률(%) · 전주비(5영업일)·전월비(bp)</p>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>지표</th><th>수익률(%)</th><th>전주비(bp)</th><th>전월비(bp)</th></tr></thead>
      <tbody id="wk-bond"></tbody></table></div>
    <div class="section-title">국채선물</div>
    <p class="section-sub" id="wk-fut-sub">근월물(거래량 최대) 기준</p>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>상품</th><th>종목</th><th>종가</th><th>전일비</th><th>주간변동</th><th>미결제약정</th><th>거래량</th></tr></thead>
      <tbody id="wk-fut"></tbody></table></div>
    <div class="section-title">장내 국채 지표물 · BEI</div>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>구분</th><th>수익률(%)</th><th>주간변동(bp)</th></tr></thead>
      <tbody id="wk-govt"></tbody></table></div>
    <div class="section-title">시장지표 주간</div>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>지표</th><th>종가</th><th>전일비</th><th>주간변동률(%)</th></tr></thead>
      <tbody id="wk-mkt"></tbody></table></div>`;

  // 1) 채권시장종합 — CFG 의 국고·통안(govt) 그룹 라벨 기반 (하드코딩 없음)
  const bondBody = $("#wk-bond", root);
  const govtLabels = CFG.monitorGroups.filter((g) => g.govt).flatMap((g) => g.labels || []);
  for (const label of govtLabels) {
    const pts = yPoints(seriesOf(label));
    if (!pts.length) continue;
    const last = pts[pts.length - 1];
    const wk = pts.length > 5 ? pts[pts.length - 6] : null; // 5영업일 전
    const mo = pointOnOrBefore(pts, addMonthsISO(last.d, -1));
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = label;
    tr.appendChild(name);
    tr.appendChild(numTd(last.v, { digits: 3 }));
    tr.appendChild(numTd(wk ? (last.v - wk.v) * 100 : null, { signed: true }));
    tr.appendChild(numTd(mo && mo.d !== last.d ? (last.v - mo.v) * 100 : null, { signed: true }));
    bondBody.appendChild(tr);
  }
  if (!bondBody.children.length) hintRow(bondBody, 4, "데이터 적재 중");

  // 2) 국채선물 — 최신 영업일, prod 별 근월물(거래량 최대). 주간변동은 같은 종목코드의 5영업일 전 종가 대비
  const futBody = $("#wk-fut", root);
  if (!S.futures.length) {
    hintRow(futBody, 7, "데이터 적재 중");
  } else {
    const fDates = distinctDates(S.futures);
    const latest = fDates[fDates.length - 1];
    const wkDate = fDates.length > 5 ? fDates[fDates.length - 6] : null;
    $("#wk-fut-sub", root).textContent = `기준일 ${latest} · 근월물(거래량 최대) 기준`;
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
      futBody.appendChild(tr);
    }
    if (!futBody.children.length) hintRow(futBody, 7, "데이터 적재 중");
  }

  // 3) 장내 국채 지표물 + BEI(국고10Y − 물가채10Y)
  const gvBody = $("#wk-govt", root);
  if (!S.govt.length) {
    hintRow(gvBody, 3, "데이터 적재 중");
  } else {
    const gDates = distinctDates(S.govt);
    const latest = gDates[gDates.length - 1];
    const wkDate = gDates.length > 5 ? gDates[gDates.length - 6] : null;
    const at = (date) => S.govt.filter((r) => r.trade_date === date);
    const todays = at(latest);
    const wkRows = wkDate ? at(wkDate) : [];
    // tenor 는 문자열일 수 있음 — 숫자로 정규화해 비교
    const bench = (rows, tenor, infl) =>
      rows.find((r) => +r.tenor === tenor && r.bench_type === "지표" && !!r.is_inflation === infl) ?? null;
    const tenors = [...new Set(todays.filter((r) => r.bench_type === "지표" && !r.is_inflation).map((r) => +r.tenor))]
      .filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
    for (const t of tenors) {
      const cur = bench(todays, t, false);
      const wk = bench(wkRows, t, false);
      if (!cur || cur.close_yield == null) continue;
      const tr = document.createElement("tr");
      const nm = document.createElement("td");
      nm.textContent = `국고 ${t}년`;
      tr.appendChild(nm);
      tr.appendChild(numTd(cur.close_yield, { digits: 3 }));
      tr.appendChild(numTd(wk && wk.close_yield != null ? (cur.close_yield - wk.close_yield) * 100 : null, { signed: true }));
      gvBody.appendChild(tr);
    }
    // BEI = 국고 10년 − 물가채 10년 (bp 아님 — %p ×100 = bp 표기)
    const n10 = bench(todays, 10, false);
    const i10 = todays.find((r) => +r.tenor === 10 && !!r.is_inflation) ?? null;
    if (n10?.close_yield != null && i10?.close_yield != null) {
      const wN = bench(wkRows, 10, false);
      const wI = wkRows.find((r) => +r.tenor === 10 && !!r.is_inflation) ?? null;
      const cur = (n10.close_yield - i10.close_yield) * 100;
      const wk = wN?.close_yield != null && wI?.close_yield != null
        ? cur - (wN.close_yield - wI.close_yield) * 100 : null;
      const tr = document.createElement("tr");
      const nm = document.createElement("td");
      nm.textContent = "BEI (10년, bp)";
      tr.appendChild(nm);
      tr.appendChild(numTd(cur));
      tr.appendChild(numTd(wk, { signed: true }));
      gvBody.appendChild(tr);
    }
    if (!gvBody.children.length) hintRow(gvBody, 3, "데이터 적재 중");
  }

  // 4) 시장지표 주간 — 접이식과 동일 로직, 항상 펼침
  buildMarketTable($("#wk-mkt", root));
}

/* ══════════════ 거래현황 (KRX 일반채권시장) ══════════════ */
// 종목 분류: 여전채 / 회사채·기타 / null(국공채류 제외)
function corpClass(nm) {
  const s = nm || "";
  if (/카드|캐피탈/.test(s)) return "여전채";
  if (/국민주택|지역개발|서울도시|국고|통안|주택금융/.test(s)) return null;
  return "회사채·기타";
}

function renderTrades() {
  const root = $("#view-trades");
  root.innerHTML = `
    <p class="section-sub" id="tr-sub"></p>
    <p class="hint">KRX 일반채권시장 장내 체결 기준 · 장외 체결·개별민평 대비는 미포함</p>
    <div id="tr-top"></div>
    <div class="section-title">수익률 변동 상위</div>
    <p class="section-sub">전 영업일에도 체결된 종목의 체결수익률 변동(bp)</p>
    <div class="tile-row" id="tr-move"></div>`;

  if (!S.corp.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "데이터 적재 중";
    $("#tr-top", root).appendChild(p);
    return;
  }

  const dates = distinctDates(S.corp);
  const latest = dates[dates.length - 1];
  const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
  $("#tr-sub", root).textContent = `기준일 ${latest}`;
  const todays = S.corp.filter((r) => r.trade_date === latest);

  // 표 1: 거래대금 상위 (여전채 / 회사채·기타 각 15)
  const top = $("#tr-top", root);
  for (const cls of ["여전채", "회사채·기타"]) {
    const rows = todays.filter((r) => corpClass(r.isu_nm) === cls)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 15);
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = `${cls} 거래대금 상위`;
    top.appendChild(title);
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "data";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    for (const h of ["종목명", "체결수익률(%)", "고가(%)", "저가(%)", "거래대금(억원)"]) {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    for (const r of rows) {
      const tr = document.createElement("tr");
      const nm = document.createElement("td");
      nm.textContent = r.isu_nm ?? "—";
      tr.appendChild(nm);
      tr.appendChild(numTd(r.close_yield, { digits: 3 }));
      tr.appendChild(numTd(r.high_yield, { digits: 3 }));
      tr.appendChild(numTd(r.low_yield, { digits: 3 }));
      const val = document.createElement("td");
      val.textContent = r.value == null ? "—"
        : (r.value / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
      tr.appendChild(val);
      tbody.appendChild(tr);
    }
    if (!rows.length) hintRow(tbody, 5, "해당 분류 체결 없음");
    table.append(thead, tbody);
    scroll.appendChild(table);
    top.appendChild(scroll);
  }

  // 표 2: 수익률 변동 상위 — 전일 체결 종목과 isu_cd 조인
  const move = $("#tr-move", root);
  if (!prevDate) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "전 영업일 데이터 적재 후 제공됩니다";
    move.appendChild(p);
    return;
  }
  const prevMap = new Map(S.corp.filter((r) => r.trade_date === prevDate && r.close_yield != null)
    .map((r) => [r.isu_cd, r.close_yield]));
  const joined = todays
    .filter((r) => r.close_yield != null && prevMap.has(r.isu_cd) && corpClass(r.isu_nm) != null)
    .map((r) => ({ nm: r.isu_nm, prev: prevMap.get(r.isu_cd), cur: r.close_yield,
      chg: (r.close_yield - prevMap.get(r.isu_cd)) * 100 }));
  const mkMoveTable = (titleText, rows) => {
    const box = document.createElement("div");
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = titleText;
    box.appendChild(title);
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "data";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    for (const h of ["종목명", "전일(%)", "당일(%)", "변동(bp)"]) {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    for (const r of rows) {
      const tr = document.createElement("tr");
      const nm = document.createElement("td");
      nm.textContent = r.nm;
      tr.appendChild(nm);
      tr.appendChild(numTd(r.prev, { digits: 3 }));
      tr.appendChild(numTd(r.cur, { digits: 3 }));
      tr.appendChild(numTd(r.chg, { signed: true }));
      tbody.appendChild(tr);
    }
    if (!rows.length) hintRow(tbody, 4, "해당 종목 없음");
    table.append(thead, tbody);
    scroll.appendChild(table);
    box.appendChild(scroll);
    return box;
  };
  move.append(
    mkMoveTable("강세 상위 10 (수익률 하락)", [...joined].sort((a, b) => a.chg - b.chg).slice(0, 10)),
    mkMoveTable("약세 상위 10 (수익률 상승)", [...joined].sort((a, b) => b.chg - a.chg).slice(0, 10)),
  );
}

/* ══════════════ 발행정보 (DART 채무증권 공시) ══════════════ */
const CORP_CLS = { Y: "유가", K: "코스닥", N: "코넥스", E: "기타" };
// rcept_dt "20260718" | "2026-07-18" → "2026-07-18"
function fmtRceptDt(v) {
  const s = String(v || "");
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10) || "—";
}

function renderOfferings() {
  const root = $("#view-offerings");
  root.innerHTML = `
    <p class="section-sub">DART 채무증권 발행 공시 · 최근 90일</p>
    <div id="of-body"></div>
    <p class="hint">수요예측 밴드·주관사 상세는 2차(신고서 본문 파싱) 예정</p>`;
  const box = $("#of-body", root);

  if (!S.dart.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "DART API 키 등록 후 자동 수집됩니다 (bond-spread-system .env 의 DART_API_KEY)";
    box.appendChild(p);
    return;
  }

  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "data";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const h of ["접수일", "회사명", "보고서명", "법인구분"]) {
    const th = document.createElement("th");
    th.textContent = h;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  const tbody = document.createElement("tbody");
  for (const r of S.dart) {
    const tr = document.createElement("tr");
    const dt = document.createElement("td");
    dt.textContent = fmtRceptDt(r.rcept_dt);
    tr.appendChild(dt);
    const nm = document.createElement("td");
    nm.textContent = r.corp_name ?? "—";
    tr.appendChild(nm);
    const rep = document.createElement("td");
    const url = String(r.url || "");
    if (/^https?:\/\//.test(url)) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = r.report_nm ?? url;
      rep.appendChild(a);
    } else {
      rep.textContent = r.report_nm ?? "—";
    }
    tr.appendChild(rep);
    const cls = document.createElement("td");
    cls.textContent = CORP_CLS[r.corp_cls] ?? (r.corp_cls || "—");
    tr.appendChild(cls);
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  scroll.appendChild(table);
  box.appendChild(scroll);
}

/* ══════════════ 수급동향 (준비 중) ══════════════ */
function renderFlows() {
  const root = $("#view-flows");
  root.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>주요 투자자 수급동향</h2></div>
      <p class="hint">KOFIA 채권정보센터 투자자별 매매동향 데이터 소스 연결 준비 중입니다.
      연결되면 외국인·보험기금·은행·투신의 채권종류·만기별 순매수가 이 탭에 표시됩니다.</p>
    </div>`;
}

/* ══════════════ 부트스트랩 ══════════════ */
async function main() {
  try {
    const [series, market, stats, meta, futures, govt, corp, dart] = await Promise.all([
      loadSpreadSeries(), loadMarket(), loadRegimeStats(), loadWebMeta(),
      loadKrxFutures(30), loadKrxGovt(30), loadKrxCorp(10), loadDartOfferings(90),
    ]);
    S.series = series;
    S.market = market;
    S.stats = stats;
    S.futures = futures;
    S.govt = govt;
    S.corp = corp;
    S.dart = dart;

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
  } catch (err) {
    $("#loading").textContent = `데이터 로드 실패: ${err.message}`;
  }
}
main();

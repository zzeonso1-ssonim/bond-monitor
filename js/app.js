// 본드스프레드 모니터 — 화면 로직 (순수 바닐라 ES 모듈, 외부 의존 없음)
import {
  MONITOR_GROUPS, MATRIX_GROUPS, MATRIX_MATS, XCURVE_DEFS, RV_DEFS,
  REGIME_LABELS, MARKET_SYMBOLS, SLOT_VARS,
} from "./config.js";
import { loadSpreadSeries, loadMarket, loadRegimeStats } from "./api.js";
import { lineChart, regimeRangeChart } from "./charts.js";

const $ = (sel, root = document) => root.querySelector(sel);

// 전역 상태 — 로드된 데이터
const S = { series: new Map(), market: new Map(), stats: { regime: new Map(), rv: new Map(), xcurve: new Map() }, asof: "" };

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
const mon = { label: null, govt: false, mode: "y" };

function renderMonitor() {
  const root = $("#view-monitor");
  root.innerHTML = `
    <div class="tile-row" id="mon-tiles"></div>
    <div class="card">
      <div class="card-head">
        <h2 id="mon-title"></h2><span class="hint">최근 1년</span><span class="spacer"></span>
        <div class="seg" id="mon-seg">
          <button data-mode="y" class="active">수익률</button>
          <button data-mode="bp">스프레드</button>
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

  // 30개 지표 요약 표
  const body = $("#mon-body", root);
  for (const g of MONITOR_GROUPS) {
    const gr = document.createElement("tr");
    gr.className = "group-row";
    const gtd = document.createElement("td");
    gtd.colSpan = 8;
    gtd.textContent = g.name;
    gr.appendChild(gtd);
    body.appendChild(gr);

    for (const label of g.labels) {
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

  // 행 클릭 → 카드 차트
  body.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.sel-row");
    if (!tr) return;
    selectMonitor(tr.dataset.label, tr.dataset.govt === "1");
  });

  // 세그먼트 토글 (수익률|스프레드)
  $("#mon-seg", root).addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    mon.mode = btn.dataset.mode;
    for (const b of $("#mon-seg").querySelectorAll("button")) b.classList.toggle("active", b === btn);
    updateMonitorChart();
  });

  // 기본 선택: 첫 지표
  const first = MONITOR_GROUPS[0];
  selectMonitor(first.labels[0], !!first.govt);
}

function selectMonitor(label, govt) {
  mon.label = label;
  mon.govt = govt;
  if (govt && mon.mode === "bp") mon.mode = "y"; // 국고·통안은 수익률만
  const bpBtn = $('#mon-seg button[data-mode="bp"]');
  bpBtn.disabled = govt;
  for (const b of $("#mon-seg").querySelectorAll("button")) b.classList.toggle("active", b.dataset.mode === mon.mode);
  for (const tr of document.querySelectorAll("#mon-body tr.sel-row")) tr.classList.toggle("selected", tr.dataset.label === label);
  updateMonitorChart();
}

function updateMonitorChart() {
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
  for (const m of MATRIX_MATS) {
    const th = document.createElement("th");
    th.textContent = `${m}년`;
    head.appendChild(th);
  }

  // 셀 값 계산 (히트맵 농도 산정용 최댓값 포함)
  const rows = [];
  let maxV = 0;
  for (const g of MATRIX_GROUPS) {
    const items = [];
    for (const m of MATRIX_MATS) {
      if (!g.mats.includes(m)) { items.push(null); continue; }
      const label = `${g.labelPrefix} ${m}년`;
      const pts = bpPoints(seriesOf(label));
      const cur = pts.length ? pts[pts.length - 1].v : null;
      const prev5 = pts.length > 5 ? pts[pts.length - 6].v : null; // 5영업일 전
      items.push({ label, mat: m, cur, chg: cur != null && prev5 != null ? cur - prev5 : null });
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

/* ══════════════ 이종커브 ══════════════ */
function renderXcurve() {
  const root = $("#view-xcurve");
  root.innerHTML = `
    <div class="note"><strong>이종커브</strong> = 크레딧 단기물(2년) − 국고 3년.
    금리 리스크가 완화되면 크레딧 매수가 몰려 스프레드가 축소되고, 리스크 확대 국면에서는 확대된다 — 채권 투자심리 지표.</div>
    <div class="tile-row" id="xc-tiles"></div>
    <div class="card">
      <div class="card-head"><h2>이종커브 추이</h2><span class="hint">bp</span></div>
      <div id="xc-chart"></div>
    </div>
    <div class="section-title">국면별 통계</div>
    <div id="xc-regime"></div>`;

  // 스탯 타일 — 현재 bp, 전일비·1주비
  const tiles = $("#xc-tiles", root);
  const chartSeries = [];
  for (const def of XCURVE_DEFS) {
    const pts = diffPoints(def.a, def.b);
    chartSeries.push({ name: def.label, cssVar: SLOT_VARS[def.slot], points: pts });
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
    <div class="table-scroll">
      <table class="data">
        <thead><tr><th>지표</th><th>현재(bp)</th><th>전일(bp)</th><th>1주(bp)</th><th>1개월(bp)</th></tr></thead>
        <tbody id="rv-body"></tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-head"><h2 id="rv-title"></h2><span class="hint">1·2·3년, bp</span></div>
      <div id="rv-chart"></div>
    </div>
    <div id="rv-regime"></div>`;

  const body = $("#rv-body", root);
  for (const g of RV_DEFS) {
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
    selectRvGroup(tr.dataset.group);
  });

  selectRvGroup(RV_DEFS[0].group);
}

function selectRvGroup(groupName) {
  rvGroup = RV_DEFS.find((g) => g.group === groupName) || RV_DEFS[0];
  for (const tr of document.querySelectorAll("#rv-body tr.sel-row")) tr.classList.toggle("selected", tr.dataset.group === rvGroup.group);
  $("#rv-title").textContent = `${rvGroup.group} 추이`;

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
  const labels = REGIME_LABELS.filter((l) => S.stats.regime.has(l));
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

/* ══════════════ 부트스트랩 ══════════════ */
async function main() {
  try {
    const [series, market, stats] = await Promise.all([loadSpreadSeries(), loadMarket(), loadRegimeStats()]);
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

    renderMonitor();
    renderMatrix();
    renderXcurve();
    renderRv();
    renderRegime();
  } catch (err) {
    $("#loading").textContent = `데이터 로드 실패: ${err.message}`;
  }
}
main();

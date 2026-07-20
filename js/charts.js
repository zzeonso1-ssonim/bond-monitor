// 경량 SVG 차트 — 라인(크로스헤어 툴팁 포함)·국면 레인지 차트
// dataviz 규칙: 2px 라인, 헤어라인 실선 그리드, 시리즈≥2 시 범례, 툴팁은 전 시리즈 표시,
// 텍스트는 textContent 로만 삽입(외부 데이터 신뢰 금지), 색은 CSS 변수 참조.

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) { hi = lo + 1; }
  const span = hi - lo;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const start = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function fmtDateShort(iso) {
  return `${iso.slice(2, 4)}.${+iso.slice(5, 7)}`;
}
function fmtDateFull(iso) {
  return `${iso.slice(0, 4)}-${iso.slice(5, 7)}-${iso.slice(8, 10)}`;
}

// series: [{name, cssVar, points:[{d,v}]}] — 모든 시리즈는 동일 축(단위 동일)
export function lineChart(container, series, opts = {}) {
  const W = 960, H = 300;
  const M = { l: 46, r: 14, t: 12, b: 26 };
  const unit = opts.unit || "";
  const digits = opts.digits ?? 1;

  container.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  wrap.appendChild(svg);
  container.appendChild(wrap);

  const live = series.filter((s) => s.points.length > 0);
  if (!live.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "표시할 데이터가 없습니다.";
    container.appendChild(p);
    return;
  }

  // 공통 날짜축(합집합, 오름차순)
  const dateSet = new Set();
  for (const s of live) for (const p of s.points) dateSet.add(p.d);
  const dates = [...dateSet].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));
  const byDate = live.map((s) => {
    const m = new Map(s.points.map((p) => [p.d, p.v]));
    return dates.map((d) => (m.has(d) ? m.get(d) : null));
  });

  let vLo = Infinity, vHi = -Infinity;
  for (const arr of byDate) for (const v of arr) if (v != null) { vLo = Math.min(vLo, v); vHi = Math.max(vHi, v); }
  const pad = (vHi - vLo || 1) * 0.08;
  vLo -= pad; vHi += pad;
  if (opts.zeroLine && vLo > 0) vLo = 0;

  const x = (i) => M.l + (i / Math.max(dates.length - 1, 1)) * (W - M.l - M.r);
  const y = (v) => H - M.b - ((v - vLo) / (vHi - vLo)) * (H - M.t - M.b);

  // 그리드 + y축 눈금
  const ticks = niceTicks(vLo, vHi, 5);
  for (const t of ticks) {
    svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: y(t), y2: y(t), stroke: "var(--grid)", "stroke-width": 1 }));
    const lab = el("text", { x: M.l - 8, y: y(t) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--muted)" });
    lab.textContent = t.toLocaleString(undefined, { maximumFractionDigits: 3 });
    svg.appendChild(lab);
  }
  // 0 기준선 강조(있으면)
  if (vLo < 0 && vHi > 0) {
    svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: y(0), y2: y(0), stroke: "var(--baseline)", "stroke-width": 1 }));
  }

  // x축 눈금 — 월 시작 기준 최대 8개
  const monthFirst = [];
  let prevMonth = "";
  dates.forEach((d, i) => {
    const m = d.slice(0, 7);
    if (m !== prevMonth) { monthFirst.push(i); prevMonth = m; }
  });
  const stride = Math.ceil(monthFirst.length / 8);
  for (let k = 0; k < monthFirst.length; k += stride) {
    const i = monthFirst[k];
    const lab = el("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" });
    lab.textContent = fmtDateShort(dates[i]);
    svg.appendChild(lab);
  }
  svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, stroke: "var(--baseline)", "stroke-width": 1 }));

  // 시리즈 패스 (+ 마지막 값 마커: 서페이스 링 2px)
  live.forEach((s, si) => {
    let dAttr = "", started = false;
    byDate[si].forEach((v, i) => {
      if (v == null) { started = false; return; }
      dAttr += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      started = true;
    });
    svg.appendChild(el("path", {
      d: dAttr, fill: "none", stroke: `var(${s.cssVar})`,
      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    for (let i = byDate[si].length - 1; i >= 0; i--) {
      const v = byDate[si][i];
      if (v != null) {
        svg.appendChild(el("circle", { cx: x(i), cy: y(v), r: 5.5, fill: "var(--surface-1)" }));
        svg.appendChild(el("circle", { cx: x(i), cy: y(v), r: 4, fill: `var(${s.cssVar})` }));
        break;
      }
    }
  });

  // ── 크로스헤어 + 툴팁 ──
  const cross = el("line", { y1: M.t, y2: H - M.b, stroke: "var(--baseline)", "stroke-width": 1, visibility: "hidden" });
  svg.appendChild(cross);
  const dots = live.map((s) => {
    const g = el("g", { visibility: "hidden" });
    g.appendChild(el("circle", { r: 6, fill: "var(--surface-1)" }));
    g.appendChild(el("circle", { r: 4, fill: `var(${s.cssVar})` }));
    svg.appendChild(g);
    return g;
  });

  const tip = document.createElement("div");
  tip.className = "viz-tooltip";
  const tipDate = document.createElement("div");
  tipDate.className = "tt-date";
  tip.appendChild(tipDate);
  const tipRows = live.map((s) => {
    const row = document.createElement("div");
    row.className = "tt-row";
    const key = document.createElement("span");
    key.className = "tt-key";
    key.style.borderTopColor = getComputedStyle(document.documentElement).getPropertyValue(s.cssVar) || "";
    key.dataset.cssvar = s.cssVar;
    const nm = document.createElement("span");
    nm.className = "tt-name";
    nm.textContent = live.length > 1 ? s.name : (opts.tooltipLabel || s.name);
    const val = document.createElement("span");
    val.className = "tt-val";
    row.append(key, nm, val);
    tip.appendChild(row);
    return { key, val };
  });
  wrap.appendChild(tip);

  function refreshKeyColors() {
    const cs = getComputedStyle(document.documentElement);
    live.forEach((s, i) => { tipRows[i].key.style.borderTopColor = cs.getPropertyValue(s.cssVar); });
  }

  function onMove(ev) {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    if (px < M.l - 10 || px > W - M.r + 10) { onLeave(); return; }
    const frac = (px - M.l) / (W - M.l - M.r);
    const i = Math.max(0, Math.min(dates.length - 1, Math.round(frac * (dates.length - 1))));
    cross.setAttribute("x1", x(i));
    cross.setAttribute("x2", x(i));
    cross.setAttribute("visibility", "visible");
    tipDate.textContent = fmtDateFull(dates[i]);
    refreshKeyColors();
    live.forEach((s, si) => {
      const v = byDate[si][i];
      if (v == null) {
        dots[si].setAttribute("visibility", "hidden");
        tipRows[si].val.textContent = "—";
      } else {
        dots[si].setAttribute("transform", `translate(${x(i)},${y(v)})`);
        dots[si].setAttribute("visibility", "visible");
        tipRows[si].val.textContent = v.toFixed(digits) + unit;
      }
    });
    tip.style.display = "block";
    const wr = wrap.getBoundingClientRect();
    const tx = ((x(i) / W) * wr.width);
    const flip = tx > wr.width * 0.62;
    tip.style.left = flip ? "auto" : `${tx + 14}px`;
    tip.style.right = flip ? `${wr.width - tx + 14}px` : "auto";
    tip.style.top = "10px";
  }
  function onLeave() {
    cross.setAttribute("visibility", "hidden");
    dots.forEach((g) => g.setAttribute("visibility", "hidden"));
    tip.style.display = "none";
  }
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerleave", onLeave);

  // 범례 (시리즈 ≥ 2일 때만 — 단일 시리즈는 제목이 이름을 대신)
  if (live.length > 1) {
    const lg = document.createElement("div");
    lg.className = "legend";
    for (const s of live) {
      const item = document.createElement("span");
      item.className = "lg";
      const key = document.createElement("span");
      key.className = "lg-key";
      key.style.borderTopColor = `var(${s.cssVar})`;
      const nm = document.createElement("span");
      nm.textContent = s.name;
      item.append(key, nm);
      lg.appendChild(item);
    }
    container.appendChild(lg);
  }
}

// 국면별 레인지 차트 — 버킷별 lo–hi 트랙 + 평균 마커, 현재값 기준선
// rows: [{bucket, bucket_type, avg_bp, hi_bp, lo_bp}] (현재 행 포함)
export function regimeRangeChart(container, rows, opts = {}) {
  const cur = rows.find((r) => r.bucket_type === "current");
  const buckets = rows.filter((r) => r.bucket_type !== "current" && r.avg_bp != null);
  container.textContent = "";
  if (!buckets.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "국면별 통계가 아직 없습니다. (로컬 run_daily 실행 시 갱신)";
    container.appendChild(p);
    return;
  }

  const rowH = 30, labW = 190;
  const W = 960, M = { l: labW, r: 60, t: 26, b: 8 };
  const H = M.t + buckets.length * rowH + M.b;

  let lo = Infinity, hi = -Infinity;
  for (const b of buckets) {
    lo = Math.min(lo, b.lo_bp ?? b.avg_bp);
    hi = Math.max(hi, b.hi_bp ?? b.avg_bp);
  }
  if (cur?.avg_bp != null) { lo = Math.min(lo, cur.avg_bp); hi = Math.max(hi, cur.avg_bp); }
  const pad = (hi - lo || 1) * 0.06;
  lo -= pad; hi += pad;
  const x = (v) => M.l + ((v - lo) / (hi - lo)) * (W - M.l - M.r);

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}` });
  wrap.appendChild(svg);
  container.appendChild(wrap);

  for (const t of niceTicks(lo, hi, 6)) {
    svg.appendChild(el("line", { x1: x(t), x2: x(t), y1: M.t - 4, y2: H - M.b, stroke: "var(--grid)", "stroke-width": 1 }));
    const lab = el("text", { x: x(t), y: M.t - 10, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" });
    lab.textContent = t.toLocaleString();
    svg.appendChild(lab);
  }

  buckets.forEach((b, i) => {
    const cy = M.t + i * rowH + rowH / 2;
    const name = el("text", { x: labW - 12, y: cy + 4, "text-anchor": "end", "font-size": 12, fill: "var(--text-secondary)" });
    name.textContent = b.bucket;
    svg.appendChild(name);
    if (b.lo_bp != null && b.hi_bp != null) {
      svg.appendChild(el("rect", {
        x: x(b.lo_bp), y: cy - 3, width: Math.max(x(b.hi_bp) - x(b.lo_bp), 2), height: 6,
        rx: 3, fill: "var(--accent-wash)",
      }));
    }
    svg.appendChild(el("circle", { cx: x(b.avg_bp), cy, r: 6.5, fill: "var(--surface-1)" }));
    svg.appendChild(el("circle", { cx: x(b.avg_bp), cy, r: 4.5, fill: b.bucket_type === "policy" ? "var(--series-6)" : "var(--series-1)" }));
    const av = el("text", { x: x(b.avg_bp), y: cy - 9, "text-anchor": "middle", "font-size": 10.5, fill: "var(--text-secondary)" });
    av.textContent = b.avg_bp.toFixed(1);
    svg.appendChild(av);
  });

  if (cur?.avg_bp != null) {
    svg.appendChild(el("line", { x1: x(cur.avg_bp), x2: x(cur.avg_bp), y1: M.t - 4, y2: H - M.b, stroke: "var(--up)", "stroke-width": 1.5, "stroke-dasharray": "" }));
    const lab = el("text", { x: Math.min(x(cur.avg_bp) + 6, W - 4), y: M.t + 8, "font-size": 11, "font-weight": 700, fill: "var(--up)" });
    lab.textContent = `현재 ${cur.avg_bp.toFixed(1)}${opts.unit || "bp"}${cur.pctile != null ? ` (백분위 ${cur.pctile}%)` : ""}`;
    svg.appendChild(lab);
  }

  const lg = document.createElement("div");
  lg.className = "legend";
  const mk = (cssVar, text) => {
    const item = document.createElement("span");
    item.className = "lg";
    const key = document.createElement("span");
    key.className = "lg-key";
    key.style.borderTopColor = `var(${cssVar})`;
    const nm = document.createElement("span");
    nm.textContent = text;
    item.append(key, nm);
    return item;
  };
  lg.append(mk("--series-1", "시기별 국면 평균"), mk("--series-6", "정책국면 평균"), mk("--up", "현재"));
  const hint = document.createElement("span");
  hint.className = "lg";
  hint.textContent = "트랙 = 국면 내 저점–고점";
  lg.appendChild(hint);
  container.appendChild(lg);
}

// ── 이축 커브-스프레드 차트 — "두 지표 차이" 모드 전용 ──
// 주의: 이 프로젝트에서 이축(dual-axis)은 이 차트 하나만 허용한다.
// 좌축(금리 레벨 %)과 우축(그 차이 bp)이 파생 관계라 예외적으로 쓰는 것 —
// 다른 차트에 이축을 확산시키지 말 것.
// data: { a:{name, points:[{d,v}]}, b:{name, points}, spread:{name, points} }
// 색 고정: A=--series-1(파랑), B=--series-2(녹색) — 표의 A/B 뱃지 색과 일치, 스프레드 영역=--series-6 wash
export function dualSpreadChart(container, data, opts = {}) {
  const W = 960, H = 300;
  const M = { l: 46, r: 46, t: 12, b: 26 }; // 우측 마진 = 우축(bp) 라벨 공간

  container.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  wrap.appendChild(svg);
  container.appendChild(wrap);

  const A = data.a, B = data.b, SP = data.spread;
  if (!A?.points?.length || !B?.points?.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "표시할 데이터가 없습니다.";
    container.appendChild(p);
    return;
  }

  // 공통 날짜축 — 세 시리즈 합집합
  const dateSet = new Set();
  for (const s of [A, B, SP]) for (const p of s?.points || []) dateSet.add(p.d);
  const dates = [...dateSet].sort();
  const mapOf = (s) => new Map((s?.points || []).map((p) => [p.d, p.v]));
  const mA = mapOf(A), mB = mapOf(B), mS = mapOf(SP);
  const vA = dates.map((d) => (mA.has(d) ? mA.get(d) : null));
  const vB = dates.map((d) => (mB.has(d) ? mB.get(d) : null));
  const vS = dates.map((d) => (mS.has(d) ? mS.get(d) : null));

  // 좌축(%): A·B 값 범위
  let lLo = Infinity, lHi = -Infinity;
  for (const arr of [vA, vB]) for (const v of arr) if (v != null) { lLo = Math.min(lLo, v); lHi = Math.max(lHi, v); }
  const lPad = (lHi - lLo || 1) * 0.08;
  lLo -= lPad; lHi += lPad;
  // 우축(bp): 스프레드 범위 — 영역 기준선 0 포함
  let rLo = 0, rHi = 0;
  for (const v of vS) if (v != null) { rLo = Math.min(rLo, v); rHi = Math.max(rHi, v); }
  const rPad = (rHi - rLo || 1) * 0.08;
  rLo -= rPad; rHi += rPad;

  const x = (i) => M.l + (i / Math.max(dates.length - 1, 1)) * (W - M.l - M.r);
  const yL = (v) => H - M.b - ((v - lLo) / (lHi - lLo)) * (H - M.t - M.b);
  const yR = (v) => H - M.b - ((v - rLo) / (rHi - rLo)) * (H - M.t - M.b);

  // 좌축 눈금 + 그리드 (그리드는 좌축만 — 이중화 금지)
  for (const t of niceTicks(lLo, lHi, 5)) {
    svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: yL(t), y2: yL(t), stroke: "var(--grid)", "stroke-width": 1 }));
    const lab = el("text", { x: M.l - 8, y: yL(t) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--muted)" });
    lab.textContent = t.toLocaleString(undefined, { maximumFractionDigits: 3 });
    svg.appendChild(lab);
  }
  // 우축 눈금 — 라벨만
  for (const t of niceTicks(rLo, rHi, 5)) {
    const lab = el("text", { x: W - M.r + 8, y: yR(t) + 4, "text-anchor": "start", "font-size": 11, fill: "var(--muted)" });
    lab.textContent = (t === 0 ? 0 : t).toLocaleString(); // -0 표기 방지
    svg.appendChild(lab);
  }

  // x축 눈금 — 월 시작 기준 최대 8개
  const monthFirst = [];
  let prevMonth = "";
  dates.forEach((d, i) => {
    const mo = d.slice(0, 7);
    if (mo !== prevMonth) { monthFirst.push(i); prevMonth = mo; }
  });
  const stride = Math.ceil(monthFirst.length / 8);
  for (let k = 0; k < monthFirst.length; k += stride) {
    const i = monthFirst[k];
    const lab = el("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" });
    lab.textContent = fmtDateShort(dates[i]);
    svg.appendChild(lab);
  }
  svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, stroke: "var(--baseline)", "stroke-width": 1 }));

  // 스프레드 영역 — 우축 0 기준선에서 시작, null 구간은 끊어서 그림
  const y0 = yR(0);
  svg.appendChild(el("line", { x1: M.l, x2: W - M.r, y1: y0, y2: y0, stroke: "var(--baseline)", "stroke-width": 1 }));
  let runStart = -1;
  const flushArea = (endIdx) => {
    if (runStart < 0) return;
    let fill = `M${x(runStart).toFixed(1)},${y0.toFixed(1)}`;
    let edge = "";
    for (let i = runStart; i <= endIdx; i++) {
      const px = x(i).toFixed(1), py = yR(vS[i]).toFixed(1);
      fill += `L${px},${py}`;
      edge += `${edge ? "L" : "M"}${px},${py}`;
    }
    fill += `L${x(endIdx).toFixed(1)},${y0.toFixed(1)}Z`;
    svg.appendChild(el("path", { d: fill, fill: "color-mix(in srgb, var(--series-6) 12%, transparent)", stroke: "none" }));
    svg.appendChild(el("path", { d: edge, fill: "none", stroke: "var(--series-6)", "stroke-width": 1.5, "stroke-linejoin": "round" }));
    runStart = -1;
  };
  vS.forEach((v, i) => {
    if (v == null) { flushArea(i - 1); return; }
    if (runStart < 0) runStart = i;
    if (i === vS.length - 1) flushArea(i);
  });

  // A·B 금리 라인 (2px) + 끝점 마커
  const lines = [
    { vals: vA, cssVar: "--series-1" },
    { vals: vB, cssVar: "--series-2" },
  ];
  for (const ln of lines) {
    let dAttr = "", started = false;
    ln.vals.forEach((v, i) => {
      if (v == null) { started = false; return; }
      dAttr += `${started ? "L" : "M"}${x(i).toFixed(1)},${yL(v).toFixed(1)}`;
      started = true;
    });
    svg.appendChild(el("path", {
      d: dAttr, fill: "none", stroke: `var(${ln.cssVar})`,
      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    for (let i = ln.vals.length - 1; i >= 0; i--) {
      if (ln.vals[i] != null) {
        svg.appendChild(el("circle", { cx: x(i), cy: yL(ln.vals[i]), r: 5.5, fill: "var(--surface-1)" }));
        svg.appendChild(el("circle", { cx: x(i), cy: yL(ln.vals[i]), r: 4, fill: `var(${ln.cssVar})` }));
        break;
      }
    }
  }

  // ── 크로스헤어 + 툴팁 (A %, B %, 스프레드 bp — 키 모양으로 라인/영역 구분) ──
  const cross = el("line", { y1: M.t, y2: H - M.b, stroke: "var(--baseline)", "stroke-width": 1, visibility: "hidden" });
  svg.appendChild(cross);
  const mkDot = (cssVar) => {
    const g = el("g", { visibility: "hidden" });
    g.appendChild(el("circle", { r: 6, fill: "var(--surface-1)" }));
    g.appendChild(el("circle", { r: 4, fill: `var(${cssVar})` }));
    svg.appendChild(g);
    return g;
  };
  const dotA = mkDot("--series-1"), dotB = mkDot("--series-2"), dotS = mkDot("--series-6");

  const tip = document.createElement("div");
  tip.className = "viz-tooltip";
  const tipDate = document.createElement("div");
  tipDate.className = "tt-date";
  tip.appendChild(tipDate);
  const mkRow = (name, cssVar, square) => {
    const row = document.createElement("div");
    row.className = "tt-row";
    const key = document.createElement("span");
    key.className = square ? "tt-key-sq" : "tt-key";
    if (square) key.style.background = `var(${cssVar})`;
    else key.style.borderTopColor = `var(${cssVar})`;
    const nm = document.createElement("span");
    nm.className = "tt-name";
    nm.textContent = name;
    const val = document.createElement("span");
    val.className = "tt-val";
    row.append(key, nm, val);
    tip.appendChild(row);
    return val;
  };
  const valA = mkRow(A.name, "--series-1", false);
  const valB = mkRow(B.name, "--series-2", false);
  const valS = mkRow(SP?.name || "스프레드(우, bp)", "--series-6", true);
  wrap.appendChild(tip);

  function onMove(ev) {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    if (px < M.l - 10 || px > W - M.r + 10) { onLeave(); return; }
    const frac = (px - M.l) / (W - M.l - M.r);
    const i = Math.max(0, Math.min(dates.length - 1, Math.round(frac * (dates.length - 1))));
    cross.setAttribute("x1", x(i));
    cross.setAttribute("x2", x(i));
    cross.setAttribute("visibility", "visible");
    tipDate.textContent = fmtDateFull(dates[i]);
    const put = (dot, v, val, yFn, digits, unit) => {
      if (v == null) {
        dot.setAttribute("visibility", "hidden");
        val.textContent = "—";
      } else {
        dot.setAttribute("transform", `translate(${x(i)},${yFn(v)})`);
        dot.setAttribute("visibility", "visible");
        val.textContent = v.toFixed(digits) + unit;
      }
    };
    put(dotA, vA[i], valA, yL, 3, "%");
    put(dotB, vB[i], valB, yL, 3, "%");
    put(dotS, vS[i], valS, yR, 1, "bp");
    tip.style.display = "block";
    const wr = wrap.getBoundingClientRect();
    const tx = ((x(i) / W) * wr.width);
    const flip = tx > wr.width * 0.62;
    tip.style.left = flip ? "auto" : `${tx + 14}px`;
    tip.style.right = flip ? `${wr.width - tx + 14}px` : "auto";
    tip.style.top = "10px";
  }
  function onLeave() {
    cross.setAttribute("visibility", "hidden");
    for (const g of [dotA, dotB, dotS]) g.setAttribute("visibility", "hidden");
    tip.style.display = "none";
  }
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerleave", onLeave);

  // 범례 — A·B 는 라인 키, 스프레드는 사각 스와치 (필수)
  const lg = document.createElement("div");
  lg.className = "legend";
  const mkLg = (name, cssVar, square) => {
    const item = document.createElement("span");
    item.className = "lg";
    const key = document.createElement("span");
    key.className = square ? "lg-key-sq" : "lg-key";
    if (square) key.style.background = `var(${cssVar})`;
    else key.style.borderTopColor = `var(${cssVar})`;
    const nm = document.createElement("span");
    nm.textContent = name;
    item.append(key, nm);
    return item;
  };
  lg.append(
    mkLg(A.name, "--series-1", false),
    mkLg(B.name, "--series-2", false),
    mkLg(SP?.name || "스프레드(우, bp)", "--series-6", true),
  );
  container.appendChild(lg);
}

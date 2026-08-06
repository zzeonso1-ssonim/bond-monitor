// 주간 채권시장 보고서 — 브라우저 Canvas 2쪽을 PDF 1.4로 패키징한다.
// 외부 런타임 없이 동작하며, 화면 테마와 무관하게 화이트 인쇄 양식을 사용한다.

const PAGE_W = 2339;
const PAGE_H = 1654;
const PDF_W = 842;
const PDF_H = 595;
const BLUE = "#0052ff";
const BLUE_2 = "#6f98ff";
const INK = "#0a0b0d";
const MUTED = "#5b616e";
const LINE = "#d8dee8";
const PANEL = "#f6f8fb";
const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", Pretendard, Arial, sans-serif';
const MONO = '"IBM Plex Mono", Menlo, Consolas, monospace';

const finite = (v) => v != null && Number.isFinite(+v);
const num = (v, digits = 2) => finite(v) ? (+v).toLocaleString("ko-KR", {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
}) : "—";
const signed = (v, digits = 1) => finite(v)
  ? `${+v > 0 ? "+" : ""}${(+v).toFixed(digits)}` : "—";
const dateShort = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "—";

function canvasPage() {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = "middle";
  return { canvas, ctx };
}

function roundRect(ctx, x, y, w, h, r = 22, fill = PANEL, stroke = LINE) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function text(ctx, value, x, y, opts = {}) {
  const { size = 20, color = INK, weight = 400, align = "left", mono = false } = opts;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
  ctx.textAlign = align;
  ctx.fillText(String(value ?? ""), x, y);
}

function header(ctx, pageNo, asof, subtitle) {
  text(ctx, "WEEKLY BOND MARKET", 85, 61, { size: 18, color: BLUE, weight: 700 });
  text(ctx, pageNo === 1 ? "주간 채권시장" : "주간 채권시장 차트", 85, 112, { size: 48, weight: 400 });
  text(ctx, subtitle, 85, 157, { size: 20, color: MUTED });
  roundRect(ctx, 1905, 48, 349, 78, 28, "#eef3ff", null);
  text(ctx, `기준일 ${asof || "—"}`, 2079, 87, { size: 19, color: BLUE, weight: 700, align: "center", mono: true });
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(85, 194); ctx.lineTo(2254, 194); ctx.stroke();
}

function footer(ctx, pageNo, note) {
  ctx.strokeStyle = LINE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(85, 1586); ctx.lineTo(2254, 1586); ctx.stroke();
  text(ctx, note, 85, 1618, { size: 15, color: MUTED });
  text(ctx, `${pageNo} / 2`, 2254, 1618, { size: 16, color: MUTED, align: "right", mono: true });
}

function tableCard(ctx, cfg) {
  const { x, y, w, h, title, subtitle = "", columns, rows, widths, rowSize = 19 } = cfg;
  roundRect(ctx, x, y, w, h);
  text(ctx, title, x + 28, y + 35, { size: 24, weight: 700 });
  if (subtitle) text(ctx, subtitle, x + w - 28, y + 35, { size: 15, color: MUTED, align: "right" });
  const top = y + 68;
  const left = x + 25;
  const innerW = w - 50;
  const colW = widths || columns.map(() => innerW / columns.length);
  ctx.fillStyle = "#eef2f7"; ctx.fillRect(left, top, innerW, 39);
  let cx = left;
  columns.forEach((c, i) => {
    const align = i === 0 ? "left" : "right";
    text(ctx, c, align === "left" ? cx + 9 : cx + colW[i] - 9, top + 20, {
      size: 16, color: MUTED, weight: 700, align,
    });
    cx += colW[i];
  });
  const available = h - 119;
  const rh = Math.min(42, available / Math.max(rows.length, 1));
  rows.forEach((row, ri) => {
    const ry = top + 39 + ri * rh;
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, ry + rh); ctx.lineTo(left + innerW, ry + rh); ctx.stroke();
    let px = left;
    row.forEach((v, i) => {
      const align = i === 0 ? "left" : "right";
      text(ctx, v, align === "left" ? px + 9 : px + colW[i] - 9, ry + rh / 2, {
        size: rowSize, color: i === 0 ? INK : MUTED, weight: i === 0 ? 600 : 400,
        align, mono: i !== 0,
      });
      px += colW[i];
    });
  });
}

function series(state, label) { return state.series.get(label) || []; }
function yieldPoints(state, label) {
  return series(state, label).filter((p) => finite(p.y)).map((p) => ({ d: p.d, v: +p.y }));
}
function bpPoints(state, label) {
  return series(state, label).filter((p) => finite(p.bp)).map((p) => ({ d: p.d, v: +p.bp }));
}
function diffPoints(state, a, b) {
  const bm = new Map(yieldPoints(state, b).map((p) => [p.d, p.v]));
  return yieldPoints(state, a).filter((p) => bm.has(p.d)).map((p) => ({ d: p.d, v: (p.v - bm.get(p.d)) * 100 }));
}
function weeklyDelta(points, scale = 1) {
  if (points.length < 2) return null;
  const i = Math.max(0, points.length - 6);
  return (points[points.length - 1].v - points[i].v) * scale;
}
function marketPoints(state, symbol) {
  return (state.market.get(symbol) || []).filter((r) => finite(r.value))
    .map((r) => ({ d: r.trade_date, v: +r.value })).sort((a, b) => a.d.localeCompare(b.d));
}
function valueOn(points, d) { return points.find((p) => p.d === d)?.v ?? null; }
function latest(points) { return points.length ? points[points.length - 1] : null; }

function weekStart(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

function futuresWeekly(state, product) {
  const rows = state.futures.filter((r) => r.prod === product && finite(r.close_price));
  if (!rows.length) return null;
  const dates = [...new Set(rows.map((r) => r.trade_date))].sort();
  const lastDate = dates[dates.length - 1];
  const active = rows.filter((r) => r.trade_date === lastDate)
    .sort((a, b) => (+b.volume || 0) - (+a.volume || 0))[0];
  if (!active) return null;
  const hist = rows.filter((r) => r.isu_cd === active.isu_cd && finite(r.close_price))
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const cur = hist[hist.length - 1];
  const prev = hist[Math.max(0, hist.length - 6)];
  return { value: +cur.close_price, delta: prev && prev !== cur ? (+cur.close_price - +prev.close_price) * 100 : null, d: cur.trade_date };
}

function weeklyFlowRows(state) {
  const invs = [
    ["은행", "bank"], ["운용(공모)", "amc_public"], ["운용(사모)", "amc_private"],
    ["보험", "insurance"], ["기금·공제", "fund_pension"], ["외국인", "foreigner"],
    ["종금·상호", "merchant_mutual"], ["선물", "futures_co"], ["국가·지자체", "government"],
    ["기타법인", "other_corp"], ["개인", "individual"],
  ];
  const classes = ["합계", "국채", "통안증권", "지방채", "특수채", "은행채", "기타금융채", "회사채", "ABS"];
  const net = state.flows.filter((r) => r.trade_type === "순매수");
  const lastDate = [...new Set(net.map((r) => r.trade_date))].sort().pop();
  if (!lastDate) return { rows: [], classes, asof: "—" };
  const wk = weekStart(lastDate);
  const cur = net.filter((r) => r.trade_date >= wk && r.trade_date <= lastDate);
  const rows = invs.map(([name, key]) => [name, ...classes.map((cls) => {
    let sum = 0, has = false;
    for (const r of cur) if (r.bond_class === cls && finite(r[key])) { sum += +r[key]; has = true; }
    return has ? Math.round(sum).toLocaleString("ko-KR") : "—";
  })]);
  return { rows, classes, asof: lastDate };
}

function weeklyFlowChart(state) {
  const invs = [
    ["은행", "bank"], ["운용", "amc_public"], ["보험", "insurance"],
    ["기금", "fund_pension"], ["외국인", "foreigner"], ["개인", "individual"],
  ];
  const net = state.flows.filter((r) => r.trade_type === "순매수" && r.bond_class === "합계");
  const weeks = [...new Set(net.map((r) => weekStart(r.trade_date)))].sort().slice(-4);
  const colors = ["#c7d5ff", "#9bb5ff", BLUE_2, BLUE];
  return {
    categories: invs.map(([name]) => name),
    series: weeks.map((wk, i) => ({
      name: `${dateShort(wk)}주`, color: colors[i],
      values: invs.map(([, key]) => net
        .filter((r) => weekStart(r.trade_date) === wk && finite(r[key]))
        .reduce((sum, r) => sum + +r[key], 0)),
    })),
  };
}

function pageOne(state) {
  const { canvas, ctx } = canvasPage();
  header(ctx, 1, state.asof, "금리 · 주간 변동 · 투자자 수급 · 주식/외환/해외");

  const rateDefs = [
    ["국고 3년", "bond", "국고채 3년"], ["국고 5년", "bond", "국고채 5년"],
    ["국고 10년", "bond", "국고채 10년"], ["국고 30년", "bond", "국고채 30년"],
    ["회사채 AA- 3년", "bond", "회사채 AA- 3년"], ["미국 2년", "market", "UST2Y"],
    ["미국 10년", "market", "UST10Y"],
  ];
  const baseDates = yieldPoints(state, "국고채 3년").slice(-5).map((p) => p.d);
  const rateRows = rateDefs.map(([name, kind, key]) => {
    const pts = kind === "bond" ? yieldPoints(state, key) : marketPoints(state, key);
    return [name, ...baseDates.map((d) => num(valueOn(pts, d), 3))];
  });
  tableCard(ctx, {
    x: 85, y: 224, w: 1072, h: 454, title: "지난 주 채권금리", subtitle: "단위 % · 일별",
    columns: ["금리", ...baseDates.map(dateShort)], rows: rateRows,
    widths: [280, 138, 138, 138, 138, 190], rowSize: 18,
  });

  const changeDefs = [
    ["통안 1년", "통안채 1년"], ["통안 2년", "통안채 2년"], ["국고 3년", "국고채 3년"],
    ["국고 5년", "국고채 5년"], ["국고 10년", "국고채 10년"], ["국고 20년", "국고채 20년"],
    ["국고 30년", "국고채 30년"],
  ];
  const changeRows = changeDefs.map(([name, label]) => {
    const pts = yieldPoints(state, label); const last = latest(pts);
    return [name, num(last?.v, 3), signed(weeklyDelta(pts, 100), 1), "bp"];
  });
  for (const [name, product] of [["3년 국채선물", "KTB3"], ["10년 국채선물", "KTB10"]]) {
    const v = futuresWeekly(state, product);
    changeRows.push([name, num(v?.value, 2), signed(v?.delta, 0), "틱"]);
  }
  tableCard(ctx, {
    x: 1182, y: 224, w: 1072, h: 454, title: "주간 채권금리 변동폭", subtitle: "최근값 대비 5관측치 전",
    columns: ["지표", "최근값", "주간", "단위"], rows: changeRows,
    widths: [435, 215, 215, 157], rowSize: 18,
  });

  const stockDefs = [
    ["KOSPI", "KOSPI", 2], ["나스닥", "NASDAQ", 2], ["S&P500", "SP500", 2],
    ["니케이225", "NIKKEI", 2], ["상해종합", "SSE", 2], ["항셍H", "HSCEI", 2],
    ["유로스톡스50", "SX5E", 2],
  ];
  const fxDefs = [
    ["달러/원", "USDKRW", 2], ["달러/엔", "USDJPY", 3],
    ["유로/달러", "EURUSD", 4], ["호주/달러", "AUDUSD", 4], ["파운드/달러", "GBPUSD", 4],
    ["위안/달러", "USDCNY", 4], ["달러인덱스", "DXY", 2],
  ];
  const marketRows = (defs) => defs.map(([name, symbol, digits]) => {
    const pts = marketPoints(state, symbol); const last = latest(pts); const old = pts[Math.max(0, pts.length - 6)];
    const pct = last && old && old !== last && old.v ? (last.v / old.v - 1) * 100 : null;
    return [name, num(last?.v, digits), signed(pct, 2), last?.d ? dateShort(last.d) : "—"];
  });

  const overseasDefs = [
    ["미국 2년", "UST2Y", 3, true], ["미국 10년", "UST10Y", 3, true],
    ["독일 10년", "DE10Y", 3, true], ["영국 10년", "GB10Y", 3, true], ["호주 10년", "AU10Y", 3, true],
    ["GSCI", "GSCI", 2], ["WTI", "WTI", 2], ["천연가스", "NATGAS", 3], ["구리", "COPPER", 3],
    ["금", "GOLD", 1], ["비트코인", "BTC", 0], ["소맥", "WHEAT", 2],
  ];
  const overseasRows = overseasDefs.map(([name, symbol, digits, rate]) => {
    const pts = marketPoints(state, symbol); const last = latest(pts); const old = pts[Math.max(0, pts.length - 6)];
    const delta = last && old && old !== last ? (rate ? (last.v - old.v) * 100 : old.v ? (last.v / old.v - 1) * 100 : null) : null;
    return [name, num(last?.v, digits), signed(delta, rate ? 1 : 2), rate ? "bp" : "%", last?.d ? dateShort(last.d) : "—"];
  });
  const cardW = 708, marketY = 704, marketH = 408;
  for (const [i, title, defs] of [[0, "주식시장", stockDefs], [1, "외환시장", fxDefs]]) tableCard(ctx, {
    x: 85 + i * (cardW + 22), y: marketY, w: cardW, h: marketH, title, subtitle: "주간 변동률 %",
    columns: ["지표", "최근값", "주간", "기준일"], rows: marketRows(defs),
    widths: [205, 165, 130, 158], rowSize: 14,
  });
  tableCard(ctx, {
    x: 85 + 2 * (cardW + 22), y: marketY, w: 709, h: marketH, title: "해외", subtitle: "금리 bp · 기타 %",
    columns: ["지표", "최근값", "주간", "단위", "기준일"], rows: overseasRows,
    widths: [170, 150, 105, 70, 164], rowSize: 13,
  });

  const flow = weeklyFlowRows(state);
  tableCard(ctx, {
    x: 85, y: 1138, w: 1285, h: 420, title: "투자자 동향", subtitle: `주간 합산 · 억원 · ${dateShort(flow.asof)}`,
    columns: ["투자자", ...flow.classes], rows: flow.rows,
    widths: [155, 120, 120, 120, 120, 120, 120, 120, 120, 120], rowSize: 11,
  });
  chartCard(ctx, {
    x: 1392, y: 1138, w: 862, h: 420, title: "투자주체별 4주 순매수",
    unit: "억원", grouped: weeklyFlowChart(state), note: "주간 합산 · 합계",
  });
  footer(ctx, 1, "출처: KOFIA · KRX · BOK/FRED · 시장데이터 적재본 | 통안 91일 제외 | 원천별 최신 기준일 병기");
  return canvas;
}

function chartCard(ctx, cfg) {
  const { x, y, w, h, title, series: lines = [], unit = "bp", bar = false, grouped = null, note = "" } = cfg;
  roundRect(ctx, x, y, w, h, 20);
  text(ctx, title, x + 24, y + 28, { size: 19, weight: 700 });
  text(ctx, note || unit, x + w - 24, y + 28, { size: 13, color: MUTED, align: "right" });
  const plot = { x: x + 46, y: y + 62, w: w - 68, h: h - 91 };
  if (grouped) drawGroupedBars(ctx, plot, grouped, unit);
  else if (bar) drawBars(ctx, plot, lines, unit);
  else drawLines(ctx, plot, lines, unit);
}

function drawGroupedBars(ctx, plot, grouped, unit) {
  const categories = grouped.categories || [];
  const groups = (grouped.series || []).filter((s) => s.values?.some(finite));
  const vals = groups.flatMap((s) => s.values.filter(finite).map(Number));
  if (!categories.length || !vals.length) {
    text(ctx, "데이터 없음", plot.x + plot.w / 2, plot.y + plot.h / 2, { size: 17, color: MUTED, align: "center" });
    return;
  }
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (lo === hi) hi = lo + 1;
  const span = hi - lo;
  lo -= span * .08; hi += span * .08;
  const legendH = 28, labelH = 28;
  const area = { x: plot.x, y: plot.y + legendH, w: plot.w, h: plot.h - legendH - labelH };
  const yp = (v) => area.y + area.h - ((v - lo) / (hi - lo)) * area.h;
  const zeroY = yp(0);
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const v = hi - i * (hi - lo) / 2, yy = yp(v);
    ctx.beginPath(); ctx.moveTo(area.x, yy); ctx.lineTo(area.x + area.w, yy); ctx.stroke();
    text(ctx, num(v, unit === "억원" ? 0 : 1), area.x - 6, yy, { size: 10, color: MUTED, align: "right", mono: true });
  }
  const slot = area.w / categories.length;
  const clusterW = slot * .76;
  const bw = Math.max(2, clusterW / groups.length - 2);
  categories.forEach((label, ci) => {
    groups.forEach((s, si) => {
      const v = finite(s.values[ci]) ? +s.values[ci] : null;
      if (v == null) return;
      const xx = area.x + ci * slot + (slot - clusterW) / 2 + si * (clusterW / groups.length);
      const yy = yp(v);
      ctx.fillStyle = s.color || [BLUE, BLUE_2, "#94a3b8", "#0f172a"][si % 4];
      ctx.fillRect(xx, Math.min(yy, zeroY), bw, Math.max(1, Math.abs(zeroY - yy)));
    });
    text(ctx, label, area.x + (ci + .5) * slot, area.y + area.h + 14, { size: categories.length > 8 ? 9 : 11, color: MUTED, align: "center" });
  });
  let lx = area.x;
  groups.forEach((s, i) => {
    ctx.fillStyle = s.color || [BLUE, BLUE_2, "#94a3b8", "#0f172a"][i % 4];
    ctx.fillRect(lx, plot.y + 7, 14, 7);
    text(ctx, s.name, lx + 20, plot.y + 11, { size: 11, color: MUTED });
    lx += Math.max(92, ctx.measureText(s.name).width + 43);
  });
}

function drawLines(ctx, plot, lines, unit) {
  const valid = lines.map((s) => ({ ...s, points: (s.points || []).filter((p) => finite(p.v)).slice(-260) }))
    .filter((s) => s.points.length);
  if (!valid.length) { text(ctx, "데이터 없음", plot.x + plot.w / 2, plot.y + plot.h / 2, { size: 17, color: MUTED, align: "center" }); return; }
  const dates = valid.flatMap((s) => s.points.map((p) => p.d)).sort();
  const minD = dates[0], maxD = dates[dates.length - 1];
  const t0 = new Date(`${minD}T00:00:00Z`).getTime(), t1 = new Date(`${maxD}T00:00:00Z`).getTime();
  const vals = valid.flatMap((s) => s.points.map((p) => p.v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * .12; lo -= pad; hi += pad;
  const xp = (d) => plot.x + ((new Date(`${d}T00:00:00Z`).getTime() - t0) / Math.max(1, t1 - t0)) * plot.w;
  const yp = (v) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const yy = plot.y + i * plot.h / 2; ctx.beginPath(); ctx.moveTo(plot.x, yy); ctx.lineTo(plot.x + plot.w, yy); ctx.stroke();
    text(ctx, num(hi - i * (hi - lo) / 2, unit === "억원" ? 0 : 1), plot.x - 7, yy, { size: 11, color: MUTED, align: "right", mono: true });
  }
  valid.forEach((s, idx) => {
    ctx.strokeStyle = s.color || [BLUE, BLUE_2, "#94a3b8", "#0f172a"][idx % 4]; ctx.lineWidth = idx === 0 ? 4 : 3;
    ctx.beginPath();
    s.points.forEach((p, i) => { const xx = xp(p.d), yy = yp(p.v); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); });
    ctx.stroke();
    const last = s.points[s.points.length - 1];
    const lx = plot.x + 8 + (idx % 2) * plot.w * .5;
    text(ctx, `${s.name} ${num(last.v, unit === "억원" ? 0 : 1)}`, lx, plot.y + 13 + Math.floor(idx / 2) * 18, {
      size: 11, color: s.color || [BLUE, BLUE_2, "#64748b", "#0f172a"][idx % 4], weight: 700, mono: true,
    });
  });
  text(ctx, dateShort(minD), plot.x, plot.y + plot.h + 14, { size: 11, color: MUTED });
  text(ctx, dateShort(maxD), plot.x + plot.w, plot.y + plot.h + 14, { size: 11, color: MUTED, align: "right" });
}

function drawBars(ctx, plot, rows, unit) {
  const vals = rows.filter((r) => finite(r.value));
  if (!vals.length) { text(ctx, "데이터 없음", plot.x + plot.w / 2, plot.y + plot.h / 2, { size: 17, color: MUTED, align: "center" }); return; }
  const max = Math.max(...vals.map((r) => Math.abs(r.value)), 1);
  const rh = plot.h / rows.length;
  rows.forEach((r, i) => {
    const yy = plot.y + i * rh + rh * .22;
    text(ctx, r.name, plot.x, yy + rh * .28, { size: 11, color: MUTED });
    const bw = finite(r.value) ? Math.abs(r.value) / max * plot.w * .55 : 0;
    ctx.fillStyle = i % 2 ? BLUE_2 : BLUE;
    ctx.fillRect(plot.x + plot.w * .35, yy, bw, rh * .55);
    text(ctx, finite(r.value) ? `${num(r.value, 1)} ${unit}` : "—", plot.x + plot.w - 2, yy + rh * .28, { size: 11, align: "right", mono: true });
  });
}

function issueSeries(state) {
  const yms = [...new Set(state.issueMonthly.map((r) => r.ym))].sort().slice(-12);
  const get = (ym, cls) => state.issueMonthly.find((r) => r.ym === ym && r.bond_class === cls)?.net;
  const make = (name, calc, color) => ({ name, color, points: yms.map((ym) => ({ d: `${ym}-01`, v: calc(ym) })).filter((p) => finite(p.v)) });
  return [
    make("지방+특수", (ym) => finite(get(ym, "지방채")) && finite(get(ym, "특수채")) ? +get(ym, "지방채") + +get(ym, "특수채") : null, BLUE),
    make("은행채", (ym) => get(ym, "은행채"), BLUE_2),
    make("기타금융", (ym) => get(ym, "기타금융채"), "#64748b"),
    make("회사채", (ym) => get(ym, "회사채"), "#0f172a"),
  ];
}

function issueBars(state) {
  const lines = issueSeries(state);
  const categories = lines[0]?.points.map((p) => p.d.slice(2, 7).replace("-", "/")) || [];
  return { categories, series: lines.map((s) => ({ ...s, values: s.points.map((p) => p.v) })) };
}

function isoShift(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function atOrBefore(points, target) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].d <= target) return points[i].v;
  return null;
}

function creditComparison(state, labels) {
  const all = labels.flatMap((label) => bpPoints(state, label));
  const asof = all.map((p) => p.d).sort().pop();
  const targets = asof ? [asof, isoShift(asof, -7), isoShift(asof, -30)] : [];
  return {
    categories: labels.map((l) => l.replace("특수은행채", "산금채").replace("특수채", "공사채").replace(" 3년", "")),
    series: [
      ["현재", BLUE], ["전주", BLUE_2], ["전월", "#c7d5ff"],
    ].map(([name, color], i) => ({
      name, color, values: labels.map((label) => targets.length ? atOrBefore(bpPoints(state, label), targets[i]) : null),
    })),
  };
}

function pageTwo(state) {
  const { canvas, ctx } = canvasPage();
  header(ctx, 2, state.asof, "발행 · 크레딧 스프레드 · 상대가치 · 등급간 스프레드");
  const matrixLabels = ["특수채 AAA 3년", "특수은행채 AAA 3년", "은행채 AAA 3년", "여전채 AA+ 3년", "여전채 AA- 3년", "회사채 AA- 3년"];
  chartCard(ctx, {
    x: 85, y: 224, w: 1072, h: 430, title: "월별 순발행", unit: "억원",
    grouped: issueBars(state), note: "최근 12개월 · 월별",
  });
  chartCard(ctx, {
    x: 1182, y: 224, w: 1072, h: 430, title: "크레딧 스프레드", unit: "bp",
    grouped: creditComparison(state, matrixLabels), note: "현재 · 전주 · 전월",
  });

  const panels = [];
  panels.push({ title: "2년 스프레드-1", unit: "bp", series: [
    ["공사채 AAA", "특수채 AAA 2년"], ["산금채", "특수은행채 AAA 2년"], ["은행채", "은행채 AAA 2년"],
  ].map(([name, l], i) => ({ name, points: bpPoints(state, l), color: [BLUE, BLUE_2, "#64748b"][i] })) });
  panels.push({ title: "2년 스프레드-2", unit: "bp", series: [
    ["여전 AA+", "여전채 AA+ 2년"], ["여전 AA-", "여전채 AA- 2년"], ["회사 AA-", "회사채 AA- 2년"],
  ].map(([name, l], i) => ({ name, points: bpPoints(state, l), color: [BLUE, BLUE_2, "#64748b"][i] })) });
  panels.push({ title: "3년 스프레드-1", unit: "bp", series: [
    ["공사채 AAA", "특수채 AAA 3년"], ["산금채", "특수은행채 AAA 3년"], ["은행채", "은행채 AAA 3년"],
  ].map(([name, l], i) => ({ name, points: bpPoints(state, l), color: [BLUE, BLUE_2, "#64748b"][i] })) });
  panels.push({ title: "3년 스프레드-2", unit: "bp", series: [
    ["여전 AA+", "여전채 AA+ 3년"], ["여전 AA-", "여전채 AA- 3년"], ["회사 AA-", "회사채 AA- 3년"],
  ].map(([name, l], i) => ({ name, points: bpPoints(state, l), color: [BLUE, BLUE_2, "#64748b"][i] })) });
  panels.push({ title: "은행-특수 / 여전-회사 2년", unit: "bp", series: [
    { name: "은행-특수", points: diffPoints(state, "은행채 AAA 2년", "특수채 AAA 2년"), color: BLUE },
    { name: "여전-회사", points: diffPoints(state, "여전채 AA- 2년", "회사채 AA- 2년"), color: BLUE_2 },
  ] });
  panels.push({ title: "은행-특수 / 여전-회사 3년", unit: "bp", series: [
    { name: "은행-특수", points: diffPoints(state, "은행채 AAA 3년", "특수채 AAA 3년"), color: BLUE },
    { name: "여전-회사", points: diffPoints(state, "여전채 AA- 3년", "회사채 AA- 3년"), color: BLUE_2 },
  ] });
  panels.push({ title: "회사채 AA- 2년 - A+ 2년", unit: "bp", series: [
    { name: "AA- - A+", points: diffPoints(state, "회사채 AA- 2년", "회사채 A+ 2년"), color: BLUE },
  ] });
  panels.push({ title: "회사채 AA- 3년 - A+ 3년", unit: "bp", series: [
    { name: "AA- - A+", points: diffPoints(state, "회사채 AA- 3년", "회사채 A+ 3년"), color: BLUE },
  ] });

  const left = 85, top = 676, gap = 22, cardW = 525, cardH = 430;
  panels.forEach((p, i) => chartCard(ctx, {
    ...p, x: left + (i % 4) * (cardW + gap), y: top + Math.floor(i / 4) * (cardH + gap), w: cardW, h: cardH,
  }));
  footer(ctx, 2, "출처: KOFIA 시가평가수익률·발행통계 | 최근 1년(월별 순발행 최근 12개월) | 단일 블루 인쇄 양식");
  return canvas;
}

function bytesFromDataUrl(url) {
  const raw = atob(url.split(",")[1]);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const enc = new TextEncoder();

function pdfFromJpegs(images) {
  const chunks = [];
  const offsets = new Array(9).fill(0);
  let length = 0;
  const push = (part) => { const b = typeof part === "string" ? enc.encode(part) : part; chunks.push(b); length += b.length; };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const obj = (n, body, stream = null) => {
    offsets[n] = length; push(`${n} 0 obj\n${body}`);
    if (stream) { push("\nstream\n"); push(stream); push("\nendstream"); }
    push("\nendobj\n");
  };
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${images[0].length} >>`, images[0]);
  const draw1 = `q ${PDF_W} 0 0 ${PDF_H} 0 0 cm /Im1 Do Q`;
  obj(5, `<< /Length ${enc.encode(draw1).length} >>`, enc.encode(draw1));
  obj(6, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /XObject << /Im2 7 0 R >> >> /Contents 8 0 R >>`);
  obj(7, `<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${images[1].length} >>`, images[1]);
  const draw2 = `q ${PDF_W} 0 0 ${PDF_H} 0 0 cm /Im2 Do Q`;
  obj(8, `<< /Length ${enc.encode(draw2).length} >>`, enc.encode(draw2));
  const xref = length;
  push("xref\n0 9\n0000000000 65535 f \n");
  for (let i = 1; i <= 8; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(length); let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

export async function buildWeeklyReportPdfBlob(state) {
  if (!state?.series?.size) throw new Error("채권 데이터가 아직 로드되지 않았습니다.");
  if (document.fonts?.ready) await document.fonts.ready;
  const pages = [pageOne(state), pageTwo(state)];
  const jpgs = pages.map((c) => bytesFromDataUrl(c.toDataURL("image/jpeg", 0.94)));
  return new Blob([pdfFromJpegs(jpgs)], { type: "application/pdf" });
}

export function renderWeeklyReportPages(state) {
  return [pageOne(state), pageTwo(state)];
}

export async function downloadWeeklyReportPdf(state) {
  const blob = await buildWeeklyReportPdfBlob(state);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `본드모니터_주간채권시장_${state.asof || new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

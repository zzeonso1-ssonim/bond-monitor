import { loadMonthlyReportData } from './api.js';
import { lineChart, dualSpreadChart, dualLineChart, barChart } from './charts.js';
import { futuresRankingSection } from './futures-rankings.js';

const COLORS = ['--series-1', '--series-2', '--series-6', '--series-5', '--series-4'];
export const DOMESTIC = [
  ['국고 6개월', 'MR_GOV6M'], ['국고 1년', 'MR_GOV1Y'], ['국고 2년', 'MR_GOV2Y'], ...[3, 5, 10, 30].map(y => [`국고 ${y}년`, `국고채 ${y}년`]),
  ['은행채 AAA 3년', '은행채 AAA 3년'], ['3년 국채선물', 'KTB3'], ['10년 국채선물', 'KTB10'],
];
export const OVERSEAS = [['미국', 'MR_US10Y'], ['영국', 'MR_GB10Y'], ['독일', 'MR_DE10Y'],
  ['호주', 'MR_AU10Y'], ['일본', 'MR_JP10Y'], ['이탈리아', 'MR_IT10Y'], ['스페인', 'MR_ES10Y'],
  ['중국', 'MR_RM10Y'], ['브라질', 'MR_BR10Y'], ['한국', '국고채 10년']];
const INSTITUTIONS = ['은행', '투신', '보험', '기금'];
const HOLDINGS = [['외국인 상장채권 잔고', 'FOREIGN_LISTED_BOND_BAL'],
  ['주식형 펀드', 'FUND_STOCK_AUM'], ['채권형 펀드', 'FUND_BOND_AUM'], ['MMF', 'MMF_AUM']];
const finite = v => typeof v === 'number' && Number.isFinite(v);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v, digits = 2) => finite(v) ? v.toLocaleString('ko-KR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) : '—';
const signed = (v, digits = 2) => finite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), digits)}` : '—';
const deltaClass = v => v > 0 ? 'delta-up' : v < 0 ? 'delta-dn' : '';
export function kstYesterday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
}
export function shiftMonth(month, offset) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
const monthEnd = month => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export function reportingRange(month, today = new Date()) {
  const cap = kstYesterday(today);
  if (!/^\d{4}-\d{2}$/.test(month) || month > cap.slice(0, 7)) throw new Error('조회 가능한 월을 선택하세요.');
  const previous = shiftMonth(month, -1);
  const end = [monthEnd(month), cap].sort()[0];
  return {month, start:month + '-01', end, previous, previousStart:previous + '-01',
    previousEnd:monthEnd(previous), partial:end < monthEnd(month)};
}
export function observation(points, start, end) {
  return points.filter(p => p.d >= start && p.d <= end && finite(p.v)).sort((a,b) => a.d.localeCompare(b.d)).at(-1) || null;
}
export function monthlySum(points, start, end) {
  const rows = points.filter(p => p.d >= start && p.d <= end && finite(p.v));
  return rows.length ? {d:rows.map(p=>p.d).sort().at(-1), v:rows.reduce((n,p)=>n+p.v,0)} : null;
}
export function monthlySpot(rows, investor, start, end) {
  const totals = rows.filter(r => r.investor === investor && r.maturity_bucket === '전체' && r.trade_date >= start && r.trade_date <= end && finite(r.net_buy_krw_thousand));
  const last = totals.sort((a,b) => a.trade_date.localeCompare(b.trade_date)).at(-1);
  return last ? {d:last.trade_date, v:last.net_buy_krw_thousand / 1e9,
    buckets:rows.filter(r=>r.investor===investor && r.trade_date===last.trade_date && !['전체','미분류'].includes(r.maturity_bucket) && finite(r.net_buy_krw_thousand))
      .map(r=>({name:r.maturity_bucket, v:r.net_buy_krw_thousand / 1e9}))} : null;
}
export function nearbySeries(rows, product) {
  const days = new Map();
  for (const r of rows) if (r.prod === product && finite(r.close_price) && finite(r.volume) && r.volume > 0) {
    const old = days.get(r.trade_date);
    if (!old || old.volume < r.volume || old.volume === r.volume && r.isu_cd < old.isu_cd) days.set(r.trade_date, r);
  }
  return [...days.values()].sort((a,b)=>a.trade_date.localeCompare(b.trade_date)).map(r=>({d:r.trade_date,v:r.close_price,contract:r.isu_nm,...(r.source?{source:r.source}:{})}));
}
function indexData(data) {
  const points = new Map();
  const add = (key,p) => { if (!points.has(key)) points.set(key,[]); points.get(key).push(p); };
  data.rates.forEach(r=>add(r.label,{d:r.trade_date,v:r.yield}));
  data.market.forEach(r=>add(r.symbol,{d:r.trade_date,v:r.value}));
  data.foreignFutures.forEach(r=>add(r.symbol,{d:r.trade_date,v:r.value}));
  ['KTB3','KTB10'].forEach(p=>points.set(p,nearbySeries(data.futures,p)));
  return points;
}
function metric(points, r, multiplier = 1) {
  const current = observation(points,r.start,r.end), previous = observation(points,r.previousStart,r.previousEnd);
  return {current, previous, delta:current && previous ? (current.v - previous.v) * multiplier : null};
}
function pointCell(p,digits) { return p ? `${fmt(p.v,digits)}<small>${esc(p.d)}${p.contract ? ' · '+esc(p.contract.trim()) : ''}${p.source?' · '+esc(p.source):''}</small>` : '—<small>해당 월 자료 없음</small>'; }
function rateTable(defs, points, range, domestic = false) {
  const cells = defs.map(([name,key])=>({name,key,...metric(points.get(key)||[],range,key.startsWith('KTB')?1:100)}));
  return {cells, html:`<div class="table-scroll"><table class="data monthly-rates"><thead><tr><th>구분</th>${cells.map(c=>`<th>${esc(c.name)}${domestic?'':' 10년'}</th>`).join('')}</tr></thead><tbody>
    <tr><th>${range.previous} 월말</th>${cells.map(c=>`<td>${pointCell(c.previous,c.key.startsWith('KTB')?2:3)}</td>`).join('')}</tr>
    <tr><th>${range.partial?'월중':'월말'} · ${range.end}</th>${cells.map(c=>`<td>${pointCell(c.current,c.key.startsWith('KTB')?2:3)}</td>`).join('')}</tr>
    <tr><th>전월말 대비</th>${cells.map(c=>`<td class="${deltaClass(c.delta)}">${signed(c.delta,c.key.startsWith('KTB')?2:1)}<small>${c.key.startsWith('KTB')?'pt':'bp'}</small></td>`).join('')}</tr></tbody></table></div>`};
}
function flowMetrics(data, points, range) {
  const one = (name,unit,current,previous) => ({name,unit,current,previous,delta:current&&previous?current.v-previous.v:null});
  const foreign = [one('외국인 현물 순매수','조원',monthlySpot(data.spot,'외국인',range.start,range.end),monthlySpot(data.spot,'외국인',range.previousStart,range.previousEnd))];
  for (const [name,key] of [['외국인 3년 국채선물 순매수','KTB3F_FRG'],['외국인 10년 국채선물 순매수','KTB10F_FRG']]) foreign.push(one(name,'계약',monthlySum(points.get(key)||[],range.start,range.end),monthlySum(points.get(key)||[],range.previousStart,range.previousEnd)));
  const domestic = INSTITUTIONS.map(name=>one(`${name==='투신'?'투신(공모)':name==='기금'?'기금·공제':name} 현물 순매수`,'조원',monthlySpot(data.spot,name,range.start,range.end),monthlySpot(data.spot,name,range.previousStart,range.previousEnd)));
  return {foreign,domestic};
}
function summaryTable(cells, range) {
  return `<div class="table-scroll"><table class="data"><thead><tr><th>지표</th><th>${range.month}${range.partial?' 누계':' 전체'}</th><th>${range.previous} 전체</th><th>전월 전체 대비 증감</th></tr></thead><tbody>${cells.map(c=>`<tr><th>${esc(c.name)}<small>${c.unit}</small></th><td>${pointCell(c.current,c.unit==='계약'?0:2)}</td><td>${pointCell(c.previous,c.unit==='계약'?0:2)}</td><td class="${deltaClass(c.delta)}">${signed(c.delta,c.unit==='계약'?0:2)} ${c.unit}</td></tr>`).join('')}</tbody></table></div>`;
}
function spread(a,b) {
  const values = new Map(a.map(p=>[p.d,p.v]));
  return b.filter(p=>finite(p.v)&&finite(values.get(p.d))).map(p=>({d:p.d,v:(p.v-values.get(p.d))*100}));
}
function chartBox(id,title,note='') { return `<section class="card monthly-chart"><h3>${title}</h3>${note?`<p class="hint">${note}</p>`:''}<div id="${id}"></div></section>`; }
function prose(flow, holdings, range) {
  const [spot,f3,f10] = flow.foreign;
  const bucket = spot.current?.buckets || [];
  const buy = [...bucket].filter(b=>b.v>0).sort((a,b)=>b.v-a.v)[0];
  const sell = [...bucket].filter(b=>b.v<0).sort((a,b)=>a.v-b.v)[0];
  const sentence = c => c.current ? `${c.name}는 ${c.current.d} 기준 ${signed(c.current.v,c.unit==='계약'?0:2)}${c.unit}${c.previous ? ` (전월 전체 대비 ${signed(c.delta,c.unit==='계약'?0:2)}${c.unit})` : ' (전월 자료 없음)'}` : `${c.name} 자료는 미수집`;
  const balance = holdings[0];
  const funds = holdings.slice(1).map(c=>`${c.name} ${c.current ? `${fmt(c.current.v)}조원(${c.current.d}), 전월말 대비 ${signed(c.delta)}조원` : '미수집'}`).join('; ');
  return `${range.month} ${range.partial?'월중 누계':'월간'} 수급\n${flow.foreign.map(sentence).join('. ')}.${buy?` 현물 순매수 최대 구간은 ${buy.name}(${signed(buy.v)}조원).`:''}${sell?` 순매도 최대 구간은 ${sell.name}(${signed(sell.v)}조원).`:''}\n${balance.current?`외국인 상장채권 잔고는 ${balance.current.d} ${fmt(balance.current.v)}조원, 전월말 대비 ${signed(balance.delta)}조원.`:'외국인 상장채권 잔고는 해당 월 자료가 없습니다.'}\n${flow.domestic.map(sentence).join('. ')}.\n${funds}.\n${range.partial?'월중 누계와 전월 전체의 비교이므로 집계 기간이 다릅니다. ':''}순매수(유량)와 잔고·수탁고(월말 수준)를 구분했으며 실제 기준일은 표에 표시했습니다.`;
}
let pending = null, loaded = null;
export async function openMonthlyReport(root) {
  if (root.dataset.ready) return;
  root.innerHTML='<div class="loading">월간 보고서 지표를 불러오는 중…</div>';
  try {
    if (!pending) pending=loadMonthlyReportData();
    loaded=await pending;
    root.dataset.ready='true';
    const current=kstYesterday().slice(0,7);
    root.innerHTML=`<div class="monthly-toolbar"><div><h2>월간 보고서</h2><p class="hint">보고서에 쓰는 금리·수급·잔고를 한곳에서 확인합니다.</p></div><label>보고서 월 <select id="mr-month" aria-label="보고서 월">${Array.from({length:12},(_,i)=>shiftMonth(current,-i)).map(m=>`<option value="${m}">${m}</option>`).join('')}</select></label><button id="mr-csv" class="pdf-btn">표 CSV</button><button id="mr-copy" class="pdf-btn">요약 복사</button></div><div id="mr-content"></div>`;
    const points=indexData(loaded);
    const draw=()=>render(root,loaded,points,root.querySelector('#mr-month').value);
    root.querySelector('#mr-month').addEventListener('change',draw);
    draw();
  } catch(error) {
    pending=null;
    delete root.dataset.ready;
    root.innerHTML=`<p class="note">월간 지표를 불러오지 못했습니다. ${esc(error.message)}</p><button class="pdf-btn" id="mr-retry">다시 불러오기</button>`;
    root.querySelector('#mr-retry').onclick=()=>openMonthlyReport(root);
  }
}
function render(root,data,points,month) {
  root.querySelector('#mr-copy').textContent='요약 복사';
  const r=reportingRange(month), domestic=rateTable(DOMESTIC,points,r,true), overseas=rateTable(OVERSEAS,points,r);
  const flow=flowMetrics(data,points,r);
  const rankings=futuresRankingSection(data,r.end,r.partial);
  const holdings=HOLDINGS.map(([name,key])=>({name,key,unit:'조원',...metric(points.get(key)||[],r)}));
  const from=shiftMonth(month,-11)+'-01';
  const pts=key=>(points.get(key)||[]).filter(p=>p.d>=from&&p.d<=r.end&&finite(p.v));
  const text=prose(flow,holdings,r);
  const latestDate=items=>{const d=items.map(c=>c.current?.d).filter(Boolean).sort();return !d.length?'해당 월 자료 없음':d[0]===d.at(-1)?d[0]:`${d[0]}~${d.at(-1)}`;};
  const sourceStatus=`실제 기준일 · 국내 금리 ${latestDate(domestic.cells.filter(c=>!c.key.startsWith('KTB')))} · 해외 금리 ${latestDate(overseas.cells)} · 선물 종가 ${latestDate(domestic.cells.filter(c=>c.key.startsWith('KTB')))} · 현물 수급 ${latestDate([flow.foreign[0],...flow.domestic])} · 수탁고 ${latestDate(holdings.slice(1))}`;
  root.querySelector('#mr-content').innerHTML=`<p class="note"><strong>${month} · ${r.partial?'월중 잠정':'월말'} 보고서</strong> · 조회 한도 ${r.end} · 국내 금리 민평 4사 · 금리 변동은 전월말 대비 bp, 선물 가격은 pt. 휴일·공표 시차가 있어 지표별 실제 관측일을 함께 표시합니다.</p>
    <p class="hint monthly-status">${sourceStatus}</p><h2 class="section-title">국내 금리</h2>${domestic.html}<p class="hint">국채선물은 KRX 정규장 종가(인포맥스 경유 포함), 거래량 최대 종목 기준이며 계약 교체가 포함됩니다. 표의 실제 종목과 출처를 확인하세요.</p>
    <div class="monthly-grid">${chartBox('mr-curve','기간 스프레드 · 국고 10년−3년','금리 좌축 %, 스프레드 우축 bp · 최근 12개월')}${chartBox('mr-credit','크레딧 스프레드 · 은행채 AAA 3년−국고 3년','민평 4사 · 금리 좌축 %, 스프레드 우축 bp')}</div>
    <h2 class="section-title">해외 금리</h2>${overseas.html}<p class="hint">해외는 인포맥스 BID_Close 종가(%), 한국은 국내 표와 같은 민평 4사입니다. 현지 시장별 관측일이 다를 수 있습니다.</p>
    <div class="monthly-grid">${chartBox('mr-us','미국채 10년−2년 스프레드','금리 좌축 %, 스프레드 우축 bp')}${chartBox('mr-global','주요국 10년 금리','미국·영국·독일·호주 · %')}</div>
    <h2 class="section-title">외국인 수급 · 현물과 선물</h2>${summaryTable(flow.foreign,r)}<p class="hint">현물은 인포맥스 4668 전체채권 순매수거래량(액면), 선물은 KRX 외국인 합계 순매수 계약 수(인포맥스 경유 포함)입니다. ${r.partial?'이번 달 누계와 전월 전체를 비교하므로 기간 길이가 다릅니다.':'두 달 모두 월간 전체 누계입니다.'}</p>
    ${rankings.html||rankings}
    <h2 class="section-title">국내 주요기관 수급</h2>${summaryTable(flow.domestic,r)}<p class="hint">인포맥스 4668 월간 액면 순매수 · 투신(공모)과 기금·공제는 인포맥스 분류 · 일별로 저장된 월간 누계를 중복 합산하지 않습니다.</p>
    <h2 class="section-title">외국인 잔고 · 펀드 수탁고</h2><div class="table-scroll"><table class="data"><thead><tr><th>지표 (조원)</th><th>${month} ${r.partial?'최신':'월말'}</th><th>${r.previous} 월말</th><th>전월말 대비 증감 (조원)</th></tr></thead><tbody>${holdings.map(c=>`<tr><th>${c.name}</th><td>${pointCell(c.current,2)}</td><td>${pointCell(c.previous,2)}</td><td class="${deltaClass(c.delta)}">${signed(c.delta)}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint">외국인 잔고: 금감원 당일 만기상환 반영 상장채권 잔고 · 펀드: FreeSIS 설정원본(수탁고). 잔고와 설정원본은 합산하지 않습니다.</p>
    <div class="monthly-grid">${chartBox('mr-balance','외국인 상장채권 잔고 · 원/달러','잔고 좌축 조원, 환율 우축 원 · 선택 월의 일별 추이')}${chartBox('mr-funds','주식형·채권형·MMF 수탁고','최근 12개월 일별 설정원본 · 조원')}</div>
    ${chartBox('mr-institutions','투자주체별 월간 현물 순매수',`은행·투신·보험·기금·외국인 · 조원 · ${r.partial?month+'은 월중 누계':'월말 누계'}`)}
    <h2 class="section-title">보고서용 수급 요약</h2><p class="hint">관측값으로 만든 초안입니다. 시장 원인을 추정하지 않으며 비교 기준을 명시합니다.</p><textarea id="mr-prose" class="monthly-prose" readonly aria-label="보고서용 수급 요약"></textarea>`;
  const proseBox=root.querySelector('#mr-prose');
  const rankCsv=root.querySelector('#mr-rank-csv');
  if(rankCsv) rankCsv.onclick=()=>{
    const lines=[['상품','순위','월','순매수_계약','집계시작','집계종료','거래일수','집계구분','조회한도','출처'],...rankings.rows.map(m=>[m.product,m.rank,m.month,m.net,m.first,m.last,m.days,m.provisional?'월중 잠정':'월 전체',r.end,'본드모니터 KRX 계열 (최근 인포맥스 경유)'])];
    const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`국채선물_외국인_월간순매수_TOP5_${month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  proseBox.value=text;
  proseBox.style.height=Math.max(235,proseBox.scrollHeight+4)+'px';
  const chart=id=>root.querySelector('#'+id);
  const spreadChart=(id,a,b,an,bn)=>dualSpreadChart(chart(id),{a:{name:an,points:pts(a)},b:{name:bn,points:pts(b)},spread:{name:'스프레드',points:spread(pts(a),pts(b))}});
  spreadChart('mr-curve','국고채 3년','국고채 10년','국고 3년','국고 10년');
  spreadChart('mr-credit','국고채 3년','은행채 AAA 3년','국고 3년','은행채 AAA 3년');
  spreadChart('mr-us','MR_US02Y','MR_US10Y','미국 2년','미국 10년');
  lineChart(chart('mr-global'),OVERSEAS.slice(0,4).map(([name,key],i)=>({name:name+' 10년',cssVar:COLORS[i],points:pts(key)})),{unit:'%',digits:2});
  const balance=pts('FOREIGN_LISTED_BOND_BAL').filter(p=>p.d>=r.start), fx=pts('USDKRW').filter(p=>p.d>=r.start);
  dualLineChart(chart('mr-balance'),{left:{name:'외국인 잔고',cssVar:COLORS[2],points:balance},right:{name:'원/달러',cssVar:COLORS[0],points:fx}},{leftUnit:'조원',rightUnit:'원',leftDigits:1,rightDigits:1});
  lineChart(chart('mr-funds'),HOLDINGS.slice(1).map(([name,key],i)=>({name,cssVar:COLORS[i],points:pts(key)})),{unit:'조원',digits:1});
  const months=Array.from({length:12},(_,i)=>shiftMonth(month,i-11));
  barChart(chart('mr-institutions'),months.map(m=>m.slice(2)),[...INSTITUTIONS,'외국인'].map((name,i)=>({name:name==='투신'?'투신(공모)':name,cssVar:COLORS[i],values:months.map(m=>monthlySpot(data.spot,name,m+'-01',m===month?r.end:monthEnd(m))?.v??null)})),{unit:'조원',digits:2});
  root.querySelector('#mr-copy').onclick=async()=>{
    const button=root.querySelector('#mr-copy');
    try {await navigator.clipboard.writeText(text);button.textContent='복사 완료';}
    catch {root.querySelector('#mr-prose').select();button.textContent='요약을 선택했습니다';}
  };
  root.querySelector('#mr-csv').onclick=()=>{
    const all=[...domestic.cells.map(c=>({...c,unit:c.key.startsWith('KTB')?'pt':'%',deltaUnit:c.key.startsWith('KTB')?'pt':'bp',source:c.key.startsWith('KTB')?`KRX 정규장 종가${c.current?.source?' / '+c.current.source:''}`:'인포맥스 KOFIA4'})),...overseas.cells.map(c=>({...c,name:c.name+' 10년',unit:'%',deltaUnit:'bp',source:c.key.startsWith('MR_')?'인포맥스 BID_Close':'인포맥스 KOFIA4'})),...flow.foreign.map(c=>({...c,source:c.unit==='계약'?'KRX 외국인 순매수 (인포맥스 경유 포함)':'인포맥스 현물 액면'})),...flow.domestic.map(c=>({...c,source:'인포맥스 현물 액면'})),...holdings.map((c,i)=>({...c,source:i?'FreeSIS 설정원본':'금감원 상장채권 잔고'}))];
    const lines=[['보고서월','지표','단위','당월값','당월실제관측일','전월값','전월실제관측일','증감','증감단위','비교기준','출처'],...all.map(c=>[month,c.name,c.unit,c.current?.v??'',c.current?.d??'',c.previous?.v??'',c.previous?.d??'',c.delta??'',c.deltaUnit||c.unit,c.unit==='계약'||c.name.includes('순매수')?'전월 전체 대비':'전월말 대비',c.source])];
    const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`본드모니터_월간보고서_${month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
}

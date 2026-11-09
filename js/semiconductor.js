import { loadSemiconductorData } from './api.js';

export function openSemiconductor(panel) {
  if(panel.dataset.initialized)return;
  panel.dataset.initialized='true';
  panel.innerHTML=`<style>
  #semi-view{padding:22px;border:1px solid var(--border);border-radius:14px;background:var(--surface-1);color:var(--text-primary)}
  #semi-view h2{margin:0 0 8px;font-size:21px}#semi-view p{line-height:1.65;margin:8px 0;color:var(--muted)}
  #semi-view .semi-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:18px 0}#semi-view select,#semi-view button{border:1px solid var(--border);border-radius:7px;background:var(--surface-1);color:var(--text-primary);padding:8px 12px;font:inherit}
  #semi-view .semi-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}#semi-view .semi-card{padding:16px;border:1px solid var(--border);border-radius:10px}#semi-view .semi-card strong{display:block;font-size:28px;font-variant-numeric:tabular-nums;margin:7px 0}
  #semi-view .semi-chart{width:100%;display:block;min-height:260px;touch-action:pan-y}#semi-view .semi-note{font-size:12px}#semi-view .semi-hover{min-height:26px;font-variant-numeric:tabular-nums}#semi-view .semi-table{overflow:auto;max-height:350px}#semi-view table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}#semi-view th,#semi-view td{padding:9px;border-bottom:1px solid var(--border);text-align:right}#semi-view th:first-child,#semi-view td:first-child{text-align:left}
  #semi-view [role=status]{padding:12px 0}#semi-view summary{cursor:pointer;padding:14px 0}@media(max-width:600px){#semi-view{padding:12px}#semi-view .semi-cards{grid-template-columns:1fr}#semi-view h2{font-size:18px}#semi-view .semi-chart{min-height:220px}}
  </style><div id="semi-view"><h2>반도체 가격과 국고채 3년</h2><p>DDR5 16Gb (2G×8) 4800/5600 현물가격 · 국고채 3년 민평3사 금리</p>
  <div class="semi-toolbar"><label>기간 <select id="semi-period"><option value="3m">3개월</option><option value="6m">6개월</option><option value="1y" selected>1년</option><option value="2y">2년</option><option value="all">전체</option></select></label><button id="semi-refresh" type="button">다시 조회</button><button id="semi-csv" type="button" disabled>CSV 내려받기</button></div>
  <div id="semi-status" role="status" aria-live="polite">탭을 열면 최신 DB 자료를 조회합니다.</div><div id="semi-content"></div></div>`;
  const $=s=>panel.querySelector(s);
  let payload=null,loading=false,rows=[];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>typeof v==='number'&&Number.isFinite(v);
  const fmt=v=>number(v)?v.toFixed(3):'미관측';
  const time=d=>Date.parse(d+'T00:00:00Z');
  $('#semi-period').addEventListener('change',render);$('#semi-refresh').addEventListener('click',load);
  async function load(){
    if(loading)return;loading=true;$('#semi-refresh').disabled=true;$('#semi-status').textContent='Supabase 누적 자료를 조회하고 있습니다…';
    try{
      const data=await loadSemiconductorData();
      for(const key of ['prices','yields'])if(!Array.isArray(data[key])||!data[key].length||data[key].some(r=>!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!number(r.value)))throw new Error('자료 형식을 확인해 주세요.');
      payload=data;$('#semi-status').textContent='';$('#semi-csv').disabled=false;render();
    }catch(e){$('#semi-status').textContent=(payload?'이전 조회 결과를 표시합니다. ':'')+e.message;}
    finally{loading=false;$('#semi-refresh').disabled=false;}
  }
  function render(){
    if(!payload)return;
    const priceLast=payload.prices.at(-1),yieldLast=payload.yields.at(-1);
    const end=[priceLast.date,yieldLast.date].sort().at(-1),period=$('#semi-period').value;
    const cutoff=new Date(time(end));const months={'3m':3,'6m':6,'1y':12,'2y':24}[period];
    if(months){const day=cutoff.getUTCDate();cutoff.setUTCDate(1);cutoff.setUTCMonth(cutoff.getUTCMonth()-months);const last=new Date(Date.UTC(cutoff.getUTCFullYear(),cutoff.getUTCMonth()+1,0)).getUTCDate();cutoff.setUTCDate(Math.min(day,last));}
    const start=months?cutoff.toISOString().slice(0,10):payload.prices[0].date;
    const prices=payload.prices.filter(r=>r.date>=start),yields=payload.yields.filter(r=>r.date>=start);
    const pm=new Map(prices.map(r=>[r.date,r.value])),ym=new Map(yields.map(r=>[r.date,r.value]));
    rows=[...new Set([...pm.keys(),...ym.keys()])].sort().map(date=>({date,price:pm.get(date),yield:ym.get(date)}));
    const common=rows.filter(r=>number(r.price)&&number(r.yield));
    if(!rows.length){$('#semi-content').textContent='선택 기간에 관측치가 없습니다.';return;}
    const stale=r=>(Date.now()-time(r.date))/86400000>7?' · 갱신 지연 확인 필요':'';
    $('#semi-content').innerHTML=`<div class="semi-cards"><div class="semi-card"><span style="color:#c24d41">● DDR5 현물가격</span><strong>${fmt(priceLast.value)} <small>USD</small></strong><span>${priceLast.date}${stale(priceLast)}</span></div><div class="semi-card"><span style="color:#347aa8">● 국고채 3년 · 민평3사</span><strong>${fmt(yieldLast.value)} <small>%</small></strong><span>${yieldLast.date}${stale(yieldLast)}</span></div></div>
    <p class="semi-note">${rows[0].date} ~ ${rows.at(-1).date} · 가격 ${prices.length}개 / 금리 ${yields.length}개 · 같은 날 관측 ${common.length}개</p>
    <div id="semi-plot"></div><div class="semi-hover" id="semi-hover">그래프 위에서 날짜별 수치를 확인하세요.</div>
    <p class="semi-note">왼쪽 축: 국고3년 금리(%) · 오른쪽 축: DDR5 가격(USD). 서로 다른 축을 사용하므로 선의 교차는 같은 값이나 매매 신호를 의미하지 않습니다. 휴장·결측은 0이나 전일값으로 채우지 않습니다.</p>
    <details><summary>날짜별 DB 관측치 보기</summary><div class="semi-table"><table><thead><tr><th>관측일</th><th>DDR5 (USD)</th><th>국고3년 (%)</th></tr></thead><tbody>${[...rows].reverse().map(r=>`<tr><td>${r.date}</td><td>${fmt(r.price)}</td><td>${fmt(r.yield)}</td></tr>`).join('')}</tbody></table></div></details>
    <p class="semi-note">가격: ${esc(payload.priceSource.source)}<br>금리: ${esc(payload.yieldSource)}<br>가격 수집: ${esc(payload.priceSource.queried_at)} · 화면 조회: ${esc(new Date(payload.receivedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))} KST<br>기존 PC 일일 갱신 작업에서 수집합니다. PC·Windows 로그인·인포맥스 연결이 필요합니다. ‘다시 조회’는 DB를 다시 읽습니다.</p>`;
    const W=1000,H=420,L=65,R=70,T=35,B=40,w=W-L-R,h=H-T-B;
    const t0=time(rows[0].date),t1=time(rows.at(-1).date),x=d=>L+(time(d)-t0)/(t1-t0||1)*w;
    function scale(series){const values=series.map(r=>r.value),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.08,.01);return {min:lo-pad,max:hi+pad,y:v=>T+h-(v-lo+pad)/(hi-lo+2*pad)*h};}
    const ps=scale(prices),ys=scale(yields);
    const line=(series,s,color)=>{let last=null;return `<path fill="none" stroke="${color}" stroke-width="2.4" d="${series.map(r=>{const move=!last||time(r.date)-time(last)>7*86400000;last=r.date;return `${move?'M':'L'}${x(r.date).toFixed(2)},${s.y(r.value).toFixed(2)}`;}).join(' ')}"/>`;};
    let grid='';for(let i=0;i<=4;i++){const y=T+h*i/4;grid+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="currentColor" opacity=".12"/><text x="${L-10}" y="${y+4}" text-anchor="end" fill="#347aa8">${(ys.max-(ys.max-ys.min)*i/4).toFixed(2)}</text><text x="${W-R+10}" y="${y+4}" fill="#c24d41">${(ps.max-(ps.max-ps.min)*i/4).toFixed(2)}</text>`;}
    for(let i=0;i<=4;i++){const d=rows[Math.round((rows.length-1)*i/4)].date;grid+=`<text x="${x(d)}" y="${H-12}" text-anchor="middle">${d}</text>`;}
    $('#semi-plot').innerHTML=`<svg class="semi-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="DDR5 달러 현물가격과 국고채 3년 민평3사 금리의 이중축 시계열" style="font:12px system-ui;fill:currentColor"><text x="${L}" y="17" fill="#347aa8">국고3년 (%)</text><text x="${W-R}" y="17" text-anchor="end" fill="#c24d41">DDR5 (USD)</text>${grid}${line(yields,ys,'#347aa8')}${line(prices,ps,'#c24d41')}<line id="semi-cursor" x1="0" y1="${T}" x2="0" y2="${H-B}" stroke="currentColor" opacity="0" stroke-dasharray="4 4"/></svg>`;
    $('#semi-plot svg').addEventListener('pointermove',e=>{const rect=e.currentTarget.getBoundingClientRect();const point=(e.clientX-rect.left)/rect.width*W;const target=t0+(point-L)/w*(t1-t0);const r=rows.reduce((a,b)=>Math.abs(time(a.date)-target)<=Math.abs(time(b.date)-target)?a:b);const cursor=$('#semi-cursor');cursor.setAttribute('x1',x(r.date));cursor.setAttribute('x2',x(r.date));cursor.setAttribute('opacity','.5');$('#semi-hover').textContent=`${r.date} · DDR5 ${fmt(r.price)} USD · 국고3년 ${fmt(r.yield)} %`;});
  }
  $('#semi-csv').addEventListener('click',()=>{if(!rows.length)return;const csv='\ufeff관측일,DDR5 현물가격 (USD),국고3년 민평3사 (%)\r\n'+rows.map(r=>[r.date,r.price??'',r.yield??''].join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='DDR5_국고3년_'+rows.at(-1).date+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  load();
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v.toLocaleString('ko-KR');

// Daily product totals, never expiry totals or daily-stored monthly snapshots.
export function monthlyFuturesRankings(rows,symbol,end,excludeMonth) {
  const days=new Map();
  for(const r of rows) if(r.symbol===symbol && r.trade_date<=end && /^\d{4}-\d{2}-\d{2}$/.test(r.trade_date) && Number.isSafeInteger(r.value)) {
    const old=days.get(r.trade_date);
    if(old!==undefined && old!==r.value) throw new Error('동일 날짜의 선물 수급 값이 다릅니다.');
    days.set(r.trade_date,r.value);
  }
  const months=new Map();
  for(const [day,value] of [...days].sort(([a],[b])=>a.localeCompare(b))) {
    const month=day.slice(0,7);
    if(month===excludeMonth) continue;
    if(!months.has(month)) months.set(month,{month,net:0,days:0,first:day,last:day});
    const m=months.get(month);m.net+=value;m.days++;m.last=day;
  }
  const sorted=[...months.values()].filter(m=>m.net>0).sort((a,b)=>b.net-a.net||a.month.localeCompare(b.month));
  return sorted.map((m,i)=>({...m,rank:1+sorted.filter(other=>other.net>m.net).length})).filter(m=>m.rank<=5);
}

export function futuresRankingSection(data,end,partial) {
  const research=data.futuresResearch;
  if(!research?.products) return '<h2 class="section-title">외국인 국채선물 월간 순매수 TOP 5</h2><p class="hint">장기 이력 대조 기록을 불러오지 못했습니다.</p>';
  const output=[];
  const cards=['KTB3','KTB10'].map(product=>{
    const source=research.products[product],name=product==='KTB3'?'3년':'10년';
    const top=monthlyFuturesRankings(data.foreignFutures,product+'F_FRG',end,source.db_start.slice(0,7));
    output.push(...top.map(m=>({...m,product:name,provisional:partial&&m.month===end.slice(0,7)})));
    return `<section class="card"><h3>${name} 국채선물</h3><p class="hint">기존 DB ${esc(source.db_start)}~${esc(end)}</p><div class="table-scroll"><table class="data"><thead><tr><th>순위</th><th>월</th><th>순매수 (계약)</th><th>집계 구분</th></tr></thead><tbody>${top.map(m=>`<tr><td>${m.rank}위</td><th>${m.month}</th><td>${fmt(m.net)}</td><td>${partial&&m.month===end.slice(0,7)?`월중 잠정<small>${m.first}~${m.last}</small>`:'월 전체'}</td></tr>`).join('')||'<tr><td colspan="4">해당 시점의 월간 이력 없음</td></tr>'}</tbody></table></div></section>`;
  }).join('');
  const comparisons=['KTB3','KTB10'].map(p=>{
    const source=research.products[p];
    return `<h4>${p==='KTB3'?'3년':'10년'} · 인포맥스 ${source.native_start}~${research.asof}</h4><p class="hint">겹치는 ${fmt(source.overlap)}일 중 ${source.differences}일의 값 차이. 조사 당시 상위 5개 월의 순위는 ${source.same_top_months?'동일':'다름'}.</p><table class="data"><thead><tr><th>월</th><th>기존 KRX (계약)</th><th>인포맥스 (계약)</th><th>차이 (계약)</th></tr></thead><tbody>${source.comparison_months.filter(m=>m.month<=end.slice(0,7)).map(m=>`<tr><th>${m.month}</th><td>${fmt(m.krx)}</td><td>${fmt(m.infomax)}</td><td>${fmt(m.difference)}</td></tr>`).join('')}</tbody></table>`;
  }).join('');
  return {html:`<h2 class="section-title">외국인 국채선물 월간 순매수 TOP 5</h2><p class="hint">조회 한도 ${end} · 일별 외국인 합계 매수−매도를 월별 합산 · 확인 가능한 이력 기준이며 상장 이후 전체 기록을 뜻하지 않습니다. ${partial?'이번 달은 전일까지의 잠정 누계로 지난 월 전체와 비교합니다.':''} 순위는 자료 갱신과 보고서 월 선택에 맞춰 다시 계산합니다.</p><div class="monthly-grid">${cards}</div><p class="hint">본드모니터 기존 KRX 계열을 기준으로 표시합니다(최근 일별 갱신은 검증된 인포맥스 경유). 시작 월은 일부 날짜만 있어 순위에서 제외합니다. 3년물은 인포맥스 2001-01-30 이후 이력으로 넓혀도 조사 당시 TOP 5 순서가 같았습니다.</p><details><summary>장기 원자료 대조 기록 · ${research.asof}</summary><p class="hint">과거 일부 값이 달라 두 자료를 독립적으로 집계했습니다. 기존 값을 보존하며 아래 대조값은 조사 당시 기록입니다.</p>${comparisons}</details><button class="pdf-btn" id="mr-rank-csv">순위 CSV</button>`,rows:output};
}

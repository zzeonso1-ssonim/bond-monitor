export const FOREIGN_BALANCE_SYMBOL='MR_FOREIGN_BAL_4668';
export const FOREIGN_FX_SYMBOL='MR_USDKRW_4668';
export const FOREIGN_BALANCE_NAME='외국인 잔고(4668)';
export const FOREIGN_BALANCE_NOTE='인포맥스 4668 · 전체채권 장외 거래 추적잔고(순매도 종목 포함). 금감원 실제 보유잔고 통계와 구분합니다.';

// A one-calendar-month window ending on the requested date, matching 4668's 1M.
export function balanceChartWindow(end) {
  const next=new Date(end+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const day=next.getUTCDate();next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()-1);
  const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();
  next.setUTCDate(Math.min(day,last));
  return {start:next.toISOString().slice(0,10),end};
}
export function balanceChartPoints(balance,fx,end) {
  const range=balanceChartWindow(end);
  const keep=p=>p.d>=range.start&&p.d<=end&&typeof p.v==='number'&&Number.isFinite(p.v)&&p.v>0;
  const b=balance.filter(keep).sort((a,b)=>a.d.localeCompare(b.d));
  const rates=new Map(fx.filter(keep).map(p=>[p.d,p.v]));
  return {balance:b,fx:b.filter(p=>rates.has(p.d)).map(p=>({d:p.d,v:rates.get(p.d)})),...range};
}

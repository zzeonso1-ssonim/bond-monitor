import test from 'node:test';
import assert from 'node:assert/strict';
import {balanceChartWindow,balanceChartPoints,FOREIGN_BALANCE_SYMBOL,FOREIGN_FX_SYMBOL} from '../js/infomax-balance.js';

test('4668 one month window includes the prior month baseline and handles month ends',()=>{
  assert.deepEqual(balanceChartWindow('2026-10-28'),{start:'2026-09-29',end:'2026-10-28'});
  assert.equal(balanceChartWindow('2026-10-31').start,'2026-10-01');
  assert.equal(balanceChartWindow('2026-03-30').start,'2026-02-28');
});
test('balance and FX use their own verified symbols and only same-day observations',()=>{
  assert.equal(FOREIGN_BALANCE_SYMBOL,'MR_FOREIGN_BAL_4668');
  assert.equal(FOREIGN_FX_SYMBOL,'MR_USDKRW_4668');
  const b=[{d:'2026-09-29',v:343.8},{d:'2026-10-28',v:350.48463178},{d:'2026-10-29',v:999}];
  const fx=[{d:'2026-09-29',v:1350},{d:'2026-10-27',v:1327},{d:'2026-10-28',v:1342}];
  const result=balanceChartPoints(b,fx,'2026-10-28');
  assert.deepEqual(result.fx,[fx[0],fx[2]]);
  assert.equal(result.balance.at(-1).v,350.48463178);
  assert.equal(balanceChartPoints([{d:'2026-10-28',v:null}],[fx[2]],'2026-10-28').fx.length,0);
});

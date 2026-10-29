import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyFuturesRankings,futuresRankingSection} from '../js/futures-rankings.js';
const row=(day,value,symbol='KTB3F_FRG')=>({trade_date:day,value,symbol});

test('monthly ranking sums signed daily totals once, separates products and respects cutoff',()=>{
  const rows=[row('2025-04-01',200),row('2025-04-02',-50),row('2025-04-02',-50),row('2026-10-01',100),row('2026-10-28',40),row('2026-10-29',999),row('2026-10-01',999,'KTB10F_FRG')];
  const ranks=monthlyFuturesRankings(rows,'KTB3F_FRG','2026-10-28');
  assert.deepEqual(ranks.map(r=>[r.month,r.net,r.rank,r.days]),[['2025-04',150,1,2],['2026-10',140,2,2]]);
  assert.equal(monthlyFuturesRankings(rows,'KTB3F_FRG','2026-09-30').length,1);
});
test('ties share a competition rank, including ties at fifth place',()=>{
  const values=[100,90,80,70,60,60,50];
  const ranks=monthlyFuturesRankings(values.map((v,i)=>row(`2025-0${i+1}-02`,v)),'KTB3F_FRG','2026-10-28');
  assert.deepEqual(ranks.map(r=>r.rank),[1,2,3,4,5,5]);
});
test('partial first source month and invalid quantities do not become records',()=>{
  const rows=[row('2010-09-06',9999),row('2010-10-01',10),row('2010-10-02',null),row('2010-10-03',1.5),row('2010-11-01',-100)];
  assert.deepEqual(monthlyFuturesRankings(rows,'KTB3F_FRG','2010-11-30','2010-09').map(r=>r.net),[10]);
  assert.throws(()=>monthlyFuturesRankings([row('2010-10-01',1),row('2010-10-01',2)],'KTB3F_FRG','2026-10-28'));
});
test('rendering labels current MTD and includes source coverage and comparison records',()=>{
  const source={db_start:'2010-09-06',native_start:'2001-01-30',overlap:3969,differences:83,same_top_months:true,comparison_months:[{month:'2025-04',krx:214673,infomax:214313,difference:-360}]};
  const data={foreignFutures:[row('2026-10-28',127746),row('2026-10-28',44474,'KTB10F_FRG')],futuresResearch:{asof:'2026-10-28',products:{KTB3:source,KTB10:{...source,db_start:'2010-10-25',native_start:'2010-10-25'}}}};
  const section=futuresRankingSection(data,'2026-10-28',true);
  assert.equal(section.rows.length,2);
  assert.equal(section.rows[0].provisional,true);
  assert.match(section.html,/월중 잠정/);
  assert.match(section.html,/214,313/);
  assert.match(section.html,/2001-01-30/);
});

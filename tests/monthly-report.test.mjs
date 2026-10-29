import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingRange, kstYesterday, monthlySpot, monthlySum, nearbySeries, observation } from '../js/monthly-report.js';

test('KST cutoff uses yesterday and a closed month uses its calendar month end',()=>{
  const now=new Date('2026-10-28T23:00:00Z');
  assert.equal(kstYesterday(now),'2026-10-28');
  assert.equal(reportingRange('2026-10',now).end,'2026-10-28');
  assert.equal(reportingRange('2026-10',now).partial,true);
  assert.equal(reportingRange('2026-09',now).end,'2026-09-30');
  assert.equal(reportingRange('2026-09',now).partial,false);
});
test('first day of next month closes prior month without using current-day prices',()=>{
  const now=new Date('2026-10-31T16:00:00Z');
  assert.equal(kstYesterday(now),'2026-10-31');
  assert.equal(reportingRange('2026-10',now).partial,false);
  assert.throws(()=>reportingRange('2026-11',now));
});
test('monthly source snapshots are never summed and buckets share the selected as-of',()=>{
  const row=(day,bucket,v)=>({trade_date:day,investor:'외국인',maturity_bucket:bucket,net_buy_krw_thousand:v});
  const rows=[row('2026-10-23','전체',4e9),row('2026-10-28','전체',5e9),row('2026-10-23','0~6M',3e9),row('2026-10-28','1~2Y',2e9)];
  const result=monthlySpot(rows,'외국인','2026-10-01','2026-10-28');
  assert.equal(result.v,5);
  assert.deepEqual(result.buckets,[{name:'1~2Y',v:2}]);
  assert.equal(monthlySpot(rows,'외국인','2026-09-01','2026-09-30'),null);
});
test('daily futures sum distinguishes true zero, missing, and future observations',()=>{
  const rows=[{d:'2026-10-01',v:5},{d:'2026-10-02',v:-5},{d:'2026-10-29',v:100}];
  assert.equal(monthlySum(rows,'2026-10-01','2026-10-28').v,0);
  assert.equal(monthlySum(rows,'2026-09-01','2026-09-30'),null);
});
test('nearby contract selection uses volume and retains actual contract',()=>{
  const rows=[{trade_date:'2026-10-01',prod:'KTB3',close_price:100,volume:5,isu_cd:'a',isu_nm:'old'},
    {trade_date:'2026-10-01',prod:'KTB3',close_price:102,volume:50,isu_cd:'b',isu_nm:'new'},
    {trade_date:'2026-10-02',prod:'KTB3',close_price:null,volume:500,isu_cd:'c'}];
  assert.deepEqual(nearbySeries(rows,'KTB3'),[{d:'2026-10-01',v:102,contract:'new'}]);
});
test('month-end observation never carries an old month forward as a new observation',()=>{
  const rows=[{d:'2026-08-31',v:3},{d:'2026-09-29',v:4},{d:'2026-10-29',v:9}];
  assert.deepEqual(observation(rows,'2026-09-01','2026-09-30'),{d:'2026-09-29',v:4});
  assert.equal(observation(rows,'2026-10-01','2026-10-28'),null);
});

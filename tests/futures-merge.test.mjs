import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeInfomaxFutures} from '../js/api.js';
import {nearbySeries} from '../js/monthly-report.js';

const quotes=(day,price=103.2,volume=100)=>Object.entries({C:price,V:volume,O:1000,S:103.2,D:-.14}).map(([suffix,value])=>({symbol:`MR_KTB3_202612_A656C000_${suffix}`,trade_date:day,value}));
test('preserve exchange rows and fill only uncovered product dates',()=>{
  const krx=[{prod:'KTB3',trade_date:'2026-10-27',close_price:103.34,volume:500,isu_cd:'KRX-ID'}];
  const rows=mergeInfomaxFutures(krx,[...quotes('2026-10-27',999),...quotes('2026-10-28')]);
  assert.equal(rows.length,2);
  assert.equal(rows[0],krx[0]);
  assert.equal(rows[1].source,'인포맥스');
  assert.equal(rows[1].isu_cd,'IMX_A656C000');
  assert.equal(rows[1].open_int,1000);
  assert.equal(rows[1].change,-.14);
  assert.equal(rows[1].settle,103.2);
  assert.deepEqual(nearbySeries(rows,'KTB3').map(r=>r.v),[103.34,103.2]);
});
test('invalid or absent source values cannot turn into valid prices',()=>{
  for (const market of [quotes('2026-10-28',null),quotes('2026-10-28',NaN),quotes('2026-10-28',103,-1),quotes('2026-10-28').filter(r=>!r.symbol.endsWith('_V'))]) {
    assert.equal(mergeInfomaxFutures([],market).length,0);
  }
  assert.equal(nearbySeries(mergeInfomaxFutures([],quotes('2026-10-28',103,0)),'KTB3').length,0);
});
test('an empty exchange row does not suppress a liquid Infomax contract',()=>{
  const old=[{prod:'KTB3',trade_date:'2026-10-28',close_price:null,volume:0}];
  assert.equal(nearbySeries(mergeInfomaxFutures(old,quotes('2026-10-28')),'KTB3')[0].source,'인포맥스');
});

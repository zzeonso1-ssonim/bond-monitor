import assert from 'node:assert/strict';
import {loadSemiconductorData} from '../js/api.js';

const nativeFetch=globalThis.fetch;
let pages=0;
globalThis.fetch=async(url,options)=>{
  const meta=String(url).includes('web_meta');
  assert.ok(meta||String(url).includes('SEMI_DDR5_16G_SPOT,SEMI_GOVT3Y_AVG3'));
  assert.ok(!String(url).includes('fc_global_rates'));
  if(meta)return {ok:true,headers:new Headers({'content-range':'0-0/1'}),json:async()=>[{payload:{unit:'USD'}}]};
  pages++;
  const offset=Number(options.headers.Range.split('-')[0]);
  const rows=offset===0?Array.from({length:1000},()=>({trade_date:'2026-11-05',symbol:'SEMI_DDR5_16G_SPOT',value:60.667})):[{trade_date:'2026-11-06',symbol:'SEMI_GOVT3Y_AVG3',value:3.615}];
  return {ok:true,headers:new Headers({'content-range':`${offset}-${offset+rows.length-1}/1001`}),json:async()=>rows};
};
const sample=await loadSemiconductorData();assert.equal(pages,2);assert.equal(sample.prices.length,1000);assert.equal(sample.yields[0].value,3.615);assert.equal(sample.priceSource.unit,'USD');
globalThis.fetch=nativeFetch;
if(process.argv.includes('--live')){
  const data=await loadSemiconductorData();assert.ok(data.prices.length>=799);assert.ok(data.yields.length>=772);
  assert.equal(data.prices.find(r=>r.date==='2026-11-06').value,60.167);assert.equal(data.yields.find(r=>r.date==='2026-11-06').value,3.615);
  console.log(`Live data: ${data.prices.length} prices, ${data.yields.length} yields`);
}
console.log('Semiconductor data contract and pagination: PASS');

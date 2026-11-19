import test from 'node:test'
import assert from 'node:assert/strict'
import {forecast} from './pilot.mjs'

const hour=3600000
const origin=Date.UTC(2026,10,19,13)
const rows=Array.from({length:7},(_,i)=>({time:new Date(origin+(i-6)*hour).toISOString(),pm2_5:10+i}))

test('Da Nang forecast uses only the seven hourly inputs through the origin',()=>{
  const result=forecast(rows,origin+hour/2)
  assert.equal(result.status,'experimental')
  assert.deepEqual(result.predictions.map(p=>Date.parse(p.valid_at_utc)),[origin+hour,origin+3*hour])
  assert.deepEqual(forecast([...rows,{time:new Date(origin+hour).toISOString(),pm2_5:999}],origin),result)
})
test('missing, stale, and invalid inputs give no forecasts',()=>{
  assert.equal(forecast(rows,origin+hour).status,'stale')
  assert.equal(forecast(rows.slice(1),origin).status,'insufficient_data')
  assert.equal(forecast([...rows.slice(0,-1),{...rows.at(-1),pm2_5:null}],origin).predictions.length,0)
})

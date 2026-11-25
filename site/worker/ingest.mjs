import {collect} from './data.mjs'
const secret=process.env.AIR_SYNC_SECRET
if (!secret) throw Error('AIR_SYNC_SECRET is required')
const packet=await collect(14)
const origin='https://da-nang-air-quality-ai.nitia-gpt-pr-6208.chatgpt.site'
const response=await fetch(origin+'/api/system/ingest',{
  method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
  body:JSON.stringify(packet),signal:AbortSignal.timeout(30000)})
if (!response.ok) throw Error('Ingest failed: HTTP '+response.status+' '+await response.text())
const status=await (await fetch(origin+'/api/air-quality/current')).json()
if(status.updated_at!==packet.updated_at || status.stale) throw Error('Readback did not return fresh data')
console.log('Updated and verified:',status.updated_at)

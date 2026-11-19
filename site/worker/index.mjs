import {collect} from './data.mjs'
import {assets, snapshot, bands, modelInfo} from './generated.mjs'

function json(data,status=200) {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
}
let recent = null
let pending
async function history(bucket,now) {
  if (!recent && bucket) {
    const stored = await bucket.get('latest.json')
    if (stored) recent = await stored.json()
  }
  let cached = recent || snapshot
  if (!recent || now-Date.parse(cached.retrieved_at)>900000) {
    try {
      pending ??= collect(14).finally(()=>{pending=null})
      recent = await pending
      cached = recent
      if (bucket) {
        const body=JSON.stringify(recent)
        await bucket.put('history/'+recent.updated_at.slice(0,13)+'.json',body)
        await bucket.put('latest.json',body)
      }
    } catch { /* Keep timestamped readings if the provider is unavailable. */ }
  }
  return {...cached, stale:now-Date.parse(cached.updated_at)>10800000,
    refresh_delayed:now-Date.parse(cached.retrieved_at)>3600000}
}
export default {async fetch(request,env={}) {
  const url = new URL(request.url)
  if (url.pathname==='/api/system/sync' && request.method==='POST') {
    // Restricted to the owner-private Site by the hosting dispatch layer.
    if (!env.BUCKET) return json({error:'Storage unavailable'},503)
    if (Number(request.headers.get('Content-Length'))>300000) return json({error:'Too large'},413)
    const payload=await request.json()
    const keys=['pm2_5','pm10','carbon_monoxide','nitrogen_dioxide','sulphur_dioxide','ozone','temperature_2m','relative_humidity_2m','us_aqi']
    const times=Array.isArray(payload.data)?payload.data.map(row=>Date.parse(row.time)):[]
    const now=Date.now(), retrieved=Date.parse(payload.retrieved_at)
    const valid=payload.kind==='atmospheric_model_estimate' && payload.source==='Open-Meteo / CAMS'
      && times.length>=1 && times.length<=365 && Number.isFinite(retrieved) && Math.abs(retrieved-now)<900000
      && times.every((t,i)=>Number.isFinite(t)&&t<=now&&t%3600000===0&&(!i||t>times[i-1]))
      && times.at(-1)===Date.parse(payload.updated_at) && payload.data.every(row=>keys.every(k=>
        row[k]===null || Number.isFinite(row[k]) && (k==='temperature_2m'||row[k]>=0)
          && (k!=='relative_humidity_2m'||row[k]<=100)))
    if (!valid) return json({error:'Invalid normalized hourly data'},422)
    const body=JSON.stringify(payload)
    await env.BUCKET.put('history/'+payload.updated_at.slice(0,13)+'.json',body)
    await env.BUCKET.put('latest.json',body)
    recent=payload
    return json({data:{saved:times.length,updated_at:payload.updated_at}})
  }
  if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405})
  if (!url.pathname.startsWith('/api/')) {
    const asset = assets[url.pathname==='/'?'/index.html':url.pathname]
    if (!asset) return new Response('Not found',{status:404})
    const bytes=Uint8Array.from(atob(asset[1]), c=>c.charCodeAt(0))
    return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset[0]}})
  }
  const path=url.pathname.slice(5)
  if (path==='model/info') return json({data:modelInfo})
  if (path==='predictions') return json({data:[],status:'region_not_validated',horizons:[1,3]})
  if (path==='stations') return json({data:[{id:'dn-grid',name:'Điểm tham chiếu Đà Nẵng',latitude:16.0544,longitude:108.2022,kind:'model_grid'}]})
  const now=Date.now()
  const snapshotData=await history(env.BUCKET,now)
  const {data,...meta}=snapshotData
  const row=data.at(-1)
  const value=Number.isFinite(row.us_aqi)?Math.round(row.us_aqi):null
  const band=value===null?null:bands.find(([limit])=>limit===null || value<=limit)
  const index={value,category:band?.[1]??null,advice:meta.stale?null:band?.[2]??null,method:'US AQI',standard:'US AQI',
    status:value===null?'unavailable':meta.stale?'stale':'ok',valid_at:row.time,source:'Open-Meteo / CAMS'}
  switch(path) {
    case 'air-quality/history': {
      const days=Number(url.searchParams.get('days')??7)
      if (!Number.isInteger(days)||days<1||days>14) return json({error:'days must be 1–14'},422)
      const start=Date.parse(row.time)-days*86400000
      return json({...meta,data:data.filter(r=>Date.parse(r.time)>start)})
    }
    case 'weather/current': return json({...meta,data:{time:row.time,temperature_2m:row.temperature_2m,relative_humidity_2m:row.relative_humidity_2m}})
    case 'air-quality/current': return json({...meta,data:row})
    case 'aqi/current': return json({...meta,data:index})
    case 'system/status': {
      const archive=env.BUCKET ? await env.BUCKET.head('latest.json') : null
      return json({...meta,data:{status:meta.stale?'stale':'ok',region:'Da Nang',
        archived_at:archive?.uploaded?.toISOString()??null}})
    }
    case 'alerts': return json({...meta,data:meta.stale?[{kind:'stale_data'}]:value>100?[{kind:'current',...index}]:[]})
    default:return json({error:'Unknown endpoint'},404)
  }
}}

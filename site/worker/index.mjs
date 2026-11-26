import {collect} from './data.mjs'
import {forecast} from './pilot.mjs'
import pilotInfo from './pilot-model.json' with {type:'json'}
import {assets, snapshot, bands, modelInfo} from './generated.mjs'

function json(data,status=200) {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
}
let recent = null
let pending
async function recordForecast(bucket,result,now) {
  if (!bucket || result.status!=='experimental') return
  const key='su-pham/forecasts/'+result.model_version+'/'+result.origin_utc+'.json'
  await bucket.put(key,JSON.stringify({...result,issued_at:new Date(now).toISOString()}),
    {onlyIf:{etagDoesNotMatch:'*'}})
}
async function history(bucket,now) {
  if ((!recent || now-Date.parse(recent.retrieved_at)>900000) && bucket) {
    const stored = await bucket.get('su-pham/latest.json')
    if (stored) recent = await stored.json()
  }
  let cached = recent && Date.parse(recent.updated_at)>=Date.parse(snapshot.updated_at) ? recent : snapshot
  if (!recent || now-Date.parse(cached.retrieved_at)>900000 || Date.parse(cached.updated_at)<Math.floor(now/3600000)*3600000) {
    try {
      pending ??= collect(14).finally(()=>{pending=null})
      recent = await pending
      cached = recent
      if (bucket) {
        const body=JSON.stringify(recent)
        await bucket.put('su-pham/history/'+recent.updated_at.slice(0,13)+'.json',body)
        await bucket.put('su-pham/latest.json',body)
      }
    } catch (error) { console.error('Air data refresh failed:', String(error)) }
  }
  return {...cached, stale:now-Date.parse(cached.updated_at)>10800000,
    refresh_delayed:now-Date.parse(cached.retrieved_at)>3600000}
}
export default {async fetch(request,env={}) {
  const url = new URL(request.url)
  if (url.pathname==='/api/system/ingest' && request.method==='POST') {
    const secret=env.SYNC_SECRET
    const provided=request.headers.get('Authorization') || ''
    if (!secret || provided !== 'Bearer '+secret) return json({error:'Unauthorized'},401)
    if (!env.BUCKET) return json({error:'Storage unavailable'},503)
    if (Number(request.headers.get('Content-Length')||0)>300000) return json({error:'Too large'},413)
    const packet=await request.json()
    const now=Date.now(), rows=packet.data
    if (packet.source!=='Open-Meteo / CAMS' || packet.kind!=='atmospheric_model_estimate' ||
        packet.coordinates?.latitude!==16.0622 || packet.coordinates?.longitude!==108.1594 ||
        !Array.isArray(rows) || !rows.length || rows.length>365 ||
        Date.parse(packet.retrieved_at)>now+60000 || Date.parse(packet.retrieved_at)<now-900000 ||
        Date.parse(packet.updated_at)!==Math.floor(now/3600000)*3600000 ||
        rows.at(-1).time!==packet.updated_at ||
        rows.some((r,i)=>!Number.isFinite(Date.parse(r.time)) || Date.parse(r.time)>now ||
          (i && Date.parse(rows[i-1].time)>=Date.parse(r.time)))) return json({error:'Invalid data'},422)
    const body=JSON.stringify(packet)
    await env.BUCKET.put('su-pham/history/'+packet.updated_at.slice(0,13)+'.json',body)
    await env.BUCKET.put('su-pham/latest.json',body)
    recent=packet
    await recordForecast(env.BUCKET,forecast(rows,now),now)
    return json({data:{saved:rows.length,updated_at:packet.updated_at}})
  }
  if (url.pathname==='/api/system/sync' && request.method==='POST') {
    // Only provider data fetched by this server may enter the archive.
    if (!env.BUCKET) return json({error:'Storage unavailable'},503)
    const now=Date.now()
    const packet=await history(env.BUCKET,now)
    if (packet.refresh_delayed || Date.parse(packet.updated_at)!==Math.floor(now/3600000)*3600000)
      return json({error:'Current provider hour unavailable'},503)
    await recordForecast(env.BUCKET,forecast(packet.data,now),now)
    return json({data:{saved:packet.data.length,updated_at:packet.updated_at}})

  }
  if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405})
  if (!url.pathname.startsWith('/api/')) {
    const asset = assets[url.pathname==='/'?'/index.html':url.pathname]
    if (!asset) return new Response('Not found',{status:404})
    const bytes=Uint8Array.from(atob(asset[1]), c=>c.charCodeAt(0))
    return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset[0]}})
  }
  const path=url.pathname.slice(5)
  if (path==='model/info') return json({data:{...pilotInfo,beijing_benchmark:modelInfo}})
  if (path==='stations') return json({data:[{id:'dn-su-pham-grid',name:'Điểm tham chiếu ĐH Sư phạm Đà Nẵng',latitude:16.0622,longitude:108.1594,kind:'model_grid'}]})
  const now=Date.now()
  const snapshotData=await history(env.BUCKET,now)
  const {data,...meta}=snapshotData
  const row=data.at(-1)
  const value=Number.isFinite(row.us_aqi)?Math.round(row.us_aqi):null
  const band=value===null?null:bands.find(([limit])=>limit===null || value<=limit)
  const index={value,category:band?.[1]??null,advice:meta.stale?null:band?.[2]??null,method:'US AQI',standard:'US AQI',
    status:value===null?'unavailable':meta.stale?'stale':'ok',valid_at:row.time,source:'Open-Meteo / CAMS'}
  switch(path) {
    case 'predictions': {
      const result=forecast(data,now)
      await recordForecast(env.BUCKET,result,now)
      return json({...meta,data:result})
    }
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
      const archive=env.BUCKET ? await env.BUCKET.head('su-pham/latest.json') : null
      return json({...meta,data:{status:meta.stale?'stale':'ok',region:'Da Nang',
        archived_at:archive?.uploaded?.toISOString()??null}})
    }
    case 'alerts': return json({...meta,data:meta.stale?[{kind:'stale_data'}]:value>100?[{kind:'current',...index}]:[]})
    default:return json({error:'Unknown endpoint'},404)
  }
}}

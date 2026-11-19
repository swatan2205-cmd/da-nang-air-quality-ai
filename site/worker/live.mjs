import {collect} from './data.mjs'
import {forecast} from './pilot.mjs'
import bands from './bands.json' with {type:'json'}

export async function liveDashboard() {
  const packet=await collect(7)
  const now=Date.now()
  const row=packet.data.at(-1)
  const stale=now-Date.parse(row.time)>10800000
  const value=Number.isFinite(row.us_aqi)?Math.round(row.us_aqi):null
  const band=value===null?null:bands.find(([limit])=>limit===null||value<=limit)
  return {history:{...packet,stale},aqi:{data:{value,method:'US AQI',category:band?.[1],
    advice:stale?null:band?.[2],valid_at:row.time}},predictions:{data:forecast(packet.data,now)}}
}

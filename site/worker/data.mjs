const coords = {latitude: 16.0544, longitude: 108.2022}
const aq = Object.fromEntries(['pm2_5','pm10','carbon_monoxide','nitrogen_dioxide','sulphur_dioxide','ozone'].map(k => [k,'μg/m³']))
export const sources = [
  ['https://air-quality-api.open-meteo.com/v1/air-quality', {...aq,us_aqi:'USAQI'}],
  ['https://api.open-meteo.com/v1/forecast', {temperature_2m:'°C',relative_humidity_2m:'%'}]
]

export async function collect(days, now = Date.now()) {
  const streams = await Promise.all(sources.map(async ([endpoint, fields]) => {
    const url = new URL(endpoint)
    url.search = new URLSearchParams({...coords, timezone:'GMT', hourly:Object.keys(fields).join(','),
      past_days:String(days), forecast_days:'1'})
    let packet
    for (let attempt=0; attempt<2; attempt++) {
      try {
        const response = await fetch(url, {signal:AbortSignal.timeout(8000)})
        if (!response.ok) throw Error('Upstream HTTP '+response.status)
        packet = await response.json()
        break
      } catch (err) { if (attempt) throw err }
    }
    const rows = new Map()
    const times = packet.hourly.time
    for (const [field,unit] of Object.entries(fields)) {
      if (packet.hourly_units[field]?.replace('µ','μ')!==unit || packet.hourly[field]?.length!==times.length)
        throw Error('Unexpected units or length for '+field)
    }
    times.forEach((time,i) => {
      const ms = Date.parse(time+'Z')
      if (!Number.isFinite(ms) || ms>now) return
      const row = {time:new Date(ms).toISOString()}
      for (const field of Object.keys(fields)) {
        const value = packet.hourly[field][i]
        row[field] = Number.isFinite(value) && (field==='temperature_2m' || value>=0)
          && (field!=='relative_humidity_2m' || value<=100) ? value : null
      }
      rows.set(ms,row)
    })
    return {endpoint,grid:[packet.latitude,packet.longitude],rows}
  }))
  const data = [...streams[0].rows].filter(([ms])=>streams[1].rows.has(ms))
    .map(([ms,row])=>({...row,...streams[1].rows.get(ms)})).sort((a,b)=>a.time.localeCompare(b.time))
  if (!data.length) throw Error('No common hours')
  return {data,updated_at:data.at(-1).time,retrieved_at:new Date(now).toISOString(),
    kind:'atmospheric_model_estimate',source:'Open-Meteo / CAMS',coordinates:coords,
    grids:streams.map(({endpoint,grid})=>({endpoint,grid}))}
}

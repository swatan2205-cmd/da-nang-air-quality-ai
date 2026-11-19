import artifact from './pilot-model.json' with {type:'json'}

const hourMs=3600000
export function forecast(rows,now=Date.now()) {
  const origin=Math.floor(now/hourMs)*hourMs
  const readings=new Map(rows.map(row=>[Date.parse(row.time),row.pm2_5]))
  const result={model_version:artifact.version,validation:'cams_estimates_only',
    kind:'experimental_ml_forecast',coordinates:{latitude:16.0544,longitude:108.2022},
    origin_utc:null,unit:'µg/m³',predictions:[]}
  if (!readings.has(origin)) return {...result,status:rows.length?'stale':'insufficient_data'}
  const lag=Array.from({length:7},(_,offset)=>readings.get(origin-offset*hourMs))
  result.origin_utc=new Date(origin).toISOString()
  if (!lag.every(v=>Number.isFinite(v)&&v>=0)) return {...result,status:'insufficient_data'}
  const hour=new Date(origin+7*hourMs).getUTCHours()
  const angle=2*Math.PI*hour/24
  const mean=n=>lag.slice(0,n).reduce((a,b)=>a+b,0)/n
  const features=[lag[0],lag[1],lag[3],lag[6],mean(3),mean(6),Math.sin(angle),Math.cos(angle)]
  for (const horizon of [1,3]) {
    const model=artifact.models[String(horizon)]
    const pm25=Math.max(0,model.coefficients.reduce((sum,w,i)=>sum+w*features[i],model.intercept))
    const change=pm25-lag[0]
    result.predictions.push({horizon_h:horizon,valid_at_utc:new Date(origin+horizon*hourMs).toISOString(),
      pm25,change,trend:Math.abs(change)<=1?'stable':change>0?'rising':'falling',model:model.name})
  }
  return {...result,status:'experimental',current_pm25:lag[0]}
}

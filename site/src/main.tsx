import React, {useEffect, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, CloudSun, Cpu, Database, Droplets, ExternalLink, Gauge, Globe2, Info, Layers, Leaf, LocateFixed, MapPin, Menu, Radio, RefreshCw, ShieldCheck, Thermometer, Waves, Wind, X} from 'lucide-react'
import {Area, AreaChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './style.css'

const vars = [
  ['pm2_5','PM2.5','Bụi mịn'], ['pm10','PM10','Bụi hô hấp'], ['carbon_monoxide','CO','Carbon monoxide'],
  ['nitrogen_dioxide','NO₂','Nitơ đioxit'], ['sulphur_dioxide','SO₂','Lưu huỳnh đioxit'], ['ozone','O₃','Ozon'],
] as const
type Pollutant = typeof vars[number][0]
type Reading = {time:string} & Partial<Record<Pollutant | 'temperature_2m' | 'relative_humidity_2m' | 'us_aqi',number|null>>
type History = {data:Reading[],stale?:boolean,updated_at?:string,retrieved_at?:string}
type Aqi = {value?:number|null,category?:string,advice?:string,method?:string}
const nav = [
  {id:'tong-quan',title:'Tổng quan', icon:Gauge}, {id:'quan-trac',title:'Quan trắc',icon:Radio},
  {id:'du-bao',title:'Dự báo AI',icon:Cpu},{id:'lich-su',title:'Lịch sử & thống kê',icon:ChartNoAxesCombined},
  {id:'he-thong',title:'Giới thiệu hệ thống',icon:Info}
]
const tz = 'Asia/Ho_Chi_Minh'
const dayKey = (s:string) => new Date(new Date(s).getTime()+7*3600000).toISOString().slice(0,10)
const stamp = (s?:string,mode:'hour'|'full'|'day'='full') => !s || !Number.isFinite(Date.parse(s)) ? '—' :
  new Intl.DateTimeFormat('vi-VN',{timeZone:tz,...(mode==='hour'?{hour:'2-digit',minute:'2-digit'}:mode==='day'?{day:'2-digit',month:'2-digit'}:{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}).format(new Date(s))
const number = (n?:number|null,digits=1) => typeof n==='number' && Number.isFinite(n) ? n.toLocaleString('vi-VN',{maximumFractionDigits:digits}):'—'
const paths = () => nav.find(n=>n.id===location.hash.slice(1))?.id || 'tong-quan'
const pmUnit = 'µg/m³'
const units = (key:string) => key==='temperature_2m'?'°C':key==='relative_humidity_2m'?'%':pmUnit
const hasValue = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v)
const aqiBands = [
  ['Tốt','0–50'], ['Trung bình','51–100'],
  ['Kém cho nhóm nhạy cảm','101–150'], ['Có hại cho sức khỏe','151–200'],
  ['Rất có hại cho sức khỏe','201–300'], ['Nguy hại','301 trở lên']
]

function AqiScale() {
  return <div className="aqibar" aria-label="Các mức US AQI">
    {aqiBands.map(([name,range],i)=><button type="button" className="aqiband" key={range}
      aria-label={name+', US AQI '+range} aria-describedby={'aqi-band-'+i}>
      <span className="aqitooltip" role="tooltip" id={'aqi-band-'+i}>{name}<br/><b>US AQI {range}</b></span>
    </button>)}
  </div>
}

function DataChart({records,field,daily=false}:{records:Reading[],field:Pollutant,daily?:boolean}) {
  const rows = records.map(r=>({t:r.time,v:r[field]??null}))
  if(!rows.some(r=>hasValue(r.v)))return <div className="empty">Chưa có dữ liệu cho khoảng thời gian này.</div>
  return <div className="plot"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{left:-14,right:14,top:12,bottom:0}}>
    <defs><linearGradient id="mist" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#34b597" stopOpacity={.28}/><stop offset="100%" stopColor="#34b597" stopOpacity={.025}/></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="#e0e9e5" strokeDasharray="3 4"/><XAxis dataKey="t" tickFormatter={s=>stamp(s,daily?'day':'hour')} minTickGap={36} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#687870'}}/><YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#687870'}} width={52}/>
    <Tooltip labelFormatter={s=>stamp(String(s),daily?'day':'full')} formatter={v=>[number(Number(v))+' '+pmUnit,vars.find(a=>a[0]===field)?.[1]]} contentStyle={{borderRadius:12,borderColor:'#c8ddd5',fontSize:13}}/>
    <Area type="linear" dataKey="v" stroke="#168d70" strokeWidth={2.4} fill="url(#mist)" isAnimationActive={false} connectNulls={false}/>
  </AreaChart></ResponsiveContainer></div>
}
function SiteMap({latitude,longitude,name}:{latitude:number,longitude:number,name:string}){
  const host=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!host.current)return
    const map=L.map(host.current,{scrollWheelZoom:false}).setView([latitude,longitude],12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map)
    L.circleMarker([latitude,longitude],{radius:10,weight:3,color:'#fff',fillColor:'#168d70',fillOpacity:1}).bindPopup('Điểm tham chiếu · Ước tính lưới Open-Meteo').addTo(map)
    return ()=>{map.remove()}
  },[latitude,longitude])
  return <div ref={host} className="map" aria-label={'Bản đồ điểm tham chiếu '+name}/>
}
type Prediction = {horizon_h:number, valid_at_utc:string, pm25:number, change:number, trend:string}
type ForecastData = {status:string, origin_utc:string|null, model_version:string, predictions:Prediction[]}
const unavailableForecast:ForecastData = {status:'unavailable',origin_utc:null,model_version:'',predictions:[]}

function readForecast(data:ForecastData|undefined):ForecastData {
  if (!data || !['experimental','stale','insufficient_data'].includes(data.status)) return unavailableForecast
  if (data.status !== 'experimental') return {...data,predictions:[]}
  const origin=Date.parse(data.origin_utc||'')
  if (!Number.isFinite(origin) || !Array.isArray(data.predictions)) return unavailableForecast
  if (origin!==Math.floor(Date.now()/3600000)*3600000) return {...data,status:'stale',predictions:[]}
  const predictions=data.predictions.filter(p=>p && [1,3].includes(p.horizon_h) && hasValue(p.pm25) && p.pm25>=0 &&
    hasValue(p.change) && Date.parse(p.valid_at_utc)===origin+p.horizon_h*3600000)
  return {...data,predictions,status:predictions.length?'experimental':'insufficient_data'}
}
function forecastMessage(status:string) {
  if(status==='loading')return 'Đang tải dự báo.'
  if(status==='stale')return 'Dữ liệu đầu vào đã cũ. Đang chờ kỳ dự báo mới.'
  if(status==='insufficient_data')return 'Chưa đủ dữ liệu giờ hợp lệ để tạo dự báo.'
  return 'Chưa kết nối được dịch vụ dự báo. Hãy thử làm mới.'
}
function trendLabel(p:Prediction) {
  const label=({rising:'Tăng',falling:'Giảm',stable:'Ổn định'} as Record<string,string>)[p.trend]
  return (label||'Thay đổi')+' ('+(p.change>0?'+':'')+number(p.change)+' '+pmUnit+')'
}
function ForecastPlot({rows,result}:{rows:Reading[],result:ForecastData}) {
  const origin=Date.parse(result.origin_utc||'')
  const history=rows.filter(r=>Date.parse(r.time)<=origin && Date.parse(r.time)>=origin-6*3600000)
  const points=history.map(r=>({t:Date.parse(r.time),cams:r.pm2_5??null,ml:null as number|null}))
  for(const p of result.predictions) points.push({t:Date.parse(p.valid_at_utc),cams:null,ml:p.pm25})
  const tick=(ms:number)=>stamp(new Date(ms).toISOString(),'hour')
  return <section className="card forecastplot"><h2>PM2.5 theo giờ tại Đà Nẵng</h2><p>Đơn vị {pmUnit} · UTC+7</p><div className="plot"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points.sort((a,b)=>a.t-b.t)}>
    <CartesianGrid vertical={false} strokeDasharray="3 4"/><XAxis type="number" dataKey="t" scale="time" domain={['dataMin','dataMax']} tickFormatter={tick} tick={{fontSize:11}} minTickGap={35}/><YAxis width={40} tick={{fontSize:11}}/><Tooltip labelFormatter={ms=>stamp(new Date(Number(ms)).toISOString())} formatter={v=>number(Number(v))+' '+pmUnit}/><Legend wrapperStyle={{fontSize:12}}/>
    <Line dataKey="cams" name="Ước tính CAMS" stroke="#168d70" dot={{r:2}} isAnimationActive={false}/><Line dataKey="ml" name="Dự báo AI thử nghiệm" stroke="#8155aa" strokeDasharray="4 4" dot={{r:4}} isAnimationActive={false}/>
  </ComposedChart></ResponsiveContainer></div></section>
}
function Forecast({rows,result}:{rows:Reading[],result:ForecastData}){
  const current=rows[rows.length-1]
  return <><div className="notice"><Cpu/><div><strong>Dự báo thử nghiệm tại Đà Nẵng</strong><p>Mô hình được huấn luyện và đánh giá trên chuỗi ước tính CAMS tại Đà Nẵng. Độ chính xác so với số đo tại trạm địa phương chưa được kiểm định.</p></div></div>
  <div className="forecast-grid"><section className="card"><div className="label">PM2.5 tại giờ cập nhật</div><h2 className="metric">{number(current?.pm2_5)} <small>{pmUnit}</small></h2><p>{stamp(current?.time)} (UTC+7) · Ước tính CAMS</p></section>
  {[1,3].map(h=>{const p=result.predictions.find(p=>p.horizon_h===h);return <section className="card" key={h}><div className="label">Dự báo sau {h} giờ</div><h2 className="metric">{number(p?.pm25)} <small>{pmUnit}</small></h2>{p?<><strong>{trendLabel(p)}</strong><p>{stamp(p.valid_at_utc)} (UTC+7)</p></>:<p>{result.status==='experimental'?'Chưa có dự báo cho chân trời này.':forecastMessage(result.status)}</p>}</section>})}</div>
  {result.origin_utc&&<p className="forecastmeta">Giờ đầu vào {stamp(result.origin_utc)} (UTC+7){result.model_version?' · '+result.model_version:''}</p>}
  {result.predictions.length>0&&<ForecastPlot rows={rows} result={result}/>}
  <section className="card forecastplot"><div className="eyebrow"><Cpu size={15}/> danang-cams-ridge-v1</div><h2>Sai số dự báo trên dữ liệu CAMS Đà Nẵng</h2><p>MAE trên tập kiểm thử từ tháng 7 đến hết tháng 12/2025, đơn vị {pmUnit}. Mốc đối chiếu persistence giữ nguyên nồng độ tại giờ đầu vào.</p>
  <div className="tablewrap"><table><thead><tr><th>Chân trời</th><th>Ridge</th><th>Persistence</th></tr></thead><tbody><tr><td>1 giờ</td><td>1,01</td><td>1,05</td></tr><tr><td>3 giờ</td><td>2,61</td><td>2,49</td></tr></tbody></table></div><p>Ridge giảm nhẹ sai số ở chân trời 1 giờ. Ở chân trời 3 giờ, mô hình có sai số cao hơn persistence.</p></section>
  <section className="card"><div className="eyebrow"><Cpu size={15}/> Nghiên cứu Bắc Kinh · beijing-v1</div><h2>Kết quả kiểm thử Random Forest tại Bắc Kinh</h2><p>Thử nghiệm riêng trên 12 trạm Bắc Kinh, giai đoạn kiểm thử 09/2016 – 02/2017.</p><div className="tablewrap"><table><thead><tr>{['Chân trời','Số mẫu','MAE (µg/m³)','RMSE (µg/m³)','R²'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody><tr><td>1 giờ</td><td>47.344</td><td>10,74</td><td>21,18</td><td>0,954</td></tr><tr><td>3 giờ</td><td>47.169</td><td>23,72</td><td>43,51</td><td>0,808</td></tr></tbody></table></div><p>Trong nhóm có nồng độ đích cao hơn phân vị 95 của tập huấn luyện, dự báo 3 giờ thấp hơn thực đo trung bình 55,14 µg/m³.</p></section></>
}
function Method({aqi}:{aqi:Aqi}){
  return <div className="method-grid">{[
    [Globe2,'Nguồn dữ liệu','Open-Meteo cung cấp ước tính chất lượng không khí từ mô hình khí quyển CAMS và dữ liệu thời tiết dạng lưới tại tọa độ yêu cầu.','https://open-meteo.com/en/docs/air-quality-api'],
    [Gauge,'Phương pháp AQI','Chỉ số hiển thị kèm tên phương pháp và nguồn. Nồng độ từng chất được trình bày bằng µg/m³. '+(aqi.method?'Phương pháp trong dữ liệu hiện tại: '+aqi.method+'.':''),'https://open-meteo.com/en/docs/air-quality-api'],
    [Database,'Dữ liệu huấn luyện','Beijing Multi-Site Air Quality gồm 420.768 bản ghi giờ tại 12 trạm, giai đoạn 03/2013 – 02/2017. Dữ liệu được chia theo thời gian.','https://archive.ics.uci.edu/dataset/501/beijing+multi+site+air+quality+data'],
    [Cpu,'Mô hình và giới hạn','Dự báo thử nghiệm tại Đà Nẵng dùng chuỗi ước tính CAMS địa phương. Kết quả Random Forest trên 12 trạm Bắc Kinh thuộc nghiên cứu riêng. Kiểm định bằng số đo tại Đà Nẵng còn đang chờ dữ liệu.','#du-bao']
  ].map(([Icon,title,desc,link])=>{const I=Icon as typeof Globe2;return <article className="card" key={String(title)}><I className="tileicon"/><h2>{String(title)}</h2><p>{String(desc)}</p><a className="textlink" href={String(link)}>{String(link).startsWith('#')?'Xem đánh giá':'Xem tài liệu nguồn'} <ExternalLink size={14}/></a></article>})}</div>
}
function HistoryView({rows}:{rows:Reading[]}){
  const [field,setField]=useState<Pollutant>('pm2_5'),[daily,setDaily]=useState(false)
  const first=rows[0]?.time?dayKey(rows[0].time):'',last=rows.length?dayKey(rows[rows.length-1].time):''
  const [from,setFrom]=useState(''),[to,setTo]=useState('')
  const subset=rows.filter(r=>dayKey(r.time)>=(from||first)&&dayKey(r.time)<=(to||last))
  const groups=new Map<string,number[]>()
  for(const r of subset){const k=dayKey(r.time);if(!groups.has(k))groups.set(k,[]);const v=r[field];if(hasValue(v))groups.get(k)!.push(v)}
  const points:Reading[]=daily?Array.from(groups,([k,v])=>({time:k+'T00:00:00+07:00',[field]:v.length?v.reduce((a,b)=>a+b,0)/v.length:null})):subset
  const values=subset.map(r=>r[field]).filter(hasValue)
  return <section className="card"><div className="charthead"><div><div className="eyebrow"><CalendarDays size={15}/> Lịch sử</div><h2>Thống kê theo thời gian</h2></div><Parameter value={field} onChange={setField}/></div><div className="filters"><label>Từ ngày<input type="date" min={first} max={to||last} value={from||first} onChange={e=>setFrom(e.target.value)}/></label><label>Đến ngày<input type="date" min={from||first} max={last} value={to||last} onChange={e=>setTo(e.target.value)}/></label><label>Hiển thị<select value={daily?'d':'h'} onChange={e=>setDaily(e.target.value==='d')}><option value="h">Theo giờ</option><option value="d">Trung bình ngày</option></select></label></div><DataChart field={field} records={points} daily={daily}/><div className="stats">{[['Số giờ có dữ liệu',number(values.length)],['Trung bình',values.length?number(values.reduce((a,b)=>a+b,0)/values.length):'—'],['Cao nhất',values.length?number(Math.max(...values)):'—']].map(([a,b])=><div key={a}><small>{a}</small><strong>{b}</strong></div>)}</div></section>
}
function Parameter({value,onChange}:{value:Pollutant,onChange:(v:Pollutant)=>void}){return <select aria-label="Chọn chất ô nhiễm" value={value} onChange={e=>onChange(e.target.value as Pollutant)}>{vars.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>}

type Place = {id:string,name:string,latitude:number,longitude:number,detail:string}
const defaultPlace:Place={id:'su-pham',name:'ĐH Sư phạm Đà Nẵng',latitude:16.0622,longitude:108.1594,detail:'Điểm tham chiếu ban đầu'}
const normalizedName=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim()

function Observe({defaultRows,defaultRetrieved}:{defaultRows:Reading[],defaultRetrieved?:string}) {
  const [query,setQuery]=useState(''),[places,setPlaces]=useState<Place[]>([]),[place,setPlace]=useState(defaultPlace)
  const [rows,setRows]=useState<Reading[]|null>(null),[retrieved,setRetrieved]=useState<string>(),[searching,setSearching]=useState(false)
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[field,setField]=useState<Pollutant>('pm2_5')
  const searchId=useRef(0),requestId=useRef(0)
  async function search(e:React.FormEvent) {
    e.preventDefault()
    const term=query.trim(),id=++searchId.current
    if(term.length<2){setPlaces([]);setError('Nhập ít nhất 2 ký tự để tìm địa điểm.');return}
    setSearching(true);setPlaces([]);setError('')
    try{
      const url=new URL('https://geocoding-api.open-meteo.com/v1/search')
      url.search=new URLSearchParams({name:term,count:'100',language:'vi',countryCode:'VN'}).toString()
      const response=await fetch(url,{signal:AbortSignal.timeout(12000)})
      if(!response.ok)throw Error()
      const payload=await response.json()
      if(id!==searchId.current)return
      const results:Place[]=(payload.results||[]).filter((r:{name:string,latitude:number,longitude:number})=>
        Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&r.latitude>=15.5&&r.latitude<=16.5&&r.longitude>=107.5&&r.longitude<=108.7
        && !(normalizedName(term)==='hai chau'&&normalizedName(r.name)==='hai chau'&&r.latitude<16.0))
        .map((r:{id:number,name:string,latitude:number,longitude:number,admin1?:string,admin2?:string,admin3?:string,feature_code?:string})=>({
          id:String(r.id),name:r.name,latitude:r.latitude,longitude:r.longitude,
          detail:[r.admin3,r.admin2,r.admin1,r.feature_code].filter(Boolean).join(' · ')}))
      // Open-Meteo returns a different locality named Hải Châu. This known
      // central reference is clearly labelled and remains selectable separately.
      if(normalizedName(term).includes('hai chau')) results.unshift({id:'hai-chau-center',name:'Hải Châu · Đà Nẵng',
        latitude:16.0762,longitude:108.218,detail:'Điểm trung tâm tham khảo · nguồn tinhthanhvn.com'})
      setPlaces(results)
      if(!results.length)setError('Không tìm thấy địa điểm quanh Đà Nẵng. Hãy thử tên khác.')
    }catch{if(id===searchId.current)setError('Không kết nối được dịch vụ tìm địa điểm. Hãy thử lại.')}
    finally{if(id===searchId.current)setSearching(false)}
  }
  async function choose(next:Place) {
    const id=++requestId.current
    setPlace(next);setPlaces([]);setQuery(next.name);setRows([]);setRetrieved(undefined);setError('');setLoading(true)
    try{
      const {collect}=await import('../worker/data.mjs')
      const packet=await collect(7,Date.now(),{latitude:next.latitude,longitude:next.longitude})
      if(id!==requestId.current)return
      setRows(packet.data);setRetrieved(packet.retrieved_at)
    }catch{if(id===requestId.current)setError('Không lấy được dữ liệu cho địa điểm này. Hãy thử lại.')}
    finally{if(id===requestId.current)setLoading(false)}
  }
  const displayed=rows??defaultRows,current=displayed[displayed.length-1],now=current?.time
  const stale=!!now&&Date.now()-Date.parse(now)>3*3600000
  return <><section className="card location-search"><h2>Tìm địa điểm quanh Đà Nẵng</h2>
    <form onSubmit={search}><label htmlFor="place-query">Tên địa điểm</label><div className="location-search-controls">
      <input id="place-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ví dụ: Hải Châu, Sơn Trà" />
      <button type="submit" disabled={searching}>{searching?'Đang tìm…':'Tìm kiếm'}</button></div></form>
    {error&&<p role="alert">{error}</p>}
    {places.length>0&&<ul className="place-results" aria-label="Kết quả tìm địa điểm">{places.map(p=><li key={p.id}>
      <button type="button" onClick={()=>choose(p)}><strong>{p.name}</strong><span>{p.detail} · {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}</span></button>
    </li>)}</ul>}
    </section>
    <div className="observe"><section className="card"><div className="eyebrow"><LocateFixed size={15}/> Điểm dữ liệu</div>
      <h2>{place.name}</h2><p>{place.latitude.toFixed(4)}° B · {place.longitude.toFixed(4)}° Đ. Ước tính trên lưới Open-Meteo/CAMS.</p><SiteMap latitude={place.latitude} longitude={place.longitude} name={place.name}/></section>
      <section className="card"><div className="eyebrow"><Radio size={15}/> Giờ hiệu lực {stamp(now)}</div><h2>Thông số tại điểm</h2>
      {loading?<p role="status">Đang tải dữ liệu địa điểm…</p>:!current?<p>Chưa có dữ liệu cho địa điểm này.</p>:<><p>{stale?'Dữ liệu đã cũ · ':''}Ước tính mô hình khí quyển · Thu thập {stamp(rows?retrieved:defaultRetrieved)} (UTC+7)</p>
      <div className="measurelist">{vars.map(([key,name,desc])=><div key={key}><span><b>{name}</b><small>{desc}</small></span><strong>{number(current[key])} <small>{pmUnit}</small></strong></div>)}
      {([['temperature_2m','Nhiệt độ'],['relative_humidity_2m','Độ ẩm']] as const).map(([key,name])=><div key={key}><span><b>{name}</b></span><strong>{number(current[key])} <small>{units(key)}</small></strong></div>)}</div></>}</section></div>
    <section className="card chartcard"><div className="charthead"><div><div className="eyebrow"><Activity size={15}/> Diễn biến theo giờ</div><h2>Nồng độ tại {place.name}</h2></div><Parameter value={field} onChange={setField}/></div><DataChart records={displayed} field={field}/></section></>
}

function App(){
  const [forecast,setForecast]=useState<ForecastData>({...unavailableForecast,status:'loading'})
  const [page,setPage]=useState(paths),[mobile,setMobile]=useState(false),[history,setHistory]=useState<History>({data:[]}),[aqi,setAqi]=useState<Aqi>({}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[nonce,setNonce]=useState(0),[field,setField]=useState<Pollutant>('pm2_5'),[span,setSpan]=useState(24)
  useEffect(()=>{const change=()=>{setPage(paths());setMobile(false);window.scrollTo(0,0)};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[])
  useEffect(()=>{const id=window.setInterval(()=>setNonce(n=>n+1),15*60000);return()=>clearInterval(id)},[])
  useEffect(()=>{let active=true;const ctrl=new AbortController();const timer=window.setTimeout(()=>ctrl.abort(),45000)
    async function fetchJson(url:string){const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error();return r.json()}
    setLoading(true)
    Promise.allSettled([fetchJson('/api/air-quality/history?days=7'),fetchJson('/api/aqi/current'),fetchJson('/api/predictions')]).then(async ([h,a,f])=>{
      if(!active)return
      let historyPacket=h.status==='fulfilled'?h.value:null
      let aqiPacket=a.status==='fulfilled'?a.value:null
      let forecastPacket=f.status==='fulfilled'?f.value:null
      const lastHour=Date.parse(historyPacket?.updated_at||'')
      if(historyPacket?.stale || !Number.isFinite(lastHour) || lastHour<Math.floor(Date.now()/3600000)*3600000 || readForecast(forecastPacket?.data).status!=='experimental'){
        try{
          const {liveDashboard}=await import('../worker/live.mjs')
          const live=await liveDashboard()
          if(!active)return
          historyPacket=live.history
          aqiPacket=live.aqi
          forecastPacket=live.predictions
        }catch{ /* Retain the API's timestamped history and forecast status. */ }
      }
      if(!active)return
      if(Array.isArray(historyPacket?.data)){
        setHistory({...historyPacket,data:historyPacket.data.filter((r:Reading)=>r&&Number.isFinite(Date.parse(r.time))).sort((l:Reading,r:Reading)=>Date.parse(l.time)-Date.parse(r.time))});setError('')
      }else setError('Chưa kết nối được dữ liệu. Bạn có thể thử làm mới.')
      setAqi(aqiPacket?.data||{})
      setForecast(readForecast(forecastPacket?.data))
      setLoading(false)
    }).finally(()=>clearTimeout(timer))
    return()=>{active=false;ctrl.abort();clearTimeout(timer)}
  },[nonce])
  const rows=history.data,current=rows[rows.length-1],now=current?.time
  const stale=history.stale===true||Boolean(now&&Date.now()-Date.parse(now)>7200000)||Boolean(error)
  const status=loading?'Đang cập nhật':!current?'Thiếu dữ liệu':stale?'Dữ liệu đã cũ':'Đã cập nhật'
  const cut=(hours:number)=>rows.filter(r=>Date.parse(r.time)>Date.parse(now||'')-hours*3600000)
  const previous=now?rows.find(r=>Date.parse(now)-Date.parse(r.time)===3600000):undefined
  const diff=hasValue(current?.pm2_5)&&hasValue(previous?.pm2_5)?current!.pm2_5!-previous!.pm2_5!:null
  const titles=['Chất lượng không khí','Quan trắc môi trường','Dự báo PM2.5','Lịch sử & thống kê','Giới thiệu hệ thống']
  const selected=nav.findIndex(n=>n.id===page)
  const fieldName=vars.find(v=>v[0]===field)![1]
  const okAqi=hasValue(aqi.value)
  const chart=<section className="card chartcard"><div className="charthead"><div><div className="eyebrow"><Activity size={15}/> Diễn biến theo giờ</div><h2>Nồng độ {fieldName} <small>({pmUnit})</small></h2></div><div className="charttools"><Parameter value={field} onChange={setField}/><select aria-label="Khoảng thời gian" value={span} onChange={e=>setSpan(+e.target.value)}><option value={24}>24 giờ</option><option value={72}>72 giờ</option><option value={168}>7 ngày</option></select></div></div><DataChart records={cut(span)} field={field}/></section>
  return <div className="shell">{mobile&&<button className="scrim" onClick={()=>setMobile(false)} aria-label="Đóng menu"/>}
  <aside className={mobile?'rail opened':'rail'}><a href="#tong-quan" className="brand"><div className="brandmark"><Wind size={29}/></div><div><strong>Da Nang Air</strong><small>QUALITY AI</small></div></a><button className="close" onClick={()=>setMobile(false)} aria-label="Đóng menu"><X/></button><nav>{nav.map(({id,title,icon:Icon})=><a href={'#'+id} className={id===page?'active':''} aria-current={id===page?'page':undefined} key={id}><Icon size={19}/>{title}{id===page&&<i/>}</a>)}</nav><div className="railfoot"><div className="globe"><Globe2 size={18}/></div><div><strong>Đà Nẵng, Việt Nam</strong><small>UTC+7 · Giờ địa phương</small></div></div></aside>
  <main><header className="topbar"><div className="crumb"><button className="hamb" onClick={()=>setMobile(true)} aria-label="Mở menu"><Menu/></button><Layers size={15}/><span>Không gian giám sát</span><ChevronRight size={14}/><b>{nav[selected].title}</b></div>{page!=='quan-trac'&&<div className="status"><i className={loading||stale||!current?'pending':''}/>{status}</div>}</header>
  <div className="mainbody"><div className="pageheading"><div><div className="eyebrow"><MapPin size={14}/> Đà Nẵng · Việt Nam</div><h1>{titles[selected]}</h1></div><button className="reload" disabled={loading} onClick={()=>setNonce(n=>n+1)}><RefreshCw size={15} className={loading?'spin':''}/> Làm mới</button></div>
  {error&&<div role="alert" className="warn">{error}</div>}
  {page==='tong-quan'&&<><div className="overview"><section className="hero"><div className="herotop"><span className="herolabel"><Wind size={17}/> Bụi mịn PM2.5</span><span className="hero-source">Mô hình khí quyển</span></div><div className="heronumber">{number(current?.pm2_5)} <small>{pmUnit}</small></div><div className="herochange">{diff!==null?<>{diff>0?<ArrowUpRight size={16}/>:<ArrowDownRight size={16}/>} {diff===0?'Ổn định':(diff>0?'Tăng ':'Giảm ')+number(Math.abs(diff))+' '+pmUnit} so với giờ trước</>:<><Activity size={16}/> {loading?'Đang tải dữ liệu':'Chưa đủ hai giờ liên tiếp'}</>}</div><div className="herofoot"><span><LocateFixed size={14}/> Điểm tham chiếu Đà Nẵng</span><b>{stamp(now)}</b></div></section>
  <section className="card aqicard"><div className="eyebrow"><Gauge size={16}/> Chỉ số chất lượng không khí</div><div className="aqinumber">{number(aqi.value,0)} <small>{aqi.method||'AQI'}</small></div><strong>{okAqi?(aqi.category||'Chỉ số từ nguồn'):'Chưa có chỉ số hợp lệ'}</strong><AqiScale/><p>{okAqi?aqi.advice:'Đang chờ dữ liệu AQI đủ điều kiện từ nguồn.'}</p></section></div>
  <div className="subheading"><h2>Thông số môi trường</h2><a className="textlink" href="#quan-trac">Chi tiết <ArrowRight size={15}/></a></div>
  <div className="tiles">{([['pm10','PM10',Waves],['ozone','Ozon (O₃)',Leaf],['temperature_2m','Nhiệt độ',Thermometer],['relative_humidity_2m','Độ ẩm',Droplets]] as const).map(([k,n,I])=><article className="tile" key={k}><div className="tiletitle"><I size={17}/>{n}</div><strong>{number(current?.[k])} <small>{units(k)}</small></strong></article>)}</div>
  {chart}<div className="overview-lower"><section className="card"><div className="eyebrow"><Radio size={15}/> Khí ô nhiễm</div><div className="measurelist">{vars.filter(([k])=>['carbon_monoxide','nitrogen_dioxide','sulphur_dioxide'].includes(k)).map(([k,n,d])=><div key={k}><span><b>{n}</b><small>{d}</small></span><strong>{number(current?.[k])} <small>{pmUnit}</small></strong></div>)}</div></section><section className="card"><div className="eyebrow"><Cpu size={15}/> Dự báo AI thử nghiệm</div><h2>PM2.5 sau 1 và 3 giờ</h2>{forecast.predictions.length?<><div className="measurelist">{forecast.predictions.map(p=><div key={p.horizon_h}><span><b>Sau {p.horizon_h} giờ</b><small>{stamp(p.valid_at_utc)} (UTC+7)</small></span><span><strong>{number(p.pm25)} {pmUnit}</strong><small>{trendLabel(p)}</small></span></div>)}</div><p>Tham chiếu CAMS Đà Nẵng</p></>:<p>{forecastMessage(forecast.status)}</p>}<a href="#du-bao" className="textlink">Chi tiết dự báo <ArrowRight size={14}/></a></section></div><div className="sourcefoot"><Database size={14}/> Open-Meteo · CAMS <span>Giờ hiệu lực {stamp(now)} · Thu thập {stamp(history.retrieved_at)} (UTC+7)</span></div></>}
  {page==='quan-trac'&&<Observe defaultRows={rows} defaultRetrieved={history.retrieved_at}/>}
  {page==='du-bao'&&<Forecast rows={rows} result={forecast}/>}
  {page==='lich-su'&&<HistoryView rows={rows}/>}
  {page==='he-thong'&&<Method aqi={aqi}/>}
  </div></main></div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)

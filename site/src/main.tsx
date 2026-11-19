import React, {useEffect, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, CloudSun, Cpu, Database, Droplets, ExternalLink, Gauge, Globe2, Info, Layers, Leaf, LocateFixed, MapPin, Menu, Radio, RefreshCw, ShieldCheck, Thermometer, Waves, Wind, X} from 'lucide-react'
import {Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
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
function SiteMap(){
  const host=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!host.current)return
    const map=L.map(host.current,{scrollWheelZoom:false}).setView([16.0544,108.2022],11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map)
    L.circleMarker([16.0544,108.2022],{radius:10,weight:3,color:'#fff',fillColor:'#168d70',fillOpacity:1}).bindPopup('Điểm tham chiếu Đà Nẵng · Dữ liệu lưới Open-Meteo').addTo(map)
    return ()=>{map.remove()}
  },[])
  return <div ref={host} className="map" aria-label="Bản đồ điểm tham chiếu Đà Nẵng"/>
}
function Forecast({current}:{current?:Reading}){
  return <><div className="notice"><ShieldCheck/><div><strong>Đang chờ kiểm định tại Đà Nẵng</strong><p>Mô hình đã được đánh giá trên 12 trạm Bắc Kinh. Để phát dự báo tại Đà Nẵng, cần đối chiếu với PM2.5 đo độc lập tại địa phương.</p></div></div>
  <div className="forecast-grid">{['PM2.5 tại giờ cập nhật','Dự báo sau 1 giờ','Dự báo sau 3 giờ'].map((x,i)=><section className="card" key={x}><div className="label">{x}</div><h2 className="metric">{i?'—':number(current?.pm2_5)} <small>{pmUnit}</small></h2><p>{i?'Chưa phát hành':'Ước tính Open-Meteo'}</p></section>)}</div>
  <section className="card"><div className="eyebrow"><Cpu size={15}/> Mô hình beijing-v1</div><h2>Kết quả kiểm thử Random Forest</h2><p>Chọn mô hình theo MAE trên tập validation, đánh giá trên giai đoạn 09/2016 – 02/2017 tại Bắc Kinh.</p><div className="tablewrap"><table><thead><tr>{['Chân trời','Số mẫu','MAE (µg/m³)','RMSE (µg/m³)','R²'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody><tr><td>1 giờ</td><td>47.344</td><td>10,74</td><td>21,18</td><td>0,954</td></tr><tr><td>3 giờ</td><td>47.169</td><td>23,72</td><td>43,51</td><td>0,808</td></tr></tbody></table></div><p>Trong nhóm có nồng độ đích cao hơn phân vị 95 của tập huấn luyện, dự báo 3 giờ thấp hơn thực đo trung bình 55,14 µg/m³.</p></section></>
}
function Method({aqi}:{aqi:Aqi}){
  return <div className="method-grid">{[
    [Globe2,'Nguồn dữ liệu','Open-Meteo cung cấp ước tính chất lượng không khí từ mô hình khí quyển CAMS và dữ liệu thời tiết dạng lưới tại tọa độ yêu cầu.','https://open-meteo.com/en/docs/air-quality-api'],
    [Gauge,'Phương pháp AQI','Chỉ số hiển thị kèm tên phương pháp và nguồn. Nồng độ từng chất được trình bày bằng µg/m³. '+(aqi.method?'Phương pháp trong dữ liệu hiện tại: '+aqi.method+'.':''),'https://open-meteo.com/en/docs/air-quality-api'],
    [Database,'Dữ liệu huấn luyện','Beijing Multi-Site Air Quality gồm 420.768 bản ghi giờ tại 12 trạm, giai đoạn 03/2013 – 02/2017. Dữ liệu được chia theo thời gian.','https://archive.ics.uci.edu/dataset/501/beijing+multi+site+air+quality+data'],
    [Cpu,'Mô hình và giới hạn','Hai mô hình Random Forest dự báo PM2.5 sau 1 và 3 giờ. Hiệu năng được kiểm thử tại Bắc Kinh. Kiểm định riêng tại Đà Nẵng còn đang chờ dữ liệu quan trắc.','#du-bao']
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

function App(){
  const [page,setPage]=useState(paths),[mobile,setMobile]=useState(false),[history,setHistory]=useState<History>({data:[]}),[aqi,setAqi]=useState<Aqi>({}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[nonce,setNonce]=useState(0),[field,setField]=useState<Pollutant>('pm2_5'),[span,setSpan]=useState(24)
  useEffect(()=>{const change=()=>{setPage(paths());setMobile(false);window.scrollTo(0,0)};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[])
  useEffect(()=>{const id=window.setInterval(()=>setNonce(n=>n+1),15*60000);return()=>clearInterval(id)},[])
  useEffect(()=>{let active=true;const ctrl=new AbortController();const timer=window.setTimeout(()=>ctrl.abort(),45000)
    async function fetchJson(url:string){const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error();return r.json()}
    setLoading(true)
    Promise.allSettled([fetchJson('/api/air-quality/history?days=7'),fetchJson('/api/aqi/current')]).then(([h,a])=>{
      if(!active)return
      if(h.status==='fulfilled'&&Array.isArray(h.value?.data)){
        setHistory({...h.value,data:h.value.data.filter((r:Reading)=>r&&Number.isFinite(Date.parse(r.time))).sort((l:Reading,r:Reading)=>Date.parse(l.time)-Date.parse(r.time))});setError('')
      }else setError('Chưa kết nối được dữ liệu. Bạn có thể thử làm mới.')
      setAqi(a.status==='fulfilled'&&a.value?.data?a.value.data:{})
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
  <main><header className="topbar"><div className="crumb"><button className="hamb" onClick={()=>setMobile(true)} aria-label="Mở menu"><Menu/></button><Layers size={15}/><span>Không gian giám sát</span><ChevronRight size={14}/><b>{nav[selected].title}</b></div><div className="status"><i className={loading||stale||!current?'pending':''}/>{status}</div></header>
  <div className="mainbody"><div className="pageheading"><div><div className="eyebrow"><MapPin size={14}/> Đà Nẵng · Việt Nam</div><h1>{titles[selected]}</h1></div><button className="reload" disabled={loading} onClick={()=>setNonce(n=>n+1)}><RefreshCw size={15} className={loading?'spin':''}/> Làm mới</button></div>
  {error&&<div role="alert" className="warn">{error}</div>}
  {page==='tong-quan'&&<><div className="overview"><section className="hero"><div className="herotop"><span className="herolabel"><Wind size={17}/> Bụi mịn PM2.5</span><span className="hero-source">Mô hình khí quyển</span></div><div className="heronumber">{number(current?.pm2_5)} <small>{pmUnit}</small></div><div className="herochange">{diff!==null?<>{diff>0?<ArrowUpRight size={16}/>:<ArrowDownRight size={16}/>} {diff===0?'Ổn định':(diff>0?'Tăng ':'Giảm ')+number(Math.abs(diff))+' '+pmUnit} so với giờ trước</>:<><Activity size={16}/> {loading?'Đang tải dữ liệu':'Chưa đủ hai giờ liên tiếp'}</>}</div><div className="herofoot"><span><LocateFixed size={14}/> Điểm tham chiếu Đà Nẵng</span><b>{stamp(now)}</b></div></section>
  <section className="card aqicard"><div className="eyebrow"><Gauge size={16}/> Chỉ số chất lượng không khí</div><div className="aqinumber">{number(aqi.value,0)} <small>{aqi.method||'AQI'}</small></div><strong>{okAqi?(aqi.category||'Chỉ số từ nguồn'):'Chưa có chỉ số hợp lệ'}</strong><div className="aqibar"><i/><i/><i/><i/><i/><i/></div><p>{okAqi?aqi.advice:'Đang chờ dữ liệu AQI đủ điều kiện từ nguồn.'}</p></section></div>
  <div className="subheading"><h2>Thông số môi trường</h2><a className="textlink" href="#quan-trac">Chi tiết <ArrowRight size={15}/></a></div>
  <div className="tiles">{([['pm10','PM10',Waves],['ozone','Ozon (O₃)',Leaf],['temperature_2m','Nhiệt độ',Thermometer],['relative_humidity_2m','Độ ẩm',Droplets]] as const).map(([k,n,I])=><article className="tile" key={k}><div className="tiletitle"><I size={17}/>{n}</div><strong>{number(current?.[k])} <small>{units(k)}</small></strong></article>)}</div>
  {chart}<div className="overview-lower"><section className="card"><div className="eyebrow"><Radio size={15}/> Khí ô nhiễm</div><div className="measurelist">{vars.filter(([k])=>['carbon_monoxide','nitrogen_dioxide','sulphur_dioxide'].includes(k)).map(([k,n,d])=><div key={k}><span><b>{n}</b><small>{d}</small></span><strong>{number(current?.[k])} <small>{pmUnit}</small></strong></div>)}</div></section><section className="card"><div className="eyebrow"><Cpu size={15}/> Dự báo AI</div><h2>PM2.5 sau 1 và 3 giờ</h2><p>Hai chân trời đang chờ kiểm định bằng dữ liệu quan trắc tại Đà Nẵng.</p><a href="#du-bao" className="textlink">Xem kết quả mô hình <ArrowRight size={14}/></a></section></div><div className="sourcefoot"><Database size={14}/> Open-Meteo · CAMS <span>Giờ hiệu lực {stamp(now)} · Thu thập {stamp(history.retrieved_at)} (UTC+7)</span></div></>}
  {page==='quan-trac'&&<><div className="observe"><section className="card"><div className="eyebrow"><LocateFixed size={15}/> Điểm dữ liệu</div><h2>Trung tâm Đà Nẵng</h2><p>16,0544° B · 108,2022° Đ. Tọa độ dùng để truy vấn ước tính trên lưới Open-Meteo.</p><SiteMap/></section><section className="card"><div className="eyebrow"><Radio size={15}/> Giờ hiệu lực {stamp(now)}</div><h2>Thông số tại điểm</h2><div className="measurelist">{vars.map(([key,name,desc])=><div key={key}><span><b>{name}</b><small>{desc}</small></span><strong>{number(current?.[key])} <small>{pmUnit}</small></strong></div>)}</div></section></div>{chart}</>}
  {page==='du-bao'&&<Forecast current={current}/>}
  {page==='lich-su'&&<HistoryView rows={rows}/>}
  {page==='he-thong'&&<Method aqi={aqi}/>}
  </div></main></div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)

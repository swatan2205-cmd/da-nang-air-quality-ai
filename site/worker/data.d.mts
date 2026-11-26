export function collect(days:number,now?:number,location?:{latitude:number,longitude:number}):Promise<{
  data: Array<{time:string;pm2_5?:number|null;pm10?:number|null;carbon_monoxide?:number|null;nitrogen_dioxide?:number|null;sulphur_dioxide?:number|null;ozone?:number|null;temperature_2m?:number|null;relative_humidity_2m?:number|null;us_aqi?:number|null}>
  updated_at:string
  retrieved_at:string
}>

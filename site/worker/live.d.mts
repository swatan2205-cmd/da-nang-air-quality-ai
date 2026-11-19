export function liveDashboard():Promise<{
  history:{data:unknown[],updated_at:string,retrieved_at:string,stale:boolean},
  aqi:{data:unknown},
  predictions:{data:unknown}
}>

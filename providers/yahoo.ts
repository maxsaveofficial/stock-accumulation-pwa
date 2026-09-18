const CHARTS=['https://query1.finance.yahoo.com/v8/finance/chart','https://query2.finance.yahoo.com/v8/finance/chart'];
let yahooCookie='',yahooCrumb='',yahooSessionAt=0;
async function yahooSession(){
  if(yahooCookie&&yahooCrumb&&Date.now()-yahooSessionAt<600000)return;
  const boot=await fetch('https://fc.yahoo.com',{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'}});
  yahooCookie=(boot.headers.getSetCookie?.()??[]).map(x=>x.split(';')[0]).join('; ')||'';
  await boot.body?.cancel();
  const cr=await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb',{headers:{Accept:'text/plain','User-Agent':'Mozilla/5.0','Cookie':yahooCookie}});
  if(!cr.ok)throw Error(`Yahoo crumb HTTP ${cr.status}`);
  yahooCrumb=(await cr.text()).trim();
  if(!yahooCrumb)throw Error('Yahoo crumb kosong');
  yahooSessionAt=Date.now();
}
async function yahooFetch(url:string){
  await yahooSession();
  const h={Accept:'application/json','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',Cookie:yahooCookie};
  let r=await fetch(url+(url.includes('?')?'&':'?')+`crumb=${encodeURIComponent(yahooCrumb)}`,{headers:h});
  if(r.status===401||r.status===403){
    await r.body?.cancel();yahooCookie='';yahooCrumb='';yahooSessionAt=0;
    await yahooSession();
    r=await fetch(url+(url.includes('?')?'&':'?')+`crumb=${encodeURIComponent(yahooCrumb)}`,{headers:{...h,Cookie:yahooCookie}});
  }
  return r;
}
export async function yahooOhlcv(ticker:string,from:string,to:string,name=''){
  const p1=Math.floor(new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}T00:00:00Z`).getTime()/1000);
  const p2=Math.floor(new Date(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}T23:59:59Z`).getTime()/1000)+1;
  const qs=`period1=${p1}&period2=${p2}&interval=1d&events=history&includeAdjustedClose=false`;
  let response:any=null;
  for(const base of CHARTS){
    response=await yahooFetch(`${base}/${encodeURIComponent(ticker.toUpperCase())}.JK?${qs}`);
    if(response.ok)break;
    if(response.status!==401&&response.status!==403)break;
  }
  if(!response?.ok)throw new Error(`Yahoo Finance HTTP ${response?.status||'ERR'}`);
  const payload=await response.json(),result=payload?.chart?.result?.[0];
  if(!result)throw new Error(`Yahoo Finance: no data for ${ticker}`);
  const q=result.indicators?.quote?.[0]??{};
  return(result.timestamp??[]).map((ts:number,i:number)=>({date:new Date(ts*1000).toISOString().slice(0,10),ticker:ticker.toUpperCase(),name:name||undefined,open:Number(q.open?.[i]),high:Number(q.high?.[i]),low:Number(q.low?.[i]),close:Number(q.close?.[i]),volume:Number(q.volume?.[i]??0),value:0})).filter((r:any)=>[r.open,r.high,r.low,r.close].every(Number.isFinite));
}

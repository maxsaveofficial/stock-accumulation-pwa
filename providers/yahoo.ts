const CHARTS=['https://query1.finance.yahoo.com/v8/finance/chart','https://query2.finance.yahoo.com/v8/finance/chart'];
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';
async function yahooFetch(url:string){
  let last:any=null;
  for(const baseUrl of [url,url.replace('query1.finance.yahoo.com','query2.finance.yahoo.com')]){
    try{
      const r=await fetch(baseUrl,{headers:{Accept:'application/json','User-Agent':UA}});
      last=r;
      if(r.ok)return r;
      await r.body?.cancel();
    }catch(e){last=e}
  }
  if(last instanceof Response)return last;
  throw last instanceof Error?last:Error('Yahoo Finance request failed');
}
export async function yahooOhlcv(ticker:string,from:string,to:string,name=''){
  const p1=Math.floor(new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}T00:00:00Z`).getTime()/1000);
  const p2=Math.floor(new Date(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}T23:59:59Z`).getTime()/1000)+1;
  const qs=`period1=${p1}&period2=${p2}&interval=1d&events=history&includeAdjustedClose=false`;
  const response=await yahooFetch(`${CHARTS[0]}/${encodeURIComponent(ticker.toUpperCase())}.JK?${qs}`);
  if(!response.ok)throw new Error(`Yahoo Finance HTTP ${response.status}`);
  const contentType=response.headers.get('content-type')||'';
  const raw=await response.text();
  let payload:any;
  try{payload=JSON.parse(raw)}catch{
    const preview=raw.replace(/\\s+/g,' ').trim().slice(0,160);
    throw Error(`Yahoo Finance returned non-JSON${response.status?` HTTP ${response.status}`:''}${contentType?` (${contentType})`:''}: ${preview||'empty response'}`);
  }
  if(payload?.chart?.error)throw Error(`Yahoo Finance: ${payload.chart.error.description||payload.chart.error.code||'chart error'}`);
  const result=payload?.chart?.result?.[0];
  if(!result)throw new Error(`Yahoo Finance: no data for ${ticker}`);
  const q=result.indicators?.quote?.[0]??{};
  return(result.timestamp??[]).map((ts:number,i:number)=>({date:new Date(ts*1000).toISOString().slice(0,10),ticker:ticker.toUpperCase(),name:name||undefined,open:Number(q.open?.[i]),high:Number(q.high?.[i]),low:Number(q.low?.[i]),close:Number(q.close?.[i]),volume:Number(q.volume?.[i]??0),value:0})).filter((r:any)=>[r.open,r.high,r.low,r.close].every(Number.isFinite));
}

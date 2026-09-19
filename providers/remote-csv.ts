const BASE='https://raw.githubusercontent.com/nofendian17/idx_dataset/main/data/';
const n=(v:string)=>{const x=Number(String(v??'').replaceAll(',',''));return Number.isFinite(x)?x:0};
const esc=(v:string)=>v.replaceAll('\"','').trim();
export async function remoteCsvDay(date:string){
  const iso=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const url=`${BASE}stock_data_${iso}.csv`;
  const r=await fetch(url,{headers:{Accept:'text/csv'}});
  if(!r.ok) throw Error(`Remote CSV HTTP ${r.status} for ${iso}`);
  const text=await r.text();
  const lines=text.split(/\r?\n/).filter(Boolean);
  if(lines.length<2) return [];
  const h=lines[0].split(',').map(esc);
  const ix=(name:string)=>h.findIndex(x=>x.toLowerCase()===name.toLowerCase());
  const ticker=ix('Stock Code'),prev=ix('Previous Price'),open=ix('Open Price'),last=ix('Last Price'),high=ix('High Price'),low=ix('Low Price'),vol=ix('Volume'),value=ix('Value');
  if(ticker<0||last<0) throw Error(`Remote CSV schema invalid for ${iso}`);
  return lines.slice(1).map(line=>{
    const c=line.split(',').map(esc),t=c[ticker]?.toUpperCase();
    return {date:iso,ticker:t,open:n(c[open]),high:n(c[high]),low:n(c[low]),close:n(c[last]),volume:n(c[vol]),value:n(c[value]),previous:n(c[prev]),source:'Community daily CSV (IDX-derived via imq21)'};
  }).filter(x=>x.ticker&&x.close>0);
}
export async function remoteCsvRange(from:string,to:string,tickers:string[]=[]){
  const out:any[]=[]; const wanted=new Set(tickers.map(x=>x.toUpperCase()));
  const days:string[]=[];
  for(let d=new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}T00:00:00Z`),e=new Date(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}T00:00:00Z`);d<=e;d=new Date(+d+86400000)){
    days.push(d.toISOString().slice(0,10).replaceAll('-',''));
  }
  // Fetch several trading days concurrently. The previous sequential loop could
  // take minutes for ALL/long lookbacks and made the PWA appear to have no data.
  for(let i=0;i<days.length;i+=8){
    const batch=await Promise.allSettled(days.slice(i,i+8).map(ds=>remoteCsvDay(ds)));
    batch.forEach((r,j)=>{
      const ds=days[i+j];
      if(r.status==='fulfilled'){
        for(const x of r.value)if(!wanted.size||wanted.has(x.ticker))out.push(x);
      }else if(!String(r.reason).includes('HTTP 404')){
        console.warn('[REMOTE CSV]',ds,String(r.reason));
      }
    });
  }
  return out;
}
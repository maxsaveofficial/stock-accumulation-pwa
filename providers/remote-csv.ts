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
  for(let d=new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}T00:00:00Z`),e=new Date(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}T00:00:00Z`);d<=e;d=new Date(+d+86400000)){
    const ds=d.toISOString().slice(0,10).replaceAll('-','');
    try{const rows=await remoteCsvDay(ds);for(const x of rows)if(!wanted.size||wanted.has(x.ticker))out.push(x)}catch(e){if(!String(e).includes('HTTP 404')) console.warn('[REMOTE CSV]',ds,String(e))}
  }
  return out;
}
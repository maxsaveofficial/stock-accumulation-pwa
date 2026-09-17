// StockFlow data provider layer. Keeps data source separate from analysis.
window.StockFlowProvider={
 normalize(rows){return rows.map(r=>({date:String(r.date||'').slice(0,10),ticker:String(r.ticker||r.symbol||'').toUpperCase(),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume||0),value:Number(r.value||0),brokerNetValue:r.brokerNetValue==null?undefined:Number(r.brokerNetValue)})).filter(r=>r.ticker&&r.date&&[r.open,r.high,r.low,r.close].every(Number.isFinite));},
 group(rows){const g={};this.normalize(rows).forEach(r=>(g[r.ticker]??=[]).push(r));return Object.entries(g).map(([ticker,rs])=>({ticker,rows:rs.sort((a,b)=>a.date.localeCompare(b.date)),lookback:20}));}
};

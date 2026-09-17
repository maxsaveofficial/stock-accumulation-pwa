window.StockFlow = (() => {
  const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
  const avg=(a)=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
  const sma=(a,n)=>a.length<n?null:avg(a.slice(-n));
  const pct=(a,b)=>b?((a/b)-1)*100:0;
  const sign=(x)=>x>0?1:x<0?-1:0;

  // Broker data is treated as a flow signal only. The engine does not infer
  // whether a broker represents retail, institution, foreign, etc.
  function brokerMetrics(rows, windowSize=10){
    const recent=rows.slice(-windowSize);
    const sessions=recent.map(r=>({
      date:r.date,
      brokers:Array.isArray(r.brokers)?r.brokers:(Array.isArray(r.brokerDetails)?r.brokerDetails:[])
    })).filter(x=>x.brokers.length);
    if(!sessions.length)return {available:false,netValue:0,persistence3:50,persistence5:50,persistence10:50,concentration:0,consistency:50,divergence:50,rotation:50,score:50};

    const nets=sessions.map(s=>s.brokers.reduce((sum,b)=>sum+(Number(b.buyValue)||0)-(Number(b.sellValue)||0),0));
    const totalNet=avg(nets);
    const positiveRatio=nets.length?nets.filter(x=>x>0).length/nets.length:0.5;
    const last3=nets.slice(-3), last5=nets.slice(-5);
    const persistence3=last3.length?100*last3.filter(x=>x>0).length/last3.length:50;
    const persistence5=last5.length?100*last5.filter(x=>x>0).length/last5.length:50;
    const persistence10=100*positiveRatio;

    const latest=sessions[sessions.length-1].brokers.map(b=>({...b,net:(Number(b.buyValue)||0)-(Number(b.sellValue)||0)}));
    const absTotal=latest.reduce((s,b)=>s+Math.abs(b.net),0);
    const top=Math.max(0,...latest.map(b=>Math.abs(b.net)));
    const concentration=absTotal?100*top/absTotal:0;

    const brokerStats={};
    sessions.forEach(s=>s.brokers.forEach(b=>{
      const id=String(b.broker||b.code||'').trim();
      if(!id)return;
      if(!brokerStats[id])brokerStats[id]={pos:0,neg:0,net:0,sessions:0};
      const net=(Number(b.buyValue)||0)-(Number(b.sellValue)||0);
      brokerStats[id].net+=net; brokerStats[id].sessions++;
      if(net>0)brokerStats[id].pos++; else if(net<0)brokerStats[id].neg++;
    }));
    const active=Object.values(brokerStats);
    const consistency=active.length?100*avg(active.map(x=>Math.max(x.pos,x.neg)/Math.max(x.sessions,1))):50;

    const priceRows=rows.slice(-Math.min(windowSize+1,rows.length));
    const priceMove=priceRows.length>1?pct(priceRows[priceRows.length-1].close,priceRows[0].close):0;
    const flowSign=sign(totalNet);
    // Positive flow while price is flat/down => accumulation divergence.
    // Negative flow while price is flat/up => distribution divergence.
    let divergence=50;
    if(flowSign>0) divergence=clamp(50 + Math.max(0,-priceMove)*4);
    if(flowSign<0) divergence=clamp(50 + Math.max(0,priceMove)*4);

    const previous=sessions.length>3?sessions.slice(0,-3):[];
    const latestTop=new Set(latest.filter(b=>b.net!==0).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)).slice(0,3).map(b=>String(b.broker||b.code||'')));
    const prevMap={}; previous.forEach(s=>s.brokers.forEach(b=>{const id=String(b.broker||b.code||'');if(id)prevMap[id]=(prevMap[id]||0)+Math.abs((Number(b.buyValue)||0)-(Number(b.sellValue)||0));}));
    const prevTop=new Set(Object.entries(prevMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]));
    const overlap=[...latestTop].filter(x=>prevTop.has(x)).length;
    const rotation=latestTop.size&&prevTop.size?100*(1-overlap/Math.max(latestTop.size,prevTop.size)):50;

    const netScale=latest.reduce((s,b)=>s+Math.abs(b.net),0)||1;
    const netBias=clamp(50+50*(latest.reduce((s,b)=>s+b.net,0)/netScale));
    const persistenceBias=avg([persistence3,persistence5,persistence10]);
    const divergenceBias=flowSign>0?divergence:(100-divergence);
    const score=clamp(.35*netBias+.25*persistenceBias+.20*divergenceBias+.10*consistency+.10*(100-concentration/2));
    return {available:true,netValue:totalNet,persistence3,persistence5,persistence10,concentration,consistency,divergence,rotation,score,netBias};
  }

  function analyze(rows, lookback=20){
    const r=rows.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(r.length<2)return null;
    const n=Math.min(lookback,r.length), w=r.slice(-n), last=w[w.length-1];
    const ranges=w.map(x=>Math.max(x.high-x.low,Math.abs(x.high-x.close),Math.abs(x.low-x.close)));
    const atr=avg(ranges), avgVol=avg(w.map(x=>x.volume||0)), volRatio=avgVol?last.volume/avgVol:1;
    const clv=w.map(x=>x.high===x.low?0:((x.close-x.low)-(x.high-x.close))/(x.high-x.low));
    const mf=avg(w.map((x,i)=>clv[i]*(x.volume||0)));
    const mfNorm=avgVol?clamp(50+50*(mf/avgVol)):50;
    const upVol=w.filter(x=>x.close>=x.open).reduce((s,x)=>s+(x.volume||0),0), downVol=w.filter(x=>x.close<x.open).reduce((s,x)=>s+(x.volume||0),0);
    const pressure=upVol+downVol?100*upVol/(upVol+downVol):50;
    const sma5=sma(r.map(x=>x.close),5), sma20=sma(r.map(x=>x.close),20), sma60=sma(r.map(x=>x.close),60);
    const trend=clamp(50 + (sma20?25*(last.close/sma20-1)*100:0) + (sma60?15*(last.close/sma60-1)*100:0));
    const recent=w.slice(0,-1), support=recent.length?Math.min(...recent.map(x=>x.low)):last.low, resistance=recent.length?Math.max(...recent.map(x=>x.high)):last.high;
    const supportDist=atr?((last.close-support)/atr):0, resistanceDist=atr?((resistance-last.close)/atr):0;
    const supportScore=clamp(100-Math.abs(supportDist)*30), chasePenalty=clamp(Math.max(0,(last.close-resistance)/Math.max(atr,.000001))*30);

    const bm=brokerMetrics(r,10);
    const brokerNet=last.brokerNetValue;
    const legacyBrokerScore=brokerNet==null?50:clamp(50+(brokerNet/Math.max(Math.abs(last.value||last.volume*last.close),1))*50);
    const brokerScore=bm.available?clamp(.8*bm.score+.2*legacyBrokerScore):legacyBrokerScore;

    const acc=clamp(.24*mfNorm+.15*pressure+.14*clamp(volRatio*50)+.15*trend+.12*supportScore+.20*brokerScore);
    const dist=clamp(.24*(100-mfNorm)+.15*(100-pressure)+.14*clamp((2-volRatio)*50)+.15*(100-trend)+.12*(100-supportScore)+.20*(100-brokerScore));
    const breakdown=clamp((last.close<support?70:0)+(volRatio>1.5&&last.close<last.open?25:0)+(trend<35?20:0));
    const signal=acc>=68&&dist<55&&chasePenalty<35?'BUY':dist>=68&&acc<55?'SELL':'NEUTRAL';
    const score=signal==='BUY'?acc:signal==='SELL'?dist:Math.max(acc,dist);
    return {ticker:last.ticker||'',date:last.date,price:last.close,acc,dist,score,signal,volRatio,trend,pressure,mfNorm,breakdown,brokerScore,chasePenalty,atr,support,resistance,broker:bm};
  }

  function classify(all, horizon=5){
    const results=all.map(s=>{const a=analyze(s.rows,s.lookback||20);return a?{...a,ticker:s.ticker}:null}).filter(Boolean);
    const buy=results.filter(x=>x.signal==='BUY').sort((a,b)=>b.score-a.score).slice(0,5);
    const sell=results.filter(x=>x.signal==='SELL').sort((a,b)=>b.score-a.score).slice(0,5);
    return {results,buy,sell,horizon};
  }

  function backtest(series,horizon=5,lookback=20){
    const observations=[];
    series.forEach(s=>{const r=s.rows.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)); for(let i=lookback;i<r.length-horizon;i++){const a=analyze(r.slice(0,i+1),lookback); if(!a||a.signal==='NEUTRAL')continue; const future=r[i+horizon].close, ret=(future/r[i].close-1)*100; observations.push({signal:a.signal,ret});}});
    if(!observations.length)return {hitRate:null,avgReturn:null,count:0};
    const hits=observations.filter(x=>x.signal==='BUY'?x.ret>0:x.ret<0).length;
    return {hitRate:100*hits/observations.length,avgReturn:avg(observations.map(x=>x.signal==='BUY'?x.ret:-x.ret)),count:observations.length};
  }
  return {analyze,classify,backtest,brokerMetrics};
})();
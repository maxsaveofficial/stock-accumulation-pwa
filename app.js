const $=id=>document.getElementById(id);let data=[],brokerRows=[],liveEnabled=false,selectedTickers=new Set();const BACKEND_URL=window.STOCKFLOW_BACKEND_URL||'https://stock-accumulation-pwa.maxsaveofficial.deno.net',PROVIDER_KEY='stockflow-provider',CACHE_KEY='stockflow-auto-cache-v1';
function makeDemo(){const ts=['BBCA','BBRI','BMRI','TLKM','ASII','BBNI','ICBP','INDF','ANTM','MDKA','GOTO','UNVR','PGAS','ADRO','PTBA','SMGR','JPFA','KLBF','AMRT','ACES'];return ts.map((ticker,k)=>{let p=1000+k*275,rows=[],reg=k<6?'BUY':k>=14?'SELL':'NEUTRAL';for(let i=0;i<140;i++){const d=new Date(Date.now()-(139-i)*86400000),c=Math.sin((i+k)*.37),n=Math.sin((i*7+k*11)*.91)*.004,dir=reg==='BUY'?.0028:reg==='SELL'?-.0028:.0001*c,o=p*(1+n),m=dir+(reg==='BUY'?Math.max(0,c)*.006:reg==='SELL'?-Math.max(0,c)*.006:c*.008)+n*.45,cl=o*(1+m),h=Math.max(o,cl)*(1+(reg==='BUY'?.01:.006)+Math.abs(n)),l=Math.min(o,cl)*(1+(reg==='SELL'?-.01:-.006)-Math.abs(n)),v=Math.round((650000+((i*9301+k*17011)%700000))*(reg==='NEUTRAL'?1:(i%9===0?1.8:1.05)));rows.push({date:d.toISOString().slice(0,10),ticker,open:o,high:h,low:l,close:cl,volume:v,value:v*cl,brokerNetValue:(reg==='BUY'?.16:reg==='SELL'?- .16:.02*c)*v*cl});p=cl}return{ticker,rows,lookback:20}})}
function esc(x){return String(x??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]||m))}
function fmt(x,d=2){return x==null||!Number.isFinite(Number(x))?'-':Number(x).toFixed(d)}
function statCells(s){return `<td>${s.count}</td><td>${fmt(s.hitRate,1)}%</td><td>${fmt(s.avgReturn)}%</td><td>${fmt(s.medianReturn)}%</td><td>${fmt(s.expectancy)}%</td><td>${fmt(s.winLossRatio)}</td><td>${fmt(s.avgMAE)}%</td><td>${fmt(s.avgMFE)}%</td>`}
function table(items,type){return items.length?items.map((x,i)=>`<tr data-ticker="${esc(x.ticker)}"><td>${i+1}</td><td><b>${esc(x.ticker)}</b></td><td>${x.score.toFixed(0)}</td><td>${(type==='BUY'?x.acc:x.dist).toFixed(0)}</td><td>${(type==='BUY'?x.trend:x.breakdown).toFixed(0)}</td></tr>`).join(''):'<tr><td colspan="5">Belum ada kandidat.</td></tr>'}
let renderSeq=0;
function render(){
  const seq=++renderSeq;
  const lb=+$('lookback').value,h=20,chosen=[...selectedTickers],
        pool=chosen.length===data.length?data:data.filter(x=>chosen.includes(x.ticker)),
        s=chosen.length===1?chosen[0]:'ALL';

  $('donutText').textContent='… / … / …';
  $('avgAccum').textContent='…';
  $('avgDistrib').textContent='…';
  $('avgVol').textContent='…';
  $('avgRisk').textContent='…';
  $('buyTable').innerHTML='<tr><td colspan="5">Menghitung signal market…</td></tr>';
  $('sellTable').innerHTML='<tr><td colspan="5">Menghitung signal market…</td></tr>';
  $('backtest').innerHTML='<div class="btlegend"><span>Menyiapkan backtest T+1 → T+20…</span></div>';
  $('detailBuy').innerHTML='Klik saham BUY untuk melihat detail.';$('detailSell').innerHTML='Klik saham SELL untuk melihat detail.';

  setTimeout(()=>{
    if(seq!==renderSeq)return;
    try{
      const o=StockFlow.classify(pool,h),r=o.results,n=r.length||1,
            b=r.filter(x=>x.signal==='BUY').length,
            sl=r.filter(x=>x.signal==='SELL').length;
      if(seq!==renderSeq)return;
      $('donutText').textContent=`${b} / ${r.length-b-sl} / ${sl}`;
      const total=r.length||1, bp=100*b/total, np=100*(r.length-b-sl)/total;
      $('donutBuy').style.strokeDasharray=bp+' '+(100-bp);
      $('donutBuy').style.strokeDashoffset='0';
      $('donutNeutral').style.strokeDasharray=np+' '+(100-np);
      $('donutNeutral').style.strokeDashoffset=(-bp).toString();
      const sp=Math.max(0,100-bp-np);
      $('donutSell').style.strokeDasharray=sp+' '+(100-sp);
      $('donutSell').style.strokeDashoffset=(-(bp+np)).toString();
      $('avgAccum').textContent=(r.reduce((a,x)=>a+x.acc,0)/n).toFixed(0);
      $('avgDistrib').textContent=(r.reduce((a,x)=>a+x.dist,0)/n).toFixed(0);
      $('avgVol').textContent=(r.reduce((a,x)=>a+x.volRatio,0)/n).toFixed(2)+'x';
      $('avgRisk').textContent=(r.reduce((a,x)=>a+x.breakdown,0)/n).toFixed(0);
      $('buyTable').innerHTML=table(o.buy,'BUY');
      $('sellTable').innerHTML=table(o.sell,'SELL');
      bindRows();
      if(s!=='ALL'){
        const zone=o.buy.some(x=>x.ticker===s)?'buy':o.sell.some(x=>x.ticker===s)?'sell':'buy';
        detail(s,zone);
      }else{
        $('detailBuy').innerHTML='Klik saham BUY untuk melihat detail.';
        $('detailSell').innerHTML='Klik saham SELL untuk melihat detail.';
      }
      
      setTimeout(async()=>{
        if(seq!==renderSeq)return;
        const horizons=[1,3,5,10,20];
        const box=$('backtest');
        box.innerHTML=`<div class="btchart btcompact"><div class="bt5title"><span>Donut = gross return · walk-forward</span></div><div class="btdonutwrap"><svg id="btDonut" viewBox="0 0 180 180" aria-label="Backtest horizons"><circle cx="90" cy="90" r="62" class="btdonutbase"></circle><g id="btDonutSegs"></g></svg><div class="btdonutcenter"><b id="btBestT">—</b><span id="btBestRet">menghitung</span></div></div><div class="btstats" id="btstats"></div><div class="btlegend"><span>Segmen makin besar = return makin tinggi</span><em>Gross return · tanpa biaya/stress</em></div></div>`;
        const stats=$('btstats'),segRoot=$('btDonutSegs'),results=[];
        horizons.forEach(h=>{
          const st=document.createElement('div');st.dataset.horizon=h;st.innerHTML='<small>T+'+h+'</small><b>…</b><span>menghitung</span>';stats.appendChild(st);
        });
        const update=async(h,x)=>{
          const rawRet=x?.total?.avgReturn,rawHit=x?.total?.hitRate,ret=rawRet==null?NaN:Number(rawRet),hit=rawHit==null?NaN:Number(rawHit),count=Number(x?.total?.count||0);
          results.push({h,ret,hit,count});
          const st=stats.querySelector('[data-horizon="'+h+'"]');
          if(st)st.innerHTML='<small>T+'+h+'</small><b>'+(Number.isFinite(ret)?fmt(ret,2)+'%':'—')+'</b><span>'+(Number.isFinite(hit)?fmt(hit,1)+'% hit · '+count+' signal':count+' signal')+'</span>';

          const valid=results.filter(x=>Number.isFinite(x.ret));
          const best=valid.length?valid.reduce((a,b)=>b.ret>a.ret?b:a,valid[0]):null;
          const C=2*Math.PI*62;
          segRoot.innerHTML='';
          if(best){
            $('btBestT').textContent='T+'+best.h;
            $('btBestRet').textContent=fmt(best.ret,2)+'% avg return';
            const min=Math.min(...valid.map(x=>x.ret));
            const weighted=valid.map(x=>({...x,weight:Math.max(0.05,x.ret-min+0.05)}));
            const sum=weighted.reduce((a,x)=>a+x.weight,0);
            let used=0;
            weighted.forEach(x=>{
              const pct=x.weight/sum*100;
              const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
              circle.setAttribute('cx','90');circle.setAttribute('cy','90');circle.setAttribute('r','62');
              circle.setAttribute('class','btdonutseg '+(x.h===best.h?'btbest':''));
              circle.style.strokeDasharray=(C*pct/100)+' '+(C*(1-pct/100));
              circle.style.strokeDashoffset=-(C*used/100);
              circle.setAttribute('aria-label','T+'+x.h+' '+fmt(x.ret,2)+'%');
              segRoot.appendChild(circle);
              used+=pct;
            });
          }else{
            $('btBestT').textContent='—';
            $('btBestRet').textContent='belum ada signal';
            horizons.forEach((h,i)=>{
              const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
              circle.setAttribute('cx','90');circle.setAttribute('cy','90');circle.setAttribute('r','62');
              circle.setAttribute('class','btdonutseg btplaceholder');
              circle.style.strokeDasharray=(C/5-3)+' '+(C-C/5+3);
              circle.style.strokeDashoffset=-(C*i/5);
              circle.setAttribute('aria-label','T+'+h+' belum ada signal');
              segRoot.appendChild(circle);
            });
          }
        };
        for(const h of horizons){
          if(seq!==renderSeq)break;
          await new Promise(r=>setTimeout(r,20));
          try{
            const x=window.StockFlowCalibration?.walkForward(pool,{lookback:Math.min(lb,20),horizon:h,costPct:1});
            await update(h,x);
          }catch(err){
            console.error('[BACKTEST T+'+h+']',err);
            await update(h,{total:{avgReturn:null,hitRate:null,count:0}});
          }
        }
      },0);
    }catch(e){
      $('buyTable').innerHTML=`<tr><td colspan="5">Signal error: ${esc(e.message)}</td></tr>`;
      $('sellTable').innerHTML=`<tr><td colspan="5">Signal error: ${esc(e.message)}</td></tr>`;
      $('detailBuy').innerHTML='<div>Data berhasil masuk, tetapi engine signal gagal diproses.</div>';
      $('detailSell').innerHTML='<div>Data berhasil masuk, tetapi engine signal gagal diproses.</div>';
      console.error('[RENDER]',e);
    }
  },0);
}
function bindRows(){document.querySelectorAll('#buyTable tr[data-ticker]').forEach(e=>e.onclick=()=>detail(e.dataset.ticker,'buy'));document.querySelectorAll('#sellTable tr[data-ticker]').forEach(e=>e.onclick=()=>detail(e.dataset.ticker,'sell'))}
function detail(t,zone){const s=data.find(x=>x.ticker===t);if(!s)return;const a=StockFlow.analyze(s.rows,+$('lookback').value),b=a.broker||{};const target=zone==='buy'?'detailBuy':'detailSell';const el=$(target);if(!el)return;const brokerValue=b.available?fmt(a.brokerScore,0):'-',brokerMetric=k=>b.available?fmt(b[k],0):'-';el.innerHTML=`<div class="detailtitle"><small>SAHAM YANG DIPILIH</small><b>${esc(a.ticker||t)}${s.name?' — '+esc(s.name):''}</b></div><div class="condition-guide single detail-guide"><b>${zone==='buy'?'BUY':'SELL'} condition:</b> ${zone==='buy'?'Score ↑ · Accum ↑ · Dist ↓ · Trend ↑':'Score ↓ · Accum ↓ · Dist ↑ · Trend ↓'}</div><div class="detailgrid"><div><small>Signal</small><b>${a.signal}</b></div><div><small>Confidence (Max. 100)</small><b>${fmt(a.confidence,0)}</b></div><div><small>Pattern</small><b>${esc(a.pattern)}</b></div><div><small>Broker flow (BUY/SELL)</small><b>${brokerValue}</b></div><div><small>Flow status</small><b>${b.available?'ACTIVE':'NOT AVAILABLE'}</b></div><div><small>Broker persistence 5D</small><b>${brokerMetric('persistence5')}</b></div><div><small>Concentration</small><b>${brokerMetric('concentration')}</b></div><div><small>Flow divergence</small><b>${brokerMetric('divergence')}</b></div><div><small>Rotation</small><b>${brokerMetric('rotation')}</b></div><div><small>Breakdown risk (Max. 4)</small><b>${fmt(a.breakdown,0)}</b></div><div><small>Support</small><b>${fmt(a.support,0)}</b></div><div><small>Resistance</small><b>${fmt(a.resistance,0)}</b></div></div>`}
function refresh(){const el=$('ticker');if(!el)return;const current=[...selectedTickers];const all=!current.length||current.length===data.length;el.innerHTML='<option value="ALL">ALL SAHAM · '+data.length+'</option>'+data.map(x=>'<option value="'+esc(x.ticker)+'">'+esc(x.ticker)+(x.name?' — '+esc(x.name):'')+'</option>').join('');el.value=all?'ALL':(current[0]||'ALL');el.onchange=e=>{selectedTickers=e.target.value==='ALL'?new Set(data.map(x=>x.ticker)):new Set([e.target.value]);autoLoad()}}
function ymd(d){return d.toISOString().slice(0,10).replaceAll('-','')}function provider(){return $('provider').value}
function info(){const p=provider();const msg=p==='idx'?'IDX direct: sumber resmi IDX. Jika 403, data tidak dipalsukan.':p==='yahoo'?'Yahoo Finance: sumber pihak ketiga; historical/delayed OHLCV, bukan IDX dan bukan realtime exchange feed.':p==='indexalpha'?'Index Alpha: API pihak ketiga; broker/OHLCV sesuai akses akun.':p==='remote-csv'?'Daily Remote CSV: CSV publik pihak ketiga, IDX-derived via imq21; bukan API resmi IDX.':'AUTO: Daily Remote CSV (IDX-derived via imq21) → Yahoo Finance historical → cache lokal. IDX direct hanya opsional; tidak perlu upload CSV.';const txt=$('providerInfoText');if(txt)txt.textContent=msg;try{localStorage.setItem(PROVIDER_KEY,p)}catch{}}
function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),data}))}catch(e){console.warn('[CACHE] save failed',e)}}
function restoreCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(x?.data?.length){data=x.data;refresh();render();$('status').textContent='OFFLINE CACHE';setLiveStatus(`Cache lokal · ${data.length} saham · bukan data live`);stamp();return true}}catch(e){console.warn('[CACHE] restore failed',e)}return false}
async function loadLiveAll(){const p=provider(),to=new Date(),from=new Date(to.getTime()-89*86400000),label=p==='auto'?'Daily Remote CSV → Yahoo → Cache':p.toUpperCase();setLiveStatus(`Mengambil ALL via ${label}...`);const url=`${BACKEND_URL}/market-range?from=${ymd(from)}&to=${ymd(to)}&provider=${encodeURIComponent(p)}`,res=await fetch(url,{cache:'no-store'}),j=await res.json();if(!res.ok||!j.ok)throw Error(j.error||`HTTP ${res.status}`);const prices=StockFlowProvider.normalize(j.data||[]);if(!prices.length)throw Error('Data market kosong');data=StockFlowProvider.group(prices);brokerRows=[];selectedTickers=new Set(data.map(x=>x.ticker));refresh();render();$('status').textContent=(j.provider||p).toUpperCase();setLiveStatus(`${j.source||p} · ALL · ${data.length} saham · ${prices.length} baris OHLCV · tanpa broker detail`);saveCache();stamp()}
async function loadLiveStock(){const t=[...selectedTickers];if(t.length!==1)return loadLiveAll();const ticker=t[0];const p=provider(),to=new Date(),from=new Date(to.getTime()-89*86400000),url=`${BACKEND_URL}/stock?ticker=${encodeURIComponent(ticker)}&from=${ymd(from)}&to=${ymd(to)}&provider=${encodeURIComponent(p)}`;setLiveStatus(`Mengambil ${ticker} via ${p.toUpperCase()}...`);const res=await fetch(url,{cache:'no-store'}),j=await res.json();if(!res.ok||!j.ok)throw Error(j.error||`HTTP ${res.status}`);const prices=StockFlowProvider.normalize(j.prices||[]),br=j.broker||[];if(!prices.length)throw Error('OHLCV kosong');const fresh=StockFlowProvider.group(StockFlowProvider.mergeBrokerRows(prices,br));const keep=data.filter(x=>x.ticker!==ticker);data=[...keep,...fresh];brokerRows=br;selectedTickers=new Set([ticker]);refresh();render();$('status').textContent=(j.provider||p).toUpperCase();setLiveStatus(`${j.source||p} · ${ticker} · ${prices.length} hari · ${br.length} broker rows`);saveCache();stamp()}
function stamp(){const t=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});const old=$('lastUpdate');if(old)old.textContent=t;const out=$('lastUpdateInline');if(out)out.textContent=t}function setLiveStatus(x){const old=$('liveStatus');if(old)old.textContent=x;const out=$('liveStatusInline');if(out)out.textContent=x}
async function autoLoad(){
  try{
    await loadLiveStock();
  }catch(e){
    if(provider()==='auto'&&restoreCache())return;
    const explicit=provider()!=='auto';
    $('status').textContent=explicit?'LIVE ERROR':'OFFLINE';
    setLiveStatus(explicit
      ? `LIVE ERROR · ${provider().toUpperCase()} gagal: ${e.message} · demo tidak digunakan`
      : `Data live gagal: ${e.message} · kalkulasi lokal tetap aktif`);
    if(explicit){
      data=[];
      selectedTickers=new Set();
      refresh();
      $('buyTable').innerHTML='<tr><td colspan="5">Tidak ada data live. Demo data dinonaktifkan untuk provider eksplisit.</td></tr>';
      $('sellTable').innerHTML='<tr><td colspan="5">Tidak ada data live. Demo data dinonaktifkan untuk provider eksplisit.</td></tr>';
      $('backtest').innerHTML='<div class="btlegend"><span>Backtest menunggu data live.</span></div>';
      $('detailBuy').innerHTML='Data live belum tersedia.';
      $('detailSell').innerHTML='Data live belum tersedia.';
      return;
    }
    data=[];
    selectedTickers=new Set();
    refresh();
    render();
  }
}
$('lookback').onchange=render;
$('provider').onchange=()=>{info();autoLoad()};
info();refresh();render();setTimeout(autoLoad,50);
try{const s=localStorage.getItem(PROVIDER_KEY);if(['auto','idx','yahoo','indexalpha','remote-csv'].includes(s))$('provider').value=s}catch{}if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
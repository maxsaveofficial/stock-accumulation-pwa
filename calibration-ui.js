(() => {
  const $ = id => document.getElementById(id);
  const esc = x => String(x ?? '').replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m] || m));
  const fmt = (x, d=2) => x == null || !Number.isFinite(Number(x)) ? '-' : Number(x).toFixed(d);
  function statCells(s) { return `<td>${s.count}</td><td>${fmt(s.hitRate,1)}%</td><td>${fmt(s.avgReturn)}%</td><td>${fmt(s.medianReturn)}%</td><td>${fmt(s.expectancy)}%</td><td>${fmt(s.winLossRatio)}</td><td>${fmt(s.avgMAE)}%</td><td>${fmt(s.avgMFE)}%</td>`; }
  function lineChart(results, key, title, unit='%') {
    const W=900,H=280,L=58,R=20,T=34,B=48;
    const vals=results.map(r=>Number(r.total?.[key])).filter(Number.isFinite);
    if(!vals.length) return `<div class="chart-empty">Belum cukup signal untuk membuat grafik ${esc(title)}.</div>`;
    let min=Math.min(...vals),max=Math.max(...vals); if(min===max){min-=1;max+=1;} const pad=(max-min)*0.15||1; min-=pad; max+=pad;
    const x=i=>L+(W-L-R)*(i/(results.length-1||1)), y=v=>T+(H-T-B)*(1-(v-min)/(max-min));
    const points=results.map((r,i)=>`${x(i).toFixed(1)},${y(Number(r.total?.[key])).toFixed(1)}`).join(' ');
    const labels=results.map((r,i)=>`<text x="${x(i)}" y="${H-18}" text-anchor="middle">T+${r.horizon}</text>`).join('');
    const dots=results.map((r,i)=>`<circle cx="${x(i)}" cy="${y(Number(r.total?.[key]))}" r="4"><title>T+${r.horizon}: ${fmt(r.total?.[key])}${unit}</title></circle>`).join('');
    const ticks=[min,(min+max)/2,max].map(v=>`<g><line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${fmt(v,1)}${unit}</text></g>`).join('');
    const zero=min<=0&&max>=0?`<line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" class="chart-zero"/>`:'';
    return `<div class="chartbox"><b>${esc(title)}</b><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${ticks}${zero}<polyline points="${points}" class="chart-line"/>${dots}${labels}</svg></div>`;
  }
  function renderStudy() {
    const target=$('calibration'),status=$('calibrationStatus'); if(!target||!window.StockFlowCalibration)return;
    const selected=$('ticker')?.value||'ALL',pool=selected==='ALL'?data:data.filter(x=>x.ticker===selected),cost=Math.max(1,Number($('calCost')?.value||1));
    if($('calCost'))$('calCost').value=cost.toFixed(2);
    status.textContent=`Study T+1→T+10 · ${pool.length} saham · OOS walk-forward · biaya ${fmt(cost)}%...`;
    const results=StockFlowCalibration.multiHorizon(pool,[1,2,3,4,5,6,7,8,9,10],{lookback:Math.min(+$('lookback').value,20),costPct:cost});
    const summaryRows=results.map(x=>`<tr><td><b>T+${x.horizon}</b></td><td>${x.total.count}</td><td>${fmt(x.total.hitRate,1)}%</td><td>${fmt(x.total.avgReturn)}%</td><td>${fmt(x.total.medianReturn)}%</td><td>${fmt(x.total.expectancy)}%</td><td>${fmt(x.total.avgMAE)}%</td><td>${fmt(x.total.avgMFE)}%</td></tr>`).join('');
    const last=results[results.length-1],bySignal=last.bySignal.map(x=>`<tr><td><b>${x.signal}</b></td>${statCells(x)}</tr>`).join('');
    const scoreRows=last.byScore.map(x=>`<tr><td>${x.bucket}</td>${statCells(x)}</tr>`).join(''),confRows=last.byConfidence.map(x=>`<tr><td>${x.bucket}</td>${statCells(x)}</tr>`).join('');
    const patternRows=last.patterns.map(x=>`<tr><td>${esc(x.pattern)}</td>${statCells(x)}</tr>`).join('')||'<tr><td colspan="9">Tidak ada signal non-neutral.</td></tr>';
    const coverage=StockFlowCalibration.compareBrokerEvidence(pool,{horizon:10,lookback:Math.min(+$('lookback').value,20),costPct:cost});
    const brokerRows=`<tr><td><b>With broker</b></td>${statCells(coverage.withBroker)}</tr><tr><td><b>Without broker</b></td>${statCells(coverage.withoutBroker)}</tr>`;
    target.innerHTML=`<div class="study-note"><b>STUDY MODE</b> T+1 sampai T+10 ditampilkan otomatis sebagai trend. Biaya minimum ${fmt(cost)}% adalah asumsi total round-trip, bukan parameter BUY/SELL. Threshold engine tidak diubah oleh study ini.</div><div class="chartgrid">${lineChart(results,'avgReturn','Average directional return — net of cost')}${lineChart(results,'hitRate','Hit rate')}</div><h3>Trend T+1 → T+10</h3><div class="tablewrap"><table><thead><tr><th>Horizon</th><th>Signals</th><th>Hit rate</th><th>Avg net return</th><th>Median</th><th>Expectancy</th><th>Avg MAE</th><th>Avg MFE</th></tr></thead><tbody>${summaryRows}</tbody></table></div><h3>T+10 · BUY / SELL</h3><div class="tablewrap"><table><thead><tr><th>Signal</th><th>Signals</th><th>Hit rate</th><th>Avg net return</th><th>Median</th><th>Expectancy</th><th>Win/Loss</th><th>Avg MAE</th><th>Avg MFE</th></tr></thead><tbody>${bySignal}</tbody></table></div><h3>T+10 · Score bucket</h3><div class="tablewrap"><table><thead><tr><th>Score</th><th>Signals</th><th>Hit rate</th><th>Avg net return</th><th>Median</th><th>Expectancy</th><th>Win/Loss</th><th>Avg MAE</th><th>Avg MFE</th></tr></thead><tbody>${scoreRows}</tbody></table></div><h3>T+10 · Confidence bucket</h3><div class="tablewrap"><table><thead><tr><th>Confidence</th><th>Signals</th><th>Hit rate</th><th>Avg net return</th><th>Median</th><th>Expectancy</th><th>Win/Loss</th><th>Avg MAE</th><th>Avg MFE</th></tr></thead><tbody>${confRows}</tbody></table></div><h3>T+10 · Pattern</h3><div class="tablewrap"><table><thead><tr><th>Pattern</th><th>Signals</th><th>Hit rate</th><th>Avg net return</th><th>Median</th><th>Expectancy</th><th>Win/Loss</th><th>Avg MAE</th><th>Avg MFE</th></tr></thead><tbody>${patternRows}</tbody></table></div><h3>T+10 · Broker coverage</h3><p><b>${fmt(coverage.brokerCoveragePct,1)}%</b> signal observations with broker evidence (${coverage.withBroker.count} with / ${coverage.withoutBroker.count} without).</p><div class="tablewrap"><table><thead><tr><th>Coverage</th><th>Signals</th><th>Hit rate</th><th>Avg net return</th><th>Median</th><th>Expectancy</th><th>Win/Loss</th><th>Avg MAE</th><th>Avg MFE</th></tr></thead><tbody>${brokerRows}</tbody></table></div>${coverage.warning?`<small>${esc(coverage.warning)}</small>`:''}`;
    status.textContent=`Selesai · T+1→T+10 · ${results.reduce((n,x)=>n+x.total.count,0)} signal-observations · OOS study`;
  }
  window.addEventListener('load',()=>{const btn=$('runCalibration');if(!btn)return;btn.onclick=renderStudy;const cost=$('calCost');if(cost){cost.min='1';cost.step='0.01';if(Number(cost.value)<1)cost.value='1.00';}});
})();

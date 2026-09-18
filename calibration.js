window.StockFlowCalibration = (() => {
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const median = a => {
    if (!a.length) return null;
    const x = [...a].sort((a,b) => a-b), m = Math.floor(x.length / 2);
    return x.length % 2 ? x[m] : (x[m-1] + x[m]) / 2;
  };
  const pct = (a,b) => b ? (a/b - 1) * 100 : 0;

  const bucket = score => score < 60 ? '50-59' :
    score < 65 ? '60-64' : score < 70 ? '65-69' :
    score < 75 ? '70-74' : score < 85 ? '75-84' : '85+';

  function summarize(obs) {
    const signed = obs.map(x => x.signal === 'BUY' ? x.ret : -x.ret);
    const wins = signed.filter(x => x > 0), losses = signed.filter(x => x <= 0);
    const avgWin = avg(wins), avgLoss = losses.length ? Math.abs(avg(losses)) : null;
    return {
      count: signed.length,
      hitRate: signed.length ? 100 * wins.length / signed.length : null,
      avgReturn: avg(signed),
      medianReturn: median(signed),
      winLossRatio: avgWin != null && avgLoss ? avgWin / avgLoss : null,
      expectancy: avg(signed),
      maxAdverseReturn: signed.length ? Math.min(...signed) : null
    };
  }

  function byDimension(obs, key, values) {
    return values.map(value => {
      const rows = obs.filter(x => x[key] === value);
      return {bucket:value, ...summarize(rows)};
    });
  }

  function walkForward(series, options = {}) {
    const horizon = Number(options.horizon || 5);
    const lookback = Number(options.lookback || 20);
    const costPct = Number(options.costPct || 0);
    const rows = Array.isArray(series) ? series : [];
    const observations = [];

    rows.forEach(s => {
      const r = (s.rows || []).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
      for (let i = lookback; i < r.length - horizon; i++) {
        const a = window.StockFlow.analyze(r.slice(0, i + 1), lookback);
        if (!a || a.signal === 'NEUTRAL') continue;
        const future = r[i + horizon].close;
        if (!Number.isFinite(Number(future)) || !Number(future)) continue;
        const rawReturn = pct(Number(future), Number(r[i].close));
        const signedGross = a.signal === 'BUY' ? rawReturn : -rawReturn;
        const signedNet = signedGross - costPct;
        observations.push({
          ticker: s.ticker || a.ticker || '',
          date: r[i].date,
          signal: a.signal,
          ret: signedNet,
          grossReturn: signedGross,
          score: a.score,
          confidence: a.confidence,
          pattern: a.pattern,
          brokerAvailable: !!(a.broker && a.broker.available)
        });
      }
    });

    const signals = ['BUY','SELL'];
    const scoreBuckets = ['50-59','60-64','65-69','70-74','75-84','85+'];
    const confidenceBuckets = ['<60','60-69','70-79','80-89','90+'];

    const enriched = observations.map(x => ({
      ...x,
      scoreBucket: bucket(x.score),
      confidenceBucket: x.confidence < 60 ? '<60' :
        x.confidence < 70 ? '60-69' : x.confidence < 80 ? '70-79' :
        x.confidence < 90 ? '80-89' : '90+'
    }));

    return {
      horizon, lookback, costPct,
      total: summarize(enriched),
      buy: summarize(enriched.filter(x => x.signal === 'BUY')),
      sell: summarize(enriched.filter(x => x.signal === 'SELL')),
      byScore: byDimension(enriched, 'scoreBucket', scoreBuckets),
      byConfidence: byDimension(enriched, 'confidenceBucket', confidenceBuckets),
      bySignal: signals.map(signal => ({signal, ...summarize(enriched.filter(x => x.signal === signal))})),
      patterns: [...new Set(enriched.map(x => x.pattern))].map(pattern => ({
        pattern, ...summarize(enriched.filter(x => x.pattern === pattern))
      })),
      observations: enriched
    };
  }

  function multiHorizon(series, horizons = [1,3,5,10,20], options = {}) {
    return horizons.map(h => walkForward(series, {...options, horizon:h}));
  }

  function compareBrokerEvidence(series, options = {}) {
    const full = walkForward(series, options);
    const withBroker = full.observations.filter(x => x.brokerAvailable);
    const withoutBroker = full.observations.filter(x => !x.brokerAvailable);
    return {
      ...full,
      brokerCoveragePct: full.total.count ? 100 * withBroker.length / full.total.count : null,
      withBroker: summarize(withBroker),
      withoutBroker: summarize(withoutBroker),
      warning: withoutBroker.length && withBroker.length
        ? 'Coverage is observational, not causal: broker availability may differ by date/source.'
        : null
    };
  }

  return {walkForward, multiHorizon, compareBrokerEvidence};
})();
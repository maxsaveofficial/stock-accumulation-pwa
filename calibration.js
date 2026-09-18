window.StockFlowCalibration = (() => {
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const median = a => {
    if (!a.length) return null;
    const x = [...a].sort((a, b) => a - b), m = Math.floor(x.length / 2);
    return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
  };
  const pct = (a, b) => b ? (a / b - 1) * 100 : null;

  const bucket = score => score < 60 ? '50-59' :
    score < 65 ? '60-64' : score < 70 ? '65-69' :
    score < 75 ? '70-74' : score < 85 ? '75-84' : '85+';

  function costModel(options = {}) {
    const legacy = Number(options.costPct || 0);
    const entry = Number(options.entryCostPct ?? 0);
    const exit = Number(options.exitCostPct ?? 0);
    const slippage = Number(options.slippagePct ?? 0);
    const spread = Number(options.spreadPct ?? 0);
    const explicit = entry + exit + (2 * slippage) + spread;
    return {
      entryCostPct: entry,
      exitCostPct: exit,
      slippagePct: slippage,
      spreadPct: spread,
      totalCostPct: explicit || legacy
    };
  }

  function summarize(obs) {
    const signed = obs.map(x => x.signedNetReturn);
    const wins = signed.filter(x => x > 0), losses = signed.filter(x => x <= 0);
    const avgWin = avg(wins), avgLoss = losses.length ? Math.abs(avg(losses)) : null;
    return {
      count: signed.length,
      hitRate: signed.length ? 100 * wins.length / signed.length : null,
      avgReturn: avg(signed),
      medianReturn: median(signed),
      winLossRatio: avgWin != null && avgLoss ? avgWin / avgLoss : null,
      expectancy: avg(signed),
      avgMAE: avg(obs.map(x => x.mae)),
      worstMAE: obs.length ? Math.min(...obs.map(x => x.mae)) : null,
      avgMFE: avg(obs.map(x => x.mfe)),
      bestMFE: obs.length ? Math.max(...obs.map(x => x.mfe)) : null
    };
  }

  function byDimension(obs, key, values) {
    return values.map(value => {
      const rows = obs.filter(x => x[key] === value);
      return { bucket: value, ...summarize(rows) };
    });
  }

  function pathMetrics(r, entryIndex, horizon, signal) {
    const entry = Number(r[entryIndex]?.close);
    const end = Number(r[entryIndex + horizon]?.close);
    if (!Number.isFinite(entry) || !entry || !Number.isFinite(end)) return null;
    const path = r.slice(entryIndex + 1, entryIndex + horizon + 1);
    if (!path.length) return null;

    let mae = 0, mfe = 0;
    if (signal === 'BUY') {
      mae = Math.min(0, ...path.map(x => {
        const low = Number(x.low);
        return Number.isFinite(low) && low ? (low / entry - 1) * 100 : 0;
      }));
      mfe = Math.max(0, ...path.map(x => {
        const high = Number(x.high);
        return Number.isFinite(high) && high ? (high / entry - 1) * 100 : 0;
      }));
    } else {
      mae = Math.min(0, ...path.map(x => {
        const high = Number(x.high);
        return Number.isFinite(high) && high ? (entry / high - 1) * 100 : 0;
      }));
      mfe = Math.max(0, ...path.map(x => {
        const low = Number(x.low);
        return Number.isFinite(low) && low ? (entry / low - 1) * 100 : 0;
      }));
    }

    const rawReturn = pct(end, entry);
    const signedGrossReturn = signal === 'BUY' ? rawReturn : -rawReturn;
    return { entry, end, signedGrossReturn, mae, mfe };
  }

  function walkForward(series, options = {}) {
    const horizon = Number(options.horizon || 5);
    const lookback = Number(options.lookback || 20);
    const costs = costModel(options);
    const rows = Array.isArray(series) ? series : [];
    const observations = [];

    rows.forEach(s => {
      const r = (s.rows || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      for (let i = lookback; i < r.length - horizon; i++) {
        const a = window.StockFlow.analyze(r.slice(0, i + 1), lookback);
        if (!a || a.signal === 'NEUTRAL') continue;
        const metrics = pathMetrics(r, i, horizon, a.signal);
        if (!metrics) continue;
        const signedNetReturn = metrics.signedGrossReturn - costs.totalCostPct;
        observations.push({
          ticker: s.ticker || a.ticker || '',
          date: r[i].date,
          signal: a.signal,
          ret: signedNetReturn,
          signedNetReturn,
          grossReturn: metrics.signedGrossReturn,
          mae: metrics.mae,
          mfe: metrics.mfe,
          entry: metrics.entry,
          exit: metrics.end,
          score: a.score,
          confidence: a.confidence,
          pattern: a.pattern,
          brokerAvailable: !!(a.broker && a.broker.available)
        });
      }
    });

    const signals = ['BUY', 'SELL'];
    const scoreBuckets = ['50-59', '60-64', '65-69', '70-74', '75-84', '85+'];
    const confidenceBuckets = ['<60', '60-69', '70-79', '80-89', '90+'];

    const enriched = observations.map(x => ({
      ...x,
      scoreBucket: bucket(x.score),
      confidenceBucket: x.confidence < 60 ? '<60' :
        x.confidence < 70 ? '60-69' : x.confidence < 80 ? '70-79' :
        x.confidence < 90 ? '80-89' : '90+'
    }));

    return {
      horizon,
      lookback,
      costPct: costs.totalCostPct,
      costs,
      total: summarize(enriched),
      buy: summarize(enriched.filter(x => x.signal === 'BUY')),
      sell: summarize(enriched.filter(x => x.signal === 'SELL')),
      byScore: byDimension(enriched, 'scoreBucket', scoreBuckets),
      byConfidence: byDimension(enriched, 'confidenceBucket', confidenceBuckets),
      bySignal: signals.map(signal => ({ signal, ...summarize(enriched.filter(x => x.signal === signal)) })),
      patterns: [...new Set(enriched.map(x => x.pattern))].map(pattern => ({
        pattern, ...summarize(enriched.filter(x => x.pattern === pattern))
      })),
      observations: enriched
    };
  }

  function multiHorizon(series, horizons = [1, 3, 5, 10, 20], options = {}) {
    return horizons.map(h => walkForward(series, { ...options, horizon: h }));
  }

  function compareBrokerEvidence(series, options = {}) {
    const full = walkForward(series, options);
    const withBroker = full.observations.filter(x => x.brokerAvailable);
    const withoutBroker = full.observations.filter(x => !x.brokerAvailable);
    return {
      ...full,
      brokerCoveragePct: full.total.count ? 100 * withBroker.length / full.total.count : null,
      brokerObservations: withBroker.length,
      noBrokerObservations: withoutBroker.length,
      withBroker: summarize(withBroker),
      withoutBroker: summarize(withoutBroker),
      warning: withoutBroker.length && withBroker.length
        ? 'Coverage is observational, not causal: broker availability may differ by date/source.'
        : null
    };
  }

  return { walkForward, multiHorizon, compareBrokerEvidence };
})();

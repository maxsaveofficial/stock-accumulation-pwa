# Stock Flow Scanner

PWA mobile-first untuk screening akumulasi/distribusi saham.

## MVP
- Mode ALL Stocks dan single stock
- Pareto Top 5 BUY dan Top 5 SELL
- Accumulation / Distribution score
- Volume anomaly, trend, support, resistance, breakdown risk
- Backtest T+1/T+3/T+5 tanpa look-ahead
- CSV import
- Offline service worker

## Broker flow
CSV dapat memakai kolom opsional `brokerNetValue`. Nilai positif berarti net flow masuk menurut data yang diimpor, negatif berarti net flow keluar. Aplikasi **tidak menebak identitas pembeli/penjual dari OHLCV**. Kode broker akan menjadi lapisan tambahan ketika data broker-summary tersedia.

Format CSV minimum:
`date,ticker,open,high,low,close,volume`

Opsional:
`value,brokerNetValue`

Untuk broker detail, tahap berikutnya dapat memakai data per broker per hari: `date,ticker,broker,buyValue,sellValue,buyVolume,sellVolume`. Dari sana engine akan menghitung persistence, concentration, rotation, dan net-flow consistency tanpa menganggap broker tertentu selalu mewakili retail atau institusi.

## Data
Versi awal memakai data demo dan CSV. Untuk data IDX otomatis/live, gunakan provider berlisensi atau sumber yang memang mengizinkan penggunaan aplikasi; jangan menaruh API secret di JavaScript frontend GitHub Pages.


### V3 accuracy engine
- Accumulation and distribution are scored independently; distribution is no longer a simple inverse of accumulation.
- Live Index Alpha detail fetches broker summaries across the latest 20 trading sessions so persistence, divergence and rotation can use historical broker flow.
- Signal thresholds were made slightly more sensitive on the SELL side, but should be calibrated further against out-of-sample historical results rather than tuned to a single stock.


## Calibration Lab

`calibration.js` adds an out-of-sample walk-forward calibration layer on top of `StockFlow.analyze()`.

It reports, for any loaded CSV/demo dataset:
- BUY and SELL separately
- T+1/T+3/T+5/T+10/T+20 multi-horizon runs
- hit rate, mean/median directional return, win/loss ratio and expectancy
- score buckets: 50–59, 60–64, 65–69, 70–74, 75–84, 85+
- confidence buckets: <60, 60–69, 70–79, 80–89, 90+
- pattern-level performance
- optional transaction-cost deduction
- maximum adverse signed return per group
- broker-flow coverage split for observational comparison

Example browser usage:

```js
StockFlowCalibration.walkForward(data, { horizon: 5, lookback: 20, costPct: 0.15 });
StockFlowCalibration.multiHorizon(data, [1,3,5,10,20], { lookback: 20, costPct: 0.15 });
StockFlowCalibration.compareBrokerEvidence(data, { horizon: 5, lookback: 20 });
```

### Calibration rules

The framework is deliberately descriptive: it does not tune thresholds from the same observations used to report performance. Use a time split (train/calibration period → untouched out-of-sample period) before changing signal thresholds. Broker-flow comparisons are observational and require comparable broker coverage; they do not establish causality.

Current live backend broker enrichment covers the latest 20 trading sessions. Therefore a long historical backtest with broker evidence still requires historical broker rows for the older dates; the framework exposes coverage so missing broker history is visible rather than silently treated as evidence.

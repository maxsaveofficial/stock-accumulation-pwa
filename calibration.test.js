// Lightweight Node regression tests for calibration.js.
// The production module is browser-global, so we provide the smallest DOM/window
// shim and a deterministic StockFlow.analyze stub. These tests validate the
// calibration mechanics (causality, path MAE/MFE and cost accounting), not
// market-data performance.
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require('path').join(__dirname, 'calibration.js'), 'utf8');
const context = { window: {}, console };
context.window.StockFlow = {
  analyze(rows) {
    const last = rows[rows.length - 1];
    return {
      ticker: last.ticker,
      signal: last.signal,
      score: last.score || 70,
      confidence: last.confidence || 80,
      pattern: last.pattern || 'TEST',
      broker: { available: !!last.brokerAvailable }
    };
  }
};
vm.createContext(context);
vm.runInContext(source, context);

const rows = [
  { date:'2026-01-01', ticker:'TEST', open:100, high:101, low:99, close:100, signal:'NEUTRAL' },
  { date:'2026-01-02', ticker:'TEST', open:100, high:103, low:95, close:102, signal:'BUY' },
  { date:'2026-01-03', ticker:'TEST', open:102, high:108, low:101, close:106, signal:'NEUTRAL' },
  { date:'2026-01-04', ticker:'TEST', open:106, high:109, low:104, close:108, signal:'NEUTRAL' },
  { date:'2026-01-05', ticker:'TEST', open:108, high:110, low:107, close:110, signal:'NEUTRAL' }
];

// Make only the entry bar emit BUY. A horizon of 3 must use the close on
// 2026-01-05 and path lows/highs from 2026-01-03 through 2026-01-05.
const series = [{ ticker:'TEST', rows, lookback:1 }];
const result = context.window.StockFlowCalibration.walkForward(series, {
  horizon:3,
  lookback:1,
  entryCostPct:0.10,
  exitCostPct:0.20,
  slippagePct:0.05,
  spreadPct:0.10
});

if (result.observations.length !== 1) throw new Error(`expected 1 observation, got ${result.observations.length}`);
const o = result.observations[0];
const expectedGross = 10;
const expectedCost = 0.10 + 0.20 + (2 * 0.05) + 0.10;
if (Math.abs(o.grossReturn - expectedGross) > 1e-9) throw new Error(`gross return mismatch: ${o.grossReturn}`);
if (Math.abs(o.signedNetReturn - (expectedGross - expectedCost)) > 1e-9) throw new Error(`net return mismatch: ${o.signedNetReturn}`);
if (Math.abs(o.mae - (-1.0)) > 1e-9) throw new Error(`MAE mismatch: ${o.mae}`);
if (Math.abs(o.mfe - 10.0) > 1e-9) throw new Error(`MFE mismatch: ${o.mfe}`);
if (result.costs.totalCostPct !== expectedCost) throw new Error(`cost mismatch: ${result.costs.totalCostPct}`);

console.log('calibration.test.js: PASS');

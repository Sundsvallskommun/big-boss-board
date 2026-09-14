const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./load-module.cjs');

test('HME warning boundaries are shared by cards and chart', () => {
  const { hmeStatus } = load('components/status.ts');
  for (const target of [75, 80]) {
    for (const [delta, status] of [[0, 'good'], [-2, 'warn'], [-5, 'warn'], [-5.1, 'alert']]) {
      assert.equal(hmeStatus(target + delta, target), status);
    }
  }
  const { HmeNivaer } = load('components/HmeNivaer.tsx');
  const html = renderToStaticMarkup(React.createElement(HmeNivaer, {
    matningar: { 2025: 73 }, perspektiv: { motivation: { 2025: 75 } }, target: 75,
  }));
  assert.match(html, /bg-status-warn/);
  assert.match(html, /Bevaka/);
});

test('HME renders sharp colour boundaries at actual axis coordinates and consistent active dots', () => {
  const series = [{ ar: '2021', value: 69 }, { ar: '2023', value: 73 }, { ar: '2025', value: 75 }];
  // Deterministic plot geometry only; actual chart/gradient/dot components are rendered.
  const stubs = { recharts: {
    ResponsiveContainer: ({ children }) => React.createElement('div', null, children),
    LineChart: ({ children }) => React.createElement('svg', null, children),
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
    ReferenceLine: ({ y }) => React.createElement('line', { 'data-value': y }),
    usePlotArea: () => ({ y: 24, height: 240 }),
    useYAxisScale: () => (value) => 24 + (100 - value) * 4, // domain 40–100
    Line: ({ stroke, dot, activeDot }) => React.createElement('g', { 'data-stroke': stroke },
      ...(dot ? series.map((payload, i) => dot({ cx: i * 100, cy: 24 + (100 - payload.value) * 4, payload })) : []),
      activeDot && React.createElement('g', { 'data-active': true }, activeDot({ cx: 100, cy: 132, payload: series[1] }))),
  } };
  const { HmeLineChart } = load('components/charts/HmeLineChart.tsx', stubs);
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(HmeLineChart, { data: series, target: 75 }),
    React.createElement(HmeLineChart, { data: series, target: 75 })));
  const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  const stops = [...html.matchAll(/<stop offset="([^"]+)" stop-color="([^"]+)"/g)].slice(0, 4);
  assert.deepEqual(stops.map((match) => match[2]), ['#1E8A4E', '#EAB308', '#EAB308', '#D32F2F']);
  assert.deepEqual(stops.map((match) => Number(match[1])), [100 / 240, 100 / 240, 120 / 240, 120 / 240]);
  assert.match(html, /r="7" fill="#EAB308"/);
  assert.match(html, /data-value="70"/);
  assert.match(html, /data-value="75"/);
  assert.match(html, /Grönt från 75, gult från 70/);
});

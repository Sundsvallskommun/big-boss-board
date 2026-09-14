const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./load-module.cjs');

test('status selection exposes native radios and connected tabs', () => {
  const { QuestionPanel } = load('components/QuestionPanel.tsx');
  const html = renderToStaticMarkup(React.createElement(QuestionPanel, {
    item: { area: { key: 'verksamhet', namn: 'Verksamhet', ikon: 'target', questions: [] } },
    index: 0, total: 1, historik: [],
    dimensions: [{ key: 'grunduppdrag', label: 'Grunduppdrag' }, { key: 'fullmaktigemal', label: 'Fullmäktigemål' }],
    onSaveStatus: async () => {},
  }));
  assert.equal((html.match(/type="radio"/g) || []).length, 3);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /aria-controls="[^"]+-panel-grunduppdrag"/);
  assert.match(html, /aria-selected="false" tabindex="-1"/);
});

test('HME perspective cards label different latest years explicitly', () => {
  const { HmeNivaer } = load('components/HmeNivaer.tsx');
  const html = renderToStaticMarkup(React.createElement(HmeNivaer, {
    matningar: { 2025: 80, 2027: 82 }, perspektiv: { motivation: { 2023: 73, 2025: 75 } }, target: 75,
  }));
  assert.match(html, /2027 · \+2 sedan 2025/);
  assert.match(html, /2025 · \+2 sedan 2023/);
});

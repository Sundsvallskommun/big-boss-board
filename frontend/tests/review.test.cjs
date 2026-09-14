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

test('web import sends all selected files and reports skipped rows', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.IMPORT_TOKEN;
  const { importData } = load('app/admin/import/actions.ts', {
    '@/lib/auth': { isAdmin: async () => true }, 'next/cache': { revalidatePath: () => {} },
  });
  process.env.IMPORT_TOKEN = 'test';
  try {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.ok(url.endsWith('/api/import/ekonomi-filer'));
      assert.equal(JSON.parse(init.body).filer.length, 2);
      return Response.json({ skapade: 1, uppdaterade: 0, hoppade_over: 1, enheter: [] });
    };
    const data = new FormData();
    for (const month of ['04', '05']) data.append('file', new File([
      `Period,Enhet,Mått,Kolumn,Mätvärde\n2026-${month}-30,23,SK.EK.RR.005,K18,-100`,
    ], `ekonomi-${month}.csv`));
    const result = await importData({}, data);
    assert.equal(calls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.incomplete, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.IMPORT_TOKEN;
    else process.env.IMPORT_TOKEN = previousToken;
  }
});

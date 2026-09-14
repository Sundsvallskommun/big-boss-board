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

test('admin inbox forwards the SAML session instead of a token in saml mode', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.IMPORT_TOKEN;
  const { listSubmissionsAdmin } = load('lib/admin-api.ts', {
    '@/lib/auth': { isSamlMode: () => true, SESSION_COOKIE: 'bbb_session' },
    'next/headers': { cookies: async () => ({ get: (name) => (name === 'bbb_session' ? { value: 'sid.sig' } : undefined) }) },
  });
  delete process.env.IMPORT_TOKEN; // Frontend behöver ingen token i saml-läget.
  try {
    let headers;
    globalThis.fetch = async (url, init) => {
      headers = init.headers;
      assert.ok(url.endsWith('/api/admin/submissions'));
      return Response.json([{ id: 1, text: 'x', status: 'ny', notering: null, skapad_at: '', uppdaterad_at: null }]);
    };
    const rows = await listSubmissionsAdmin();
    assert.equal(rows.length, 1);
    assert.equal(headers.cookie, 'bbb_session=sid.sig');
    assert.equal(headers.Authorization, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.IMPORT_TOKEN;
    else process.env.IMPORT_TOKEN = previousToken;
  }
});

test('admin inbox uses IMPORT_TOKEN in access_code mode and stays empty without it', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.IMPORT_TOKEN;
  const { listSubmissionsAdmin } = load('lib/admin-api.ts', {
    '@/lib/auth': { isSamlMode: () => false, SESSION_COOKIE: 'bbb_session' },
  });
  try {
    delete process.env.IMPORT_TOKEN;
    globalThis.fetch = async () => { throw new Error('ska inte anropas utan token'); };
    assert.deepEqual(await listSubmissionsAdmin(), []);

    process.env.IMPORT_TOKEN = 'test';
    let headers;
    globalThis.fetch = async (_url, init) => { headers = init.headers; return Response.json([]); };
    await listSubmissionsAdmin();
    assert.equal(headers.Authorization, 'Bearer test');
    assert.equal(headers.cookie, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.IMPORT_TOKEN;
    else process.env.IMPORT_TOKEN = previousToken;
  }
});

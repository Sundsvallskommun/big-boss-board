const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Kör kommunens oförändrade middleware med det installerade Next-biblioteket.
const filename = path.resolve(__dirname, '../middleware.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'exports', 'module', compiled)(createRequire(filename), loaded.exports, loaded);
const { middleware } = loaded.exports;

test('municipal SAML and access-code gates keep their existing behavior under Next 16', async () => {
  const names = ['AUTH_MODE', 'ACCESS_CODE', 'ADMIN_ACCESSCODE', 'ALLOW_OPEN_ACCESS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.AUTH_MODE = 'saml';
    assert.equal((await middleware(new NextRequest('http://test/api/dialogues'))).status, 401);
    for (const route of ['/api/auth/saml/callback', '/api/import/hme', '/api/health', '/api/ready']) {
      assert.equal((await middleware(new NextRequest('http://test' + route))).headers.get('x-middleware-next'), '1');
    }
    globalThis.fetch = async (url, init) => {
      assert.ok(url.endsWith('/api/me'));
      assert.equal(init.headers.cookie, 'bbb_session=test-session');
      return new Response('{}', { status: 200 });
    };
    const valid = await middleware(new NextRequest('http://test/api/dialogues', { headers: { cookie: 'bbb_session=test-session' } }));
    assert.equal(valid.headers.get('x-middleware-next'), '1');
    globalThis.fetch = async () => new Response('', { status: 401 });
    assert.equal((await middleware(new NextRequest('http://test/api/dialogues', { headers: { cookie: 'bbb_session=expired' } }))).status, 401);
    process.env.AUTH_MODE = 'access_code';
    delete process.env.ACCESS_CODE;
    delete process.env.ADMIN_ACCESSCODE;
    delete process.env.ALLOW_OPEN_ACCESS;
    assert.equal((await middleware(new NextRequest('http://test/api/dialogues'))).status, 503);
    process.env.AUTH_MODE = 'invalid';
    assert.equal((await middleware(new NextRequest('http://test/api/dialogues'))).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

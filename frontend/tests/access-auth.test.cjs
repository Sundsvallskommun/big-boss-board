const test = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { load } = require('./load-module.cjs');

function configure(t) {
  const settings = { AUTH_MODE: 'access_code', ACCESS_CODE: 'test-access-code', ADMIN_ACCESSCODE: 'test-admin-code', SESSION_SECRET: 'test-session-secret-at-least-32-characters' };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('signed access sessions expire and reject changed roles, raw codes and rotated secrets', async (t) => {
  configure(t);
  const session = load('lib/access-session.ts');
  const token = await session.createAccessSession('user');
  assert.equal(await session.verifyAccessSession(token), 'user');
  assert.ok(!token.includes(process.env.ACCESS_CODE));
  assert.equal(await session.verifyAccessSession(token.replace('.user.', '.admin.')), null);
  assert.equal(await session.verifyAccessSession(process.env.ACCESS_CODE), null);
  assert.equal(await session.verifyAccessSession('invalid.signature'), null);
  const originalCode = process.env.ACCESS_CODE;
  process.env.ACCESS_CODE = 'rotated-code';
  assert.equal(await session.verifyAccessSession(token), null);
  process.env.ACCESS_CODE = originalCode;
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'rotated-secret-with-at-least-32-characters';
  assert.equal(await session.verifyAccessSession(token), null);
  process.env.SESSION_SECRET = originalSecret;
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + session.ACCESS_MAX_AGE_S * 1000);
  assert.equal(await session.verifyAccessSession(token), null);
});

test('login issues only signed cookies and the same session determines access and admin rights', async (t) => {
  configure(t);
  const cache = new Map();
  const jar = new Map();
  const written = [];
  const stubs = {
    'next/headers': {
      headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.1' }),
      cookies: async () => ({
        get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined,
        set: (key, value, options) => { jar.set(key, value); written.push({ key, value, options }); },
      }),
    },
    'next/navigation': { redirect: (url) => { throw new Error('redirect:' + url); } },
  };
  const { login } = load('app/login/actions.ts', stubs, cache);
  const { isAdmin } = load('lib/auth.ts', stubs, cache);
  const { middleware } = load('middleware.ts', stubs, cache);
  for (const [code, admin] of [[process.env.ACCESS_CODE, false], [process.env.ADMIN_ACCESSCODE, true]]) {
    const form = new FormData();
    form.set('code', code);
    await assert.rejects(login({}, form), /redirect:\//);
    assert.equal(await isAdmin(), admin);
    const cookie = written.at(-1);
    assert.equal(cookie.key, 'bbb_access');
    assert.notEqual(cookie.value, code);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.sameSite, 'lax');
    assert.equal(cookie.options.maxAge, 8 * 60 * 60);
    const result = await middleware(new NextRequest('http://test/api/dialogues', { headers: { cookie: `${cookie.key}=${cookie.value}` } }));
    assert.equal(result.headers.get('x-middleware-next'), '1');
  }
  assert.equal((await middleware(new NextRequest('http://test/api/dialogues', { headers: { cookie: `bbb_access=${process.env.ADMIN_ACCESSCODE}` } }))).status, 401);
});

test('code login stays closed without a signing secret and cannot run in SAML mode', async (t) => {
  configure(t);
  const { login } = load('app/login/actions.ts');
  const form = new FormData();
  form.set('code', process.env.ADMIN_ACCESSCODE);
  process.env.AUTH_MODE = 'saml';
  assert.match((await login({}, form)).error, /inte aktiverad/);
  process.env.AUTH_MODE = 'access_code';
  delete process.env.SESSION_SECRET;
  assert.match((await login({}, form)).error, /konfigurerad/);
  const { middleware } = load('middleware.ts');
  assert.equal((await middleware(new NextRequest('http://test/api/dialogues'))).status, 503);
});

test('simultaneous bad codes consume attempts before a later correct code can pass', async (t) => {
  configure(t);
  const { login } = load('app/login/actions.ts', {
    'next/headers': { headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.2' }) },
  });
  const form = new FormData();
  form.set('code', 'wrong');
  const results = await Promise.all(Array.from({ length: 11 }, () => login({}, form)));
  assert.equal(results.filter((result) => /Fel kod/.test(result.error)).length, 10);
  assert.equal(results.filter((result) => /För många/.test(result.error)).length, 1);
  form.set('code', process.env.ADMIN_ACCESSCODE);
  assert.match((await login({}, form)).error, /För många/);
});

test('attempt windows expire and a forwarded prefix cannot choose a new client', (t) => {
  const attempts = load('lib/login-attempts.ts');
  const ip = attempts.loginClient(new Headers({ 'x-forwarded-for': '198.51.100.1, 192.0.2.1' }));
  assert.equal(ip, '192.0.2.1');
  assert.equal(attempts.loginClient(new Headers({ 'x-forwarded-for': '::ffff:192.0.2.1' })), ip);
  assert.equal(attempts.loginClient(new Headers({ 'x-forwarded-for': 'forged, 192.0.2.1' })), ip);
  assert.equal(attempts.loginClient(new Headers({ 'x-forwarded-for': '2001:db8::1' })), attempts.loginClient(new Headers({ 'x-forwarded-for': '2001:0db8:0:0::2' })));
  assert.equal(attempts.loginClient(new Headers()), 'unknown');
  for (let i = 0; i < 10; i++) assert.equal(attempts.reserveLoginAttempt(ip), 0);
  assert.equal(attempts.reserveLoginAttempt(ip), null);
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 15 * 60 * 1000);
  assert.equal(attempts.reserveLoginAttempt(ip), 0);
});

test('a valid regular login cannot reset attempts at guessing the admin code', async (t) => {
  configure(t);
  const { login } = load('app/login/actions.ts', {
    'next/headers': {
      headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.3' }),
      cookies: async () => ({ set: () => {} }),
    },
    'next/navigation': { redirect: () => { throw new Error('redirect'); } },
  });
  const form = new FormData();
  form.set('code', 'wrong');
  for (let i = 0; i < 9; i++) assert.match((await login({}, form)).error, /Fel kod/);
  form.set('code', process.env.ACCESS_CODE);
  await assert.rejects(login({}, form), /redirect/);
  form.set('code', process.env.ADMIN_ACCESSCODE);
  assert.match((await login({}, form)).error, /För många/);
});

test('proxy continues to forward SAML through a rewrite and headers permit IdP redirects', async () => {
  const config = require('../next.config.js');
  assert.equal((await config.rewrites())[0].source, '/api/:path*');
  const headers = Object.fromEntries((await config.headers())[0].headers.map(({ key, value }) => [key, value]));
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /form-action|default-src/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(config.poweredByHeader, false);
});

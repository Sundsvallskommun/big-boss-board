import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivity, deleteCompletedActivity, getDialogue, updateActivity } from '../lib/api.ts';
import { sjukKostnad, krText, sjukSaknadeUppgifter } from '../lib/sjukfranvaro.ts';

test('a missing write response is never retried and tells the user to verify', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; throw new DOMException('timeout', 'TimeoutError'); };
  try {
    await assert.rejects(createActivity(1, 1, 'Följ upp'), /kan ha sparats/);
    assert.equal(count, 1);
  } finally { globalThis.fetch = original; }
});

test('editing an activity sends one PATCH with only the requested fields', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(url, /\/api\/activities\/7$/);
    assert.equal(init.method, 'PATCH');
    assert.deepEqual(JSON.parse(init.body), { klar: false });
    return Response.json({ id: 7, text: 'Följ upp', klar: false });
  };
  try {
    assert.equal((await updateActivity(7, { klar: false })).klar, false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('deleting a completed activity sends one DELETE', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(url, /\/api\/activities\/7$/);
    assert.equal(init.method, 'DELETE');
    return Response.json({ id: 7 });
  };
  try {
    await deleteCompletedActivity(7);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('reads can recover from a transient failure', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => ++count === 1
    ? new Response('', { status: 503 })
    : Response.json({ id: 1, areas: [] });
  try {
    assert.equal((await getDialogue(1)).id, 1);
    assert.equal(count, 2);
  } finally { globalThis.fetch = original; }
});

test('annual cost uses imported staffing and retains the sign relative to target', () => {
  const above = sjukKostnad(7, 100);
  assert.equal(above.kostnad, 2_100_000);
  assert.equal(above.merkostnad, 300_000);
  assert.equal(sjukKostnad(5, 100).merkostnad, -300_000);
  assert.equal(sjukKostnad(7), null);
  assert.equal(sjukKostnad(NaN), null);
  assert.equal(sjukKostnad(-1), null);
  assert.equal(krText(963_200), '963 tkr');
});

test('zero imported staffing must not fall back to an older nonzero snapshot', () => {
  const result = sjukKostnad(7, 0);
  assert.equal(result.anstallda, 0);
  assert.equal(result.kostnad, 0);
  assert.equal(sjukKostnad(7, -1), null);
});


test('missing staffing never uses an older reference count', () => {
  assert.equal(sjukKostnad(7, null), null);
  assert.equal(sjukKostnad(7), null);
  assert.equal(sjukKostnad(null, 100), null);
  const details = { typ: 'sjukfranvaro', kvinnor: 0, man: 0, langtidsandel: 0,
    anstallda: null, aldersgrupper: ['29 år eller yngre', '30–49 år', '50 år eller äldre']
      .map(grupp => ({grupp, varde: 0})) };
  assert.deepEqual(sjukSaknadeUppgifter(details, 0), ['antal anställda']);
  assert.deepEqual(sjukSaknadeUppgifter({...details, anstallda: 0}, 0), []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivity, getDialogue } from '../lib/api.ts';
import { sjukKostnad, krText } from '../lib/sjukfranvaro.ts';

test('a missing write response is never retried and tells the user to verify', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; throw new DOMException('timeout', 'TimeoutError'); };
  try {
    await assert.rejects(createActivity(1, 1, 'Följ upp'), /kan ha sparats/);
    assert.equal(count, 1);
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
  const above = sjukKostnad('23', 7, 100);
  assert.equal(above.kostnad, 2_100_000);
  assert.equal(above.merkostnad, 300_000);
  assert.equal(above.franData, true);
  assert.equal(sjukKostnad('23', 5, 100).merkostnad, -300_000);
  assert.equal(sjukKostnad('unknown', 7), null);
  assert.equal(sjukKostnad('23', NaN), null);
  assert.equal(sjukKostnad('23', -1), null);
  assert.equal(krText(963_200), '963 tkr');
});

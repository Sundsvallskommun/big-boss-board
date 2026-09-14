import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

test('migrated theme emits spacing, status colours and existing focus/hover utilities', async () => {
  const file = fileURLToPath(new URL('../app/globals.css', import.meta.url));
  const css = await readFile(file, 'utf8');
  const result = await postcss([tailwind({ optimize: false })]).process(css, { from: file });
  assert.match(result.css, /--spacing:\s*1px/);
  assert.match(result.css, /--color-vattjom-surface-primary-hover:\s*#004a99/i);
  assert.match(result.css, /\.p-16\s*\{/);
  assert.match(result.css, /\.rounded-12\s*\{/);
  assert.match(result.css, /\.bg-status-good-deep\s*\{/);
  assert.ok(result.css.includes('.focus-visible\\:outline-ring'));
  assert.ok(result.css.includes('.focus-visible\\:outline-solid'));
  assert.ok(result.css.includes('.hover\\:bg-vattjom-surface-primary-hover'));
});

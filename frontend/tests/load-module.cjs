const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

// Load actual TypeScript modules without starting Next, a browser or a build.
function load(relative, stubs = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const native = createRequire(filename);
  function resolve(name) {
    if (name in stubs) return stubs[name];
    if (name === 'next/dynamic') return () => () => null;
    if (name.startsWith('.') || name.startsWith('@/')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '..', name.slice(2)) : path.resolve(path.dirname(filename), name);
      const file = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(fs.existsSync);
      if (file) return load(file, stubs, cache);
    }
    return native(name);
  }
  new Function('require', 'exports', 'module', compiled)(resolve, module.exports, module);
  return module.exports;
}

module.exports = { load };

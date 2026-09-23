const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./load-module.cjs');
const { SjukUnderlagPanel } = load('components/SjukUnderlagPanel.tsx');
const render = (item) => renderToStaticMarkup(React.createElement(SjukUnderlagPanel, {item}));

test('unknown method is visible without an R12 measurement and unsafe filenames are escaped', () => {
  const html = render({area: {key: 'sjukfranvaro'}, measurement: null, sjuk_kontroll: {
    fler_finns: false, underlag: [{id: 1, filnamn: '<script>.csv', status: 'matmetod_okand',
      enhet: {period: '2026-04-30', serie: [{period: '2026-04-30', total: 40, kvinnor: null, man: 0}]}}],
  }});
  assert.match(html, /Obekräftad mätmetod/);
  assert.match(html, /40 %/);
  assert.match(html, /Saknas/);
  assert.match(html, /0 %/);
  assert.match(html, /ingår inte i R12-serien/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const explanation = html.split('<details')[0];
  assert.match(explanation, /saknar personalmått/);
  assert.match(explanation, /rullande tolv månader/);
  assert.match(explanation, /Procentsiffrorna kan vara riktiga/);
  assert.match(explanation, /Fråga den som tar fram personalrapporten/);
  assert.match(explanation, /leverera ett nytt uttag/);
  assert.doesNotMatch(explanation, /kortet ovan bygger på det importerade/);
});

test('incomplete known data names missing fields; corrupt file does not render values', () => {
  const html = render({area: {key: 'sjukfranvaro'}, measurement: {value_num: 7, details: {
    typ: 'sjukfranvaro', matmetod: 'rullande12', period: '2026-08-31', anstallda: null,
  }}, sjuk_kontroll: {underlag: [{id: 2, filnamn: 'trasig.csv', status: 'ogiltigt_underlag', enhet: null}]}});
  assert.match(html, /Ofullständigt R12-underlag/);
  assert.match(html, /antal anställda/);
  assert.match(html, /Originalet är bevarat/);
  assert.doesNotMatch(html, /<table/);
  assert.equal(render({area: {key: 'ekonomi'}}), '');
});

test('valid current R12 is distinguished from saved files without calling either value wrong', () => {
  const html = render({area: {key: 'sjukfranvaro'}, measurement: {value_num: 6.1, details: {
    typ: 'sjukfranvaro', matmetod: 'rullande12', period: '2026-08-31',
  }}, sjuk_kontroll: {underlag: [{id: 1, filnamn: 'juni.csv', status: 'matmetod_okand',
    enhet: {period: '2026-04-30', serie: [{period: '2026-04-30', total: 5.5}]}}]}});
  assert.match(html, /Sjukfrånvarovärdet i kortet ovan bygger på det importerade R12-underlaget/);
  assert.match(html, /5,5 %/);
  assert.match(html, /inte avgöra om sjukfrånvaron är beräknad/);
});

test('unreadable content directs the user to review the original and does not invent a method problem', () => {
  const html = render({area: {key: 'sjukfranvaro'}, measurement: null, sjuk_kontroll: {
    underlag: [{id: 1, filnamn: 'fel.csv', status: 'ogiltigt_underlag', enhet: null}],
  }});
  const explanation = html.split('<details')[0];
  assert.match(explanation, /format, datum eller mätvärden klarade inte kontrollen/);
  assert.match(explanation, /Be systemförvaltningen granska originalfilen/);
  assert.doesNotMatch(explanation, /saknar personalmått/);
});

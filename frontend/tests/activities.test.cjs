const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./load-module.cjs');

const activity = {
  id: 7,
  text: 'Följ upp frågan',
  klar: false,
  klar_notering: null,
  skapad_at: '2026-09-23T10:00:00Z',
  klar_at: null,
};

test('activity controls appear for open and completed activities', () => {
  const { ActivitiesSection } = load('components/Activities.tsx');
  const html = renderToStaticMarkup(React.createElement(ActivitiesSection, {
    activities: [activity, { ...activity, id: 8, klar: true, klar_notering: 'Gjort', klar_at: activity.skapad_at }],
    onAddActivity: async () => {},
    onMarkKlar: async () => {},
    onEditActivity: async () => {},
  }));
  assert.match(html, /Följ upp frågan/);
  assert.match(html, /Klarmarkera/);
  assert.equal((html.match(/>Ändra</g) || []).length, 2);
  assert.match(html, /Gjort/);
  assert.match(html, /maxLength="4000"/);
});

test('dialog shows the same activity section after question and measurement cards', () => {
  const stubs = {
    'next/link': ({ children, href }) => React.createElement('a', { href }, children),
    '@/components/BrandLockup': { BrandLockup: () => null },
    '@/components/UserMenu': { UserMenu: () => null },
    './SjukUnderlagPanel': { SjukUnderlagPanel: () => null },
    './DetailPanel': { DetailPanel: () => React.createElement('div', null, 'Mätkort') },
    './QuestionPanel': { QuestionPanel: () => React.createElement('div', null, 'Frågekort') },
  };
  const { Dashboard } = load('components/Dashboard.tsx', stubs);
  const area = { id: 2, key: 'verksamhet', namn: 'Verksamhet', short: null, ikon: 'target', questions: [] };
  const measurement = {
    details: null, value_num: 5, value_text: '5', target_num: 5, target_text: '5', bar_max: 10,
    status: 'good', trend_dir: null, trend_good: null, trend_text: '',
  };
  for (const [value, card] of [[null, 'Frågekort'], [measurement, 'Mätkort']]) {
    const html = renderToStaticMarkup(React.createElement(Dashboard, {
      dialogue: {
        id: 1,
        organisation: { namn: 'Testförvaltning' },
        areas: [{ area, measurement: value, activities: [activity], status_historik: [] }],
      },
    }));
    assert.match(html, new RegExp(card));
    assert.match(html, /Följ upp frågan/);
    assert.equal((html.match(/Aktiviteter &amp; åtgärder/g) || []).length, 1);
  }
});

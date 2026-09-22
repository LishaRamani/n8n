// Runs the real BatchConfig.gs against stubbed Google Apps Script services.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script', 'BatchConfig.gs'), 'utf8');

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  ->  ' + JSON.stringify(actual) +
    (ok ? '' : '   (expected ' + JSON.stringify(expected) + ')'));
};

function load(grid, tabName = 'Update webinar batch here') {
  const SpreadsheetApp = {
    openById: () => ({
      getSheetByName: (n) => (n === tabName
        ? { getDataRange: () => ({ getDisplayValues: () => grid }) }
        : null)
    })
  };
  const ContentService = {
    MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
    createTextOutput: (t) => ({ _t: t, setMimeType(m) { this._mime = m; return this; } })
  };
  const Logger = { log() {} };
  const sandbox = { SpreadsheetApp, ContentService, Logger, Date, JSON, String, Number, Object, RegExp, isNaN };
  return new Function(...Object.keys(sandbox),
    src + '\n;return { doGet, readBatch_, parseStartsAt_ };')(...Object.values(sandbox));
}

// Exactly what the live tab holds today, including the reference row the team
// keeps below the data.
const HEADERS = ['Zoom Link', 'WA Group Link', 'Event Date', 'Event Time'];
const LIVE = [
  'https://us06web.zoom.us/meeting/register/VdcjjVFSS9CODREjFIVPAQ',
  'https://chat.whatsapp.com/IYbbeFiMqgmHWnf3KkiCDR',
  '23 September 2026',
  '7:00 pm'
];
const REFERENCE = ['FORMAT : (Just for reference, not used for automation )', '', '5 Sep 2026', '11:00 am'];

console.log('--- Reads the live row from the real tab shape ---');
{
  const env = load([HEADERS, LIVE, [], REFERENCE]);
  const b = env.readBatch_();
  check('zoom link', b.zoomUrl, LIVE[0]);
  check('community link', b.communityUrl, LIVE[1]);
  check('date verbatim', b.date, '23 September 2026');
  check('time verbatim', b.time, '7:00 pm');
}
{
  // The reference row sits ABOVE the real one: still skipped, because it
  // carries no http link.
  const env = load([HEADERS, REFERENCE, LIVE]);
  check('skips the FORMAT row wherever it sits', env.readBatch_().zoomUrl, LIVE[0]);
}
{
  const env = load([HEADERS, ['   ' + LIVE[0] + '  ', ' g ', '  23 September 2026 ', ' 7:00 pm ']]);
  check('trims each cell', env.readBatch_().date, '23 September 2026');
}

console.log('\n--- Finding the columns ---');
{
  // Header lookup wins, even when the columns are reordered.
  const env = load([
    ['Event Date', 'Event Time', 'Zoom Link', 'WA Group Link'],
    ['23 September 2026', '7:00 pm', LIVE[0], LIVE[1]]
  ]);
  const b = env.readBatch_();
  check('follows headers, not position', b.zoomUrl, LIVE[0]);
  check('date from the right column', b.date, '23 September 2026');
}
{
  // Headers renamed: fall back to the documented positions.
  const env = load([['a', 'b', 'c', 'd'], LIVE]);
  check('falls back to column order', env.readBatch_().communityUrl, LIVE[1]);
}

console.log('\n--- startsAt, the instant the countdown runs to ---');
{
  const env = load([HEADERS, LIVE]);
  const p = env.parseStartsAt_;
  // 7:00 pm IST on 23 Sep 2026 is 13:30 UTC the same day.
  check('live values', p('23 September 2026', '7:00 pm'), '2026-09-23T13:30:00.000Z');
  check('noon slot', p('19 September 2026', '12:00 pm'), '2026-09-19T06:30:00.000Z');
  check('short month', p('23 Sep 2026', '7:00 pm'), '2026-09-23T13:30:00.000Z');
  check('slashed date', p('23/09/2026', '7:00 pm'), '2026-09-23T13:30:00.000Z');
  check('leading weekday', p('Wed, 23 September 2026', '7:00 pm'), '2026-09-23T13:30:00.000Z');
  check('ordinal suffix', p('23rd September 2026', '7:00 pm'), '2026-09-23T13:30:00.000Z');
  check('month first', p('September 23, 2026', '7:00 pm'), '2026-09-23T13:30:00.000Z');
  check('uppercase meridiem', p('23 September 2026', '7:00 PM'), '2026-09-23T13:30:00.000Z');
  check('no minutes', p('23 September 2026', '7 pm'), '2026-09-23T13:30:00.000Z');
  check('dotted meridiem', p('23 September 2026', '7:00 p.m.'), '2026-09-23T13:30:00.000Z');
  check('24-hour time', p('23 September 2026', '19:00'), '2026-09-23T13:30:00.000Z');
  check('midnight-crossing slot', p('23 September 2026', '12:00 am'), '2026-09-22T18:30:00.000Z');
}
{
  const p = load([HEADERS, LIVE]).parseStartsAt_;
  // Anything unrecognised returns null, and the timer then renders nothing.
  check('empty date', p('', '7:00 pm'), null);
  check('empty time', p('23 September 2026', ''), null);
  check('nonsense month', p('23 Smarch 2026', '7:00 pm'), null);
  check('nonsense time', p('23 September 2026', 'evening'), null);
  check('impossible hour', p('23 September 2026', '29:00'), null);
  check('free text', p('next Wednesday', 'after lunch'), null);
}

console.log('\n--- What the pages receive ---');
{
  const env = load([HEADERS, LIVE]);
  const body = JSON.parse(env.doGet({}) ._t);
  check('ok', body.ok, true);
  check('carries the zoom link', body.zoomUrl, LIVE[0]);
  check('carries the community link', body.communityUrl, LIVE[1]);
  check('carries startsAt', body.startsAt, '2026-09-23T13:30:00.000Z');
}
{
  const env = load([HEADERS, LIVE]);
  const out = env.doGet({ parameter: { callback: 'wbsCb12' } });
  check('wraps in the callback', out._t.slice(0, 8), 'wbsCb12(');
  check('served as javascript', out._mime, 'JAVASCRIPT');
}
{
  // A crafted callback name must never be echoed into the page.
  const env = load([HEADERS, LIVE]);
  const out = env.doGet({ parameter: { callback: 'alert(1)//' } });
  check('rejects a bad callback', out._mime, 'JSON');
}

console.log('\n--- When the sheet cannot be read ---');
{
  const env = load([HEADERS, [REFERENCE[0], '', '', '']]);
  const body = JSON.parse(env.doGet({})._t);
  check('no live row -> ok:false', body.ok, false);
  check('says why', /has a Zoom Link/.test(body.error), true);
}
{
  const env = load([HEADERS], 'Some other tab');
  const body = JSON.parse(env.doGet({})._t);
  check('missing tab -> ok:false', body.ok, false);
  check('names the tab', /Update webinar batch here/.test(body.error), true);
}
{
  const env = load([HEADERS]);
  const body = JSON.parse(env.doGet({})._t);
  check('header only -> ok:false', body.ok, false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

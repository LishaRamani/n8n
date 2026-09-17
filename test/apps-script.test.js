// Runs the real Code.gs against stubbed Google Apps Script services.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script', 'Code.gs'), 'utf8');

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  ->  ' + JSON.stringify(actual) +
    (ok ? '' : '   (expected ' + JSON.stringify(expected) + ')'));
};

function load(grid, tabName = 'Webinar Automation Sheet') {
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
  const sandbox = { SpreadsheetApp, ContentService, Logger, Date, JSON, String, Number, Object, RegExp };
  return new Function(...Object.keys(sandbox),
    src + '\n;return { doGet, readWebinarDate_ };')(...Object.values(sandbox));
}

const HEADERS = ['Webinar Code', 'Date', 'Time', 'Webinar date', 'Zoom URL', 'Group Link'];
const ROW = ['CCM 21/09/26', '21/09/2026', '7:30 PM - 9:30 PM', 'Monday, 21 September 2026', 'z', 'g'];

console.log('--- Reads column D exactly as typed ---');
{
  const env = load([HEADERS, ROW]);
  check('returns the cell verbatim', env.readWebinarDate_(), 'Monday, 21 September 2026');
}
{
  // Whatever they type is what shows - no reformatting, no date parsing.
  const env = load([HEADERS, [...ROW.slice(0, 3), '  Sat 3 Jan 2099 — 8pm IST  ', 'z', 'g']]);
  check('no reformatting, only trimmed', env.readWebinarDate_(), 'Sat 3 Jan 2099 — 8pm IST');
}

console.log('\n--- Finding the column ---');
{
  // Header lookup wins, even if the column moves.
  const env = load([
    ['Date', 'Webinar date', 'Zoom URL'],
    ['21/09/2026', 'Monday, 21 September 2026', 'z']
  ]);
  check('follows the header, not position', env.readWebinarDate_(), 'Monday, 21 September 2026');
}
{
  // Header renamed: fall back to column D by position.
  const env = load([
    ['Webinar Code', 'Date', 'Time', 'When it happens', 'Zoom URL'],
    ['CCM', '21/09/2026', '7:30 PM', 'Monday, 21 September 2026', 'z']
  ]);
  check('falls back to column D', env.readWebinarDate_(), 'Monday, 21 September 2026');
}
{
  const env = load([HEADERS, ['a', 'b', 'c', 'Case Insensitive', 'z', 'g']].map(r => r));
  const env2 = load([['webinar DATE'], ['Tuesday, 1 January 2030']]);
  check('header match ignores case', env2.readWebinarDate_(), 'Tuesday, 1 January 2030');
  check('still reads D', env.readWebinarDate_(), 'Case Insensitive');
}

console.log('\n--- Blank rows ---');
{
  const env = load([HEADERS, ['', '', '', '', '', ''], ROW]);
  check('skips an empty row', env.readWebinarDate_(), 'Monday, 21 September 2026');
}

console.log('\n--- Errors are reported, not thrown ---');
{
  const env = load([HEADERS, ['CCM', '21/09/2026', '7:30 PM', '', 'z', 'g']]);
  const out = JSON.parse(env.doGet({ parameter: {} })._t);
  check('ok:false when D is empty', out.ok, false);
  check('says which column', /Webinar date/.test(out.error), true);
}
{
  const env = load([HEADERS, ROW], 'Some Other Tab');
  const out = JSON.parse(env.doGet({ parameter: {} })._t);
  check('ok:false when the tab is missing', out.ok, false);
  check('names the tab', /not found/.test(out.error), true);
}
{
  const env = load([HEADERS]);
  check('ok:false with no data rows', JSON.parse(env.doGet({ parameter: {} })._t).ok, false);
}

console.log('\n--- doGet output ---');
{
  const env = load([HEADERS, ROW]);

  const plain = env.doGet({ parameter: {} });
  check('plain call is JSON', plain._mime, 'JSON');
  check('plain call carries the date', JSON.parse(plain._t).date, 'Monday, 21 September 2026');

  const jsonp = env.doGet({ parameter: { callback: 'wdsCb123' } });
  check('JSONP mime is JAVASCRIPT', jsonp._mime, 'JAVASCRIPT');
  check('JSONP wraps in the callback', jsonp._t.slice(0, 9), 'wdsCb123(');
  check('JSONP closes', jsonp._t.slice(-2), ');');

  // The callback name lands inside a <script> body, so it must be validated.
  const evil = env.doGet({ parameter: { callback: 'x);alert(document.cookie);//' } });
  check('rejects an injected callback', evil._mime, 'JSON');
  check('injected text never echoed', /alert/.test(evil._t), false);
  check('rejects a dotted name', env.doGet({ parameter: { callback: 'a.b' } })._mime, 'JSON');
  check('accepts a plain name', env.doGet({ parameter: { callback: '_cb$1' } })._mime, 'JAVASCRIPT');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

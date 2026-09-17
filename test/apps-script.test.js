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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function makeEnv(grid, displayGrid) {
  const Utilities = {
    // Enough of Java's SimpleDateFormat for the patterns Code.gs uses.
    formatDate(d, tz, pattern) {
      const p2 = (n) => String(n).padStart(2, '0');
      return pattern
        .replace(/EEEE/g, DAYS[d.getDay()])
        .replace(/MMMM/g, MONTHS[d.getMonth()])
        .replace(/MMM/g, MONTHS[d.getMonth()].slice(0, 3))
        .replace(/yyyy/g, d.getFullYear())
        .replace(/MM/g, p2(d.getMonth() + 1))
        .replace(/dd/g, p2(d.getDate()))
        .replace(/\bd\b/g, d.getDate());
    }
  };
  const range = {
    getValues: () => grid,
    getDisplayValues: () => displayGrid || grid.map(r => r.map(c =>
      Object.prototype.toString.call(c) === '[object Date]'
        ? `${String(c.getDate()).padStart(2,'0')}/${String(c.getMonth()+1).padStart(2,'0')}/${c.getFullYear()}`
        : String(c)))
  };
  const SpreadsheetApp = {
    openById: () => ({ getSheetByName: (n) => (n === 'Webinar Automation Sheet' ? { getDataRange: () => range } : null) })
  };
  let lastMime = null;
  const ContentService = {
    MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
    createTextOutput: (t) => ({ _t: t, setMimeType(m) { lastMime = m; this._mime = m; return this; } })
  };
  const Logger = { log() {} };
  const sandbox = { Utilities, SpreadsheetApp, ContentService, Logger, Date, JSON, String, Number, Object, isNaN, RegExp };
  const fn = new Function(...Object.keys(sandbox), src + '\n;return { doGet, buildPayload_ };');
  return fn(...Object.values(sandbox));
}

const HEADERS = ['Webinar Code','Date','Time','Webinar date','Zoom URL','Group Link'];

console.log('--- Date stored as a real spreadsheet date ---');
{
  const env = makeEnv([
    HEADERS,
    ['CCM 21/09/26', new Date(2099, 8, 21), '7:30 PM - 9:30 PM', 'Monday, 21 September 2099',
     'https://zoom.example/reg', 'https://chat.whatsapp.com/xyz']
  ]);
  const t = env.buildPayload_().tokens;
  check('WEBINAR_DATE', t.WEBINAR_DATE, 'Monday 21 Sep, 2099');
  check('WEBINAR_DATE_ISO', t.WEBINAR_DATE_ISO, '2099-09-21');
  check('WEBINAR_DATE_SHORT', t.WEBINAR_DATE_SHORT, '21 Sep');
  check('WEBINAR_DAY', t.WEBINAR_DAY, 'Monday');
  check('sheet column kept verbatim', t.WEBINAR_DATE_LONG, 'Monday, 21 September 2099');
  check('WEBINAR_TIME', t.WEBINAR_TIME, '7:30 PM - 9:30 PM');
  check('WEBINAR_START_TIME', t.WEBINAR_START_TIME, '7:30 PM');
  check('ZOOM_URL', t.ZOOM_URL, 'https://zoom.example/reg');
  check('WEBINAR_CODE', t.WEBINAR_CODE, 'CCM 21/09/26');
}

console.log('\n--- Date stored as DD/MM/YYYY text ---');
{
  const env = makeEnv([HEADERS, ['CCM','21/09/2099','7:30 PM - 9:30 PM','','','']]);
  check('parses DD/MM as day-first', env.buildPayload_().tokens.WEBINAR_DATE, 'Monday 21 Sep, 2099');
}
{
  const env = makeEnv([HEADERS, ['X','03/04/2099','','','','']]);
  check('03/04 is 3 April not 4 March', env.buildPayload_().tokens.WEBINAR_DATE, 'Friday 3 Apr, 2099');
}

console.log('\n--- Picking the row ---');
{
  const env = makeEnv([
    ['Webinar Code','Date'],
    ['PAST','01/01/2020'],
    ['NEXT','25/12/2099'],
    ['LATER','31/12/2099']
  ]);
  const p = env.buildPayload_();
  check('skips past rows', p.tokens.WEBINAR_CODE, 'NEXT');
  check('flags a real upcoming match', p.matchedUpcoming, true);
}
{
  const env = makeEnv([['Webinar Code','Date'], ['A','01/01/2020'], ['B','02/02/2021']]);
  const p = env.buildPayload_();
  check('all past -> last row', p.tokens.WEBINAR_CODE, 'B');
  check('flags the fallback', p.matchedUpcoming, false);
}

console.log('\n--- doGet output ---');
{
  const env = makeEnv([HEADERS, ['CCM','21/09/2099','7:30 PM - 9:30 PM','','','']]);

  const plain = env.doGet({ parameter: {} });
  check('plain call is JSON', plain._mime, 'JSON');
  check('plain call parses', JSON.parse(plain._t).ok, true);

  const jsonp = env.doGet({ parameter: { callback: 'wdsCb123' } });
  check('JSONP mime is JAVASCRIPT', jsonp._mime, 'JAVASCRIPT');
  check('JSONP wraps in the callback', jsonp._t.slice(0, 9), 'wdsCb123(');
  check('JSONP ends correctly', jsonp._t.slice(-2), ');');

  // A callback name is injected straight into a <script> body, so it must be rejected.
  const evil = env.doGet({ parameter: { callback: 'x);alert(document.cookie);//' } });
  check('rejects an injected callback', evil._mime, 'JSON');
  check('injected text never echoed', /alert/.test(evil._t), false);
  check('rejects a callback with a dot', env.doGet({ parameter: { callback: 'a.b' } })._mime, 'JSON');
  check('accepts a plain name', env.doGet({ parameter: { callback: '_cb$1' } })._mime, 'JAVASCRIPT');
}

console.log('\n--- Failure is reported, not thrown ---');
{
  const env = makeEnv([['Webinar Code'], ['CCM']]);
  const out = JSON.parse(env.doGet({ parameter: {} })._t);
  check('ok:false when no date', out.ok, false);
  check('explains why', /usable Date/.test(out.error), true);
  check('still returns tokens object', typeof out.tokens, 'object');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

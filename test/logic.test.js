const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'systeme-io', 'webinar-date-sync.html'), 'utf8');

function slice(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  if (a === -1 || b === -1) throw new Error('marker not found: ' + startMarker);
  return src.slice(a, b);
}

// Pull the REAL shipped code: token regex + fill, CSV parsing, date logic.
const tokenPart = slice('var TOKEN_RE =', 'var SKIP_TAGS');
const fillPart  = slice('function fill(', 'function applyTokens');
const body = [
  'var TIMEZONE_OFFSET_HOURS = 5.5;',
  tokenPart,
  fillPart,
  slice('function parseCsv(', '/* ---'),
  slice('var MONTHS_SHORT', 'function buildTokens('),
  slice('function buildTokens(', '/* ---'),
  'module.exports = { parseCsv, toObjects, buildTokens, parseDate, fill };'
].join('\n');

const mod = { exports: {} };
new Function('module', 'exports', 'Date', body)(mod, mod.exports, Date);
const { parseCsv, toObjects, buildTokens, parseDate, fill } = mod.exports;

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  ->  ' + JSON.stringify(actual) +
    (ok ? '' : '   (expected ' + JSON.stringify(expected) + ')'));
}

// ---- Real data from the "Webinar Automation Sheet" tab ----
const csv = [
  'Webinar Code,Date,Time,Webinar date,Zoom URL,Group Link',
  'CCM 21/09/26,21/09/2026,7:30 PM - 9:30 PM,"Monday, 21 September 2026",https://us06web.zoom.us/meeting/register/Cuq7YoXgT_aNPXbRwtoOxw,https://chat.whatsapp.com/LHfFzvmMxPU5CROmsmMDlP'
].join('\n');

const rows = toObjects(parseCsv(csv));
check('row count', rows.length, 1);
check('header mapped', rows[0]['Webinar Code'], 'CCM 21/09/26');

const t = buildTokens(rows);
check('WEBINAR_DATE', t.WEBINAR_DATE, 'Monday 21 Sep, 2026');
check('WEBINAR_DATE_LONG', t.WEBINAR_DATE_LONG, 'Monday, 21 September 2026');
check('WEBINAR_DATE_SHORT', t.WEBINAR_DATE_SHORT, '21 Sep');
check('WEBINAR_DATE_ISO', t.WEBINAR_DATE_ISO, '2026-09-21');
check('WEBINAR_DAY', t.WEBINAR_DAY, 'Monday');
check('WEBINAR_TIME', t.WEBINAR_TIME, '7:30 PM - 9:30 PM');
check('WEBINAR_START_TIME', t.WEBINAR_START_TIME, '7:30 PM');
check('WEBINAR_END_TIME', t.WEBINAR_END_TIME, '9:30 PM');
check('ZOOM_URL token', t.ZOOM_URL, 'https://us06web.zoom.us/meeting/register/Cuq7YoXgT_aNPXbRwtoOxw');
check('GROUP_LINK token', t.GROUP_LINK, 'https://chat.whatsapp.com/LHfFzvmMxPU5CROmsmMDlP');
check('WEBINAR_CODE token', t.WEBINAR_CODE, 'CCM 21/09/26');

// ---- Quoted field containing a comma must not split ----
check('comma inside quotes', parseCsv('a,"x, y",c')[0][2], 'c');
check('escaped quote', parseCsv('a,"he said ""hi""",c')[0][1], 'he said "hi"');

// ---- Multiple rows: picks the next upcoming, skips past dates ----
const multi = toObjects(parseCsv([
  'Webinar Code,Date,Time',
  'OLD,01/01/2020,6:00 PM - 7:00 PM',
  'NEXT,25/12/2099,7:30 PM - 9:30 PM',
  'LATER,31/12/2099,8:00 PM - 9:00 PM'
].join('\n')));
check('skips past rows', buildTokens(multi).WEBINAR_CODE, 'NEXT');

// ---- All dates in the past: falls back to the last row, never blank ----
const allPast = toObjects(parseCsv([
  'Webinar Code,Date,Time',
  'A,01/01/2020,6:00 PM - 7:00 PM',
  'B,02/02/2021,6:00 PM - 7:00 PM'
].join('\n')));
check('falls back to last row', buildTokens(allPast).WEBINAR_CODE, 'B');

// ---- DD/MM vs MM/DD: 03/04/2026 must be 3 April, not 4 March ----
check('DD/MM not MM/DD', buildTokens(toObjects(parseCsv(
  'Date\n03/04/2026'))).WEBINAR_DATE, 'Friday 3 Apr, 2026');

// ---- ISO and long-form dates also parse ----
check('ISO date', buildTokens(toObjects(parseCsv('Date\n2026-09-21'))).WEBINAR_DATE, 'Monday 21 Sep, 2026');
check('long-form date only', buildTokens(toObjects(parseCsv(
  'Webinar date\n"Monday, 21 September 2026"'))).WEBINAR_DATE, 'Monday 21 Sep, 2026');

// ---- Empty / unusable sheet returns null so the fallback kicks in ----
check('no dated rows -> null', buildTokens(toObjects(parseCsv('Webinar Code\nCCM'))), null);

// ---- Placeholder substitution, both syntaxes, unknown left untouched ----
check('fill curly', fill('Join us on {{WEBINAR_DATE}}!', t), 'Join us on Monday 21 Sep, 2026!');
check('fill square', fill('[[WEBINAR_TIME]]', t), '7:30 PM - 9:30 PM');
check('fill spaced', fill('{{ WEBINAR_DAY }}', t), 'Monday');
check('two in one string', fill('{{WEBINAR_DATE}} at {{WEBINAR_TIME}}', t),
  'Monday 21 Sep, 2026 at 7:30 PM - 9:30 PM');
check('unknown token untouched', fill('{{NOPE}}', t), '{{NOPE}}');
check('href substitution', fill('{{ZOOM_URL}}', t), 'https://us06web.zoom.us/meeting/register/Cuq7YoXgT_aNPXbRwtoOxw');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

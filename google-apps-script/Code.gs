/**
 * Webinar date -> systeme.io landing page
 *
 * Reads the Webinar Automation Sheet tab and serves it as JSONP, so the
 * landing page can show a live date without the spreadsheet being public.
 *
 * Deploy:  Deploy > New deployment > Web app
 *            Execute as:      Me
 *            Who has access:  Anyone
 *          Copy the /exec URL into APPS_SCRIPT_URL in the landing page snippet.
 *
 * Re-deploy after editing: Deploy > Manage deployments > pencil > Version: New
 * (editing the code alone does not change what the live URL serves).
 */

var SHEET_ID = '18lW19qAZRtbnjctCEtT8iegjSvg0z5p0MHnY-tdH5Jo';
var TAB_NAME = 'Webinar Automation Sheet';
var TIMEZONE = 'Asia/Kolkata';

function doGet(e) {
  var payload;
  try {
    payload = buildPayload_();
  } catch (err) {
    payload = { ok: false, error: String((err && err.message) || err), tokens: {} };
  }

  var json = JSON.stringify(payload);
  var callback = e && e.parameter && e.parameter.callback;

  // JSONP. The name is validated so a crafted callback cannot inject script.
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function buildPayload_() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME);
  if (!sheet) throw new Error('Tab "' + TAB_NAME + '" not found');

  var range = sheet.getDataRange();
  var values = range.getValues();
  var display = range.getDisplayValues();
  if (values.length < 2) throw new Error('No data rows in "' + TAB_NAME + '"');

  var headers = display[0].map(function (h) { return String(h).trim(); });

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = { _raw: {}, _text: {} };
    var any = false;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      row._raw[headers[c]] = values[r][c];
      row._text[headers[c]] = String(display[r][c]).trim();
      if (row._text[headers[c]]) any = true;
    }
    if (any) rows.push(row);
  }

  var dated = rows.filter(function (row) { return dateOf_(row) !== null; });
  if (!dated.length) throw new Error('No row has a usable Date');

  var today = new Date();
  today = new Date(Utilities.formatDate(today, TIMEZONE, 'yyyy/MM/dd'));

  var chosen = null;
  for (var i = 0; i < dated.length; i++) {
    if (dateOf_(dated[i]).getTime() >= today.getTime()) { chosen = dated[i]; break; }
  }
  var matchedUpcoming = chosen !== null;
  if (!chosen) chosen = dated[dated.length - 1];

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    source: TAB_NAME,
    matchedUpcoming: matchedUpcoming,
    tokens: tokensFor_(chosen)
  };
}

function dateOf_(row) {
  var names = ['Date', 'Webinar date', 'Webinar Date'];
  for (var i = 0; i < names.length; i++) {
    for (var key in row._raw) {
      if (key.toLowerCase() !== names[i].toLowerCase()) continue;

      var raw = row._raw[key];
      if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
        return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
      }

      var parsed = parseText_(row._text[key]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseText_(text) {
  if (!text) return null;
  text = String(text).trim();
  if (!text) return null;

  var m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // DD/MM/YYYY
  if (m) {
    var year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(m[2]) - 1, Number(m[1]));
  }

  m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  var loose = new Date(text.replace(/(\d)(st|nd|rd|th)/gi, '$1')); // "Monday, 21 September 2026"
  if (!isNaN(loose.getTime())) {
    return new Date(loose.getFullYear(), loose.getMonth(), loose.getDate());
  }
  return null;
}

function tokensFor_(row) {
  var tokens = {};

  // Every column becomes a placeholder: "Speaker Name" -> {{SPEAKER_NAME}}
  for (var key in row._text) {
    var name = String(key).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (name) tokens[name] = row._text[key];
  }

  var when = dateOf_(row);
  if (when) {
    tokens.WEBINAR_DAY        = Utilities.formatDate(when, TIMEZONE, 'EEEE');
    tokens.WEBINAR_DATE       = Utilities.formatDate(when, TIMEZONE, 'EEEE d MMM, yyyy');
    tokens.WEBINAR_DATE_SHORT = Utilities.formatDate(when, TIMEZONE, 'd MMM');
    tokens.WEBINAR_DATE_ISO   = Utilities.formatDate(when, TIMEZONE, 'yyyy-MM-dd');
    if (!tokens.WEBINAR_DATE_LONG) {
      tokens.WEBINAR_DATE_LONG = Utilities.formatDate(when, TIMEZONE, 'EEEE, d MMMM yyyy');
    }
  }

  var time = tokens.TIME || tokens.WEBINAR_TIME || '';
  tokens.WEBINAR_TIME = time;
  if (time) {
    var parts = time.split(/\s*[-–—]\s*|\s+to\s+/i);
    tokens.WEBINAR_START_TIME = (parts[0] || '').trim();
    tokens.WEBINAR_END_TIME = (parts[1] || '').trim();
  }
  return tokens;
}

/** Run this once from the editor to check the output before deploying. */
function testRun() {
  Logger.log(JSON.stringify(buildPayload_(), null, 2));
}

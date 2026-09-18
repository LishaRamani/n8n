/**
 * Webinar batch -> FlexiFunnels + Lovable
 *
 * Reads the one live row of the "Update webinar batch here" tab and serves it,
 * so every page can show the current date, time, Zoom link and WhatsApp
 * community link without the sheet being public.
 *
 * Change that row, reload a page, done. Nothing else to publish anywhere.
 *
 * Deploy:  Deploy > New deployment > Web app
 *            Execute as:      Me
 *            Who has access:  Anyone
 *          Copy the /exec URL into BATCH_CONFIG_URL in the page snippet.
 *
 * After editing this file: Deploy > Manage deployments > pencil > Version: New.
 * Editing the code alone does not change what the live URL serves.
 *
 * This is separate from Code.gs on purpose - that one serves a different
 * spreadsheet for the systeme.io page and has its own deployment.
 */

var BATCH_SHEET_ID = '1IETAMKV4rBiGWTllQ_Ek5qVKVV2fRcx-94IMfVAAxho';
var BATCH_TAB_NAME = 'Update webinar batch here';

// Column headers, and the position to fall back to if a header is renamed.
var BATCH_FIELDS = [
  { key: 'zoomUrl',      header: 'Zoom Link',     index: 0 },
  { key: 'communityUrl', header: 'WA Group Link', index: 1 },
  { key: 'date',         header: 'Event Date',    index: 2 },
  { key: 'time',         header: 'Event Time',    index: 3 }
];

var MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

var IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function doGet(e) {
  var payload;
  try {
    var batch = readBatch_();
    payload = {
      ok: true,
      date: batch.date,
      time: batch.time,
      zoomUrl: batch.zoomUrl,
      communityUrl: batch.communityUrl,
      startsAt: parseStartsAt_(batch.date, batch.time),
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    payload = { ok: false, error: String((err && err.message) || err) };
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

/**
 * The live row is the first one carrying a real Zoom URL. That rule skips the
 * "FORMAT : (Just for reference...)" row the team keeps below the data, without
 * needing to know which row number it sits on.
 */
function readBatch_() {
  var sheet = SpreadsheetApp.openById(BATCH_SHEET_ID).getSheetByName(BATCH_TAB_NAME);
  if (!sheet) throw new Error('Tab "' + BATCH_TAB_NAME + '" not found');

  // Display values, so each cell reads exactly as it looks in the sheet.
  var rows = sheet.getDataRange().getDisplayValues();
  if (rows.length < 2) throw new Error('No rows below the header in "' + BATCH_TAB_NAME + '"');

  var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var cols = {};
  BATCH_FIELDS.forEach(function (f) {
    var at = headers.indexOf(f.header.toLowerCase());
    cols[f.key] = at === -1 ? f.index : at;
  });

  for (var r = 1; r < rows.length; r++) {
    var zoom = cell_(rows[r], cols.zoomUrl);
    if (!/^https?:\/\//i.test(zoom)) continue;
    return {
      zoomUrl: zoom,
      communityUrl: cell_(rows[r], cols.communityUrl),
      date: cell_(rows[r], cols.date),
      time: cell_(rows[r], cols.time)
    };
  }
  throw new Error('No row in "' + BATCH_TAB_NAME + '" has a Zoom Link');
}

function cell_(row, index) {
  var v = row[index];
  return String(v === undefined || v === null ? '' : v).trim();
}

/**
 * Turns the date and time cells into an exact instant, for the countdown timer.
 * The cells are written for humans, so several spellings have to work. Anything
 * unrecognised returns null and the timer simply does not render - a wrong
 * countdown would be worse than none.
 *
 * Times are read as IST, which is what the team means when they type them.
 */
function parseStartsAt_(dateText, timeText) {
  var d = String(dateText || '').trim().replace(/^[A-Za-z]+,\s*/, '');  // drop a leading "Sat, "
  var t = String(timeText || '').trim();
  if (!d || !t) return null;

  var y, monthIndex, day, m;

  if ((m = d.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/))) {
    day = +m[1]; monthIndex = +m[2] - 1; y = +m[3];                     // 19/09/2026
  } else if ((m = d.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})$/))) {
    day = +m[1]; monthIndex = monthIndex_(m[2]); y = +m[3];             // 19 September 2026
  } else if ((m = d.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    monthIndex = monthIndex_(m[1]); day = +m[2]; y = +m[3];             // September 19, 2026
  } else {
    return null;
  }
  if (monthIndex === null || !day || day > 31) return null;

  var hour, minute;
  if ((m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i))) {  // 12:00 pm, 7 PM
    hour = +m[1] % 12;
    minute = m[2] ? +m[2] : 0;
    if (m[3].toLowerCase() === 'p') hour += 12;
  } else if ((m = t.match(/^(\d{1,2}):(\d{2})$/))) {                    // 19:00
    hour = +m[1]; minute = +m[2];
  } else {
    return null;
  }
  if (hour > 23 || minute > 59) return null;

  return new Date(Date.UTC(y, monthIndex, day, hour, minute) - IST_OFFSET_MS).toISOString();
}

function monthIndex_(name) {
  var key = String(name || '').slice(0, 3).toLowerCase();
  return MONTHS[key] === undefined ? null : MONTHS[key];
}

/** Run this once from the editor to see exactly what the pages will receive. */
function testRun() {
  var batch = readBatch_();
  Logger.log(JSON.stringify({
    date: batch.date,
    time: batch.time,
    zoomUrl: batch.zoomUrl,
    communityUrl: batch.communityUrl,
    startsAt: parseStartsAt_(batch.date, batch.time)
  }, null, 2));
}

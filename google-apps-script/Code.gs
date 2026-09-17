/**
 * Webinar date -> systeme.io landing page
 *
 * Reads the "Webinar date" cell (column D) of the Webinar Automation Sheet tab
 * and serves it, so the landing page can show it without the sheet being public.
 *
 * Whatever is typed in that cell is what appears on the page, exactly as typed.
 *
 * Deploy:  Deploy > New deployment > Web app
 *            Execute as:      Me
 *            Who has access:  Anyone
 *          Copy the /exec URL into WEBINAR_DATE_URL in the landing page snippet.
 *
 * After editing this file: Deploy > Manage deployments > pencil > Version: New.
 * Editing the code alone does not change what the live URL serves.
 */

var SHEET_ID    = '18lW19qAZRtbnjctCEtT8iegjSvg0z5p0MHnY-tdH5Jo';
var TAB_NAME    = 'Webinar Automation Sheet';
var COLUMN_NAME = 'Webinar date';  // column D
var COLUMN_FALLBACK_INDEX = 3;     // 0-based: D, used if the header is renamed

function doGet(e) {
  var payload;
  try {
    payload = { ok: true, date: readWebinarDate_(), updatedAt: new Date().toISOString() };
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

function readWebinarDate_() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME);
  if (!sheet) throw new Error('Tab "' + TAB_NAME + '" not found');

  // Display values, so the cell reads exactly as it looks in the sheet.
  var rows = sheet.getDataRange().getDisplayValues();
  if (rows.length < 2) throw new Error('No rows below the header in "' + TAB_NAME + '"');

  var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = headers.indexOf(COLUMN_NAME.toLowerCase());
  if (col === -1) col = COLUMN_FALLBACK_INDEX;

  for (var r = 1; r < rows.length; r++) {
    var value = String(rows[r][col] === undefined ? '' : rows[r][col]).trim();
    if (value) return value;
  }
  throw new Error('Column "' + COLUMN_NAME + '" has no value');
}

/** Run this once from the editor to see what the page will show. */
function testRun() {
  Logger.log(readWebinarDate_());
}

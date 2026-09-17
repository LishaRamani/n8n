const fs = require('fs');
const { JSDOM } = require('jsdom');

const snippet = fs.readFileSync(require('path').join(__dirname, '..', 'systeme-io', 'webinar-date-sync.html'), 'utf8');
const scriptSrc = snippet.slice(snippet.indexOf('<script>') + 8, snippet.lastIndexOf('</script>'));

const CSV = [
  'Webinar Code,Date,Time,Webinar date,Zoom URL,Group Link',
  'CCM 21/09/26,21/12/2099,7:30 PM - 9:30 PM,"Monday, 21 December 2099",https://zoom.example/reg,https://chat.whatsapp.com/abc'
].join('\n');

// A stand-in for the systeme.io page: styled text blocks + a button link.
const PAGE = `<!doctype html><html><body>
  <div class="date-box"><strong style="color:#111">{{WEBINAR_DATE}}</strong></div>
  <div class="time-box"><span>{{WEBINAR_TIME}}</span></div>
  <div class="mixed">Doors open {{WEBINAR_START_TIME}} on {{WEBINAR_DAY}}</div>
  <a id="cta" href="{{ZOOM_URL}}">REGISTER FREE NOW</a>
  <div class="untouched">No placeholder here</div>
  <div class="unknown">{{NOT_A_COLUMN}}</div>
</body></html>`;

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  ->  ' + JSON.stringify(actual) +
    (ok ? '' : '   (expected ' + JSON.stringify(expected) + ')'));
};

function run(fetchImpl, label, assert) {
  const dom = new JSDOM(PAGE, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = fetchImpl;
  w.eval(scriptSrc);
  return new Promise((resolve) => {
    setTimeout(() => { assert(w.document, w); resolve(); }, 4500);
  });
}

// Drives the JSONP path: point the snippet at a URL, intercept the injected
// <script>, and answer on the callback the way Apps Script would.
function runJsonp(respond, assert) {
  const src = scriptSrc.replace(
    "var APPS_SCRIPT_URL = '';",
    "var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/TEST/exec';");
  if (src === scriptSrc) throw new Error('could not point the snippet at an Apps Script URL');

  const dom = new JSDOM(PAGE, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const head = w.document.head;
  const realAppend = head.appendChild.bind(head);
  head.appendChild = function (node) {
    if (node && node.tagName === 'SCRIPT' && node.src) {
      const name = /[?&]callback=([^&]+)/.exec(node.src);
      setTimeout(() => respond(w, name && name[1], node), 0);
      return node;                       // never actually fetched
    }
    return realAppend(node);
  };
  w.eval(src);
  return new Promise((resolve) => {
    setTimeout(() => { assert(w.document, w); resolve(); }, 4500);
  });
}

(async () => {
  console.log('--- Scenario 1: sheet reachable ---');
  await run(
    () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(CSV) }),
    'ok',
    (doc) => {
      check('date rendered', doc.querySelector('.date-box').textContent, 'Monday 21 Dec, 2099');
      check('time rendered', doc.querySelector('.time-box').textContent, '7:30 PM - 9:30 PM');
      check('mixed line', doc.querySelector('.mixed').textContent, 'Doors open 7:30 PM on Monday');
      check('button href swapped', doc.getElementById('cta').getAttribute('href'), 'https://zoom.example/reg');
      check('button text kept', doc.getElementById('cta').textContent, 'REGISTER FREE NOW');
      check('styling preserved', doc.querySelector('.date-box strong').style.color, 'rgb(17, 17, 17)');
      check('non-placeholder untouched', doc.querySelector('.untouched').textContent, 'No placeholder here');
      check('unknown token left as-is', doc.querySelector('.unknown').textContent, '{{NOT_A_COLUMN}}');
      check('nothing left hidden', doc.querySelector('.date-box strong').style.visibility, '');
    }
  );

  console.log('\n--- Scenario 2: sheet unreachable (network error) ---');
  await run(
    () => Promise.reject(new Error('network down')),
    'fail',
    (doc) => {
      check('falls back to baked-in date', doc.querySelector('.date-box').textContent, 'Monday 21 Sep, 2026');
      check('falls back to baked-in time', doc.querySelector('.time-box').textContent, '7:30 PM - 9:30 PM');
      check('no raw placeholder visible', /\{\{WEBINAR_DATE\}\}/.test(doc.body.textContent), false);
      check('page not left hidden', doc.querySelector('.date-box strong').style.visibility, '');
    }
  );

  console.log('\n--- Scenario 3: sheet not shared (Google returns a login HTML page) ---');
  await run(
    () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<!doctype html><html>Sign in</html>') }),
    'html',
    (doc) => {
      check('HTML rejected, fallback used', doc.querySelector('.date-box').textContent, 'Monday 21 Sep, 2026');
      check('no raw placeholder visible', /\{\{/.test(doc.querySelector('.date-box').textContent), false);
    }
  );

  console.log('\n--- Scenario 4: Apps Script answers over JSONP ---');
  await runJsonp(
    (w, cb) => w[cb]({ ok: true, tokens: {
      WEBINAR_DATE: 'Monday 21 Dec, 2099', WEBINAR_TIME: '7:30 PM - 9:30 PM',
      WEBINAR_START_TIME: '7:30 PM', WEBINAR_DAY: 'Monday',
      ZOOM_URL: 'https://zoom.example/reg', WEBINAR_DATE_ISO: '2099-12-21'
    } }),
    (doc) => {
      check('date from Apps Script', doc.querySelector('.date-box').textContent, 'Monday 21 Dec, 2099');
      check('time from Apps Script', doc.querySelector('.time-box').textContent, '7:30 PM - 9:30 PM');
      check('button href from Apps Script', doc.getElementById('cta').getAttribute('href'), 'https://zoom.example/reg');
      check('nothing left hidden', doc.querySelector('.date-box strong').style.visibility, '');
    }
  );

  console.log('\n--- Scenario 5: Apps Script reports an error ---');
  await runJsonp(
    (w, cb) => w[cb]({ ok: false, error: 'No row has a usable Date', tokens: {} }),
    (doc) => {
      check('falls back on a reported error', doc.querySelector('.date-box').textContent, 'Monday 21 Sep, 2026');
      check('no raw placeholder', /\{\{/.test(doc.body.textContent), false);
    }
  );

  console.log('\n--- Scenario 5b: nothing unresolved ever reaches a visitor ---');
  await runJsonp(
    (w, cb) => w[cb]({ ok: false, error: 'No row has a usable Date', tokens: {} }),
    (doc) => {
      check('no braces anywhere on the page', /\{\{|\]\]/.test(doc.body.textContent), false);
      check('unknown token dropped, sentence survives',
        doc.querySelector('.mixed').textContent.replace(/\s+/g, ' ').trim(), 'Doors open on');
      check('CTA keeps its fallback link', doc.getElementById('cta').getAttribute('href'),
        'https://us06web.zoom.us/meeting/register/Cuq7YoXgT_aNPXbRwtoOxw');
    }
  );

  console.log('\n--- Scenario 6: Apps Script URL is wrong / unreachable ---');
  await runJsonp(
    (w, cb, node) => { if (node.onerror) node.onerror(); },
    (doc) => {
      check('falls back when the script will not load', doc.querySelector('.date-box').textContent, 'Monday 21 Sep, 2026');
      check('page not left hidden', doc.querySelector('.date-box strong').style.visibility, '');
    }
  );

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

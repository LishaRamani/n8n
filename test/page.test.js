// Runs the real landing-page snippet in a simulated page.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const file = fs.readFileSync(path.join(__dirname, '..', 'systeme-io', 'webinar-date-sync.html'), 'utf8');
const scriptSrc = file.slice(file.indexOf('<script>') + 8, file.lastIndexOf('</script>'));

// Stands in for the systeme.io date block: styled text, placeholder inside.
const PAGE = `<!doctype html><html><body>
  <div class="date-box"><strong style="color:#111">{{WEBINAR_DATE}}</strong></div>
  <div class="spaced">Join us on {{ WEBINAR_DATE }} — see you there</div>
  <div class="untouched">No placeholder here</div>
</body></html>`;

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  ->  ' + JSON.stringify(actual) +
    (ok ? '' : '   (expected ' + JSON.stringify(expected) + ')'));
};

// Points the snippet at a URL, intercepts the injected <script>, and answers
// on the callback the way the deployed Apps Script would.
function run(respond, assert, { url = 'https://script.google.com/macros/s/TEST/exec' } = {}) {
  // Works whether or not the shipped file already has a URL baked in.
  const src = scriptSrc.replace(/var WEBINAR_DATE_URL = '[^']*';/, `var WEBINAR_DATE_URL = '${url}';`);
  if (src === scriptSrc) throw new Error('could not point the snippet at a URL');

  const dom = new JSDOM(PAGE, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const head = w.document.head;
  const realAppend = head.appendChild.bind(head);
  head.appendChild = function (node) {
    if (node && node.tagName === 'SCRIPT' && node.src) {
      const cb = /[?&]callback=([^&]+)/.exec(node.src);
      setTimeout(() => respond(w, cb && cb[1], node), 0);
      return node;                       // never actually fetched
    }
    return realAppend(node);
  };
  w.eval(src);
  return new Promise((r) => setTimeout(() => { assert(w.document, w); r(); }, 6000));
}

const txt = (doc, sel) => doc.querySelector(sel).textContent;

(async () => {
  console.log('--- The sheet answers ---');
  await run(
    (w, cb) => w[cb]({ ok: true, date: 'Sunday, 4 January 2099' }),
    (doc) => {
      check('date shown', txt(doc, '.date-box'), 'Sunday, 4 January 2099');
      check('works mid-sentence', txt(doc, '.spaced'), 'Join us on Sunday, 4 January 2099 — see you there');
      check('other text untouched', txt(doc, '.untouched'), 'No placeholder here');
      check('styling preserved', doc.querySelector('.date-box strong').style.color, 'rgb(17, 17, 17)');
      check('nothing left hidden', doc.querySelector('.date-box strong').style.visibility, '');
    }
  );

  console.log('\n--- Typed exactly as the cell reads ---');
  await run(
    (w, cb) => w[cb]({ ok: true, date: '21st Sept (Sun) · 7:30 PM' }),
    (doc) => check('passed through verbatim', txt(doc, '.date-box'), '21st Sept (Sun) · 7:30 PM')
  );

  console.log('\n--- The script reports a problem ---');
  await run(
    (w, cb) => w[cb]({ ok: false, error: 'Column "Webinar date" has no value' }),
    (doc) => {
      check('falls back', txt(doc, '.date-box'), 'Monday, 21 September 2026');
      check('no braces reach the visitor', /\{\{/.test(doc.body.textContent), false);
    }
  );

  console.log('\n--- The URL is wrong or unreachable ---');
  await run(
    (w, cb, node) => { if (node.onerror) node.onerror(); },
    (doc) => {
      check('falls back', txt(doc, '.date-box'), 'Monday, 21 September 2026');
      check('page not left hidden', doc.querySelector('.date-box strong').style.visibility, '');
    }
  );

  console.log('\n--- A slow cold start still wins ---');
  await run(
    // Apps Script often takes several seconds on a cold start. The fallback is
    // painted first; the real date must replace it when it finally lands.
    (w, cb) => setTimeout(() => w[cb]({ ok: true, date: 'Thursday, 24 September 2026' }), 4000),
    (doc) => {
      check('late answer replaces the fallback', txt(doc, '.date-box'), 'Thursday, 24 September 2026');
      check('replaced everywhere', txt(doc, '.spaced'),
        'Join us on Thursday, 24 September 2026 — see you there');
    }
  );

  console.log('\n--- Nothing ever answers (timeout) ---');
  await run(
    () => {},
    (doc) => {
      check('fallback stays put', txt(doc, '.date-box'), 'Monday, 21 September 2026');
      check('no braces reach the visitor', /\{\{/.test(doc.body.textContent), false);
    }
  );

  console.log('\n--- URL left empty (snippet pasted, not yet configured) ---');
  await run(
    () => { throw new Error('should not request anything'); },
    (doc) => {
      check('shows the fallback immediately', txt(doc, '.date-box'), 'Monday, 21 September 2026');
      check('no braces reach the visitor', /\{\{/.test(doc.body.textContent), false);
    },
    { url: '' }
  );

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

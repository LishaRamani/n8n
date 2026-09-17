const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'systeme-io', 'test-in-browser.html'), 'utf8');

const CSV = [
  'Webinar Code,Date,Time,Webinar date,Zoom URL,Group Link',
  'CCM 21/09/26,21/09/2026,7:30 PM - 9:30 PM,"Monday, 21 September 2026",https://us06web.zoom.us/reg/abc,https://chat.whatsapp.com/xyz'
].join('\n');

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  ->  ' + JSON.stringify(actual) +
    (ok ? '' : '   (expected ' + JSON.stringify(expected) + ')'));
};

function run(fetchImpl, assert) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/test-in-browser.html',
    beforeParse(window) { window.fetch = fetchImpl; }
  });
  return new Promise((r) => setTimeout(() => { assert(dom.window.document); r(); }, 3600));
}

const txt = (doc, sel) => doc.querySelector(sel).textContent.trim();

(async () => {
  console.log('--- Sheet reachable and readable ---');
  await run(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(CSV) }), (doc) => {
    check('verdict is pass', doc.getElementById('verdict').className, 'verdict pass');
    check('verdict headline', txt(doc, '#verdict-title'), 'Working.');
    check('mock LP date box', txt(doc, '.lp-box span:last-child'), 'Monday 21 Sep, 2026');
    check('mock LP CTA link', doc.querySelector('.lp-cta').getAttribute('href'), 'https://us06web.zoom.us/reg/abc');
    check('all six checks green', doc.querySelectorAll('#checks .mark.ok').length, 6);
    check('no red checks', doc.querySelectorAll('#checks .mark.bad').length, 0);
    check('fix panel hidden', doc.getElementById('fix-wrap').hidden, true);
    const rows = doc.querySelectorAll('#tokens tbody tr');
    check('token table populated', rows.length > 5, true);
  });

  console.log('\n--- Sheet not shared (Google returns sign-in HTML) ---');
  await run(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<!doctype html><html>Sign in</html>') }), (doc) => {
    check('verdict is fail', doc.getElementById('verdict').className, 'verdict fail');
    check('names the real cause', txt(doc, '#verdict-title'), 'The sheet is not readable without a Google login.');
    check('CSV check red', doc.querySelectorAll('#checks .mark.bad').length > 0, true);
    check('fix panel shown', doc.getElementById('fix-wrap').hidden, false);
    check('fix mentions Publish to web', /Publish to web/.test(txt(doc, '#fix')), true);
  });

  console.log('\n--- Request blocked (CORS / offline) ---');
  await run(() => Promise.reject(new TypeError('Failed to fetch')), (doc) => {
    check('verdict is fail', doc.getElementById('verdict').className, 'verdict fail');
    check('names the block', txt(doc, '#verdict-title'), 'The browser blocked the request.');
    check('fix panel shown', doc.getElementById('fix-wrap').hidden, false);
    check('falls back, no raw placeholder', /\{\{/.test(txt(doc, '.lp-box')), false);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

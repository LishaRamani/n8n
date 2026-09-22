// Runs the real FlexiFunnels snippet in a simulated page.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const file = fs.readFileSync(path.join(__dirname, '..', 'flexifunnels', 'batch-sync.html'), 'utf8');
const scriptSrc = file.slice(file.indexOf('<script>') + 8, file.lastIndexOf('</script>'));

// Stands in for the funnel pages: a landing page date block, a thank-you page
// WhatsApp button, a Zoom button, and a countdown.
const PAGE = `<!doctype html><html><body>
  <div class="date-box"><strong style="color:#111">{{WEBINAR_DATE}}</strong></div>
  <div class="line">Starts at {{ WEBINAR_TIME }} IST</div>
  <div class="untouched">No placeholder here</div>
  <a class="join" href="{{ZOOM_LINK}}">Join the webinar</a>
  <a class="community" href="%7B%7BCOMMUNITY_LINK%7D%7D">Join the WhatsApp community</a>
  <a class="normal" href="https://example.com/keep">Unrelated link</a>
  <span class="cd-full" data-wow-countdown></span>
  <span class="cd-days" data-wow-countdown="days"></span>
  <span class="cd-hours" data-wow-countdown="hours"></span>
  <span class="cd-mins" data-wow-countdown="minutes"></span>
</body></html>`;

const LIVE = {
  ok: true,
  date: '23 September 2026',
  time: '7:00 pm',
  zoomUrl: 'https://us06web.zoom.us/meeting/register/VdcjjVFSS9CODREjFIVPAQ',
  communityUrl: 'https://chat.whatsapp.com/IYbbeFiMqgmHWnf3KkiCDR',
  startsAt: '2026-09-23T13:30:00.000Z'
};

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  ->  ' + JSON.stringify(actual) +
    (ok ? '' : '   (expected ' + JSON.stringify(expected) + ')'));
};

// Points the snippet at a URL, intercepts the injected <script>, and answers on
// the callback the way the deployed Apps Script would.
function run(respond, assert, { url = 'https://script.google.com/macros/s/TEST/exec', now = null } = {}) {
  const URL_LINE = /var BATCH_CONFIG_URL = '[^']*';/;
  // Compare against the pattern, not the result: setting an empty URL is a real
  // case, and it leaves the source byte-identical to the shipped file.
  if (!URL_LINE.test(scriptSrc)) throw new Error('could not find the URL line in the snippet');
  const src = scriptSrc.replace(URL_LINE, `var BATCH_CONFIG_URL = '${url}';`);

  const dom = new JSDOM(PAGE, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  if (now !== null) {
    const fixed = now;
    const RealDate = w.Date;
    w.Date = class extends RealDate {
      constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(fixed); }
      static now() { return fixed; }
      static parse(s) { return RealDate.parse(s); }
    };
  }
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
const href = (doc, sel) => doc.querySelector(sel).getAttribute('href');

(async () => {
  console.log('--- The sheet answers ---');
  await run(
    (w, cb) => w[cb](LIVE),
    (doc) => {
      check('date shown', txt(doc, '.date-box'), '23 September 2026');
      check('time shown, spaces inside braces', txt(doc, '.line'), 'Starts at 7:00 pm IST');
      check('untouched text left alone', txt(doc, '.untouched'), 'No placeholder here');
      check('zoom button points at the meeting', href(doc, '.join'), LIVE.zoomUrl);
      check('encoded community token rewritten', href(doc, '.community'), LIVE.communityUrl);
      check('unrelated link untouched', href(doc, '.normal'), 'https://example.com/keep');
      check('placeholder is visible again', doc.querySelector('.date-box strong').style.visibility, '');
    }
  );

  console.log('\n--- Countdown ---');
  {
    // 2 days, 3 hours, 4 minutes and 5 seconds before the webinar.
    const target = Date.parse(LIVE.startsAt);
    const now = target - (((2 * 24 + 3) * 60 + 4) * 60 + 5) * 1000;
    await run(
      (w, cb) => w[cb](LIVE),
      (doc) => {
        check('days', txt(doc, '.cd-days'), '2');
        check('hours zero-padded', txt(doc, '.cd-hours'), '03');
        check('minutes zero-padded', txt(doc, '.cd-mins'), '04');
        check('combined form', txt(doc, '.cd-full'), '2d 03h 04m 05s');
        check('not marked ended', doc.querySelector('.cd-full').getAttribute('data-wow-countdown-ended'), null);
      },
      { now }
    );
  }
  {
    // The webinar has already started.
    await run(
      (w, cb) => w[cb](LIVE),
      (doc) => {
        check('reads zero once live', txt(doc, '.cd-full'), '0d 00h 00m 00s');
        check('marked ended for CSS', doc.querySelector('.cd-full').getAttribute('data-wow-countdown-ended'), 'true');
      },
      { now: Date.parse(LIVE.startsAt) + 60000 }
    );
  }
  {
    // startsAt could not be parsed: show nothing rather than a wrong number.
    await run(
      (w, cb) => w[cb](Object.assign({}, LIVE, { startsAt: null })),
      (doc) => {
        check('no startsAt -> countdown left empty', txt(doc, '.cd-full'), '');
        check('date still filled in', txt(doc, '.date-box'), '23 September 2026');
      }
    );
  }

  console.log('\n--- When the script does not answer ---');
  await run(
    (w, cb) => w[cb]({ ok: false, error: 'No row has a Zoom Link' }),
    (doc) => {
      check('falls back to the built-in date', txt(doc, '.date-box'), '23 September 2026');
      check('button still has a real destination', href(doc, '.join').slice(0, 8), 'https://');
      check('never leaves raw braces', /\{\{/.test(doc.body.textContent), false);
    }
  );
  await run(
    (w, cb, node) => node.onerror(),
    (doc) => {
      check('network failure -> fallback', txt(doc, '.date-box'), '23 September 2026');
      check('no raw braces in hrefs', /%7B%7B|\{\{/.test(href(doc, '.community')), false);
    }
  );
  await run(
    () => {},                                   // never answers at all
    (doc) => {
      check('silence -> fallback painted', txt(doc, '.date-box'), '23 September 2026');
    }
  );

  console.log('\n--- Not configured ---');
  await run(
    (w, cb) => w[cb](LIVE),
    (doc) => {
      check('empty URL -> fallback, no request', txt(doc, '.date-box'), '23 September 2026');
    },
    { url: '' }
  );

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

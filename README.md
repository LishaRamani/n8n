# Webinar date sync — Google Sheet → systeme.io landing page

The webinar date and time on the systeme.io registration page are read live from the
**Webinar Automation Sheet** tab. Change the date in the sheet → the landing page shows the new
date. No page editing, no republishing.

```
Google Sheet ──► Apps Script web app ──► the systeme.io page swaps the text
```

---

## Recommended: the Apps Script route

A small script runs inside your own Google account, reads the sheet **as you**, and hands the
landing page just the webinar row.

Why this one:

- **Your spreadsheet stays private.** Ads Content, Hooks, VSL Ads, CTWA and Sales Driven are
  never exposed. Only the webinar date, time and links leave the file.
- **Nothing can block it.** It answers as JSONP, which the page loads with a `<script>` tag —
  the one mechanism no browser CORS rule applies to. This is the usual reason a
  fetch-the-CSV approach fails.

### Setup — about five minutes, once

1. Open the sheet → **Extensions → Apps Script**.
2. Delete whatever is in the editor and paste all of
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs). Save.
3. Pick `testRun` in the function dropdown and press **Run**. Approve the permission prompt
   (it is your own script asking to read your own sheet). The execution log should print your
   webinar row — that confirms it works before anything goes near the landing page.
4. **Deploy → New deployment → Web app**, with:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the **`/exec`** URL it gives you.
6. Open [`systeme-io/webinar-date-sync.html`](systeme-io/webinar-date-sync.html) and paste that
   URL between the quotes on the `APPS_SCRIPT_URL` line.

Then paste the whole snippet into a **Raw HTML** element on the page, and replace the typed-out
date and time with placeholders:

| Change this | To this |
|---|---|
| `Thursday 17 Sep, 2026` | `{{WEBINAR_DATE}}` |
| `7:30 PM - 9:30 PM` | `{{WEBINAR_TIME}}` |

Keep the element, the icon and the styling as they are — only the words change.

> **After editing the script later**, re-deploy: **Deploy → Manage deployments → pencil →
> Version: New**. Editing the code alone does not change what the live URL serves.

### Check it before touching the page

Open [`systeme-io/test-in-browser.html`](systeme-io/test-in-browser.html) in Chrome, paste your
`/exec` URL into the box, and press **Run again**. It runs the real snippet and tells you in one
line whether it works and what date the page will show.

---

## Fallback: reading the sheet as CSV

If you skip the Apps Script, leave `APPS_SCRIPT_URL` empty and the snippet fetches the sheet
directly as CSV. This needs the file to be readable without a Google login — it currently is
(`Anyone with the link → Viewer`), which also means every other tab in it is readable by anyone
holding the link.

This path is subject to browser CORS rules, which is why it may fail where the Apps Script will
not. To tighten it, use **File → Share → Publish to web** for the one tab as CSV and put that URL
in `PUBLISHED_CSV_URL`. The file is owned by `rajat.m.sinha@gmail.com`, so that may need their
account.

---

## The sheet

Tab: **Webinar Automation Sheet**
(`docs.google.com/spreadsheets/d/18lW19qAZRtbnjctCEtT8iegjSvg0z5p0MHnY-tdH5Jo`, gid `2019145575`)

| Webinar Code | Date | Time | Webinar date | Zoom URL | Group Link |
|---|---|---|---|---|---|
| CCM 21/09/26 | 21/09/2026 | 7:30 PM - 9:30 PM | Monday, 21 September 2026 | https://us06web.zoom.us/... | https://chat.whatsapp.com/... |

Only **Date** must be filled in. Dates are read **day-first** (`21/09/2026` = 21 September);
`2026-09-21` and `Monday, 21 September 2026` also work, as does a real spreadsheet date.

**More than one row?** The page picks the first row dated today or later, so you can fill in a
quarter of webinars in advance and the page rolls forward on its own. If every row is in the past
it shows the last row rather than going blank.

---

## Placeholders

| Placeholder | Renders as |
|---|---|
| `{{WEBINAR_DATE}}` | Monday 21 Sep, 2026 |
| `{{WEBINAR_DATE_LONG}}` | Monday, 21 September 2026 |
| `{{WEBINAR_DATE_SHORT}}` | 21 Sep |
| `{{WEBINAR_DAY}}` | Monday |
| `{{WEBINAR_TIME}}` | 7:30 PM - 9:30 PM |
| `{{WEBINAR_START_TIME}}` | 7:30 PM |
| `{{WEBINAR_END_TIME}}` | 9:30 PM |
| `{{WEBINAR_CODE}}` | CCM 21/09/26 |
| `{{ZOOM_URL}}` | the registration link |
| `{{GROUP_LINK}}` | the WhatsApp group link |
| `{{WEBINAR_DATE_ISO}}` | 2026-09-21 (for a countdown) |

`{{ZOOM_URL}}` and `{{GROUP_LINK}}` also work as a **button's link** — set the button URL to
`{{ZOOM_URL}}` and a new Zoom link never needs the page edited either.

**Add a column, get a placeholder.** A column named `Speaker Name` becomes `{{SPEAKER_NAME}}`
automatically. Nothing needs changing.

---

## Good to know

- **How fast.** Responses are reused for up to a minute, so a change shows on the next page load
  after that.
- **If the sheet cannot be reached** the page falls back to the values in `FALLBACK` near the top
  of the snippet. Keep those current — especially `ZOOM_URL`, since a button uses it.
- **Nothing broken ever shows.** Placeholder text is hidden until it is filled, and on fallback any
  placeholder with no value is dropped rather than left as `{{...}}`. A link whose value is
  missing has its `href` removed rather than pointing somewhere invented.
- **Timezone.** Row selection uses IST, in both the script and the page.

### If the date doesn't change

1. Open the live page, press F12 → Console, look for a `[webinar-date-sync]` warning.
2. `could not load the Apps Script URL` → the deployment is not set to **Anyone**, or the URL is
   the `/dev` one instead of `/exec`.
3. `got HTML, not CSV` → the CSV fallback is in use and the sheet is not publicly readable. Use
   the Apps Script route.
4. Check the placeholder is spelled exactly `{{WEBINAR_DATE}}`, in capitals.
5. Confirm you are on the live page — systeme.io does not run scripts in the editor preview.

---

## Tests

```bash
npm install
npm test
```

97 checks across the Apps Script (stubbed Google services, including that a crafted JSONP callback
name is rejected), the CSV parsing and day-first dates, row selection, placeholder substitution,
and six live-page scenarios.

These stub the network. Whether Google actually serves your deployment can only be confirmed from a
real browser — that is what `test-in-browser.html` is for.

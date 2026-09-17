# Webinar date sync — Google Sheet → systeme.io landing page

The webinar date and time on the systeme.io registration page are read live from the
**Webinar Automation Sheet** tab of the Ad Creation Sheet.

Change the date in the sheet → the landing page shows the new date within about a minute.
No page editing, no republishing, no automation tool in between.

```
Google Sheet ──(CSV over HTTPS)──► browser on the systeme.io page ──► swaps the text
```

The page talks to Google directly. There is nothing to keep running and nothing that can
silently stop working overnight.

---

## The sheet

Tab: **Webinar Automation Sheet**
(`https://docs.google.com/spreadsheets/d/18lW19qAZRtbnjctCEtT8iegjSvg0z5p0MHnY-tdH5Jo` → gid `2019145575`)

| Webinar Code | Date | Time | Webinar date | Zoom URL | Group Link |
|---|---|---|---|---|---|
| CCM 21/09/26 | 21/09/2026 | 7:30 PM - 9:30 PM | Monday, 21 September 2026 | https://us06web.zoom.us/... | https://chat.whatsapp.com/... |

Only the **Date** column has to be filled in — everything else is optional.
Dates are read as **DD/MM/YYYY** (`21/09/2026` = 21 September). `2026-09-21` and
`Monday, 21 September 2026` also work.

**More than one row?** The page picks the first row dated today or later, so you can fill in
a whole quarter of webinars in advance and the page rolls forward on its own. If every row is
in the past, it shows the last row rather than going blank.

---

## Setup — three steps, once

### 1. Let the page read the sheet — already done

The visitor's browser fetches the sheet, so that one tab has to be readable without a Google login.
**This file is already shared as *Anyone with the link → Viewer***, which is exactly what the
snippet needs. Nothing to change.

Two things worth knowing about that:

- It also means every other tab in the file — Ads Content, Hooks, VSL Ads, CTWA, Sales Driven —
  is readable by anyone holding the link. That was already true before this change.
- To narrow it, use **File → Share → Publish to web**, pick **Webinar Automation Sheet** and
  **Comma-separated values (.csv)**, then restrict the file itself back to specific people.
  Paste the published URL into `PUBLISHED_CSV_URL` in the snippet. The file is owned by
  `rajat.m.sinha@gmail.com`, so that change may need their account.

### 2. Paste the snippet into the page

In the systeme.io editor, drag a **Raw HTML** element onto the page (anywhere — it renders nothing
visible) and paste the entire contents of [`systeme-io/webinar-date-sync.html`](systeme-io/webinar-date-sync.html).

### 3. Put placeholders in the text

Edit the existing date and time elements and replace the typed-out date with a placeholder.
Keep the element, the icon and the styling exactly as they are — only the words change:

| Change this | To this |
|---|---|
| `Thursday 17 Sep, 2026` | `{{WEBINAR_DATE}}` |
| `7:30 PM - 9:30 PM` | `{{WEBINAR_TIME}}` |

Save and view the **live page** (not the editor preview — systeme.io does not run scripts inside
the editor). The placeholders should come out as the date from the sheet.

### Check it before you touch the page

Open [`systeme-io/test-in-browser.html`](systeme-io/test-in-browser.html) in Chrome — double-click
the file. It runs the real snippet against the real sheet and tells you in one line whether the
connection works, what date the page will show, and what to fix if it doesn't.

> The sheet currently says **21 September 2026** while the page says 17 September. Once this is
> installed the page will follow the sheet, so make sure the sheet holds the date you actually want.

---

## Placeholders you can use

Any of these can be typed into any text element on the page:

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
| `{{WEBINAR_DATE_ISO}}` | 2026-09-21 (for a countdown timer) |

`{{ZOOM_URL}}` and `{{GROUP_LINK}}` also work as a **button's link** — set the button URL to
`{{ZOOM_URL}}` and it will point at whatever the sheet says, so a new Zoom link never needs the
page edited either.

**Add a column, get a placeholder.** A new column named `Speaker Name` automatically becomes
`{{SPEAKER_NAME}}`. Nothing in the snippet needs changing.

---

## Good to know

- **How fast.** The browser caches the sheet for up to a minute, so a change shows up on the next
  page load after that.
- **If the sheet can't be reached** — link revoked, Google down, visitor offline — the page falls
  back to the date baked into the snippet (`FALLBACK` near the top, currently 21 Sep 2026) after
  three seconds. Visitors never see a broken `{{WEBINAR_DATE}}`. Keep that fallback roughly current.
- **Nothing flashes.** Placeholder text is hidden until the real date is in place.
- **Timezone.** Row selection uses IST (`TIMEZONE_OFFSET_HOURS = 5.5`), so "today" means today in India.

### If the date doesn't change on the live page

1. Open the live page, press F12 → Console, look for a `[webinar-date-sync]` warning.
2. `got HTML, not CSV` means step 1 didn't take — the sheet isn't publicly readable yet.
3. Check the placeholder is spelled exactly `{{WEBINAR_DATE}}`, in capitals.
4. Confirm you're on the live page and not the editor preview.

---

## Tests

`test/` covers the CSV parsing, DD/MM date handling, upcoming-row selection, placeholder
substitution, the three live-page scenarios (sheet reachable, unreachable, not shared), and the
browser tester's own reporting.

These run against a stubbed network. Whether Google actually serves the sheet to a browser can only
be confirmed from a real browser — that is what `test-in-browser.html` is for.

```bash
npm install          # jsdom, for the DOM test
npm test
```

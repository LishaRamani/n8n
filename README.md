# Webinar date → systeme.io

Update **column D** of the *Webinar Automation Sheet* tab. The registration page shows the new
date. Nothing else to edit, nothing to republish.

Whatever you type in that cell is exactly what appears on the page — `Monday, 21 September 2026`,
`Sat 3 Jan, 8 PM`, anything. It is copied across as written.

```
column D  ──►  Apps Script  ──►  the date on the systeme.io page
```

---

## Setup — once, about five minutes

**1. Add the script**

Open the sheet → **Extensions → Apps Script**. Delete whatever is in the editor, paste all of
[`google-apps-script/Code.gs`](google-apps-script/Code.gs), and save.

**2. Check it reads the cell**

Choose `testRun` in the function dropdown and press **Run**. Approve the permission prompt — it is
your own script asking to read your own sheet. The log should print today's value of column D.

**3. Publish it**

**Deploy → New deployment → Web app**

- Execute as: **Me**
- Who has access: **Anyone**

Copy the **`/exec`** URL.

**4. Put the URL in the snippet**

Open [`systeme-io/webinar-date-sync.html`](systeme-io/webinar-date-sync.html) and paste the URL
between the quotes on this line:

```js
var WEBINAR_DATE_URL = '';
```

**5. Test before touching the page**

Open [`systeme-io/test-in-browser.html`](systeme-io/test-in-browser.html) in Chrome, paste the same
URL, press Run. It tells you in one line whether it works and what the page will show.

**6. Put it on the page**

In systeme.io, drag a **Raw HTML** element onto the page and paste the whole snippet. Then edit your
date element and replace the typed-out date with:

```
{{WEBINAR_DATE}}
```

Keep the element, the icon and the styling exactly as they are — only the words change.

View the **live page**, not the editor preview. systeme.io does not run scripts in the editor.

> **Edit the script later?** Re-deploy: **Deploy → Manage deployments → pencil → Version: New**.
> Changing the code alone does not change what the live URL serves.

---

## Day to day

Change column D. Reload the page. Done.

The page asks the script fresh on every load, so an edit shows on the very next reload.
A hard reload (Cmd-Shift-R) rules out the browser holding the old page itself.

---

## What happens when something breaks

The page never shows a broken `{{WEBINAR_DATE}}`. The placeholder is hidden until it has a real
value, and if the script cannot be reached within four seconds the page falls back to the date
written into `FALLBACK_DATE` near the top of the snippet. Keep that roughly current.

### If the date doesn't change

1. On the live page press F12 → Console and look for a `[webinar-date-sync]` warning.
2. `could not load …` → the deployment is not set to **Anyone**, or you used the `/dev` URL
   instead of `/exec`.
3. `the script sent back no date` → column D is empty on every row.
4. Check the placeholder reads exactly `{{WEBINAR_DATE}}`, in capitals.
5. Confirm you are looking at the live page, not the editor preview.

---

## Which row it reads

The first row below the header that has something in column D. If you keep one row and edit it,
that is the row. Blank rows are skipped.

The column is found by its **Webinar date** header, so it still works if the column moves; if the
header is renamed, it falls back to position D.

---

## Notes

- The spreadsheet does not need to be public. The script reads it as you, and hands out only the
  date — the Ads Content, Hooks, VSL Ads, CTWA and Sales Driven tabs are never exposed.
- The page loads the answer with a `<script>` tag, which no browser CORS rule applies to. That is
  the usual reason a "fetch the sheet as CSV" approach fails.

---

## Tests

```bash
npm install
npm test
```

35 checks: the Apps Script against stubbed Google services — verbatim cell reading, finding the
column by header or by position, blank rows, every error path, and rejection of a crafted JSONP
callback name — plus six page scenarios covering a good answer, a reported error, a bad URL, a
timeout and an unconfigured snippet.

These stub the network. Whether your deployment actually answers can only be confirmed from a real
browser — that is what `test-in-browser.html` is for.

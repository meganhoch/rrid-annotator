# Sharing the RRID Add-on for Testing

This is a **container-bound** Apps Script (bound to one Google Doc), not yet a
published Marketplace add-on. It requests sensitive scopes (`documents`,
`script.external_request`), so first-time authorization normally shows a
"Google hasn't verified this app" screen. Below are two ways to let others test
it, and how to remove that warning for named testers.

**Key IDs**
- Container Doc: `1mdDkh_LMMQgeBTkQcQ0XUZ6XUOlU_Z80-iB9egv-3HE`
- Script ID: `1wyPXbeaZUiqZ8Ss0WHSMcyAqwNDoarXTmXZ8Zgo3AYcaGCTAjMAaL5Rm`

Every tester also needs their **own SciCrunch API key** (free): sign up at
<https://scicrunch.org>, then copy the key from their account/API settings.

---

## Path A — "Make a copy" link (independent testing, fastest)

Each tester gets their **own copy** of the doc with the add-on. They work in
their own Drive and never touch your original.

**You do once:** open the container Doc → **Share** → General access →
"Anyone with the link" = **Viewer** (or add specific tester emails as Viewer).

**Give testers this link** (note the `/copy` ending):

```
https://docs.google.com/document/d/1mdDkh_LMMQgeBTkQcQ0XUZ6XUOlU_Z80-iB9egv-3HE/copy
```

**Tester steps:**
1. Open the link → **Make a copy**. A copy lands in their Drive with the add-on.
2. Reload the copy; wait a few seconds for the **RRID** menu to appear.
3. **RRID → Set API Key…** → paste their SciCrunch API key.
4. **RRID → Annotate Selection** (select text first) or **RRID → Open RRID Panel**.
5. On first run they'll see **"Google hasn't verified this app"** →
   **Advanced → Go to RRID (unsafe)** → **Allow**. This is expected: they are
   authorizing *their own copy* of the script.

**Trade-offs**
- ✅ Independent; testers can paste their own references; no GCP setup.
- ⚠️ The unverified-app screen still appears (they proceed as the copy's owner).
- ⚠️ Copies are frozen snapshots — your `clasp push` updates do **not** reach
  them. To ship a new version, re-share a fresh copy. (Path B avoids this.)

---

## Path B — Shared original + test users (warning-free)

Testers run your **single** script (the shared original Doc). Because it's your
project, you can add them as OAuth **test users** so they get a normal consent
screen instead of the "unverified/unsafe" warning — and they always run the
latest code you `clasp push`.

**You do once — share the doc:** open the container Doc → **Share** → add each
tester's email as **Editor**.

**You do once — GCP test-user setup** (removes the warning; ~10 min).
Steps below use the current **Google Auth Platform** console (left-nav pages:
*Overview · Branding · Audience · Data Access · Clients*).

1. **Create a Cloud project** — <https://console.cloud.google.com> → the project
   picker at the top → **New Project** (e.g. "RRID Docs Add-on") → Create, then
   make sure it's the **selected** project. Its **Project number** is on the
   Cloud Console **Overview/dashboard** (and in the project picker) — you'll need
   it in step 4.

2. **Configure the consent screen** — search bar → **Google Auth Platform**
   (or APIs & Services → **OAuth consent screen**). If you see **Get started**,
   fill:
   - **App name** `RRID Annotator` + **user support email**
   - **Audience: External**
   - **Contact email** → agree → **Create**

3. **Audience page** (left nav) — this is the part that matters:
   - **Publishing status** should read **Testing** — leave it (do *not* click
     **Publish app**).
   - **Test users** → **+ Add users** → each tester's Gmail address (up to 100)
     → **Save**.

   *(Optional — **Data Access** page: **Add or remove scopes**. The three Apps
   Script scopes won't show in the search list, so paste them in the **Manually
   add scopes** box → **Add to table** → **Update** → **Save**. Skippable: in
   Testing, test users are prompted for whatever `appsscript.json` requests.)*
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/script.external_request`
   - `https://www.googleapis.com/auth/script.container.ui`

4. **Link the project to the script** — <https://script.google.com> → open the
   RRID project (Script ID `1wyPXbe…`) → **Project Settings** (gear icon) →
   **Google Cloud Platform (GCP) Project** → **Change project** → paste the
   **Project number** from step 1 → **Set project**.

**Tester steps:** open the shared Doc → **RRID → Set API Key…** (their SciCrunch
key) → use the menu/panel. Test users authorize with a **normal consent
screen** — no "unverified app" warning.

**Trade-offs**
- ✅ No scary warning for listed testers; everyone runs the latest pushed code.
- ⚠️ Test users apply to **this** script only — a tester who *copies* the doc
  (Path A) is on their own project and won't be covered.
- ⚠️ All testers share one document (edits can collide). For separate sandboxes,
  make a copy per tester **that you own** and repeat step 3's GCP link for each.

---

## Which to use
- **A few external testers, quick look:** Path A (copy link). Accept the
  one-time warning.
- **Ongoing testing / clean UX / auto-updates:** Path B (shared doc + test
  users). Do the 10-minute GCP setup once.

## Later: real distribution
For install-in-any-doc, auto-updating distribution, convert this bound script to
a **standalone Editor Add-on** (add an `addOns` manifest section) and publish to
the Google Workspace Marketplace (unlisted). That requires the GCP project above
plus **OAuth verification** for the sensitive scopes.

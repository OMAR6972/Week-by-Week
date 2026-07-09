# Academic Hub — Handoff & File Sync

_Last updated: 2026-07-01_

> Paste this whole file into a new chat first, then upload the project files. It captures the full state so work can continue without re-asking.

---

## 0. File workflow (read this first)

- Claude sees a **read-only snapshot** of the project files and **cannot write back into the Project**. Whenever Claude sends a file, **you** upload it to **(1) the GitHub repo** and **(2) the Project's files**, replacing the old copy. Keep both in sync with whatever Claude last sent.
- **Every code file starts with a version line**, e.g.
  `/* VERSION: 2026-07-01 — ... If this dated line is present, you have the current file. */`
  Before committing on GitHub, open the file and check that line. **If GitHub says "no changes to commit," your upload was a stale download** — re-download from the chat and try again. (`admin.html` uses an HTML comment `<!-- VERSION: ... -->`.)
- **Minimize files touched per feature** and **ship schema + code together**. Content work should stay visual; SQL is not part of the daily workflow.

---

## 1. What this project is

**Academic Hub** ("Week by Week") is a student course portal (subjects, weekly materials, schedule, exams, staff, timetable, GPA calculator, announcements) with a private **admin dashboard** for editing it. Owner is **Omar** (10th of Ramadan City, Egypt). The live site must never break; work proceeds phase-by-phase in plain language. Omar often can't test, especially on mobile (iterate via screenshots).

- **Frontend:** static files on **GitHub Pages**. Repo `Week-by-Week` under `OMAR6972`. Live: `https://omar6972.github.io/Week-by-Week/`.
- **Backend:** **Supabase** free tier. Project URL `https://eeljqqrrpjpmpbvlzqqm.supabase.co`. Publishable key lives in `supabase-config.js` (safe to be public; RLS protects writes). Service key / DB password are never in code.
- **Email/SMTP:** **Brevo** (free, 300/day) wired into Supabase for auth emails (see §6).

---

## 2. Status

| Phase / feature | State |
|---|---|
| Monolith → modular + Supabase, live editing, admin mgmt | ✅ done |
| 7.1 Semesters (per-semester data, switcher, `?sem=` links, add/rename/set-current/delete) | ✅ done |
| 7.2 Auto "NEW" badges (14 d) + "Updated X ago" + auto-announcements | ✅ done |
| GPA "load semester subjects" preset | ✅ done |
| **7.3 Stats dashboard** (charts from `click_events`) | ✅ done |
| **7.3b Stats UX** (hourly "Today" view, Most/Avg/Lowest, per-subject drill-down, recent-activity list, Y-axis label, fixed chart heights) | ✅ done |
| **7.3c Detailed click tracking** (materials/links/contacts/outbound) + per-subject material drill-down | ✅ done |
| **7.4a Accounts** (username login, confirm-password signup, 🔑 change-password/username panel, forgot-password 6-digit code) | ✅ done |
| **7.4 Font Awesome icons + theme redesign** | ⬜ **next / last** — do AFTER a `v1-working` backup; discuss look first |

---

## 3. Current file versions (upload the latest of each)

| File | Version line | Changed this session? |
|---|---|---|
| `student.js` | 2026-06-28 | no |
| `student-data.js` | **2026-07-01 (7.3c)** | **yes** — basic analytics + detailed click tracking appended |
| `admin.html` | **2026-06-30 (7.4a)** | **yes** — loads `admin-stats.js` + `admin-account.js` |
| `admin-auth.js` | **2026-06-30 (7.4a)** | **yes** — username/email login, confirm-pw signup, forgot-pw code |
| `admin-account.js` | **2026-06-30 (7.4a)** | **NEW** — 🔑 Account panel (change password + username) |
| `admin-stats.js` | **2026-07-01b (7.3c)** | **yes** — full dashboard incl. detailed clicks |
| `admin.js` | 2026-06-28 | no |
| `admin-semester.js` | 2026-06-28 | no |
| `admin-manage.js` | (unchanged) | no |
| `admin.css` | 2026-06-28 | no |
| `supabase-config.js`, `course_data.js`, `index/gpa/staff/semester.html`, `logo.png` | unchanged | no |

**SQL migrations (run in Supabase, in order; all already run):**
`academic_hub_semesters.sql` → `academic_hub_stats.sql` (creates `click_events`) → `academic_hub_accounts.sql` (case-sensitive usernames) → `academic_hub_stats_detail.sql` (drops the `event_type` whitelist).

---

## 4. Files (roles)

| File | Role |
|---|---|
| `index.html` | Student shell. Nav tabs are **static HTML here** (and copied into gpa/staff/semester.html). Loads course_data.js, supabase CDN, supabase-config.js, student.js, student-data.js. |
| `student.js` | Student app (~8,600-line monolith). Hash routing, `LIVE_UPDATE`, GPA calc, createdAt-based NEW badges, "Updated X ago". **Not edited for stats** — all tracking lives in student-data.js. |
| `student-data.js` | Picks the semester, loads its `site_data`, posts `LIVE_UPDATE`, injects the navbar semester dropdown. **Plus two appended analytics blocks:** (a) basic logger → `page_view`/`tab_view`/`subject_open`/`resource_open` by wrapping `window.nav`; (b) detailed tracker → a capture-phase click listener logging `resource_click`/`link_click`/`staff_click`/`outbound_click`. Exposes `window.__ahLogEvent`. Falls back to bundled data on any error. |
| `supabase-config.js` | URL/key, creates `window.__ahSupabase`. |
| `course_data.js` | Frozen fallback data (Backup button writes it). |
| `admin.html` | Admin shell. Loads admin.js, admin-auth.js, admin-manage.js, admin-semester.js, **admin-stats.js**, **admin-account.js**. |
| `admin.js` | Admin editor. `saveData()`, `setView()`, `closeSidebar()`, `__ahAdminBoot`. Global (not IIFE-wrapped). |
| `admin-auth.js` | Login gate. Username-or-email login, confirm-pw signup + username claim, forgot-pw 6-digit code flow. Loads/saves scoped to editing semester. **Boot/data half is unchanged from pre-accounts.** |
| `admin-account.js` | 🔑 Account topbar button → modal: change password (verifies old first) + set/change username. Wraps `__ahAdminBoot` to self-inject. |
| `admin-stats.js` | 📊 Stats sidebar item + dashboard. Wraps `__ahAdminBoot` to self-inject nav button. Chart.js via CDN on first open. |
| `admin-semester.js` | Topbar **Editing** dropdown + ⚙ manage panel. |
| `admin-manage.js` | Owner-only 👥 Admins panel. |
| `gpa/staff/semester.html` | Copies of index.html opening to a view. Share all code + DB. |

---

## 5. Database (current)

- `semesters (slug PK, name, sort_order, is_current, created_at)` — public read; writes via RPCs.
- `site_data (key, value, updated_at, updated_by, semester)` — PK `(key, semester)`; FK `semester → semesters(slug)` ON DELETE CASCADE. Public read, admin write. 10 keys per semester.
- `click_events (id, created_at, session_id, semester, event_type, label, detail, path)` — analytics. RLS: **anon + authenticated INSERT**, **admin-only SELECT** (`public.is_admin()`). The `event_type` CHECK was **dropped** in 7.3c so any event type stores. Event types in use: `page_view, tab_view, subject_open, resource_open, resource_click, link_click, staff_click, outbound_click`.
- `app_usernames (user_id PK → auth.users, username, created_at)` — **case-sensitive** unique index on `username`. RLS: a user reads only their own row. RPCs do the cross-user checks.
- `admins (user_id, email, is_super, …)` — allowlist; `is_super` = owner.
- **RPCs:** `is_admin`, `is_super_admin`, `list_admins`, `add_admin`, `remove_admin`, `create_semester`, `set_current_semester`, `rename_semester`, `delete_semester`, **`username_available(text)`, `claim_username(text)`, `email_for_identifier(text)`** (last one resolves username→email for login; SECURITY DEFINER, reads `auth.users`).

---

## 6. Accounts & email (how it works / what's configured)

- **Login** accepts **username OR email**. If the input has `@` it's treated as the email and sent straight to sign-in (so existing accounts and a not-yet-run migration both keep working — no lockout). Otherwise `email_for_identifier` resolves the username.
- **Usernames are case-sensitive** (`Omar` ≠ `omar`), 3–20 chars, letters/numbers/`_`/`.`. Set/changed in 🔑 Account or at signup.
- **Change password** re-authenticates with the old password first, then `updateUser`.
- **The 2 original accounts** (owner + 1 admin) need no migration — they log in by email and can set a username anytime in 🔑 Account.
- **Forgot password** = `resetPasswordForEmail` → 6-digit code email → `verifyOtp({type:'recovery'})` → `updateUser`.

**Brevo SMTP (configured & working):**
- Supabase → Authentication → SMTP Settings (Custom SMTP enabled):
  - Host `smtp-relay.brevo.com` · Port `587`
  - Username (Brevo SMTP **Login**): `b0608d001@smtp-brevo.com`
  - Password: **a Brevo SMTP key** — stored in Supabase only. ⚠️ **Rotate it** (it was shared in chat during setup): Brevo → Settings → SMTP & API → SMTP → generate a new key → paste into Supabase → save.
  - Sender email: `electric.junior23.27@gmail.com` · Sender name: `Academic Hub`
- Supabase → Authentication → **Email Templates → Reset password** uses `{{ .Token }}` (the 6-digit code). Body currently:
  ```html
  <h2>Reset your password</h2>
  <p>Enter this code in the Academic Hub dashboard to set a new password:</p>
  <p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:18px 0;">{{ .Token }}</p>
  <p>This code expires in 1 hour. If you didn't request it, you can safely ignore this email.</p>
  ```
- Supabase → Authentication → Providers → **Email → Email OTP Length = 6**.
- Note: editing email templates **requires** Custom SMTP enabled (default Supabase email locks the Source editor).

---

## 7. Stats dashboard (how it works / for you)

- 📊 **Stats** in the admin sidebar (Insights section). Scoped to the **editing semester**, with an **All semesters** toggle and ranges **Today (hourly) / 7 / 30 / 90 days / All time**.
- **KPIs:** unique visitors, page loads, subject opens, week opens, material clicks.
- **Most / Average / Lowest** across subjects. **Activity over time** line (hourly when "Today", daily otherwise; Y-axis = events).
- **Per-subject drill-down:** click a subject → its *Weeks opened* and *Materials clicked inside weeks*, each with Most/Avg/Lowest.
- **"What students actually clicked":** Top materials, Top useful links, Contacts opened, Other outbound by page.
- **Recent activity:** newest-first list with exact date + time.
- **Tracking is forward-only** — it counts from deploy onward, never retroactively. Charts start empty and fill in as the live site is used.
- **Anonymous:** a random `session_id` in localStorage; no logins, no personal data. Logging is best-effort and never blocks/breaks the page or navigation.

**Key implementation facts (for whoever edits next):**
- `student.js` is **not** IIFE-wrapped, so its top-level `function`s are global (`window.nav`, `getActivePageId`) and its top-level `let`s (`currSub`, `currentContentObj`, `currentPageId`) are readable by name from `student-data.js`. The detailed tracker reads them defensively (try/catch).
- The admin panels (`admin-stats.js`, `admin-account.js`) self-inject by **wrapping `window.__ahAdminBoot`** (composes fine with `admin-semester.js`/`admin-manage.js`), so `admin.js`/`admin-auth.js` stay untouched.

---

## 8. Backup (course_data.js)

⬇ **Backup** button downloads a ready-made `course_data.js` for the editing semester. To use: GitHub → Add file → Upload files → drop it → Commit (overwrites). It's only the offline safety net, so back up while editing the **current/live** semester every couple of weeks or after a big content push.

---

## 9. Gotchas / lessons

- **Student nav tabs are static HTML** in index/gpa/staff/semester.html — to add/remove a tab, edit all four.
- **Verify the VERSION line** before committing; "no changes to commit" = stale download.
- **Cache:** if a commit succeeds but the page looks old, hard-refresh (GitHub Pages/browser cache).
- **Schema + code ship together.**
- Supabase blocks `UPDATE`/`DELETE` without `WHERE`.
- Supabase **doesn't trim** the SMTP Host field — a stray space breaks email silently.
- Publishable key is safe in client code; never expose the service key / DB password / SMTP key.
- Analytics must **never reject inserts** — that's why the `event_type` whitelist was dropped.

---

## 10. Next up — 7.4 theme/icons (the only thing left)

- **Save a `v1-working` backup first** (whole repo, e.g. a Git tag or a zipped copy) — this touches saved icon data and the global look.
- Replace emoji/inline icons with **Font Awesome** and do the **theme redesign**. Large and additive; **discuss the visual direction before starting.**
- Housekeeping (non-urgent): **rotate the Brevo SMTP key** (see §6), and after a few days of real traffic, review the Stats panel to decide if any charts should change.

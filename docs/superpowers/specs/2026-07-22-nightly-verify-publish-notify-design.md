# Nightly AI-verify → publish → email automation + admin Settings page

**Date:** 2026-07-22
**Status:** Approved design (this doc), implementation plan to follow.

## Goal

Fully automate the daily tail of the pipeline. Today the 2-hourly scheduled
scrape fills `dbo.martyrs` with `unverified` rows; verification, publishing
and pushing are manual. After this change:

- The existing task **`AqmarTofan 2-Hourly Scrape`** keeps running unchanged
  (task 1).
- A **new task runs daily at 22:30** (task 2): AI-verifies everything
  pending, publishes (site files → public `AQMAR` repo, auto-deploying
  aqmar.pages.dev + GitHub Pages; full repo → private `AQMAR-pipeline`
  backup), and emails the user a summary.
- Email is sent **only** when there are new people, rows stuck waiting for a
  human decision, or a failure. Nights with only silent fixes still push but
  send no mail.
- Email settings (sender Gmail, App Password, multiple recipients, on/off)
  are editable from the admin portal, which is restructured into two pages:
  **People verify** and **Settings**.

### Decisions made with the user (2026-07-22)

| Question | Decision |
|---|---|
| Schedule for verify+push+email | Once daily at 22:30 (supersedes the earlier "4×/day" idea) |
| Email transport | Gmail SMTP with an App Password from `mohamed.khamis.alex@gmail.com` |
| Default recipient | `mohamed.khamis.alex@gmail.com`; more addable in admin |
| Push rule | Push on **any** data change; email only for new people / stuck rows / errors |
| Stuck (needs-human) rows | Do email about them, listing the reason each needs a decision |
| Architecture | **A** — deterministic script orchestrates; headless Claude does only the visual verification; git/email never touched by the AI |
| Code privacy | **No code on public GitHub.** The public `AQMAR` repo is fresh-started to contain the site only (webui + JSON + images); all code lives in the local repo |
| Code backup | New **private** GitHub repo (e.g. `AQMAR-pipeline`) — full local repo (code + data + history) pushed there nightly; visible to the user's account only |

### Standing git authorization (scoped)

The user's absolute rule — no `git add/commit/push` without explicit
approval — still governs all interactive work. This design is the user
**explicitly authorizing the scheduled script** (and only it) to, on its
22:30 run: commit the specific data paths listed below in the local repo,
push the local repo to the **private** backup remote, and commit + push the
site snapshot to the **public** site repo. Nothing else inherits that
authorization. The one-time migration (creating the private repo,
fresh-starting the public one) is performed interactively with explicit
per-step approval.

## Facts this design leans on (verified 2026-07-22)

- `scripts/ai_verify_daily.ps1` already drives headless Claude
  (`claude -p`, subscription auth, tool-restricted, git disallowed) through
  `ai_verify.py pending → apply`. It logs to `data/ai_batches/daily_logs/`
  and exits 0 on an empty queue. It is **not** registered in Task Scheduler.
- `scripts/publish.ps1` already does export → `stage_covers.ps1` →
  `git add martyrs.json settings.json` → commit `publish vN[: note]` →
  **`git push`** (CLAUDE.md's "no auto-push" note is outdated).
- Export (`src/exporter.py` → `get_verified_for_export`) includes rows where
  `verification_status='verified'` **or** `ai_verified=1` (minus rejected) —
  so AI-verified people publish without waiting for manual verification.
- `mark_ai_note` leaves `ai_verified=0`, so noted rows stay in the pending
  queue; `data/ai_batches/noted_ids.json` stops the agent re-asking.
- **Photos gap (live bug):** `data/photos/` is tracked but no script stages
  new photos; 51 photos (msgs 1765–1869) are untracked and published rows
  already reference some → broken portraits in production. This design fixes
  it.
- `data/settings.json` is git-tracked and publicly served — credentials and
  private emails must not go there.
- Config is read from `.env` via `dotenv_values` (CWD-relative — every
  script must run from the repo root); no email/SMTP code exists anywhere.
- The 2-hourly task is `schtasks /it` (interactive, visible console); today
  a run died because its console window was closed. The nightly task must
  run hidden.

## Components

### 1. Task registration — `scripts/setup_nightly_trigger.ps1`

Registers **`AqmarTofan Nightly Verify+Publish`**, daily 22:30, via
`schtasks /create /sc DAILY /st 22:30 /it /rl LIMITED /f` (same pattern as
`setup_2hourly_trigger.ps1`; no UAC required — an elevated shell is fine but
not needed). Deletes/recreates on re-run.

The task action launches a generated hidden-window wrapper
`scripts\_run_nightly_silent.vbs` that runs
`cmd /c "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\nightly_verify_publish.ps1 >> logs\nightly_publish.log 2>&1"`
hidden (`WScript.Shell.Run …, 0, True`) and then `WScript.Quit`s with
powershell's exit code. Hidden window means nothing can be killed by closing
one; **waiting + quitting with the exit code** makes Task Scheduler's Last Run
Result reflect real failures (the only signal for an SMTP-send failure, which
by definition sends no email); the `cmd` redirection captures native
python/git output that `Start-Transcript` cannot in a hidden window. The setup
script overwrites its generated wrapper on re-run (same convention as the
2-hourly setup — don't hand-edit the wrapper).

### 2. Orchestrator — `scripts/nightly_verify_publish.ps1`

Runs from the repo root. Supports `-DryRun` (verify phase runs; publish and
email phases only *print* what they would do). Phases:

**Phase 0 — guards.** Abort (error email + non-zero exit) if:
- a lock file `logs/nightly_publish.lock` exists (stale-lock tolerance by
  age); create it, delete on exit;
- `git diff --cached --quiet` fails — something is already staged; the
  publish commit must never sweep in unrelated work;
- the repo root / `.venv` / `.env` / DB connection are unavailable.

(A missing `claude` CLI is **not** an abort — it's a phase 1 failure; the
deterministic phases still run.)

**Phase 1 — AI verify (the only AI step).** Loop up to 3 passes:
`ai_verify.py pending` → if rows exist, pipe the verify-only prompt into
`claude -p --output-format text` under an **allowlist** (`--allowedTools
"Read" "Write" "Edit" "Glob" "Grep" "Bash(.venv*)" --disallowedTools
"Bash(git*)"`, same proven set as `ai_verify_daily.ps1`), reusing its rules
and prompt (read the video card not the caption; month is the middle token;
poster DD-MM-YYYY breaks ambiguous swaps; conflicts and day-less dates →
`verified:false` + note; pick the cover frame, usually `_28`). The allowlist
(not `--dangerously-skip-permissions`) is deliberate: headless `claude`
auto-approves the allowed tools and denies anything else WITHOUT prompting,
so the job stays silent while a prompt-injection in an externally-sourced OCR
image is confined to file ops + `.venv` python — git stays disallowed on top.
(The user's original ask was `--dangerously-skip-permissions` "to work
silent"; a 2026-07-22 security review replaced it with the allowlist, which
meets the silent-operation goal with a far smaller blast radius.) Loop ends when
pending contains only noted rows or passes are exhausted.
*Failure handling:* a Claude failure (not logged in, crash, timeout) is
recorded and reported by email, but does **not** abort the run — phases 2–3
are deterministic and safe to continue.

**Phase 2 — publish (no AI).** Two repos are involved (see component 6):
the **local repo** (full project; `origin` = the new private backup repo)
and the **site repo clone** (a sibling checkout of the public `AQMAR`
repo, e.g. `D:\Repo\01-Khamis-Projects\AQMAR-site`).

1. Build the would-be export payload in memory (reuse `exporter` row
   building) and diff it against `git show HEAD:data/martyrs.json`, ignoring
   the `version` / `generated_at` / `note` envelope fields. Also compute
   untracked-but-referenced photos.
2. If nothing differs, skip the export/commit steps: **no publish version is
   consumed and no publish commit is made** on no-change nights. (The
   private backup push in step 4 still runs — it's a backup, not a publish.)
3. Otherwise: run the real `export_to_json.py` (writes `data/martyrs.json`,
   records `dbo.publish_versions`), then in the **local repo** stage exactly:
   - cover frames via existing `scripts/stage_covers.ps1` (`git add -f`,
     chunked — `data/frames/` is gitignored);
   - **photos referenced by the export's `photo_path` values** (new
     `scripts/stage_photos.ps1`, chunked adds; first run repairs the 51
     currently-broken portraits; unpublished rows' photos stay untracked);
   - `data/martyrs.json`, `data/settings.json`;
   and commit `publish vN: nightly auto (X new, Y fixed)`.
4. **Private backup push:** `git push origin master` — full repo (code +
   data + history) to the private `AQMAR-pipeline` repo. Runs every night
   even with no publish, so code edits made during the day are backed up.
5. **Site sync + public push:** mirror the allowlist into the site repo
   clone: `index.html`, `sw.js`, `webui/` wholesale; `data/martyrs.json`
   and `data/settings.json`; but photos and cover frames **only for rows in
   the export** (`photo_path` / `featured_frame_path` values — never the
   whole folders, so photos of not-yet-published people don't leak to the
   public repo; removed rows' files are pruned). Then `git add -A` there
   (everything in that repo is site content by construction), commit
   `publish vN: nightly auto (X new, Y fixed)` if changed, `git push`. One push → Cloudflare + GitHub Pages
   deploy, as today. Missing clone → recreated with `git clone`.
   Push rejection on either remote → error email, commit stays local,
   non-zero exit.

**Phase 3 — report + email** via `scripts/nightly_report.py` (new):
- **New people** = `msg_id`s in tonight's export that are absent from the
  previous published `martyrs.json`. The baseline is the `git show
  HEAD:data/martyrs.json` snapshot **captured in phase 2 step 1, before the
  export overwrites the file** — derived from data, not from what the AI
  claims, so it's correct even if phase 1 half-failed.
- **Stuck rows** = DB rows with `verification_status='unverified' AND
  ai_verified=0 AND ai_note` non-empty, with the note text as the reason.
- Date-fix and cover counts from the DB: rows with `ai_verified_at >=` run
  start (the `apply` console summaries are logged but not parsed).
- Send matrix: new people > 0 **or** stuck rows > 0 **or** any phase
  reported an error → send; otherwise silence. Email-send failure → log +
  non-zero exit (Task Scheduler shows the failure).

**Timing note:** the 22:00 scrape may still be running at 22:30 — harmless
(the scrape never touches git; DB upserts are per-row). Rows landing after
the last verify pass simply wait for tomorrow.

### 3. Email — `src/notifier.py` + `src/notify_store.py` + `data/notify_settings.json`

`data/notify_settings.json` — **gitignored** (added to `.gitignore`), local
to the PC, atomic writes (same tempfile+`os.replace` pattern as
`settings_store.py`):

```json
{
  "version": 1,
  "enabled": false,
  "sender_email": "mohamed.khamis.alex@gmail.com",
  "app_password": "",
  "recipients": ["mohamed.khamis.alex@gmail.com"]
}
```

`enabled` stays `false` until a password is saved. `notify_store.load/save`
validates shape (emails plausibly formed, recipients non-empty when
enabled).

`src/notifier.py` — stdlib `smtplib` over SSL to `smtp.gmail.com:465`;
builds a bilingual, RTL-aware HTML mail (Arabic primary). Functions:
`send_summary(settings, report)`, `send_test(settings)`,
`send_error(settings, stage, detail)`. Never logs the password. Summary
content: publish version + row count, new people (name, birth/martyrdom
dates, Telegram message link), date-fix/cover counts, stuck rows with
reasons, links to https://aqmar.pages.dev and the local admin portal.

### 4. Admin API — `src/admin_app.py` additions

- `GET /api/notify-settings` (admin): settings with `app_password` replaced
  by `has_password: true|false`.
- `PUT /api/notify-settings` (admin): same shape; **omitted/empty
  `app_password` keeps the stored one**; validates emails; 422 on bad input.
- `POST /api/notify-test` (admin): sends a test mail with current stored
  settings; returns `{ok}` or `{ok:false, error}` (SMTP errors surfaced,
  password never echoed).

All three use the existing `require_admin` dependency. The password
round-trips only PC-side (browser → localhost API → gitignored file).

### 5. Web UI — split admin into two pages

Same SPA, same login/session (token in `sessionStorage`, probe of
`/api/martyrs/unverified`); a new Alpine view value, not new HTML files.

- Admin banner gains two tabs: **التحقق** (People verify, `view='admin'`)
  and **الإعدادات** (Settings, `view='admin-settings'`). Banner keeps
  Publish / Export AI / Sign out on both. `goto()` gating for
  `'admin-settings'` mirrors `'admin'` (`adminAllowed` — loopback only;
  nothing leaks to public deploys).
- **People page:** existing stats strip, filters, table, edit form —
  unchanged.
- **Settings page:** sections in order:
  1. **الأحداث العامة** — the existing events editor block
     (`index.html:965-1033`) moves here verbatim; its `x-show="!editingId"`
     coupling is dropped (no edit form on this page).
  2. **إشعارات البريد** — enable toggle; sender email; App Password input
     (write-only: placeholder shows "•••• saved" when `has_password`, typed
     value overwrites, blank keeps); recipients list (add/remove rows);
     **Send test email** button with inline success/error message.
- New state keys (`notifySettings`, `notifySaving`, `notifyError`,
  `notifyTestResult`) and methods (`loadNotifySettings`,
  `saveNotifySettings`, `sendTestEmail`) on the `aqmar()` factory; API calls
  via existing `AQMAR_API`; save replaces state from the server response
  (same non-optimistic pattern as events). Loads lazily on entering the
  Settings page — nothing new on the public boot path.
- Existing exported pure-function names (used by `tests.html`) are not
  renamed.
- Per the user's preference, the Settings-page layout is chosen from a
  throwaway visual preview page before final wiring.

### 6. Two-repo publishing — the public repo IS the site

Decision (2026-07-22, revised after discussion): **no code on public
GitHub at all**, code stays local with a **private** GitHub backup.
Context: the public repo currently exposes everything — GitHub Pages
branch-builds `master` and `deploy-pages.yml` stages `git archive HEAD`
wholesale (`aqmar.pages.dev/scripts/ai_verify.py` is fetchable right now),
and the repo page shows all code plus its full history. The existing
`.gitignore` entries for `scripts/ai_verify.py`, `src/sqlserver_client.py`
etc. are **no-ops** (files already tracked) and get removed.

Target layout:

| Repo | Visibility | Content | Role |
|---|---|---|---|
| `AQMAR` (existing, github.com) | public | `index.html`, `sw.js`, `webui/`, `data/martyrs.json`, `data/settings.json`, published rows' photos + cover frames, deploy YAML, minimal README | The site. GitHub Pages branch-builds it (URL unchanged); Cloudflare deploys it (workflow simplifies — the whole tree *is* the site, no filtering) |
| `AQMAR-pipeline` (new) | **private** | full current repo — code + data + complete history | Nightly backup; visible only to the user's account |
| Local working tree (this repo) | — | everything | Source of truth. `origin` re-pointed to the private repo; site repo cloned as a sibling (`AQMAR-site` folder) for the nightly sync |

One-time migration (interactive, per-step approval, during implementation):

1. `gh repo create AQMAR-pipeline --private`; re-point `origin` to it; push
   full `master` (history preserved, including the `martyrs.json` publish
   history).
2. Build the site snapshot, create a **fresh orphan commit** ("site
   snapshot vN") in the public `AQMAR` repo, force-push `master` — old
   commits containing code disappear from the public repo. *Caveat stated
   once: anyone who cloned/forked earlier keeps their copy; the past can't
   be recalled.*
3. Verify both hosts redeploy correctly from the new public history.

Notes:

- `mohamedkhamis.github.io/AQMAR` **keeps working** — Pages still
  branch-builds the (now site-only) public repo. No Pages settings change.
- The Cloudflare workflow file moves into the site snapshot (its repo
  secrets already live on the public repo and survive the fresh start);
  its "stage" step simplifies to "deploy the tree".
- Admin page: unchanged — ships inside `webui/`, inert off localhost
  (`adminAllowed` gate), exactly as today.
- The local repo keeps ALL files tracked (scripts, src, tests, docs) —
  "local only" is achieved by where remotes point, not by untracking, so
  version control and the nightly private backup cover everything.

## Error handling summary

| Failure | Behavior |
|---|---|
| Something already staged | Abort before any git action; error email |
| Concurrent/stale run | Lock file; abort second instance |
| Claude CLI missing/failed | Skip/record; deterministic phases still run; reported in email |
| No data change tonight | No version consumed, no publish commit, no site push, no email (the private backup push still runs) |
| Push rejected (either remote) | Commit stays local; error email; non-zero exit |
| Site repo clone missing or dirty | Re-cloned / hard-reset to remote before the sync (it holds no unique state — everything is derived from the local repo) |
| SMTP failure | Logged; non-zero exit (visible in Task Scheduler) |
| Corrupt `notify_settings.json` | Treated as not-configured; error logged; run continues without email |

## Testing

- **pytest** (extends the existing 92): `notify_store` round-trip,
  validation, atomic write, password masking/keep-on-omit;
  `nightly_report` new-people diff (fixture payloads) and stuck-row query
  shaping; `notifier` message building with SMTP mocked (send matrix:
  new/stuck/error/silent); admin endpoints via FastAPI `TestClient`
  (auth required, masking, test-send mocked).
- **Manual:** visual preview page for the Settings UI; **Send test email**
  against real Gmail; `nightly_verify_publish.ps1 -DryRun`; one supervised
  live run end-to-end before trusting the schedule.
- **Migration:** after the public fresh-start, confirm on both hosts that
  the SPA, photos, covers and JSON still load, that `/scripts/ai_verify.py`,
  `/src/…`, `/CLAUDE.md` return 404, that github.com/mohamedkhamis/AQMAR
  shows only site files with a single-commit history, and that the private
  repo holds the full history.

## One-time user setup

1. On the `mohamed.khamis.alex@gmail.com` Google account: enable 2-Step
   Verification → create an App Password (myaccount.google.com/apppasswords)
   → paste it in admin **Settings → إشعارات البريد** → **Send test email**.
2. Run `scripts\setup_nightly_trigger.ps1` once (normal or elevated
   PowerShell).
3. Keep the `claude` CLI logged in to the Claude subscription (already true
   for `ai_verify_daily.ps1`).
4. Approve each step of the one-time repo migration when we run it together
   (private repo creation, public fresh-start force-push) — no Pages
   settings change is needed.

## Follow-on impact

- `scripts/publish.ps1` (manual publish) currently pushes the whole repo to
  `origin` — after the migration that would hit the private backup, not the
  site. It is rewritten as a thin wrapper over the same publish/sync steps
  the nightly script uses (export → local commit → private push → site sync
  → public push), minus verify and email — so a manual publish stays one
  command.

## Out of scope

- Changing the 2-hourly scrape task (visible console, log rotation).
- Retiring `scripts/ai_verify_daily.ps1` (superseded but left in place) and
  `setup_daily_trigger.ps1`.
- Any auth beyond the existing shared `ADMIN_TOKEN`.
- Committing the currently-dirty working tree (`ai_verify.py` refactor
  etc.) — handled separately with normal approval.

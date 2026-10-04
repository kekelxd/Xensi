# XENSI Sessions V1

## Scope

One session is one actual minigame execution; a routine produces one run and N
sessions. No generic aim score, rankings or new PB/Analysis product. Existing
Home/recent-session/PB consumers now read Sessions. Calibration and diagnostics
remain outside this layer and are not uploaded. Guest is local; Supabase is the
source for authenticated accounts, supplemented by a durable append retry queue.

Applied migration: `20261004020823_create_training_sessions.sql`, project
`zbdznwubrrkxuraispvr`. No existing profiles/preset/routine data were changed.

## Schema and Security

- `training_sessions`: UUID, owner, exercise, start/finish/duration, terminal
  status/reason, optional run/routine/step/preset references, JSONB metrics,
  JSONB context/configuration, comparison signature, schema/exercise versions,
  server-created timestamp. Immutable: no UPDATE grant or policy.
- `routine_runs`: UUID, owner, optional routine reference, name snapshot,
  start/finish/duration, running or terminal status/reason, schema version,
  server-created timestamp. UPDATE only on status/finish/duration/reason columns,
  only from own running row to own terminal row. Snapshots cannot be changed.
- RLS on both; authenticated SELECT/INSERT/DELETE own only. No PUBLIC/anon grants.
  Both user FKs cascade on auth deletion. Optional definition/run FKs SET NULL,
  preserving the result and immutable context. There is no history deletion UI.
- `xensi_append_training_history(expected_user_id,payload)`: SECURITY INVOKER,
  empty search_path, authenticated EXECUTE only; atomic batches max 100 per kind,
  run dependencies first, same-own-UUID retries confirm without overwriting
  results, foreign UUID/owner denied. Direct foreign-run/definition references
  denied by RLS. RPC resolves only owned definitions; missing/deleted guest
  references become NULL while their context snapshots remain unchanged.
- No meaningless updated_at on append-only results; existing updated_at triggers
  untouched. Versions: schema_version=1 describes records; exercise_version=1
  describes scoring/rules. Readers reject unsupported versions explicitly.
- Indexes: session owner/finish/id, owner/exercise/finish, run/routine/step/preset
  FKs; run owner/start/id and routine FK. Query adapter supports exercise,
  7/30/90-day filter and pagination, max 300 rows per fetch. No automatic cloud
  retention or infinite browser download. Initial history load: latest 300.

## Metrics Registry

`trainingSession.ts` defines a mode-discriminated union, NOT Record<string,any>.
`SESSION_REGISTRY` reuses `PERSONAL_BEST_DEFINITIONS`; only one primary per mode.

| Mode | Primary | Direction | Persisted actual metrics |
| --- | --- | --- | --- |
| switch | score, points | higher | score, accuracy, onTargetMs, hits, bestStreak, reaction/acquisition mean, aim bias, overshoots/corrections |
| tracking | accuracy, % | higher | accuracy, onTargetMs, bestTrackingStreakMs, reaction/acquisition mean, aim bias, overshoots/corrections |
| strafetrack | accuracy, % | higher | same tracking contract |
| flick | score, points | higher | score, accuracy, hits, shots, clickErrors, bestStreak, reaction/acquisition mean, aim bias, overshoots/corrections |
| reflex | score, points | higher | same click-exercise contract |
| gridshot | score, points | higher | same click-exercise contract |
| sniper-reaction | bestReactionMs, ms | lower | hits, misses, shots, earlyShots, noShots, attempts, accuracy, mean/median/best hit reaction, consistency |

Sniper primary is minimum HIT reaction, not mean reaction. Missing best/median/
consistency remains NULL. No unproduced generic sniper tracking fields are
persisted. `sessionSummary` is only a legacy-UI projection, not another source.

## Snapshots and Comparison

Context captures game, sensitivity, DPI, original preset ID and optional original
routine ID/name/step ID. Full execution configuration includes selected/effective
difficulty, duration, arena geometry, mouse-pointer-lock input, crosshair, target
count and difficulty constants (scale/speed/dwell/respawn; sniper opening/radius/
speed). Derived behavior is reproducible via exercise version. No IP, fingerprint
or unnecessary hardware identity. cm/360 is not a source of truth.

Signature is explicitly ordered JSON of exercise/version and normalized actual
configuration. Sensitivity, DPI, game and preset identity are evidence but NOT
automatic comparison barriers. Duration, geometry, targets or version changes
separate groups. Definition edits/deletes never alter snapshots. Invalid/
interrupted records cannot award PB or enter performance trends. Existing Analysis
performance uses the newest valid comparability group per exercise; its recent
list retains invalid/interrupted records with PT/EN/ES status labels. No new graphs.
Personal Bests V1 now derives every comparable group from persisted Sessions,
using a read-only RPC for the full account history rather than its 300-row cache.
See [PERSONAL_BESTS.md](PERSONAL_BESTS.md) for rules, security and verification.

## Recorder and Interruption

`SessionRecorder` centralizes start/sample/invalidate/complete/abort and run
start/finish. First active frame emits one lifecycle start. Samples only update
memory; persistence is never per frame. No targeting/scoring/input/DPI changes.
Absolute timestamps are separate from performance.now duration. Session duration
is the observed interval (including pauses); paused executions are invalid.
Run duration includes countdowns/transitions; sessions start at actual gameplay.
Once Auth resolves the owner, recording does not wait for the remote history
fetch; slow history reads cannot silently discard a newly started execution.

Natural pointer-lock release AFTER completion stays valid. Other lock loss keeps
existing pause/resume but marks invalid. Stable reasons cover ESC, hidden page,
resized arena, manual abort, navigation, account change, reload and unverified
legacy data. First observed reason wins. Interruptions retain the last available
sample (roughly 100ms cadence), or NULL, never fake completion or guessed metrics.
Start anchors recover the SAME UUID after reload. Newly opened tabs get their own
identity even if sessionStorage was cloned. If unloading did not finish,
duration stays unknown (0), metrics NULL. Recovery targets this tab; other tabs'
abandoned anchors become eligible only after 24h. A browser killed before the
first IndexedDB start transaction can lose that just-started record.

## Storage, Pending and Consent

- IndexedDB `xensi-sessions-v1` uses structured documents and scope index; guest
  and each user have separate records/cache/anchors/pending/receipts. Shared
  `AccountCollectionRepository` accepts asynchronous storage, preserving existing
  synchronous preset/routine behavior and auth race guards.
- Retention: 3,000 guest sessions, 300 sessions in each account cache. Referenced
  runs are protected; unrelated guest runs bounded to last 1,000, unrelated
  account runs bounded with the account cache. Pending dependencies are protected.
  There is no cloud deletion to implement local retention.
- Max 500 queued documents per account. Overflow/quota errors are explicit;
  existing pending writes are not evicted and no false save is claimed. At
  capacity a new final write can fail, leaving its existing start anchor; later
  recovery can produce an interrupted record, not an invented final score.
- Save locally before uploading. Retries use UUID; response-lost-after-commit
  cannot duplicate records. A's pending survives logout and never uploads as B.
  Token and expected-user checks protect requests; stale visible results are
  discarded. An older running-run acknowledgement cannot erase a newer final run.
- Retry on login/refresh/online/new endpoint/explicit retry. No giant offline
  scheduler or realtime subscriptions. BroadcastChannel invalidates other tabs.
- One consent dialog for presets/routines/sessions. Runs import before sessions
  in bounded batches. All UUIDs must be confirmed before receipts; partial and
  response-lost imports retry safely. Guest originals retained, cloud UUID wins.
  Dismissed history-only imports can be offered again with the existing Profile
  import icon; no automatic upload or extra dialog is introduced.
- Legacy raw `sensi-warmup-session:v1:*` documents remain untouched. Transactional
  migration assigns stable IDs to timestamped summaries exactly once. They lack
  provable V1 start/config/rules, so are invalid `legacy_unverified`, NULL config/
  signature, duration 0 (UNKNOWN), start=finish at the known recorded boundary.
  Untimestamped/malformed summaries remain in original raw data, not invented
  rows. Corrupt JSON reports failure, never an empty overwrite. Preset/routine
  storage is not migrated here. Browser-private-mode/quota failures are reported.

## Files and Checks

Core: trainingSession.ts, sessionRecorder.ts, sessionStorage.ts, sessionCloud.ts,
sessionRepository.ts, useSessionRecorder.ts. Shared: accountCollectionRepository.ts,
PresetSyncStatus.tsx, PT/EN/ES i18n/privacy text. Integration: Warmup.tsx, Routine.tsx,
warmupTelemetry.ts, personalBests.ts, Home.tsx, Analysis.tsx, account-aware Warmup
key in App.tsx, coordinated re-offer icon in PlayerProfile.tsx. Existing navbar
initialization race fixed in AppNavigation.tsx:
read current Auth after initialization, not an old resolved guest result after
login. No Auth form redesign, calibration, social or diagnostic sync.

SQL regression `supabase/tests/training_sessions.sql` uses generated users A/B
on the REAL remote database and rolls everything back: own CRUD (except forbidden
session UPDATE), terminal run transition, immutable metrics/snapshots, denied
cross-owner CRUD/foreign-run/owner mismatch/UUID collisions, repeated append,
SET NULL on preset/step/routine/run deletion, preserved snapshots, auth cascade,
anon denial. No production user records were modified or removed.

Unit tests cover all mode contracts, timing/snapshots/versions/signatures,
sensitivity comparability, primary/direction, PB exclusion, routine grouping,
malformed remote responses, delayed auth cache, consent, incomplete confirmation,
offline queue and response loss. Playwright covers all seven REAL mouse arenas,
actual multi-step routine, repeated PB, reload/interruptions, real IndexedDB
legacy/corruption/recovery/retention/500-queue limits and acknowledgement races.
Desktop/mobile consent/sync/account isolation/second-browser flows intercept
Supabase HTTP with fixtures; they are NOT a production email/password login test.
Touch-only browsers keep the existing pointer-lock gameplay limitation; mobile
storage/consent/UX is covered. Hidden-page browser coverage dispatches a simulated
visibility event; it is not a physical tab-switch measurement. Pointer-lock loss
and ESC are exercised separately against the real arena.

Sessions-specific test/config files: trainingSession.test.ts,
sessionRepository.test.ts, tests/session-lifecycle.spec.ts,
tests/session-storage.spec.ts, tests/session-pending.spec.ts,
tests/session-sync.spec.ts, tests/fixtures/sessionHistory.ts; extended shared
tests/fixtures/accountCloud.ts and tests/routine-sync.spec.ts. Updated existing
tests/home.spec.ts, tests/analysis-dashboard.spec.ts, tests/custom-routine.spec.ts,
tests/personal-bests.spec.ts, tests/preset-flow.spec.ts, tests/sniper-reaction.spec.ts
to use the new historical source. Config: playwright.config.ts,
playwright.presets.config.ts, .gitignore (generated test-result folders).
Database files: the migration above and supabase/tests/training_sessions.sql.
Earlier uncommitted Presets/Routines changes and unrelated files were preserved.

## Executed Verification (2026-10-04 UTC)

| Check | Result |
| --- | --- |
| `npx tsc -b` | Passed |
| `npm run lint` | Passed |
| `npm test` | 229 passed, 30 files |
| `npm run build` | Passed; existing >500kB bundle warning; JS 959.99kB / gzip 269.93kB |
| `git diff --check` | Passed; only Git LF/CRLF conversion warnings |
| `dist/index.html` search for `/Sensi/` | No matches |
| Remote SQL regression | All assertions passed, generated fixtures rolled back |
| Remote metadata | Both tables have RLS; 7 policies, 7 correct FKs, 8 indexes plus PKs; invoker RPC with empty search_path and narrow grants confirmed |
| Full default Playwright desktop/mobile | 100 passed, 20 skipped, 12 failed (details below) |
| Account transport Playwright desktop/mobile | 39 passed, 1 desktop-only-gameplay skip, no failures |

Final Playwright commands:

```sh
npx playwright test --project=desktop --project=mobile --workers=3 --output=test-results-sessions-all
npx playwright test --config=playwright.presets.config.ts --workers=2 --output=test-results-sessions-cloud
```

All seven arena completion tests, multi-step routine execution, reload UUID
recovery, separate pointer-lock/ESC/visibility paths, IndexedDB volume/recovery,
cross-owner pending isolation and retry/import tests passed. The account suite
also records a real arena interruption while its authenticated history GET is
deliberately blocked. No new framework/dependency was installed.

The full default suite is NOT green: these unchanged, older tests have stale
fixtures/expectations unrelated to Sessions and remain explicit follow-up work:

- tests/feedback.spec.ts:93 expects `/Sensi/`, but deployment is at `/`;
  :126 trusts a manually injected fake user ID, not a Supabase Auth session.
  Two desktop failures; existing mobile skips.
- tests/navbar-readability.spec.ts:65/:73 expects an authenticated profile menu
  from a localStorage-only fake identity; :135 expects an old methodology heading.
  Four failures across desktop/mobile.
- tests/profile.spec.ts:5 cannot open an authenticated menu with its
  localStorage-only fake identity. Six failures across desktop/mobile.

Auth was not weakened to satisfy these tests. Account-aware profile workflows
are covered in the passing HTTP-fixture suite. Production email/password Auth
and two physical devices were not tested here. Browser screenshots for the
combined consent dialog were inspected at desktop and mobile sizes; no overflow.
No commit or push was performed for this Sessions task.

Security Advisor: no new Sessions warning; prior nickname executable SECURITY
DEFINER warnings and disabled leaked-password protection remain outside scope.
Performance Advisor initially reports INFO unused owner-history index on an empty
new table; retained intentionally for indexed history/time queries. No destructive
workaround to silence that informational finding.

References: [anon nickname](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated nickname](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[unused index info](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

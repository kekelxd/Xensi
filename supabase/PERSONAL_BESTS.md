# Personal Bests V1

## Source and Architecture

`training_sessions` remains the sole cloud source of truth. Guest uses the existing
Sessions IndexedDB store. No `personal_bests` table, localStorage key, persisted PB
snapshot, trigger, materialization, dependency or separate import was introduced.
Guest retention remains Sessions V1's 3,000-session limit; guest records therefore
describe retained history, not a guarantee beyond that limit.

`src/trainingSession.ts` owns `SESSION_REGISTRY`: primary metric, direction, unit,
precision, supported flag and current exercise version. `comparisonSignature`
remains the Sessions V1 configuration signature. The old PB registry dependency
and duplicate Analysis comparison/formatter were removed, not retained in parallel.
There are no fabricated PB scores or demo fallbacks in production components.

`src/personalBests.ts` provides deterministic pure `derivePersonalBests`,
`evaluatePersonalBest`, `getPBForSession`, `didSessionSetPB`, and shared formatting.
`src/personalBestService.ts` supplies owner-scoped `getAll`, `getForExercise`,
`getForSession`, `compareSessionToPB`, `didSessionSetPB`, refresh and subscription.
Its in-memory projection is disposable and reconstructed from Sessions.

Eligibility: completed, no invalid reason, schema 1, positive integer exercise
version, signature/config/context/metrics present, valid timestamps and a finite
primary metric. Higher metrics accept genuine zero; reaction requires a positive
hit reaction. Missing reaction never falls back to mean, score or fabricated zero.

Comparisons use raw values. Display rounding cannot change eligibility or ranking.
An equal value is not a new record; the first chronological session/date wins.
Chronology is finished_at ascending, then UUID ascending if timestamps are exactly
equal, independent of fetch order. Importing older history can reveal an earlier
original record. No mutable PB state is needed to reproduce this choice.

## Mode Audit

| Exercise (id) | Primary metric | Direction | Unit / formatter | Signature | Supported |
| --- | --- | --- | --- | --- | --- |
| Target Switch (switch) | score | higher | points, localized integer | C + T | yes |
| Tracking (tracking) | accuracy | higher | %, localized 1 decimal | C + T | yes |
| Target Shooting (flick) | score | higher | points, localized integer | C + T | yes |
| Reflex (reflex) | score | higher | points, localized integer | C + T | yes |
| Gridshot (gridshot) | score | higher | points, localized integer | C + T | yes |
| Strafetrack (strafetrack) | accuracy | higher | %, localized 1 decimal | C + T | yes |
| Sniper Reaction (sniper-reaction) | bestReactionMs | lower | ms, localized integer | C + S | yes |
| Micro Flick (micro_flick) | meanAcquisitionTimeMs | lower | ms, localized integer | C + M | accuracy >=90%, hits >=5 |

M: actual target radius, minimum/maximum spawn radius, central reference radius,
timeout/respawn and PB quality gates. Seed is recorded but not compared.
See [Micro Flick V1](MICRO_FLICK.md) for the applied extension and validation.

C: exercise, exercise version, duration, selected/effective difficulty, arena
width/height, input type, crosshair and target count. T: target scale/speed,
dwell and respawn. S: sniper opening/radius/speed. Group key additionally includes
owner and primary metric. Version is explicitly included even if a malformed
external session reuses an old signature. Mouse/controller groups are distinct;
this does not add controller gameplay. Sensitivity, DPI, game, preset and routine
identity remain session context, not new comparison boundaries.

## Database and Performance

Applied to XENSI `zbdznwubrrkxuraispvr`:
`20261004031124_derive_personal_bests.sql`.

The only new database object is `public.xensi_personal_best_sessions`, a STABLE
read-only SECURITY INVOKER RPC with empty search_path, explicit auth.uid/expected
owner matching, existing training_sessions RLS, and no anonymous/PUBLIC EXECUTE.
The existing trusted service_role default grant is unchanged. No RLS/table grant
was relaxed, and no production rows were changed.

The RPC extracts JSONB primary values, ranks within exercise/version/signature,
and returns only winner Session rows, 100 per client page (server cap 200).
Metric selectors come from SESSION_REGISTRY; SQL validates selector fields but
does not maintain a second exercise-to-metric registry. A specific completion
query filters exercise/signature/version and excludes that session and all later
sessions. The boundary UUID must belong to the caller.

The account query covers all persisted history, including winners older than the
300-session browser cache. It runs on repository changes or explicit refresh,
not every React render/frame. Guest derives locally with the same pure engine;
the cloud preselection is followed by that engine too. No Realtime dependency.

`supabase/tests/personal_bests_explain.sql` ran EXPLAIN ANALYZE with authenticated
RLS against 361 rollback-only fixture sessions: 358 numeric eligible candidates,
5 winners, index scan `training_sessions_owner_exercise_time`, 148 kB sort memory,
no temporary disk blocks, 3.244 ms execution in that run. Existing indexes suffice
for this Alpha fixture; this is not a large-scale latency guarantee. The server
still scans/ranks eligible owner history, so reconsider expression/materialized
indexes only with real growth measurements. No speculative index was added.

## Lifecycle and UI

SessionRecorder still writes Sessions. Feedback waits for IndexedDB persistence
and, for accounts, successful cloud queue acknowledgement before querying prior
records. Gameplay does not wait. Failures show localized PB unavailable rather
than presenting the limited local account cache as a global record.

The service clears derived items during Auth loading or owner changes and ignores
late responses. Logout restores only guest history. Import reuses Sessions consent
and transport, then refreshes PBs. Removing a winner and refreshing selects the
best remaining session, without an orphaned PB row. Another device sees changes
on opening/refreshing the account; no background realtime promise is made.

Warmup result feedback, routine stage results, and the existing Analysis PB panel
use the shared service/formatter. First/new records are quiet feedback; ties and
invalid sessions do not celebrate. Analysis shows all comparable variants (first
8, expandable), duration, difficulty, version, date and detailed configuration.
Refresh, loading, unavailable and true empty states have PT/EN/ES copy. No charts,
ranks, achievements, Privacy or Auth UI redesign was introduced. A narrow grid
constraint prevents the Analysis shell from widening the PB panel on mobile.

## Executed Verification (2026-10-04)

- `npm test`: 31 files, 255 tests passed. Includes all seven metric mappings,
  higher/lower, raw precision, ties, empty/one/multiple records, invalid/interrupted,
  different modes/signatures/durations/versions/inputs, context independence,
  deletion, import, persistence ordering and delayed response owner isolation.
- `npm run lint`: passed.
- `npm run build`: passed, including `tsc -b` and route preparation. Vite warns
  about the existing single JS chunk exceeding 500 kB (966.35 kB minified).
- Cloud Playwright suite: 43 distinct cases passed, 1 desktop-only pointer-lock
  case skipped on mobile, counting targeted reruns of the two corrected PB tests.
  HTTP/Auth are intercepted fixtures, not live email/password sign-ins. Coverage
  includes existing presets/routines/Sessions, old winner beyond 300 cached rows,
  deletion, unavailable state, logout/account B, import and separate-browser refresh.
- Analysis/panel Playwright: 8 passed on desktop/mobile after updating the old
  empty-copy expectation and fixing mobile panel width. Screenshots inspected;
  panel bounds are asserted in addition to document overflow.
- Real pointer-lock PB gameplay: 1 desktop passed, 1 mobile skipped; first record,
  improvement, non-improvement and persisted reload across three executions.
- `supabase/tests/personal_bests.sql`: passed on the real project under authenticated
  and anon roles: >300 history, higher/lower/raw, ties, invalid/interrupted,
  signature/input/version groups, pagination, prior boundary, deletion, imported
  history, A/B isolation and anonymous denial. Fixtures and generated users rolled
  back. Post-test inspection confirmed zero training_sessions and no PB table.

The SQL tests exercise real PostgreSQL/RLS; browser transport tests are explicitly
mocked. The full unrelated default UI suite was not rerun for this layer.

Security Advisor: no PB finding. Three pre-existing warnings remain untouched:
[anonymous nickname SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated nickname SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance Advisor: existing INFO for
[unused training_sessions_owner_time](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
Retained for history pagination; an empty production table is not evidence to drop it.

No commit, push or production frontend deployment was performed in this layer.

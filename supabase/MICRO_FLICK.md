# Micro Flick V1

## Registration and Architecture

`exercise_id: micro_flick`, `exercise_version: 1`, category Precision.
Route `/train/micro-flick`. Mouse pointer lock only. Standalone duration is the
existing 60 seconds; Routines use the existing 60/120/180/240/300-second options.
No new duration system, dependency, controller, leaderboard or score formula.

Uses EXERCISES, WarmupArena's single canvas/RAF, shared countdown, crosshair,
pointer-lock lifecycle, getWarmupPointerGain and preset/session context.
Movement is accumulated in refs, not React state. Metrics publish at 100 ms.
DPI is recorded as context and never multiplies pointer gain.

## Spawn and Difficulty

All geometry uses the shorter logical arena dimension, independent of DPR and
aspect ratio. Reference follows the actual aim but is radially clamped to a
central zone of radius 10% of that dimension. Each target is a small stationary
disk near that reference, never overlapping the aim or outside the canvas.
The existing seeded RNG samples angles with rejection and six shuffled distance
strata per block. This balances distance difficulty without a circular sequence.

| Difficulty | Target radius | Spawn distance | Respawn |
| --- | --- | --- | --- |
| Easy | 2.596% | 6.5-10% | 220 ms |
| Normal | 2.068% | 7-12% | 150 ms |
| Hard | 1.584% | 7.5-14.5% | 90 ms |

Timeout is 2,000 ms. Misses retain the same target and acquisition clock.
Timeouts count as misses. Feedback is a brief crosshair tint, without particles,
shake or strong glow. Adaptive difficulty is not offered for V1.

## Real Metrics and PB

Recorded: hits, misses, shots, timeouts, accuracy, targetsPerSecond,
meanAcquisitionTimeMs, medianAcquisitionTimeMs, meanFlickDistancePx,
meanOvershootPx, overshootCount and consistency.

- Accuracy: hits / (hits + misses), including timed-out targets.
- Acquisition: visible spawn to successful click, including failed corrections.
- Distance: actual logical aim-to-target distance at spawn, averaged over hits.
- Overshoot: maximum projected travel past the far target edge per finished
  target, averaged over hits/timeouts; crossing is counted once per target.
- Consistency: clamped 100 * (1 - acquisition standard deviation / mean),
  only available with at least two positive-time hits.
- Missing acquisition/distance values are null, not fabricated zero.

Primary metric is meanAcquisitionTimeMs, lower is better, displayed as integer
milliseconds but compared without rounding. PB requires >=90% accuracy and
>=5 hits. A transparent threshold and correction-inclusive timer are preferred
over an arbitrary effective-time/overshoot weighting formula.

Signature includes mode/version, duration, selected/effective difficulty,
arena dimensions, input, crosshair, target count, actual target radius,
min/max/reference radii, timeout, respawn and quality thresholds. Seed is stored
for reproducibility but excluded from comparability, as are sensitivity, DPI,
preset and routine identity.

## Sessions, Account and Routines

Uses the existing TrainingSession format and repository: guest IndexedDB,
account training_sessions, owner-scoped synchronization and append RPC.
PB derives from persisted Sessions through SESSION_REGISTRY and existing PB
service/RPC. No independent PB writes/table or manual component-level PB state.
Pointer-lock loss follows existing invalidation and cannot award a PB.
Routines register from EXERCISES and link their completed Micro session to
routine_run, preserving duration and sensitivity context.

Applied remote migration: `20261004113851_add_micro_flick.sql` in XENSI
`zbdznwubrrkxuraispvr`. Extends the named exercise constraint and existing
read-only PB RPC's selectors/quality filters. SECURITY INVOKER, empty search_path,
RLS and anonymous denial remain unchanged. No new tables or production-row edits.

## Preview and Translation

Reuses ExercisePreview and its existing hover/focus mount/unmount lifecycle.
Three-second CSS cycle: nearby small target, short crosshair movement, hit,
another nearby target. No additional RAF, canvas game loop, pointer lock,
Session, PB or Supabase call. Leaving/unfocusing removes the preview; reduced
motion shows a static frame. All new copy uses PT/EN/ES dictionary keys.

## Files Created for Micro Flick

- src/microFlick.ts and src/microFlick.test.ts
- tests/micro-flick.spec.ts and tests/fixtures/microFlickArena.ts
- supabase/migrations/20261004113851_add_micro_flick.sql
- supabase/tests/micro_flick.sql and supabase/MICRO_FLICK.md

## Existing Integration Files Updated

Some were already uncommitted from the preceding account-data layers.

- src/Warmup.tsx, src/Routine.tsx, src/Home.tsx
- src/warmupConfig.ts, src/warmupExercises.ts, src/warmupTelemetry.ts
- src/routineConfig.ts, src/routes.ts, src/routes.test.ts
- src/trainingSession.ts, src/trainingSession.test.ts
- src/personalBests.ts, src/personalBestCloud.ts, src/sessionCloud.ts
- src/PersonalBestPanel.tsx, src/testFixtures/sessions.ts
- src/i18n.tsx, src/styles.css, scripts/prepare-pages-routes.mjs
- tests/training-catalog.spec.ts, tests/personal-best-sync.spec.ts
- tests/fixtures/accountCloud.ts, supabase/PERSONAL_BESTS.md

## Verification on 2026-10-04

- npm test: 270 passed in 32 files.
- npm run lint: passed.
- npm run build (including tsc -b): passed. Existing large-chunk warning:
  main JS approximately 977 kB minified / 275 kB gzip; not a build failure.
- dist/index.html: no /Sensi/ reference.
- Micro/catalog Playwright: 22 passed, 6 intentional skips across 1920x1080,
  1440x900, 1366x768 and mobile. Real acquisition/retry/miss/PB/lock-loss and
  routine execution tested on desktop; mobile is setup/preview/catalog only.
- Account PB transport Playwright: 6 passed (mocked HTTP, desktop/mobile),
  including Micro raw ranking, quality rejection and deletion recalculation.
- Full account-data transport suite: 45 passed, 1 intentional mobile pointer-lock
  skip (includes the 6 PB cases above, not an additional count).
- Existing seven-mode Sessions lifecycle regression: 11 passed on desktop.
- SQL on the real project: micro_flick.sql, personal_bests.sql and
  training_sessions.sql passed; sensitivity_presets.sql and training_routines.sql
  also passed. All generated fixtures rolled back.
- Screenshots inspected: actual arena, desktop result and English mobile setup.

Security Advisor: three pre-existing warnings outside this extension:
[anonymous nickname SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated nickname SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
and [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Performance Advisor: [unused owner-time index INFO](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
The useful existing Sessions index was retained. No advisor finding introduced
by Micro Flick required a schema change. Auth hardening remains separate scope.

This is focused verification, not a claim that every historical repository E2E
passes or that mocked account transport is a real interactive Auth signup test.

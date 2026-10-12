# XENSI Squad Finder V1.0

Current release decision, 2026-10-11: age assurance is no longer an access
prerequisite. The additive `20261011182551_squad_finder_remove_age_gate.sql`
migration removes that gate and the access DTO age field; frontend age notices
and the 18+ badge are removed. Existing assurance records and the adapter are
preserved for future work. The age requirements below describe the original
migrations, not the final access rule. See `squad-release-test.md` for the
current four-migration sequence and controlled test access.

Implementation reviewed on 2026-10-11. **Production release remains blocked.**
No migration was applied to a hosted project and no site deployment was performed.

## Architecture audit and scope

Read `agent.md`, React 19/Vite, `src/routes.ts`, `AppNavigation`, Supabase
`authService`/`supabaseClient`, existing migrations/policies, `DESIGN.md`,
`UX-CONTRACT.md`, `XensiAppShell`, ambient owners and Motion primitives.
`public.profiles` is the only source of nickname/avatar. Its existing owner-only
RLS stays unchanged; the guarded backend projects only nickname/avatar for social
interactions. No social nickname input or second public profile exists.

Calibrator, Converter, minigame engines, Sessions and PBs were not modified.
Guest tools remain available. Integration changes are limited to lazy loading,
routes, the current navbar and static SPA route generation. The current logo,
shell, coral tokens, ambient background, native selects, Motion timings and
dialog focus primitive are reused. The module has pt-BR/en-US copy; the existing
Spanish locale falls back to English within this module.

## Files, components and routes

- `src/squad/SquadFinder.tsx`: authenticated wrapper; private workspace;
  shared create/request/decision dialog; listing, host panel, requests, blocks,
  notifications, moderation. Private React state remounts on account changes.
- `service.ts`: typed DTOs and the existing Supabase client; abortable guarded RPC.
- `registry.ts`: platform compatibility, structured game options, mode/rank
  validation and Discord validation. Backend registry is authoritative;
  configurable registry changes must update the frontend defaults together.
- `copy.ts`, `squad.css`: localized copy and scoped universal-token styling.
- `/squad`, `/squad/my-room`, `/squad/requests`, `/squad/moderation`,
  `/squad/blocks`: direct links, history support, lazy chunk. Filters use URL query
  parameters; private contacts never appear in URLs. Results use 20 rows/page.

## Database and security boundaries

Migration: `supabase/migrations/20261011163626_squad_finder_v1.sql`, created with
the Supabase CLI. Public tables: `lfg_rooms`, `lfg_requests`,
`lfg_room_contacts`, `lfg_request_contacts`, `lfg_reports`, `lfg_blocks`,
`lfg_moderation_actions`. Private schema: `settings`, `registry`,
`age_assurances`, `moderators`, `restrictions`, `events`, `audit`.

Every table has RLS enabled. Authenticated/anonymous roles have **no direct
SELECT/INSERT/UPDATE/DELETE grants** on these tables. Owner read policies on
rooms, requests and blocks add defense in depth; contact, report and moderation
tables have no generic policies. Profiles policies are not broadened.

`public.xensi_lfg(action,payload,expected_user_id)` is an invoker wrapper for the
private dispatcher. It checks `auth.uid()` against the expected account,
confirmed email, current private age evidence, trusted provider allowlist,
feature settings and suspension on every social action. The private dispatcher
uses `SECURITY DEFINER` intentionally for narrowly projected authorized DTOs,
an empty search path and explicit grants. Helper functions are not executable by
clients. A moderator membership is stored in the private DB, never user metadata.
Moderators can act during an emergency feature shutdown, after confirmed auth.
The browser never receives a service key.

RPC actions: `access`, `list`, `mine`, `requests`, `notifications`, `blocks`,
`create`, `request`, `accept`, `decline`, `withdraw`, `host_contact`, `release`,
`confirm`, `cancel`, `report`, `block`, `unblock`, `mod_list`, `mod_decide`,
`mod_capacity`. Unknown actions fail. All writes validate server-side.

## State transitions and concurrency

| Entity | From | Operation | To |
|---|---|---|---|
| Room | open | accept a pending eligible request | reserved |
| Room | reserved | confirm the approved player joined | closed |
| Room | reserved | release / reservation timeout | open, if room TTL remains |
| Room | open/reserved | room deadline | expired |
| Room | open/reserved | host cancellation / moderation | cancelled |
| Request | pending | host accepts | accepted |
| Request | pending | host declines | declined |
| Request | pending | requester withdraws | withdrawn |
| Request | accepted | host confirms | joined |
| Request | pending/accepted | room ends / block / suspension | cancelled |
| Request | accepted | reservation timeout / release | cancelled |

Closed/expired/cancelled rooms and final request statuses cannot reopen.
An applicant gets one request per room, including after withdrawal/release.
Other pending requests remain pending during reservation; confirmation cancels
all of them. Host alone controls acceptance, confirmation and closure.

Actor advisory transaction locks serialize frequency accounting. `FOR UPDATE`
room locks serialize approval, release and confirmation; partial unique indexes
enforce one active room per host and one accepted request per room. A composite
FK binds the accepted request to its own room; checks enforce one slot and
reservation invariants. Status writes are unavailable to clients. A failed
transaction rolls back its data and notifications together.

Rate limits: 3 successful room creations/hour, 5 requests/10 minutes,
5 reports/hour, 30 successful mutations/contact fetches/minute per account.
Failed SQL transactions do not count as persistent attempts. Before launch,
configure perimeter rate limits for unsuccessful/anonymous HTTP attempts too.
Authorization prevents enumeration from revealing contacts.

## Discord visibility

Listings contain only structured room data, nickname/avatar and an opaque room
action handle. They never return a host user UUID, email, age evidence or Discord.
Opaque room/request handles needed for actions are not rendered as personal data.

Only the host receives requester Discord for pending/accepted requests in their
own room, while both users remain eligible and unblocked. Only the approved
requester can call `host_contact`, during an unexpired active reservation with an
eligible unblocked host. Requester lists do not include host Discord. Frontend
fetches host contact only on demand. Cancellation, blocking, suspension, release,
reservation/room expiry or confirmation denies subsequent contact reads.

There is no persistent browser contact cache. Host contacts clear on account
changes, page/area changes, failed authorization, reservation deadline and tab
visibility changes. The last username submitted by the current account is reused
only in memory during that module mount. Discord values never enter logs,
notifications, public cards or initial HTML. Copy failures show manual-copy help.
Revocation cannot undo information someone already copied externally.

## Age assurance and Brazilian privacy review

No valid age assurance mechanism existed in the audited repository. No birth
date, document image or editable `is_age_verified` shortcut was introduced.
All release flags default false; the provider allowlist starts empty.

Prepared adapter:
`public.xensi_lfg_record_age(user_id,provider,evidence_reference,valid_until)` is
executable only by `service_role`, allows only configured providers and rejects
expired or longer-than-one-year evidence. It records a minimal provider reference,
verification time and expiration, with revocation support in the private table.
It is an integration contract, **not an implemented or certified age verifier**.

A selected provider's backend webhook must verify signature, replay protection,
event identity, verified adult result, user/subject binding and expiration before
calling this RPC. Never call it merely because email was confirmed, metadata
contains an adult claim, a date was typed, or an administrator wants test access.
The one-year database ceiling is not a legal recommendation for assurance
validity; legal/provider review must choose an appropriate freshness policy.

Official sources reviewed:

- [ECA Digital and ANPD program](https://www.gov.br/anpd/pt-br/assuntos/eca-digital/).
- [ANPD preliminary age-assurance guidance](https://www.gov.br/anpd/pt-br/assuntos/eca-digital/mecanismos-confiaveis-de-afericao-de-idade-orientacoes-preliminares.pdf).
- [MJSP/ANPD discussion of reliable assurance and minimization](https://www.gov.br/mj/pt-br/assuntos/noticias-1/regulamentacoes-do-eca-digital-e-do-marco-civil-sao-debatidas-em-webinar-com-mjsp-e-anpd).
- [LGPD, Law 13.709](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

Engineering assessment: a social module sharing external contact identifiers
needs a risk-based age-assurance design and data minimization. A declared
adult-only audience does not by itself resolve applicable ECA Digital duties.
Legal review must determine applicability, lawful bases (separate from the UI
sharing acknowledgement), assurance freshness/access requirements, privacy
notice, data-subject rights, processor contracts/international transfers,
moderation retention and incident handling. No legal compliance claim is made.

## Game registry evidence

- [Riot: console/PC crossplay separation and Series/PS5](https://playvalorant.com/en-us/news/announcements/valorant-coming-to-console-in-australia--new-zealand/).
- [Riot: console generations and availability](https://playvalorant.com/en-us/news/game-updates/about-valorant-console-availability/).
- [Valve: Counter-Strike 2 platforms/system requirements](https://store.steampowered.com/app/730/CounterStrike_2/).
- [Epic: supported Fortnite devices](https://www.epicgames.com/help/c-34254770/c-33726977/a22202510?lang=en-US).
- [Epic: enabling console crossplay](https://www.epicgames.com/help/en-US/fortnite-c5719335176219/battle-royale-c5719350646299/a5720367818779).
- [Discord: username rules](https://support.discord.com/hc/en-us/articles/12620128861463-New-Usernames-Display-Names).

Valorant: PC or Xbox Series X|S / PS5; PC never joins console rooms. Console
crossplay needs host opt-in. CS2: PC only. Fortnite: PC, Xbox One/Series, PS4/PS5;
cross-platform requests require host crossplay enabled. A request includes its
actual platform; incompatible combinations are rejected by the server too.
Modes are deliberately limited to team-compatible structured options.
Ranks are reported by the player, not a claim of rank verified by game APIs.

## Moderation, expiry and notifications

Reports use fixed categories, no free text or upload, and are visible only through
authorized moderation RPC. Moderators see pending/history reports, blocks,
restrictions and structured decision history; may restrict publication, suspend,
restore, cancel rooms, dismiss/resolve reports or pause new room creation.
Suspension cancels hosted rooms and pending/reserved participation.
User blocks apply in both directions and cancel affected requests/reservations.

Rooms expire after 30 minutes; reservations after 10 minutes, capped by room TTL.
Settings allow bounded duration changes. `lfg_private.sweep()` uses row locks with
`SKIP LOCKED`, terminates expired rooms, releases expired reservations and deletes
finalized contacts. Every API call runs maintenance; authorization additionally
checks deadlines after acquiring locks. If pg_cron is installed, migration adds
a one-minute job. Otherwise a trusted scheduled worker must call the service-only
sweep function before release. Deadlines deny contact/participation immediately
even if physical cleanup is delayed. Events/audit retain 30 days; reports and
moderation retention await the legal/operational policy. Account deletion must
first finalize active reservations involving the user to satisfy the composite FK.

Private in-app notifications cover request creation/withdrawal,
acceptance/decline, reservation expiry/cancellation, room closure/expiry and join.
The workspace polls every 20 seconds while visible, with one load at a time,
abort on unmount/filter changes and stale-account response checks. There is no
custom WebSocket, email notification, chat or Discord OAuth/bot.

## Verification and remaining release work

Commands: `npm test`, `npm run test:squad:db`, `npm run lint`, `npm run build`,
`npx playwright test --config playwright.squad.config.ts`, scoped strict UI audit
using `docs/squad-premium-ui.json`, and existing navigation/universal-design tests.
See `docs/squad-validation.md` for actual results.

The database runner uses an isolated PostgreSQL engine (PGlite), the exact
migration and real SQL roles/privileges/RLS; it does not mock state transitions.
It checks guest/age/email/identity denial, server validation, direct-table denial,
contact isolation, approval exclusivity, all main transitions, expiration,
blocking, moderation and frequency limits. PGlite serializes a single connection;
rapid competing approvals are tested, but **multi-connection simultaneous locking
has not been exercised on a hosted/local Supabase server**.

Browser tests use an intercepted Supabase fixture, independently of the actual
SQL authorization tests. They cover desktop/mobile, disclosure, approval/join,
contact fetch/logout, network failure recovery, keyboard focus, English and reduced
motion. Browser fixtures do not certify a deployed production backend.

Required before public release: select/integrate real age assurance; obtain legal
review and approved privacy/retention policy; assign moderators and operational
capacity; apply/review the migration on staging; run Supabase security advisors
and concurrent multi-session tests; validate deployed auth/RLS/HTTP cache behavior;
install/verify maintenance scheduling and unsuccessful-attempt perimeter limits;
then explicitly enable the DB flags. Frontend assets alone cannot enable access.

Deferred product features: multi-slot rooms, chat, voice, Discord OAuth/bots,
automatic invites, AI matchmaking, reputation, permanent groups, feed/comments,
uploads and behavior recommendations. None is silently enabled for V1.1.

## Web Push (2026-10-12)

Browser push for `new_request` (host) and `request_accepted` (requester). Payloads
are generic and never carry Discord; tapping opens `/squad/my-room` or
`/squad/requests`, where `host_contact` is fetched on demand under the usual rules.

Pieces: `public/sw.js`, `src/squad/push.ts`, migration
`20261012120000_squad_finder_web_push.sql` (subscriptions table, service-only target RPCs, subscribe/unsubscribe
RPCs, `pg_net` trigger on `lfg_private.events`), Edge Function `supabase/functions/squad-push`.

Setup (not applied anywhere yet):
1. `npx web-push generate-vapid-keys`; set `VITE_VAPID_PUBLIC_KEY` in GitHub Actions.
2. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:… PUSH_SHARED_SECRET=…`
3. `supabase functions deploy squad-push --no-verify-jwt`
4. Apply the migration, then insert `function_url` and `shared_secret` rows into `lfg_private.push_config`.

## Games and multi-slot rooms (2026-10-12)

Migration `20261012190000_squad_finder_games_and_slots.sql` (apply together with the matching frontend):
17 games (Valorant, CS2, Fortnite, Rainbow Six Siege X, Call of Duty, Apex Legends, PUBG, Overwatch 2,
Marvel Rivals, Delta Force, The Finals, Battlefield 6, League of Legends, Dota 2, Deadlock, Rocket League,
EA Sports FC). Every game accepts every platform; the host picks it and requesters choose theirs. Crossplay
gating and the per-game mode/rank lists are gone: mode and rank are optional free text (<= 24 chars, no
links/contact hints, enforced by `lfg_private.free_text_ok` and mirrored in `registry.ts`). Regions are
SA/NA/EU/AS/OC (br/latam -> sa, asia -> as, oce -> oc).

Rooms hold 1-4 slots (`max_open_slots`, chosen by the host). Each accepted request occupies a slot, carries its
own 10-minute `reserved_until` and receives the host Discord immediately. The host confirms every join; an
unconfirmed reservation returns the slot. Room `open` = free slot, `reserved` = all slots taken but some
unconfirmed, `closed` = all joined (automatic) or closed by the host after at least one join. Accepting the last
free slot declines remaining pending requests. Verified by `npm run test:squad:slots` (PGlite, 21 checks).

## Saved Discord (2026-10-12)

Migration `20261012210000_squad_finder_saved_discord.sql` adds `lfg_private.discord_handles` (RLS on, no client
grants) with owner-only RPCs `xensi_discord_get` / `xensi_discord_set` (eligible accounts, same username rules as
contacts). Room/request dialogs prefill it and, with the default-on "remember" checkbox, save changes; the
sidebar "Meu Discord" entry edits it. The handle is still only shared as before (host, or the approved player)
and is removed with the account. This replaces the earlier in-memory-only reuse.

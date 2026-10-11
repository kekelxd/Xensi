# UX Contract

## Product context

- Audience: competitive FPS players preparing for or reviewing short browser sessions.
- Primary jobs: calibrate a sensitivity, warm up, inspect input devices, and review clear local results.
- Target markets: global; active locales are Portuguese, English, and Spanish.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Product direction | User-provided aim-training brief | Product brief | 2026-09-04 |
| Sensitivity behavior | `src/sensMath.ts`, `src/calibration.ts` | Domain implementation and tests | 2026-09-04 |
| Locale copy | `src/i18n.tsx` | Locale source | 2026-09-04 |

## Visual contract

- Project design context: `DESIGN.md`.
- Runtime design-system source: `src/design/universal.css`; legacy feature adapters: `src/styles.css`.
- Canonical motion source: `src/design/motion.ts`; CSS mapping: `src/main.tsx`; Home presentation: `src/design/HomeMotion.tsx`, `useHomeLighting.ts`, `premium-motion.css`.
- Token drift gate: update `DESIGN.md` whenever shared XENSI tokens or interaction states change.
- Supported themes: dark only.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native `select` with XENSI styling | `src/App.tsx`, `src/styles.css` | native | keyboard + locale labels |
| Form | Local controlled React state | feature modules | setup / profile edit | unit + browser flow |
| Scrollbar | Global stylesheet | `src/styles.css` | all presentation document scrollers | computed style + browser |
| Motion | Motion for React + scoped CSS | `src/design/` | Home expression / tool feedback / reduced motion | rapid navigation, focus, previews, Pointer Lock |
| Toast | No shared owner yet | feature-local feedback | none until shared primitive exists | browser |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | labeled native button | transform-only lift | mint outline | scale .99 | reduced contrast | fixed geometry | inline explanation when needed |
| Target demo | visible target | pointer-ready | visible outline | hit marker and score | n/a | n/a | n/a |
| Input | dark surface | brighter border | coral border | n/a | reduced contrast | preserve size | inline validation |

## Navigation and responsive behavior

- App navigation changes the local route state and remains disabled while an active training session owns input.
- Presentation pages scroll naturally; no page-level overflow clipping.
- Scrollbar tracks are visually hidden by explicit user direction; native scrolling remains available.
- Page motion updates URL/history immediately and respects the latest interrupted destination; navbar remains persistent.
- Active sessions, Pointer Lock, and realtime input tools bypass presentation route transitions. Home lights never attach to minigames.
- Numeric feedback presents real formatted snapshots; accessible final values are immediate.
- At narrow screens the navigation may wrap or scroll horizontally, but primary actions and arena targets remain reachable.

## Overlays and feedback

- Dialog primitive: existing app-owned modal backdrop.
- Keyboard focus returns to the trigger after closing a dialog.
- The home demo uses visible score and hit-marker feedback rather than a toast.

## Validation

- Static commands: `npm run lint`, `npm run build`, and `npm test -- --run`.
- Browser checks: desktop and mobile layouts, navigation to calibration/warmup/diagnostics, target demo interaction, Portuguese/English/Spanish copy.

## Universal ownership and runtime boundaries

- App shell: `src/design/XensiAppShell.tsx`; atmosphere themes: `ambientThemes.ts`; persistent background: `GlobalAmbientBackground.tsx`; contextual geometry: `PageAtmosphere.tsx`.
- Surface: `SpotlightCard.tsx`; page header and viewport sections: `Primitives.tsx`; masked title: `PrecisionTitle.tsx`. Motion timing remains owned by `motion.ts`.
- Native selects retain native popup ownership. The existing profile game filter is an authored listbox and retains its keyboard behavior. Decorative scrollbars remain hidden without replacing native scrolling.
- One accessible main landmark and one shared footer on presentation routes. Immersive sessions omit the footer. Auth keeps its own layout and existing account behavior.
- Decoration pauses on hidden documents, reduced motion, active session DOM, Pointer Lock, and polling/button/refresh/drift routes. Automatic ambient drift also pauses in training catalogs; pointer feedback and persistent route continuity remain available there.
- Analysis deletion uses an app-owned inline confirmation with Cancel, explicit deletion, Escape handling, and trigger focus restoration. The existing repository operation and personal-best recalculation are unchanged.
- Business calculations, exercise engines, session persistence, auth handlers, device sampling, and realtime measurement loops remain feature-owned.
- Verification uses repository Playwright because the Browser plugin is unavailable in this session. Resolutions: 1920, 1440, 1366, and 393 pixels; input tests include real Pointer Lock and session lifecycle checks.

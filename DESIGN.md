---
version: alpha
colors:
  background: "#06090e"
  surface: "rgba(15, 21, 30, 0.88)"
  surfaceRaised: "rgba(22, 29, 40, 0.92)"
  text: "#f5f1ea"
  muted: "#aab4c0"
  border: "rgba(167, 181, 199, 0.17)"
  accent: "#ff4055"
  accentWarm: "#ff4055"
  positive: "#75ffd5"
  focus: "#ff4055"
typography:
  display:
    fontFamily: "Space Grotesk, Plus Jakarta Sans, sans-serif"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
  data:
    fontFamily: "DM Mono, ui-monospace, monospace"
rounded:
  control: "8px"
  surface: "16px"
  media: "28px"
spacing:
  compact: "12px"
  regular: "20px"
  section: "56px"
components:
  action:
    emphasis: "solid coral for primary; outline graphite for secondary"
  surface:
    elevation: "tonal layer and fine border; shadows only on primary media"
  telemetry:
    color: "mint only for positive measurements"
---

## Overview

XENSI is a hybrid product: a focused technical home that leads into practical FPS tools. It should feel like a purpose-built training room. The current Home uses the existing photographic training environment, coral headline, and two clear actions. Live minigame previews belong to the training catalog.

The intended audience is competitive FPS players using a desktop browser before or between matches. The product should be direct, competent, and honest about browser limitations. It must not resemble Aim Lab, generic neon gaming landing pages, or heavy glassmorphism.

Runtime visual tokens are owned by `src/design/universal.css` (Model B: runtime tokens are canonical; this document mirrors them). Legacy feature rules remain in `src/styles.css` and are consolidated by scoped migration adapters. Motion tokens live in `src/design/motion.ts` and are mapped to CSS variables in `src/main.tsx`; this file records their semantic intent.

## Colors

Use the near-black background and graphite surfaces to create depth through contrast, not stacked cards. Coral is the sole action and target color. Mint is reserved for a hit, a positive trend, or a stable metric; it must never become a second brand accent. Borders are thin and low-contrast. A technical grid may support orientation but should fade into the page.

## Typography

Space Grotesk carries focused display headings. Manrope handles instruction and reports at comfortable reading sizes. DM Mono is limited to small technical labels, timers, and measurements. Portuguese, English, and Spanish use the same visual hierarchy; do not hard-code line breaks that cause translated copy to clip.

## Layout

Desktop is the primary experience. The Home hero places explanation over the existing photograph. Pathways, continuation cards, and ecosystem follow. Home grids become one column at 1000px; below 600px hero actions stack and text fits within 24px gutters. Preserve the current photo, copy, and desktop hierarchy.

Document scrolling belongs to every presentation page. Gameplay alone owns its viewport. Per the user's explicit direction, scrollbar tracks are visually hidden while native wheel, touch, keyboard, and document scrolling remain operable. Never use viewport clipping to hide content.

## Elevation & Depth

Most surfaces sit flat on tonal contrast with a one-pixel border. The training arena can use a restrained dark shadow because it represents an active space. Do not add frosted glass, broad blur, or persistent glow around static copy.

## Shapes

Controls use an 8px radius. Section surfaces use 16px. The arena can use 28px. Targets are circular. Avoid mixing pill shapes into ordinary UI.

## Components

### Foundational visual states

Interactive controls use native buttons, visible focus, hover feedback, and a pressed scale. Disabled controls lose contrast and do not look actionable. Global ambient motion pauses when the document is hidden, input measurement owns the route, or gameplay owns input. Home-specific ambient motion also pauses outside the hero. Reduced motion removes entrances, ambient drift, and pointer lighting; focus feedback and final data remain visible.

### Buttons and actions

Use one coral primary action per local decision. Secondary actions use an outline and neutral light text. Icons clarify actions but text remains visible. Busy states preserve the button geometry.

### Navigation and data display

Navigation is compact and text-led. Technical readings use the data face and tabular figures. Sparklines, bars, and target feedback must have text labels or an accessible summary.

### Forms and overlays

Fields remain dark and use coral on focus. Product dialogs are app-owned and restore focus when closed. Browser alerts and prompts are not used.

### Iconography

Lucide is the current source. Use its 1.8–2px outline language consistently at 15–22px. Do not use icons only as decoration when a label is available.

### Motion

Premium Motion V2 is expressive on Home and functional inside tools. Canonical durations: micro 140ms, interaction 240ms, layout 320ms, reveal 560ms, cinematic 900ms. Existing fast/normal/slow tokens remain compatible with V1 surfaces. Hero order: atmosphere, masked title lines, description, actions; actions remain usable during entry. Sections reveal once per Home mount through native scroll and viewport observation.

Reusable signatures: technical title reveal, scoped radial/edge light, directional CTA highlight, and shared active indicator. Home pointer lighting uses one delegated listener, cached bounds, and a throttled one-shot animation frame; no React state per pointer move. The Home-specific 18s ambient transform loop pauses outside the hero and on hidden documents; the persistent global 24s loop follows the stricter universal pause contract below. Avoid moving button hitboxes.

Presentation page transitions last 300ms and preserve the navbar and footer. URL/history update immediately; interrupted captures resolve to the latest destination. Active gameplay, realtime input diagnostics, and Pointer Lock bypass page transitions. Training catalogs and calibration presentation pages may transition. No second outgoing React tree remains mounted.

Metric transitions show actual formatted snapshots only, with the final accessible value immediately available. No interpolated or invented readings. Gameplay rendering, timers, targeting, and realtime measurements remain outside this motion layer. Home-specific code and styles load with its lazy chunk.

### Content and data visualization

Write like a precise coach: name the measure, say what it means, and offer the next action. Avoid inflated rankings and generic promises. Values are concise and use units where meaningful.

## Do's and Don'ts

- **Do:** preserve Home photography and use catalog previews to demonstrate training behavior.
- **Do:** use coral for actions and targets, and mint only for a positive result.
- **Don't:** fill the page with dashboard cards, artificial HUD labels, or oversized display type.
- **Don't:** claim browser input is physically identical to a game engine.

## Universal Experience V1

The persistent `XensiAppShell` owns one document main landmark, one shared footer, `GlobalAmbientBackground`, and `PageAtmosphere`. Auth retains its separate layout. The original XensiLogo, favicon, Home photograph, and product copy remain authoritative.

`XensiPageHeader`, `XensiSection`, `SpotlightCard`, `PrecisionTitle`, existing Motion dialog primitives, and active indicators are reusable owners. Profile identity and the larger active configuration sit side by side; searchable presets below contain actual persisted records. Training, conversion, calibration, diagnostics, analysis, routines, and institutional pages share gutters, tonal surfaces, headings, and controls. Desktop content is capped at 1280px with 24–64px gutters; layouts collapse for mobile.

Ambient motion is separate from feature state. Route changes move the same mounted coral light and reveal contextual SVG geometry. Pointer lighting uses motion values and springs, never React state per movement. The global light has one 24s transform drift; grid pulses are finite. Catalog drift is paused to protect live preview fluency. Visibility loss, reduced motion, active gameplay, Pointer Lock, and the four realtime input routes pause decorative background activity. Local spotlights stop their frame callback once settled. Home preserves its single delegated listener and existing finite reveal sequence.

React Bits SpotlightCard and Magic UI Animated Grid Pattern are adapted locally with source notices and full licenses in `src/design/third-party/`. No second animation engine or new dependency was installed. React Bits carries MIT plus Commons Clause; Magic UI carries MIT. The exact integration scope, verification, and limitations are recorded in `docs/xensi-universal-design-system.md`.

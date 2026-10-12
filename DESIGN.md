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
    fontFamily: "var(--font-display) — Space Grotesk 500/600"
  body:
    fontFamily: "var(--font-ui) — Sora 400/500/600"
  data:
    fontFamily: "var(--font-mono) — JetBrains Mono 400/500, tabular-nums"
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

## Landing V4 (Home)

The Home is a conversion landing owned by `src/Home.tsx` with its parts in `src/home/` (`homeCopy.ts`, `HomeAimDemo.tsx`, `HomeConverter.tsx`, `ExerciseArt.tsx`) and scoped styles in `src/home/landing.css` (`xl-` prefix, loaded only with the lazy Home chunk; legacy `.xensi-home-v3-*` rules in `styles.css` no longer apply to the Home). Order: photographic hero with a 5-target reaction demo → registry-derived proof strip → XENSI loop (scroll-driven progress) → filterable exercise showcase with hover-only CSS previews → tools bento (calibrator, live converter on `convertSensitivity`, four diagnostics) → analysis teaser (chart explicitly labelled illustrative) → continuation cards only when real saved data exists → final CTA.

Honesty rules: every count comes from `EXERCISES`, the diagnostic routes and the convertible game profiles; the demo reports only measured browser times and says so; the converter shows the target profile's verification status. Decorative animation is paused at rest (exercise art, calibrator, waves) and fully disabled under reduced motion.

## Direção "Transmissão" (Landing V5, escolhida em 2026-10-11)

Linguagem de transmissão de e-sports, escolhida entre três direções exploradas. Substitui, para a Home e a navegação compartilhada, as regras de tipografia e forma acima:

- Tipografia: **Big Shoulders Display** 800–900 em caixa alta para títulos, abas e botões; **Chivo Mono** para rótulos, contadores e dados; **Schibsted Grotesk** para texto corrido. Space Grotesk / Manrope / DM Mono deixam de ser usadas nessas superfícies. Fontes carregadas em `index.html`.
- Forma: cantos retos; botões e aba ativa com corte diagonal (`clip-path` paralelogramo); cartões com régua coral de 4 px (topo ou esquerda). Sem pílulas.
- Cor: fundo `#07080c`, cartões `#12141b`; coral `#FF4055` como único acento e como faixa cheia no CTA final; mint só para medições positivas e para Diagnóstico.
- Navegação: `src/design/broadcast.css` (carregado em `main.tsx`) — aba ativa é a lâmina coral inclinada animada pelo `ActiveIndicator` existente; logo inalterado.
- Hero sem selo, sem faixa de números e sem ticker (removidos na revisão do usuário). O teste de reflexo é um card "desafio rápido" com faixa coral.
- Próximo passo: levar a mesma linguagem para Treinar, Calibrar, Análise e Perfil.

### Páginas internas na direção "Transmissão" (Análise, Converter, Perfil)

- Camada compartilhada em `src/design/broadcast.css`: cabeçalho de página (`XensiPageHeader` ganhou `kicker` opcional; título gigante em caixa alta), botões primários/secundários retos com corte diagonal, modais com régua coral.
- Páginas em `src/design/broadcast-pages.css`, escopadas por `.xb-page` (`.xb-analysis`, `.xb-converter`, `.xb-profile`). As classes antigas (`analysis-v1-*`, `av1-*`, `converter-*`, `profile-v1-*`, `profile-preset-card`) continuam no markup como ganchos dos testes; o visual é sobrescrito pela camada nova.
- Análise: faixa de filtros, placar de números (primeiro valor em coral), gráfico com linha coral e PB em mint, comparação "atual × anterior", recordes e histórico em linhas numeradas.
- Converter: quadro "origem VS destino" com faixa coral no destino, resultado gigante, placar de auditoria e avisos com régua lateral (mint = verificado, âmbar = atenção).
- Perfil: cartão de jogador (avatar em moldura inclinada, nickname gigante), "loadout" ativo com sensibilidade em coral, presets em cartões com régua coral no principal.
- Lógica, repositórios, sincronização e cálculos não foram alterados.

## Tipografia V2 (2026-10-11) — substitui as regras de fonte da direção "Transmissão"

Fonte única de verdade: `src/design/typography.css` (importado antes de qualquer outro CSS em `main.tsx`).

- Famílias: `--font-display` (Space Grotesk 500/600) para h1, h2 e nomes de card; `--font-ui` (Sora 400/500/600; substituiu Inter em 2026-10-11 por ser neutra demais) para texto, botões, navbar e rótulos; `--font-mono` (JetBrains Mono 400/500) só para números e métricas, com `tabular-nums`.
- Self-hosted em `public/fonts` (woff2 do @fontsource, latin + latin-ext, `font-display: swap`), com preload de Sora 400/500 e Space Grotesk 600 no `index.html`. Fallbacks locais com `size-adjust`/`ascent-override` calculados contra Arial/Courier New evitam salto de layout. Space Grotesk 700 (latin) é carregada só para o wordmark XENSI, que não foi alterado.
- Escala: `--text-2xs` 11px (mínimo absoluto) · `--text-xs` 12px (rótulos) · `--text-sm` 14 · `--text-md` 16 · `--text-lg` 18 · `--text-xl` 22 · `--text-2xl` 28 · `--text-3xl` 36 · `--text-4xl` clamp(36–56) · `--text-hero` clamp(44–84).
- Pesos: no máximo 600 (`font-synthesis-weight: none`); mono no máximo 500.
- Caixa e tracking: `--case-label: none` em rótulos, botões e navbar; `--case-eyebrow: uppercase` + `--tracking-eyebrow: .04em` apenas no eyebrow de seção/página e no selo "Principal". Títulos usam `--tracking-tight` (-0.02em) ou `--tracking-snug` (-0.01em).
- Texto secundário: `--text-secondary` #b3b9c2 e `--text-tertiary` #8e96a1 sobre grafite.
- Os CSS legados foram convertidos de forma sistemática para esses tokens (famílias, uppercase, letter-spacing, pesos > 600, tamanhos < 11px). Não escrever `font-family` literal fora de `typography.css`.

## Componentes base: Tailwind v4 + shadcn/ui (2026-10-11)

- Tailwind v4 via `@tailwindcss/vite`, configurado em `src/design/tailwind.css` (importado por último em `main.tsx`). **Sem preflight**: o reset global do Tailwind restilizaria todas as telas legadas. As utilities saem como `!important` dentro de `@layer utilities`, para vencer os seletores descendentes do CSS legado sem hacks; conflitos entre utilities são resolvidos pelo `cn()` (`src/lib/utils.ts`, clsx + tailwind-merge).
- Tokens shadcn (`--background`, `--card`, `--primary` = #FF4055, `--border`, `--ring` = mint, `--radius` 4px, `--slant`) mapeados para a paleta atual; `font-sans` = `--font-ui` (Sora), `font-heading` = `--font-display`, `font-mono` = `--font-mono`.
- Componentes em `src/components/ui/` (`components.json` no estilo new-york, alias `@/`): `Button` (default coral inclinado, `outline`, `secondary`, `ghost`, `destructive`, `link`; foco com anel interno porque o `clip-path` cortaria um anel externo), `Card` (+ Header/Title/Description/Action/Content/Footer, `accent` = régua coral, `spotlight` = luz que segue o ponteiro), `Dialog` (Radix: foco preso, Esc, `aria-modal`), `Input`, `Label`.
- A luz dos cartões virou o hook `src/design/useSpotlight.ts`, usado pelo `SpotlightCard` antigo e pelo `Card` novo.
- O CSS legado pinta todo `header`/`footer` com grade; cards e diálogos shadcn anulam isso em `tailwind.css`.
- **Perfil** é a página de referência: todo o markup usa esses componentes e utilities. As regras antigas do Perfil (`profile-v1-*`, `profile-preset-*`, `profile-avatar-picker`, `.xb-profile`) foram removidas de `styles.css`, `universal.css`, `broadcast.css` e `broadcast-pages.css`. Ficam só como ganchos de teste (sem estilo): `profile-preset-card`/`primary`, `profile-v1-identity`, `profile-v1-identity-copy`, `profile-v1-person`, `profile-avatar-picker`. `profile-v1-modal` e `profile-v1-error` continuam estilizadas porque `PresetSyncStatus` e `Routine` usam.
- Próximas páginas devem migrar do mesmo jeito: trocar o markup por `@/components/ui/*` e apagar as regras antigas daquela página, nunca manter os dois sistemas para o mesmo elemento.

## Shell compartilhado 16:9 + Squad Finder (2026-10-11)

- **Navbar V2** (`AppNavigation.tsx` + `design/navbar.css`) é a única navbar: flutuante, vidro, raio 14px, largura `min(--xensi-max-width, 100% - 2*--xensi-gutter)`. Rótulos em sentence case via `navLabel()`.
- **`design/shell.css`**: tokens `--xensi-max-width` 1640px, `--xensi-gutter`, `--xensi-page-space` e a arte de fundo compartilhada (`assets/xensi-hero-art.webp`, camada `::before` com máscara). Opacidade por tela via `data-view` (perfil .5, squad .9, home sem arte).
- Raios: cards 12px (`rounded-xl`), controles 8px (`rounded-lg`); sombras tingidas; pílulas arredondadas. Sem clip-path nos componentes shadcn.
- **Perfil**: título + subtítulo, card de identidade (avatar redondo, apelido, "Membro desde" só com conta real, contagem salva), card de configuração ativa (jogo, pílula Principal, métricas com divisores, Calibrar/Converter) e grade "Sensibilidades". Sem dados inventados.
- **Squad Finder**: layout em duas colunas (sidebar com as mesmas abas e ícones + conteúdo), hero "Encontre seu time ideal" com apenas contagens reais (salas na lista, atualizações), card "Sua sala", painel "Filtros de busca" e "Salas abertas" em grade. Lógica, RPCs e textos de acessibilidade preservados; só layout/CSS e copy de rótulos mudaram (textos em CAIXA ALTA viraram sentence case: "Solicitar entrada", "Aceitar", etc.).
- Telas ainda não migradas (Análise, Converter, Treinar, Home) herdam navbar, largura e arte, mas mantêm o conteúdo antigo.

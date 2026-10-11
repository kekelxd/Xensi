# XENSI Motion Foundation V1

Motion deve explicar estado, seleção e feedback. Rápido, discreto, funcional;
transform/opacity primeiro, sem bounce por padrão. A UI funciona sem animação.

## Tokens e componentes

Motor: `motion@14.1.0`, importado por `motion/react`. Não havia biblioteca de
animação, shadcn, Radix ou React Bits nas dependências; os componentes são próprios.
Já existiam animações CSS de menus, previews, wizard, home e ferramentas.

Fonte dos tokens: `src/design/motion.ts`. Durações em segundos:
instant **.09**, fast **.14**, normal **.20**, slow **.30**.
Easings: standard **[.2,0,0,1]**, out **[.16,1,.3,1]**,
in-out **[.4,0,.2,1]**. Springs: fast **460/34**, layout **420/36**
(stiffness/damping). CSS recebe esses mesmos valores pelo bootstrap em `main.tsx`.

`useXensiMotion` fornece fade, dropdown, dialog e card variants. Entrada .20s,
saída .14s; menu desloca -5px/scale .99, dialog 6px/scale .98.
`MotionDropdown`, `MotionDialog`/`MotionDialogPanel`, `ActiveIndicator` e
`MotionExerciseCard` reduzem repetição real. Elementos em saída ficam inertes.

## Aplicação

- Navbar: Treinar, Calibrar, Diagnóstico e menu autenticado usam o mesmo dropdown.
  A centralização de Diagnóstico usa `translate` CSS separado do transform do Motion.
- Treinar: indicador com `layoutId`, isolado por `LayoutGroup`; grid com
  `layout="position"` e `AnimatePresence mode="popLayout"`, sem stagger.
  Cards entram/saem com opacity e scale .98; previews existentes ganham fade externo.
  Removidos hover translate -3px e sombra animada; conteúdo essencial permanece.
- Buttons: feedback de contraste preservado, durações comuns e press scale .985
  somente nos botões de ação dos dialogs e login da navbar. Disabled não recebe press.
  Seletores e itens de menu não recebem scale para manter a geometria estável.
- Dialogs: configuração/resultado de treino e calibração, finder, perfil/presets,
  ações de rotinas, detalhes de sessão, feedback e importação compartilhada de
  presets/rotinas/sessões usam a mesma linguagem. Backdrop sem blur.

Não há Tooltip compartilhado. Tooltips de gráficos e tabs de diagnóstico foram
mantidos fora do piloto; `ActiveIndicator` pode ser reutilizado em tabs equivalentes
dentro de um `LayoutGroup` próprio. Não foram adicionados page transitions,
cursor, smooth scroll, animações de páginas ou imports no hot loop de gameplay.

## Reduced motion

`MotionConfig reducedMotion="user"` + `useReducedMotion` reutilizável: sem layout,
deslocamento ou scale; opacity em .09s. CSS remove press e congela previews somente
nos cards do catálogo. Scroll horizontal já existente na navbar fica instantâneo.
Focus, Escape, handlers, Auth e importação mantêm sua lógica.

## Validação e limites

Playwright em `http://127.0.0.1:5174`: 1920×1080, 1440×900, 1366×768 e 393×851,
motion normal/reduzido. Trocas de filtro e dropdown a cada 25ms, abertura/fechamento
de setup antes de concluir a entrada, foco/Escape, previews, contagem final de
cards/indicador e overflow horizontal passaram. Sem erros de console; em reduced
motion o Motion emite seu aviso informativo de desenvolvimento esperado.

16 testes existentes de navegação passaram nos quatro projetos. Regressão desktop:
16 passaram (catálogo, presets, rotinas, análise e parte de feedback); 5 falharam
por expectativas anteriores ao patch: dois de feedback esperam `/Sensi`/usuário
injetado, três de perfil dependem de uma sessão via localStorage que Auth remove.
Os mesmos estados foram reproduzidos usando os arquivos originais de HEAD em
um servidor temporário independente. A suíte completa não está verde.

Menu autenticado e importação em conta real não foram exercitados ponta a ponta.
Não foi medido input latency, CLS via PerformanceObserver nem GPU profiling;
gameplay permaneceu isolado. Capturas visuais verificadas de catálogo, menu e setup.

`npm run test`: 35 arquivos, **297 testes passaram**. `npm run lint` passou.
`npx tsc -b` passou; o build final também executou esse typecheck.
`npm run build` passou. Bundle principal: **1009.55 → 1141.00 kB**,
gzip **284.57 → 328.26 kB** (**+43.69 kB**). CSS **435.53 → 437.69 kB**,
gzip **79.72 → 80.08 kB**. Spatial Hunt permanece em chunk separado e praticamente
inalterado (**549.32 → 549.33 kB**, gzip **137.72 kB**). Motion está no principal.
O aviso de chunk >500 kB já existia antes desta mudança.

## Arquivos desta entrega

Criados: `src/design/motion.ts`, `src/design/MotionSurfaces.tsx`,
`src/design/motion.css`, `docs/xensi-motion.md`.

Alterados: `package.json`, `package-lock.json`, `src/main.tsx`, `src/styles.css`,
`src/AppNavigation.tsx`, `src/Warmup.tsx`, `src/App.tsx`, `src/Routine.tsx`,
`src/PlayerProfile.tsx`, `src/PresetSyncStatus.tsx`, `src/SensitivityFinderModal.tsx`,
`src/Analysis.tsx`, `src/AlphaFeedbackModal.tsx`.
Evolução atual: [Premium Motion V2](./xensi-motion-v2.md). Este documento registra a entrega V1.

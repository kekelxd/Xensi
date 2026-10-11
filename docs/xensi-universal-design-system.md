# XENSI — Universal Design System & Premium Experience V1

Implementação concluída em 11/10/2026. Referência anterior: commit `f3848ec7f198c6b0c92ef7854eff1df22a730580`. A evolução foi aplicada ao produto existente, mantendo dados, motores, fórmulas e integrações funcionais sob seus donos atuais.

## 1. Arquitetura do Design System

`XensiAppShell` é o ambiente persistente das páginas do produto. Mantém `GlobalAmbientBackground`, `PageAtmosphere`, navegação, um único landmark `main`, rodapé compartilhado e feedback global. Autenticação conserva seu layout separado. Sessões imersivas removem o rodapé e recuperam o viewport da arena.

`src/design/universal.css` é a fonte canônica dos tokens visuais (Model B). `DESIGN.md` espelha as decisões; `UX-CONTRACT.md` registra comportamento e ownership. As regras antigas de cada ferramenta recebem adapters delimitados pelo shell, sem substituir seus estados ou motores.

Tokens principais: coral `#FF4055`, fundo `#06090E`, grafite translúcido, bordas discretas, controles de 8px e superfícies de 16px. Mint permanece para estados positivos. Tipografia: Space Grotesk nos títulos, Manrope no corpo e DM Mono nos dados. Conteúdo com máximo de 1280px e gutters de 24–64px.

Primitivos compartilhados: `SpotlightCard`, `XensiPageHeader`, `XensiSection`, `PrecisionTitle`, os dialogs Motion existentes, `ActiveIndicator` e `AnimatedMetric`.

## 2. Bibliotecas externas utilizadas

Motion for React **14.1.0**, já instalado, sobre React **19.2.7**; o peer de Motion admite React 18/19. Lucide existente continua responsável pelos ícones. Nenhuma dependência ou lockfile novo; nenhuma segunda engine de animação.

As integrações React Bits e Magic UI são adaptações locais de componentes reais, com atribuição em cada arquivo e licenças completas em `src/design/third-party/`. Não há dependência npm adicional dessas coleções.

## 3. React Bits incorporado

[SpotlightCard](https://reactbits.dev/components/spotlight-card) foi adaptado em `src/design/SpotlightCard.tsx`: luz coral radial e contorno responsivo, smoothing exponencial, bounds em cache e frames somente enquanto o movimento converge. É utilizado no Perfil, cards de Diagnóstico e caminhos da Home. A Home delega o tracking ao listener compartilhado que já existia.

Licença: [MIT + Commons Clause](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md), David Haz, 2026. A cláusula restringe a venda/redistribuição comercial do próprio software/componente conforme seus termos; a cópia integral acompanha a implementação.

AnimatedContent e SplitText foram avaliados. Suas versões usam GSAP/ScrollTrigger; o comportamento necessário foi implementado com `XensiSection` e `PrecisionTitle` sobre Motion existente, evitando outra engine.

## 4. Magic UI, Aceternity e Animate UI

[Animated Grid Pattern, Magic UI](https://magicui.design/docs/components/animated-grid-pattern): integração em `AnimatedGridPattern.tsx`, licença [MIT](https://github.com/magicuidesign/magicui/blob/main/LICENSE). O pattern SVG foi mantido; posições aleatórias, ResizeObserver e updates perpétuos foram substituídos por três pulsos finitos em coordenadas fixas.

[Aceternity Spotlight New](https://ui.aceternity.com/components/spotlight-new) foi avaliado, mas não incorporado: duplicaria a iluminação do ambiente. O background global é código próprio com Motion/CSS. [Animate UI Tabs](https://animate-ui.com/docs/components/radix/tabs) foi avaliado, mas não incorporado: os indicadores existentes já atendem à navegação sem introduzir Radix redundante.

## 5. Motion variants e assinaturas

O conjunto canônico `motion.ts` foi reutilizado: micro 140ms, interação 240ms, layout 320ms, reveal 560ms, cinematic 900ms; easings e springs existentes. Os variants de dropdown/dialog/card/fade continuam compartilhados.

Novas composições: título mascarado em `XensiPageHeader`/`PrecisionTitle`, entrada de seção por viewport em `XensiSection`, reveal escalonado de superfícies em `useRouteReveal`, transição de opacidade/posição da geometria contextual e interpolação do foco luminoso entre rotas. Reduced motion resolve títulos e valores diretamente e remove tracking/loops decorativos. As assinaturas anteriores de CTA, indicador ativo e snapshots reais de métricas foram preservadas.

## 6. Ambiente global

Camadas: base escura, grid SVG técnico, luz coral radial, reação ao ponteiro com Motion Values/springs e vignette de leitura. Tudo é decorativo (`aria-hidden`, `pointer-events: none`). Nenhum `setState` por pointermove.

`ambientThemes.ts` centraliza posições/intensidade. `PageAtmosphere` apresenta retículas no treino, arcos na calibração, conexões na conversão, onda no diagnóstico, curvas na análise e círculos no perfil. A geometria é decorativa; não representa telemetria inventada.

## 7. Continuidade entre rotas

O mesmo background permanece montado. A luz interpola posição e intensidade; grupos contextuais trocam visibilidade. Navegação e histórico continuam atualizando imediatamente e destinos interrompidos resolvem para o último pedido. Snapshots de transição cobrem conteúdo, preservando o ambiente real ao fundo.

Gameplay, Pointer Lock e medições de input bypassam apresentações. O shell detecta troca dos roots e classes das arenas sem observar árvores de texto/telemetria em realtime.

## 8. Home

A fotografia original, texto, logo, caminhos e CTAs foram preservados. O cinematic hero existente continua lazy, com sequência de atmosfera/título/descrição/ações, scroll reveals e realce direcional dos CTAs. Os caminhos passam a usar `SpotlightCard` com iluminação delegada; o rodapé agora pertence ao shell.

## 9. Perfil

Identidade à esquerda e configuração ativa em painel maior à direita; avatar e informações existentes. Presets pesquisáveis abaixo, filtro de jogos, ações de criar/editar/principal/remover, calibração e conversão continuam usando dados reais. Cards recebem superfícies e iluminação compartilhadas. O indicador de configuração em uso aparece somente quando existe um preset ativo. Sem rankings ou estatísticas fabricadas.

Não foi fornecida imagem de mockup nesta solicitação. A composição segue as instruções textuais; não se afirma correspondência pixel a pixel com uma referência ausente.

## 10. Páginas funcionais

| Área | Aplicação visual | Comportamento preservado |
|---|---|---|
| Treinar | Header comum, filtros e cards uniformes, previews legíveis | Catálogo, dificuldades, setups e motores |
| Calibrar | Título mascarado, hero/demo/processo e superfícies comuns | Fluxo, valores e cálculo |
| Converter | Header, campos, resultado e superfície comum | Fórmulas e preset de origem |
| Diagnóstico | Cards Spotlight e atmosfera contextual | Rotas e início de ferramentas |
| Polling, input, refresh, drift | Bases/controles alinhados e ambiente pausado | Sampling, frames e medições |
| Análise | Header, filtros, painéis e valores reais | Sessões, comparação e personal bests |
| Exclusão de sessão | Confirmação app-owned com Cancelar/Escape/foco | Operação de remoção e recálculo existentes |
| Rotinas | Header comum na biblioteca/builder e painéis consistentes | CRUD, playlist e execução |
| Histórico/resultados | Linguagem visual e Motion existentes reutilizados | Contexto e registros reais |
| Institucionais | Seções com reveal e rodapé único | Conteúdo e links |
| Auth | Materiais visuais coerentes no layout próprio | Handlers e integração de conta |

## 11. Preservação da identidade

O componente `XensiLogo`, sua construção/tipografia, favicon e fotografia não foram alterados. O teste compara texto, font family e letter spacing da logo antes/depois de navegação. Coral permanece a ação principal; os estados positivos usam mint.

## 12. Bundle

Build Vite de produção, comparado ao commit anterior; valores gzip em kB reportados pelo bundler:

| Artefato | Antes | Depois | Diferença |
|---|---:|---:|---:|
| JS principal | 328,40 | 332,85 | +4,45 |
| JS Home lazy | 6,71 | 6,82 | +0,11 |
| CSS principal | 80,68 | 84,02 | +3,34 |
| CSS Home lazy | 1,57 | 1,57 | 0 |
| JS SpatialHunt lazy | 137,72 | 137,73 | +0,01 |

Foto: 1.711,51kB, preservada. Continua existindo o aviso prévio de chunks acima de 500kB; este trabalho não reestrutura o bundle inteiro.

## 13. Estratégias e comparação de performance

Tracking fora do ciclo de render React, bounds em cache, RAF de uma atualização/settling, CSS transforms, grid finito, Home lazy, sem novos observers de resize na grid e sem observer em subárvores de métricas. Luzes locais cancelam frames ao sair, perder visibilidade/Pointer Lock ou desmontar.

O drift global é pausado no catálogo para proteger os previews; reação ao ponteiro e continuidade de rota permanecem. Hidden document, reduced motion, gameplay e as quatro medições também pausam o ambiente. Minigames não recebem glow/tracking sobre canvases.

Comparação local Chromium headless, 1440×900, janela de 2,4s após estabilização, 145 intervalos por cenário, PerformanceObserver e métricas CDP. Baseline servida de `git archive f3848ec` na porta 5175; implementação na 5174. Gameplay usou Pointer Lock real.

| Cenário | p95 antes → depois | Script antes → depois | Task antes → depois |
|---|---|---|---|
| Perfil idle | 16,8 → 16,7ms | 0,98 → 8,21ms | 7,78 → 47,75ms |
| Catálogo idle | 16,7 → 16,7ms | 0,97 → 0,95ms | 8,02 → 7,71ms |
| Gameplay | 16,7 → 16,8ms | 57,57 → 55,63ms | 206,64 → 198,32ms |

Nenhuma long task observada nas seis amostras. O Perfil tem custo adicional de apresentação, explicitado acima. A janela curta e headless não comprova latência física, performance de GPU nem comportamento de hardware/browser em todas as máquinas; as diferenças pequenas não são uma conclusão estatística.

## 14. Arquivos

Novos: `AnimatedGridPattern.tsx`, `GlobalAmbientBackground.tsx`, `PageAtmosphere.tsx`, `PrecisionTitle.tsx`, `Primitives.tsx`, `SpotlightCard.tsx`, `XensiAppShell.tsx`, `ambientThemes.ts`, `universal.css`, `useRouteReveal.ts`, duas licenças em `third-party/` e `tests/universal-design.spec.ts`.

Alterados: `App.tsx`, `main.tsx`, `Home.tsx`, `PlayerProfile.tsx`, `DiagnosticLanding.tsx`, `Warmup.tsx`, `SensitivityConverter.tsx`, `CalibrationLanding.tsx`, `CalibrationAnalysis.tsx`, `Routine.tsx`, `InstitutionalPage.tsx`, `Analysis.tsx`, `i18n.tsx`, `design/HomeMotion.tsx`, `design/pageMotion.ts`, `tests/analysis-dashboard.spec.ts`, `tests/micro-flick.spec.ts`, `DESIGN.md`, `UX-CONTRACT.md` e este relatório.

O teste Micro Flick agora distingue callbacks RAF de arena dos callbacks de apresentação. Continua verificando que o preview não monta engine, Pointer Lock ou sessão real.

## 15. Verificações executadas

- `npm run lint`: aprovado.
- `npm test -- --run`: 35 arquivos e **297 testes aprovados**.
- `npm run build`: typecheck e build aprovados.
- `designmd lint DESIGN.md`: zero erros; 12 warnings existentes do formato de referências/subtokens documentais.
- Playwright Home + Análise: **40 aprovados** após correção final de chrome e stacking dos modais.
- Playwright Universal + Premium Motion + Navegação: **56 aprovados**.
- Playwright session lifecycle + preset flow em desktop: **14 aprovados**.
- Rotinas + ferramentas diagnósticas + Micro Flick + Spatial Hunt em desktop: **13 casos distintos aprovados**; dois CRUD de rotina repetidos após o header final, novamente aprovados.
- Total: **123 casos distintos de navegador aprovados** nas suítes selecionadas; não se afirma execução da suíte global completa.

Quatro projetos/resoluções: 1920, 1440, 1366 e mobile 393px. Cobertura: navegação rápida/histórico/fallback, persistência do background, CRUD/filtro/conversão de preset real, layouts/overflow, single main/footer, auth isolado, reduced motion, hidden document, pausa de medições, sessão concluída/interrompida, perda de foco/lock, previews sem engine, minigames e execução de rotina.

Playwright do repositório foi utilizado porque o Browser plugin não estava disponível. Capturas antes/depois de nove páginas em desktop/mobile foram produzidas e telas representativas inspecionadas. Evidência em `C:/Users/FSOS/.codex/visualizations/2026/10/11/01a12890-62f6-7e11-921a-1f4bfb99c7e4/`: arquivos `universal-before-*`, `universal-after-*` e `universal-profile-populated.png`. O preset da captura preenchida foi criado pela UI em contexto isolado de teste.

## 16. Limitações e pendências reais

Auditoria estática premium estrita: **11 achados antes e os mesmos 11 depois**, sem novos achados. Sete são decisões de native select que o scanner não extrai do contrato; dois pedem `noValidate` nos formulários Auth/Feedback; um pede evidência literal de resize de textarea; um pede tema de scrollbar apesar da direção explícita de ocultar tracks. Não se alterou validação de autenticação para satisfazer o scanner. Esses achados não são apresentados como corrigidos.

Não houve auditoria WCAG completa, profiling físico de dispositivos, validação de envio/auth externos nem execução de toda a suíte legada. Testes selecionados e limitações estão listados acima. Mockup visual não fornecido. O drift do catálogo foi deliberadamente limitado por performance. O aviso de chunks grandes permanece.

Este relatório registra a implementação e validação da etapa. O histórico Git registra o commit e a publicação solicitados posteriormente; nenhum deploy foi realizado nesta etapa.

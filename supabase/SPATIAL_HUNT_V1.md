# Spatial Hunt V1

Implementacao experimental concluida em 10/10/2026 (America/Sao_Paulo).
Rota: `/train/spatial-hunt`. Nenhum commit ou push foi executado nesta entrega.

## Entrega solicitada

1. **Arquitetura:** `SpatialHuntPage` controla menus e estados de alto nivel; `SpatialHuntController` controla as rodadas; `FirstPersonViewport` controla camera/scene; `SpatialAudio` controla listener, HRTF e pulsos. Sem React state por movimento ou frame.
2. **Biblioteca:** Three.js 0.186.1, sem React Three Fiber, fisica, WASD, armas, assets externos ou pos-processamento. Geometrias e materiais simples compartilhados.
3. **Lazy loading:** `SpatialHuntLoader` usa `React.lazy`/`Suspense` e boundary de erro. O chunk 3D so e solicitado ao abrir o modo, nunca no hover. Build: JS lazy 549.32 kB / 137.72 kB gzip; CSS lazy 3.15 kB. Bundle principal 1009.55 kB / 284.57 kB gzip.
4. **exercise_id:** `spatial_hunt`.
5. **exercise_version:** `1`; schema de Sessions permanece `1`.
6. **Categoria:** Audio, com traducoes PT/EN/ES, no registry existente. Card do mesmo tamanho dos outros.
7. **Rodada:** orientacao visivel 3000 ms; fade 400 ms (100 ms com reduced motion); blackout completo; tres pulsos; clique confirma camera; reveal 1600 ms; intervalo 300 ms; repetir ate oito rodadas.
8. **State machine:** idle -> preparing -> orientation -> fading_out -> blackout -> stimulus -> awaiting_response -> revealing -> inter_round -> completed. `interrupted` e terminal. Preparing e a fase de desbloqueio da pagina, antes de criar o controller/Session.
9. **FOV:** horizontal canonico 103 graus. Vertical = `2 * atan(tan(hFov/2) / aspect)`, convertido em graus e recalculado no resize. Camera fixa a 1.65 m, pitch limitado a +/-85 graus.
10. **Sensibilidade:** reutiliza `getDegreesPerCount(game, sensitivity)` e `sanitizePointerMovement`; converte graus para radianos. DPI nao multiplica o delta: permanece no contexto, presets e cm/360.
11. **Pointer Lock:** helper compartilhado, com fallback de `unadjustedMovement`. Opcao `fullscreen: false` somente no Spatial Hunt; comportamento anterior dos outros modos preservado. Audio resume e requestPointerLock sao iniciados no mesmo clique, antes do await.
12. **Web Audio:** um AudioContext por pagina, criado somente no Start, reutilizado nas rodadas e retries. Listener acompanha forward/up reais da camera, no mesmo sistema Y-up/-Z-forward.
13. **HRTF:** `PannerNode.panningModel = 'HRTF'`, fonte a raio fixo 6 m na altura dos ouvidos. Sem StereoPanner fallback, oclusao, reverb, distancia variavel ou permissao de microfone.
14. **Estimulo:** ruido broadband procedural deterministico, buffer mono 120 ms com envelope suave; pulsos em 0/250/500 ms, ganho 0.12. Perfil de audio v1; sem URL de audio externa. Resposta aceita a partir do primeiro onset agendado, usando o relogio do AudioContext para latencia.
15. **Direcoes:** oito setores, cada um exatamente uma vez, jitter +/-12 graus. Fonte relativa ao yaw capturado quando o fade chega ao preto completo, nao ao yaw inicial da rodada.
16. **Seed:** seed por sessao via `crypto.getRandomValues`, RNG deterministico e shuffle Fisher-Yates; armazenado no configuration, fora da comparison_signature.
17. **Erro angular:** acos do produto escalar normalizado e limitado a [-1,1], entre camera forward e direcao real da fonte. Pitch participa do erro. Circular angle helper tambem tem testes de wrap.
18. **Metricas:** mean/median/p95/best angular error, mean/median localization time, timeouts, round_count e oito rounds compactos (setor, referencia, fonte, resposta, pitch, erro, latencia e timeout). P95 usa nearest rank. Timeout recebe 180 graus e 5000 ms, sem PB.
19. **Primary metric:** `mean_angular_error_deg`, lower-is-better, graus, uma casa decimal no PB. Zero real e valido.
20. **Signature:** array JSON ordenado com exercise/version/input/roundCount/audioProfileVersion/distributionVersion/sourceRadius/horizontalFov/spatialization/orientationMs/timeoutMs/jitterDegrees. Sem sensitivity, DPI, preset, seed ou viewport. Mudancas futuras no estimulo devem incrementar audioProfileVersion/exerciseVersion.
21. **Training Sessions:** recorder/repository/IndexedDB/fila existentes. Nenhuma tabela ou storage paralelo. Amostras atualizadas no fim de cada rodada e Session terminal persistida ao completar/interromper. Sem chamadas Supabase no mouse/frame/pulso.
22. **PB:** registry e servico existentes; somente oito respostas validas, zero timeouts, status completed, sem invalid_reason. RPC estendido para nove modos e erro zero. Sem logica de recordes dentro do controller.
23. **Analysis:** registry existente com seis metricas em graus/ms; RPC `xensi_analysis_v1` estendido. Historico e detalhes mostram oito rodadas/HRTF, nao duracao ficticia de zero segundos. Home nao converte Spatial Hunt em Aim Score generico.
24. **Guest/auth:** guest local; conta usa fila/cloud existentes e isolamento por owner. Testes de navegador com transporte simulado verificaram append, reload, Analysis/PB e troca de conta; SQL real verificou os RPCs e RLS. Nao foi realizado login real de producao no navegador.
25. **Preview:** CSS no mesmo `ExercisePreview`, silenciosa, desmontada no mouseleave/blur. Sem AudioContext, RAF proprio, Pointer Lock ou import da engine. Validado pelo trafego e instrumentacao do browser.
26. **Capabilities:** fine pointer, WebGL2, Pointer Lock, Web Audio/PannerNode. HRTF e verificado ao criar o audio. Em mobile incompativel: aviso explicito, Start desabilitado, sem canvas vazio ocupando a tela. Nenhuma metrica degradada.
27. **Cleanup:** cancela RAF, remove listeners, para/desconecta fontes/nodes, fecha AudioContext, libera geometrias/materials/renderer e perde contexto quando canvas sai do DOM. Remontagem de efeitos do StrictMode nao perde o contexto do canvas reutilizado. ESC, perda de lock, ocultacao, troca de owner e navegacao encerram a sessao, sem retomada valida.
28. **Performance:** pixel ratio limitado a 1.5, duas luzes, sem sombras/texturas/pos-processamento. Nenhum draw WebGL durante blackout estavel, mas mouse/listener continuam. Verificado em Chromium a 1920x1080, 1440x900 e 1366x768, incluindo resize, canvas pixels, cleanup e reuse de AudioContext. Nao equivale a benchmark em hardware de usuario ou garantia de 60 FPS.
29. **i18n:** PT, EN e ES, incluindo estados reais, erro de import, unsupported, timeout, interrupcao, metricas e resultados. Corrigida a ordem dos spreads para o fallback PT nao sobrescrever EN/ES.
30. **Arquivos:** ver inventario abaixo. Nenhum arquivo de Auth UI, tabela de profiles ou fluxo de cadastro foi alterado.
31. **Unitarios:** `npm test`: 297 testes, 35 arquivos, aprovados. Cobrem geometria/FOV/wrap, oito setores/seeds, maquina de estados, relogio de audio, timeout no clique antes do RAF, interrupcao, nested metrics, PB 12.4/9.8/11.1 -> 9.8, zero, audio/pulsos/dispose e exclusao de Rotinas.
32. **Funcionais:** Spatial Hunt + catalogo: 20 aprovados e 4 pulados intencionalmente (mouse em mobile e repeticoes do cenario de interrupcao). Setup apos ajuste mobile: 4 aprovados. Sincronizacao autenticada simulada: 2 aprovados, desktop/mobile. Fluxo real de oito rodadas em cada desktop, PB, retry, ESC, perda de lock e cleanup aprovados. Hidden document foi simulado via visibilitychange; nao e teste manual de troca de aba. SQL Spatial, Micro Flick, Personal Bests e Analysis executados no projeto remoto com PASS e rollback dos dados de teste.
33. **Typecheck:** `tsc -b`, executado pelo build, aprovado.
34. **Lint:** `npm run lint`, aprovado sem avisos.
35. **Build:** `npm run build`, aprovado. Aviso de chunks acima de 500 kB permanece visivel; engine esta lazy, nao no bundle inicial. Rota estatica adicionada no prepare-pages-routes.

## Arquivos

Novos: `src/SpatialHuntLoader.tsx`, `src/SpatialHuntPage.tsx`, `src/firstPersonViewport.ts`, `src/spatialAudio.ts`, `src/spatialHunt.ts`, `src/spatialHuntCopy.ts`, `src/spatialHunt.css`, `src/spatialPreview.css`, `src/spatialHunt.test.ts`, `src/spatialAudio.test.ts`, `tests/spatial-hunt.spec.ts`, `tests/spatial-sync.spec.ts`, `supabase/tests/spatial_hunt.sql` e a migration abaixo.

Integracao: `package.json`, lockfile, configs Playwright, `scripts/prepare-pages-routes.mjs`, `src/Warmup.tsx`, `src/warmupConfig.ts`, `src/warmupExercises.ts`, `src/warmupTelemetry.ts`, `src/routes.ts`, `src/pointerInput.ts`, `src/trainingSession.ts`, `src/sessionCloud.ts`, `src/personalBests.ts`, `src/PersonalBestPanel.tsx`, `src/analysisMetrics.ts`, `src/Analysis.tsx`, `src/useSessionLabels.ts`, `src/Home.tsx`, `src/i18n.tsx`, `src/Routine.tsx`, `src/routineConfig.ts` e respectivos testes/fixtures existentes.

## Banco e advisors

Projeto: `zbdznwubrrkxuraispvr`. Migration aplicada: `20261011011053_spatial_hunt_v1.sql`. O arquivo vazio iniciado em 05/10 foi preenchido e seu timestamp alinhado ao registro retornado pelo Supabase; nao ha duas migrations para a mesma mudanca.

Objetos alterados: allowlist de `training_sessions`, `xensi_personal_best_sessions` e `xensi_analysis_v1`. Nenhuma tabela nova, exclusao de dados, relaxamento de RLS ou permissao anonima adicionada. RPCs permanecem SECURITY INVOKER, search_path vazio e grants somente authenticated.

Security Advisor: nenhum alerta novo do Spatial Hunt. Permanecem os avisos anteriores de [is_nickname_available anon SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [protecao contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nao alterados por estarem fora desta migration.

Performance Advisor: informativo anterior de [indice training_sessions_owner_time ainda nao utilizado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). Nao removido.

`npm audit --omit=dev`: zero vulnerabilidades. Audit completo: seis avisos em dependencias de desenvolvimento preexistentes (duas moderadas/quatro altas). Versoes afetadas conferidas contra HEAD e inalteradas: vitest, @vitest/mocker, brace-expansion, js-yaml, nanoid, source-map-js. Nenhum autofix amplo aplicado.

## Limites e evidencias

- Rotinas continuam baseadas em duracao; Spatial Hunt fica fora do creator ate existir suporte a rounds. Sem refatoracao antecipada.
- Audio test separado e volume slider opcionais nao foram adicionados. O Start faz o unlock; ganho inicial conservador fixo.
- Chromium/Playwright foi usado: Browser plugin/skill dedicado nao estava disponivel. Firefox, Safari e qualidade binaural subjetiva com fones reais nao foram testados. Nao ha afirmacao de localizacao binaural perfeita nem simulacao acustica real.
- Screenshots: `test-results/spatial-final/` (orientation, blackout, reveal, resultados nas tres resolucoes); `test-results/spatial-setup-final/` (setup/unsupported atualizado). Verificacao automatica de pixels confirma scene nao vazia nos desktops e blackout com apenas crosshair.
- Falhas corrigidas durante QA: campo GameConfig.label, traducoes sobrescritas pelo fallback, context loss durante replay do StrictMode, indice visual da rodada no reveal e teste antigo do estado vazio de Analysis. Testes finais executados novamente.
- Regressao adicional: `tests/micro-flick.spec.ts` no desktop, quatro testes aprovados, incluindo Pointer Lock, PB, retry e execucao em Rotinas. `git diff --check` aprovado. `dist/index.html` sem `/Sensi/`, rota estatica Spatial Hunt presente.

Referencias tecnicas: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html), [Web Audio spatialization](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics), [funcoes Supabase](https://supabase.com/docs/guides/database/functions).

# Analysis V1

Implementada em 2026-10-05. Pagina: `/analysis`. Sem novo historico,
tabela derivada, IA, realtime ou biblioteca de graficos adicional.

## Entrega

1. Estrutura: header, filtros, ate quatro indicadores, um grafico,
   comparacao entre periodos, Personal Bests e sessoes recentes.
2. Fontes: Training Sessions existentes, Personal Best service e presets
   do mesmo proprietario. Calibracao nao entra nas estatisticas de treino.
3. Auditoria da pagina anterior: misturava calibracoes e warmups por
   metricas genericas e comparava as duas ultimas execucoes. Essa analise
   foi substituida; nao havia necessidade de inventar ou preencher dados.
   Historico e metodologia de calibracao permanecem no menu CALIBRAR.
4. `analysisService.ts`: funcoes puras para janelas, agregacao, tendencia,
   comparabilidade, transicoes de preset e series. `useAnalysis.ts` resolve
   o contexto e descarta respostas atrasadas; `analysisCloud.ts` valida RPC.
5. Filtros: periodo, exercicio, configuracao e metrica. Overview "Todos"
   nao agrega performance de exercicios diferentes. Defaults vem do registry.
6. Periodos: 7, 30, 90 dias e todo periodo. Janelas moveis, nao meses civis.
   Atual inclui o limite inicial e final; anterior exclui o limite final.
   Cada consulta usa um unico instante de referencia; timestamps futuros
   nao entram. Todo periodo nao fabrica uma janela anterior.
7. Exercicios: Target Switch, Tracking, Target Shooting, Reaction,
   Gridshot, Strafe Track, Sniper Reaction e Micro Flick.
8. Metricas: score, accuracy, hits, bestReactionMs, medianReactionMs,
   meanAcquisitionTimeMs, medianAcquisitionTimeMs, meanOvershootPx e
   targetsPerSecond. Cada exercicio expoe somente o subconjunto declarado
   em SESSION_REGISTRY, com unidade, precisao e direcao centralizadas.
9. Agregacao ENTRE sessoes: score, accuracy, hits, meanOvershootPx e
   targetsPerSecond usam media; tempos bestReactionMs, medianReactionMs,
   meanAcquisitionTimeMs e medianAcquisitionTimeMs usam mediana para
   reduzir influencia de outliers. Os valores internos de cada Session
   nao sao recalculados a partir de telemetria inexistente.
10. Tendencia: `(atual / anterior - 1) * 100`, multiplicada por -1
    para lower-is-better. Exige tres valores validos em CADA janela.
    Baseline zero, dado ausente ou resultado nao finito produz indisponivel.
    Empate e zero, nao melhoria. 200 -> 180 ms representa +10%.
11. Consistencia: CV populacional = `stddev_pop / abs(mean) * 100`.
    Pelo menos dois valores e media diferente de zero. Nao e nota de
    qualidade, intervalo de confianca ou faixa de classificacao.
12. Direction awareness: direcao herdada do registry para metricas
    principais; complementares possuem metadados explicitos.
13. Comparabilidade: exercicio + exercise_version + comparison_signature
    exatos. Duracao, input, arena e regras que integram a assinatura nao
    sao misturados. Rotina e identidade do preset nao criam novas variantes.
14. Grafico: scatter ligado cronologicamente, X timestamp real, Y uma
    metrica. Dimensoes responsivas, pontos acessiveis por teclado e texto
    alternativo no resumo, comparacao e lista. Um ponto tambem e mostrado.
15. Biblioteca: SVG React, seguindo o padrao existente. ResizeObserver
    adapta coordenadas a largura real; nenhuma dependencia foi adicionada.
16. Tooltip: data/hora local, exercicio, valor/unidade, configuracao compacta,
    sensibilidade, DPI, jogo, cm/360 pela engine oficial, preset e rotina.
    Mouse/foco abrem o contexto; clique/Enter/Espaco abrem detalhes completos.
    Modal tem Escape, foco inicial, contencao de Tab e retorno de foco.
17. Markers: uma transicao discreta quando sensibilidade, DPI, game_id ou
    preset_id muda entre os pontos exibidos. Renomear preset nao marca
    mudanca. Nao infere equivalencia de DPI nem causalidade de performance.
18. PB: usa o service existente, nao nova tabela. Linha somente para
    metrica principal e variante exata. PB e lifetime, nao recorde restrito
    ao periodo. Resumo identifica explicitamente PB da metrica principal.
19. Recent Sessions: ultimas 20 completed/comparable do filtro, em linhas;
    invalid/interrupted nao entram. Detalhes mostram valores registrados,
    contexto e status. Exclusao exige confirmacao, respeita owner/RLS e
    recalcula grafico, resumo, lista e PB; erro nao simula sucesso.
20. Guest: Sessions locais do IndexedDB/repository existente. Estatisticas
    usam todo o historico local retido (limite existente: 3.000), nao apenas
    os pontos desenhados. Nenhum upload sem importacao consentida.
21. Autenticado: agregados cloud via RPC, nao o cache de 300 Sessions como
    se fosse historico completo. Loading/erro nao fazem fallback para guest.
    Nova Session, importacao e exclusao invalidam pelo repository existente.
22. Logout: snapshot anterior fica inacessivel imediatamente; contexto
    guest so aparece depois de resolvido, com dados apenas do guest.
23. Multi-device: refetch ao abrir/atualizar; sem realtime. E2E verifica
    segundo contexto de navegador com transporte mockado, nao dois PCs reais.
24. Supabase: RPC `public.xensi_analysis_v1` aplicada no projeto
    `zbdznwubrrkxuraispvr`, migration `20261005043144_analysis_v1.sql`.
    SECURITY INVOKER, search_path vazio, auth.uid igual ao owner esperado,
    EXECUTE apenas authenticated, RLS existente preservado.
    Banco filtra owner + duas janelas; seleciona exercicio + assinatura +
    versao exatos para agregados. Inventario de variantes traz apenas uma
    Session representativa por variante no periodo atual. Nao busca toda
    a tabela sem owner, nem envia milhares de pontos para o cliente.
25. Indices: inspecionados owner_time, owner_exercise_time, PK e indices das
    FKs de run/routine/step/preset. Nenhum indice ou tabela novo: filtros
    existentes ja contam com os indices por owner/data/exercicio.
26. Arquivos: lista abaixo. Nenhum frontend/Auth UI foi alterado para
    contornar autenticacao. Alteracoes unrelated preexistentes preservadas.
27. i18n: copy Analysis PT/EN/ES, duas novas labels de tempos no i18n
    central, dificuldade/input/mira reutilizados. Datas usam locale e fuso
    local; timestamps persistidos em UTC permanecem intactos.
28. Unitarios: `npm test -- --run`: 278 passaram em 33 arquivos. Cobrem
    janelas, media/mediana/CV, direcao, empate, poucos dados, baseline zero,
    NaN/Infinity, overflow, assinatura/versao/owner, sens/DPI e exclusao.
29. Integracao: 16 casos Analysis UI passaram em quatro viewports;
    10 casos Analysis cloud passaram em desktop/mobile com Supabase mockado;
    regressao Sessions/PB: 17 passaram, um skipped no mobile por pointer-lock.
    SQL transacional REAL em XENSI passou para 351 Sessions/agregado completo,
    limites de payload, mediana/CV, janelas, owner/RLS/anon, filtros e exclusao.
    Fixtures SQL terminam em ROLLBACK; nao ficam usuarios de teste no banco.
30. Typecheck: `tsc -b`, executado dentro de `npm run build`, passou.
31. Lint: `npm run lint` passou; `git diff --check` sem erro de whitespace.
32. Build: `npm run build` passou. Bundle JS aproximadamente 992 kB
    minificado / 279 kB gzip; aviso Vite >500 kB permanece. Sem alterar
    limite para esconder aviso ou fazer refatoracao de bundle fora do escopo.

## Limites e advisors

Grafico: ultimos 300 pontos validos, ordenados por timestamp; estatisticas
cloud incluem TODO o periodo filtrado. UI informa o limite quando aplicavel.
Recentes: 20 linhas. Inventario de variantes nao e paginado nesta versao;
uma conta com milhares de configuracoes distintas pode exigir paginacao
futura desse inventario, sem mudar a exatidao dos agregados.

Presets apagados: fallback "Preset removido", sensibilidade/DPI originais
da Session preservados. Session V1 nao possui snapshot do nome do preset;
nao foi inventado nem migrado um nome historico.

Security e Performance Advisors executados depois da migration. Nenhum
alerta identifica a nova RPC. Permanecem alertas preexistentes, sem alteracao
de comportamento fora do escopo:

- `is_nickname_available` SECURITY DEFINER executavel por anon e authenticated:
  [anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- [Leaked password protection desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- INFO: [training_sessions_owner_time sem uso observado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
  Nao remover cegamente indice util para owner/data.

## Arquivos

- `src/Analysis.tsx`
- `src/AnalysisChart.tsx`
- `src/AnalysisSessionContext.tsx`
- `src/CalibrationAnalysis.tsx`
- `src/analysisService.ts`
- `src/analysisService.test.ts`
- `src/analysisMetrics.ts`
- `src/analysisCloud.ts`
- `src/analysisCopy.ts`
- `src/useAnalysis.ts`
- `src/useSessionLabels.ts`
- `src/PersonalBestPanel.tsx`
- `src/trainingSession.ts`
- `src/sessionRepository.ts`
- `src/sessionRepository.test.ts`
- `src/sessionCloud.ts`
- `src/sessionStorage.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `tests/analysis-dashboard.spec.ts`
- `tests/analysis-sync.spec.ts`
- `tests/fixtures/accountCloud.ts`
- `playwright.config.ts`
- `playwright.presets.config.ts`
- `supabase/migrations/20261005043144_analysis_v1.sql`
- `supabase/tests/analysis_v1.sql`
- `supabase/ANALYSIS_V1.md`

## Verificacao visual

Playwright/Chromium do projeto, Browser plugin ausente. Viewports:
1920x1080, 1440x900, 1366x768 e Pixel 5. Capturas fora do repositorio,
em `C:/Users/FSOS/.codex/analysis-v1-final`.

Filtros 7 dias -> Micro Flick -> variante 60s demonstraram tres sessoes
atuais, tres anteriores e +10% para 200 -> 180 ms. Em 30 dias, seis pontos
e um marker de 0.27 -> 0.24. Tooltip, detalhes, troca para accuracy,
todo periodo e exclusao foram exercitados. Sem overflow horizontal,
framework overlay ou pageerror nos casos Analysis UI.

Nao foi executado login interativo contra conta real de producao, Safari,
Firefox ou comparacao de carga em banco com historico massivo. Testes de
transporte/auth/multi-device usam mocks; testes SQL/RLS usam o banco real.

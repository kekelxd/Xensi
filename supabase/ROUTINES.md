# Saved Routines V1

## Modelo e Migration

Aplicada no projeto XENSI `zbdznwubrrkxuraispvr`: `20261004012653_create_training_routines.sql`.
O timestamp local foi alinhado ao registro remoto, sem criar outra migration.
A inspecao anterior encontrou somente `profiles` e `sensitivity_presets`, sem estrutura conflitante de rotinas.

`CustomRoutine` possui id, name, gameId, presetId opcional, items, createdAt e updatedAt.
Cada item possui identidade, modeId, durationSeconds, difficulty e order. Portanto foram escolhidos steps normalizados, nao JSONB como armazenamento da definicao.

| Tabela | Campos |
| --- | --- |
| `public.training_routines` | id UUID PK, user_id UUID FK, name, game_id, preset_id opcional, created_at, updated_at |
| `public.training_routine_steps` | id UUID PK, routine_id UUID FK, position, exercise_id, duration_seconds, difficulty, created_at, updated_at |

Configuracoes reais sao duration_seconds e difficulty, com jogo/preset na rotina. Nao ha parametros variaveis adicionais que justifiquem configuration JSONB.
Duracoes preservadas: 60, 120, 180, 240 e 300 segundos. Dificuldades: easy, medium, hard e adaptive; sniper-reaction nao aceita adaptive.
Nao foram persistidos estados visuais do creator, mira temporaria, dados derivados, sessions, PBs ou Analysis.
Valores manuais de sensibilidade/DPI continuam seguindo o comportamento existente do runner; a referencia persistida e gameId/presetId, nao um novo snapshot de sensibilidade.
`preset_id` e texto sem FK: referencias locais antigas ou presets removidos nao devem impedir preservar a rotina. O resolvedor de presets existente foi mantido.
Nao foi adicionado schema_version a tabela porque o modelo nao introduz configuracao opaca; os namespaces locais sao versionados em v1.

## Integridade e Seguranca

- RLS habilitado nas duas tabelas. Policies `training_routines_{select,insert,update,delete}_own`: `(select auth.uid()) = user_id`; UPDATE tem USING e WITH CHECK.
- Policies `training_routine_steps_{select,insert,update,delete}_own`: routine_id deve pertencer a uma rotina do usuario; UPDATE verifica destino e origem.
- authenticated recebe somente SELECT/INSERT/UPDATE/DELETE nas tabelas e EXECUTE nas tres RPCs. anon/PUBLIC nao recebem esses acessos.
- FK user_id -> auth.users(id) ON DELETE CASCADE; FK routine_id -> training_routines(id) ON DELETE CASCADE.
- Triggers `training_routines_updated_at` e `training_routine_steps_updated_at` reutilizam `public.xensi_set_updated_at()`, sem alterar a funcao existente.
- Indice `training_routines_owner_updated(user_id,updated_at desc,id)` cobre filtro de proprietario/FK e ordenacao. Unique `training_routine_step_position(routine_id,position)` cobre FK e leitura ordenada dos steps; e DEFERRABLE INITIALLY DEFERRED para permitir troca de posicoes. PKs indexam os UUIDs. Nao foram adicionados indices redundantes.
- RPCs `xensi_get_training_routines()`, `xensi_save_training_routine(definition,create_new,expected_user_id)` e `xensi_import_training_routines(definitions,expected_user_id)` sao SECURITY INVOKER, com search_path vazio. Salvamento/importacao verificam expected_user_id e usam advisory lock por conta.
- Save valida steps nao vazios, UUIDs unicos, posicoes contiguas 0..n-1 e checks de configuracao. Nome/rotina e todos os steps sao salvos na mesma transacao; qualquer erro reverte tudo. UPSERT preserva created_at dos steps existentes, atualiza seus timestamps e recusa reutilizar UUID de outro routine_id.
- Fetch retorna um unico JSON agregado, sem depender do limite REST de linhas para steps embutidos. JSON e usado como transporte da RPC, nao como atalho de schema.
- exercise_id aceita texto nao vazio para preservar referencias antigas/removidas. A UI/repository validam os modos disponiveis para novas definicoes; rotinas antigas mantem steps indisponiveis, mostram mensagem localizada e nao podem iniciar.

Nenhuma estrutura de profiles, Auth ou sensitivity_presets foi alterada por esta migration. Nao existe service_role no frontend.

## Infraestrutura Compartilhada

`AccountCollectionRepository` extrai dos presets a transicao Auth/loading, isolamento por conta, refresh, cache confirmado, controle de concorrencia, erros, offers, dismissal e receipts. Ambos os repositories usam essa classe e o mesmo binding de eventos Auth/storage.
`PresetRepository` preserva sua API e status presets-loading por meio de um snapshot adaptado. Nao foi criado outro sistema independente de sync.
`RoutineRepository` oferece getAll, getById, create, update, remove, duplicate, rename, reorder, refresh e importGuestRoutines; somente o adapter cloud conhece Supabase.
`useRoutineState` fornece um snapshot estavel para React. Routine e Home usam essa fonte. O creator/runner existente permanece; a tela e remontada ao trocar proprietario para descartar drafts anteriores.
Auth loading/data loading nao renderizam temporariamente a biblioteca guest. Iniciar tambem aguarda os presets da conta.
Writes nao sao otimistas: erro conserva os ultimos dados/cache confirmados e nao exibe Salvo. Cache offline nao e uma mutation queue.

## Storage, IDs e Importacao

| Finalidade | Namespace |
| --- | --- |
| Biblioteca guest | `xensi-routine-library:v1` |
| Legado de rotina unica, mantido intacto | `xensi-custom-routine:v1` |
| Backup dos dois documentos originais | `xensi-routines:pre-sync-v1` |
| Cache autenticado | `xensi-routines:user:<userId>:v1` |
| Receipts confirmados | `xensi-routines:imported:<userId>:v1` |
| Dismissal na sessao | `xensi-routines:offer-dismissed:<userId>` em sessionStorage |

Leitura normaliza o modelo existente, converte IDs antigos/duplicados em UUIDs e grava o resultado somente depois de preservar os documentos originais. UUIDs validos sao mantidos. Dados malformados nao sao sobrescritos: aparece erro e novas gravacoes guest ficam bloqueadas ate refresh bem-sucedido.
Exercicios com modeId desconhecido nao sao descartados. O restante da rotina permanece editavel; renomear uma definicao antiga preserva esses steps. Referencias legadas de presets sao remapeadas somente quando o backup e os presets atuais identificam uma correspondencia unica, sem depender da ordem da lista.
Biblioteca explicitamente vazia nao volta a migrar a rotina unica apos exclusao.
Duplicate cria outro UUID para rotina e cada step, novos timestamps, mesma configuracao e ordem; sufixo localizado preserva o comportamento PT existente, com limite de nome ja existente de 48 caracteres.
Reorder verifica uma permutacao completa dos steps e grava posicoes contiguas, sem perder identidades.

Cloud fetch acontece antes da oferta. Nao ha upload sem consentimento. `PresetSyncStatus` coordena um unico dialogo: presets, rotinas ou ambos, com contagens quando necessario.
Agora nao conserva os originais e evita loops durante a sessao; o botao da biblioteca permite reabrir a oferta. Logout limpa o dismissal da conta, descarta dados visiveis autenticados e restaura o guest anterior, nunca copiando cloud para guest.
Merge e por UUID: mesmo UUID preserva a definicao cloud; UUID diferente preserva ambos, mesmo com nome/configuracao identicos. Colisao com outra conta falha, sem tomar posse dos dados.
Importacao da colecao de rotinas e transacional. Repetir apos perda da resposta nao duplica dados. Receipt so e escrito apos confirmar todos os UUIDs na resposta; originais guest nao sao apagados. Falha ao gravar receipt permite retry seguro.
Presets/rotinas sao duas transacoes independentes quando importados juntos: sucesso parcial mantem receipts da colecao confirmada e oferece retry da restante. Troca de conta entre as duas operacoes interrompe o fluxo antes de importar na nova conta.

## I18n

`src/i18n.tsx`: novas chaves `routines.*` e `accountData.*` em PT, EN e ES.
Incluem import title/text/actions, importing, success/error, save/sync error, loading, empty state, duplicate suffix, unavailable exercise, acoes da biblioteca, dialogs e ordem de item.
Nao foram inseridas mensagens novas hardcoded na UI.

## Testes Executados

- `supabase/tests/training_routines.sql` executado no banco real: usuarios temporarios A/B, own CRUD, steps/config/order, timestamps, ownership reassignment negada, mismatch de sessao, erro parcial com rollback integral, retry/merge por UUID, UUID diferente com configuracao igual, bloqueio de leitura/update/delete/insert/RPC entre contas, anon sem acesso, cascade de rotina e cascade de usuario. Tudo passou e foi revertido com ROLLBACK.
- Inspecao pos-migration confirmou tabelas/RLS, oito policies, FKs, indices, triggers e RPCs invoker/search_path. A verificacao final encontrou 0 rotinas, 0 steps, 0 usuarios de teste e 0 grants anon; profiles continuou com 7 linhas e presets com 0.
- `npm test`: 209 testes passaram em 28 arquivos. Novos testes cobrem CRUD guest/cloud, migration/backup, storage malformado, cache/account isolation, merge/retry, responses antigas, configuracoes/ordenacao e leitura de 1001 steps sem truncamento.
- `npx playwright test --config=playwright.presets.config.ts --workers=2`: 28 testes desktop/mobile para presets e rotinas. Login, CRUD, reload, explicit import/dismissal, resposta perdida/retry, importacao conjunta, erro sem falso sucesso, segundo browser, loading sem flash guest, modo removido e textos em ingles.
- Regressao `tests/custom-routine.spec.ts` e `tests/preset-flow.spec.ts`, desktop/mobile: 10 passed, 4 skipped conforme skips preexistentes de rotina/mobile. Execucao com pointer lock passou em desktop, incluindo duracao/dificuldade por step e contexto das metricas/PBs.
- `tests/auth.spec.ts`, desktop/mobile: 10 passed. O teste de geometria passou a esperar fontes/animacao; nenhum comportamento ou estilo Auth foi alterado.
- Typecheck `npx tsc -b`: passou. Lint `npm run lint`: passou. Build `npm run build`: passou, com aviso de chunk maior que 500 kB (JS aproximadamente 936 kB), ja presente no projeto. dist/index.html nao contem `/Sensi/`.

Playwright foi usado porque o Browser plugin/skill nao estava disponivel. Runtime: Chromium desktop 1440x900 e Pixel 5; preview guest em http://127.0.0.1:5174/train/routines. Servidor isolado de fixtures em 5175, com URL/chave falsas e chamadas Supabase interceptadas.
Os testes de app verificaram identidade da pagina, conteudo nao vazio, ausencia de overlay Vite e erros de runtime/console inesperados, screenshots e interacoes. Erros HTTP 503 nos casos de falha sao intencionais.
Screenshots conferidos para biblioteca e dialogo compartilhado; biblioteca/dialogo sem overflow nos viewports testados. Uma captura full-page da Home mobile evidencia overflow horizontal preexistente fora do modulo de rotinas; nao foi redesenhada nesta tarefa.
Auth cloud no navegador e multi-device sao simulados por fixtures/dois contextos, nao login real no Supabase nem dois dispositivos fisicos. SQL/RLS/cascade foram realmente executados no projeto remoto. Nao foi feito deploy nem push nesta etapa.

## Advisors e Pendencias

Performance Advisor: nenhum alerta. Security Advisor: nenhum alerta de rotinas; continuam os tres anteriores, fora desta migration:

- [Nickname SECURITY DEFINER acessivel por anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- [Nickname SECURITY DEFINER acessivel por authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- [Protecao contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Pendencias de validacao externa: exercitar login real em producao com uma conta de teste e confirmar dois dispositivos reais. O bundle warning e a Home mobile citados acima permanecem fora do escopo.

## Arquivos Desta Etapa

- Infra: `src/accountCollectionRepository.ts`, `src/presetRepository.ts`, `src/presetStorage.ts`, `src/routineRepository.ts`, `src/routineStorage.ts`, `src/useRoutineState.ts`.
- UI/modelo: `src/PresetSyncStatus.tsx`, `src/Routine.tsx`, `src/routineConfig.ts`, `src/useSensitivityPreset.ts`, `src/Home.tsx`, `src/App.tsx`, `src/i18n.tsx`.
- Unit: `src/routineRepository.test.ts`, `src/routineConfig.test.ts`.
- E2E: `tests/routine-sync.spec.ts`, `tests/fixtures/accountCloud.ts`, `tests/preset-sync.spec.ts`, `tests/custom-routine.spec.ts`, `tests/auth.spec.ts`, `playwright.presets.config.ts`, `playwright.config.ts`.
- Banco/documentacao: `supabase/migrations/20261004012653_create_training_routines.sql`, `supabase/tests/training_routines.sql`, `supabase/ROUTINES.md`.

Alteracoes da etapa Presets V1 que ja estavam no worktree foram preservadas.

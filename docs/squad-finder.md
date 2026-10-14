# XENSI Squad Finder — estado atual

Reescrito em 2026-10-13 a partir das migrations `supabase/migrations/*squad_finder*`
(em ordem), de `src/squad/*`, de `public/sw.js`, da função `supabase/functions/squad-push`
e dos scripts de teste. Onde algo não pôde ser confirmado no código está escrito
**"não verificado"**. Nenhuma alegação de conformidade legal é feita.

**Estado de implantação (verificado em 2026-10-13 no projeto hospedado `xensi`):**
- **Não existe ambiente de staging.** Tudo foi aplicado direto no projeto de produção.
- Migrations aplicadas: as seis primeiras (`20261011163626` até `20261011185312`) e também
  `web_push`, `push_service_rpcs`, `clear_notifications`, `games_and_slots`, `saved_discord` e
  `push_endpoint_allowlist` (esta em 2026-10-13, verificada: host parecido, userinfo, IP e porta
  diferente de 443 são rejeitados). Os arquivos locais usam as mesmas versões do hospedado
  (ver "Nomes das migrations").
- Edge function `squad-push`: **implantada e ACTIVE, mas na v1**, anterior às correções (sem
  revalidação de host, sem comparação de segredo em tempo constante, sem `event_id`/tag por
  evento, sem log de falhas). **A reimplantação com o código atual está pendente** (deploy manual).
- `lfg_private.push_config` tem as chaves `function_url` e `shared_secret` (valores não documentados);
  `pg_net` está instalado; há 0 inscrições de push; `settings.enabled` e `creation_enabled` são
  `true`; há 1 moderador.
- Security advisors (13/10): apenas avisos esperados (RLS sem política nas tabelas privadas;
  `SECURITY DEFINER` nas RPCs do próprio módulo). `is_nickname_available` é executável por `anon`
  (pré-existente; intenção não confirmada). **Leaked password protection está desativada**
  (ação manual no painel de Auth).
- Não verificado nesta revisão: o job `pg_cron` atual e a execução real de entrega de push de ponta a ponta.

## Escopo e arquitetura

- `public.profiles` é a única fonte de nickname/avatar; sua RLS de dono não foi ampliada.
  O backend projeta apenas nickname/avatar nas interações sociais. Não existe segundo perfil.
- Calibrador, conversor, minigames, sessões e PBs não são tocados. Ferramentas para
  convidados continuam disponíveis. Integração limitada a lazy loading, rotas, navbar atual
  e geração estática de rotas SPA.
- Copy em pt-BR/en-US; o locale espanhol cai para inglês dentro do módulo.
- Acesso exige conta registrada com e-mail confirmado e não anônima, e `settings.enabled`
  (ver "Acesso").

### Arquivos e rotas

- `src/squad/SquadFinder.tsx`: área autenticada (listagem, painel do host, solicitações,
  bloqueios, notificações, moderação, push, "Meu Discord"). O estado privado remonta a cada
  troca de conta.
- `SquadBell.tsx` (sino na navbar, polling de 8 s + ao voltar a aba, ativa/desativa push),
  `SquadToast.tsx`, `GameSelect.tsx`, `sound.ts` (alerta sintetizado, só com aba aberta),
  `push.ts`, `service.ts` (RPC tipada, abortável), `registry.ts`, `copy.ts`, `squad.css`.
- `registry.ts` espelha os padrões do backend (jogos, plataformas, regiões, texto livre,
  Discord). **O registro do backend é a autoridade**; mudar um exige mudar o outro.
- Rotas: `/squad`, `/squad/my-room`, `/squad/requests`, `/squad/moderation`, `/squad/blocks`
  (links diretos, histórico, chunk lazy). Filtros usam query string; contatos privados nunca
  entram em URL. Páginas de 20 itens. O workspace atualiza a cada 20 s enquanto visível.
- Sem WebSocket próprio, e-mail, chat ou OAuth/bot do Discord.

## Acesso

- `lfg_private.eligible(u)` (migration `…182551`): e-mail confirmado, não anônimo,
  `access_enabled(u)` verdadeiro e usuário sem `restrictions.suspended`.
- **O gate de idade foi removido** (`…182551_remove_age_gate`) e o acesso foi aberto a contas
  registradas (`…184403_registered_access`): `access_enabled` = `settings.enabled`;
  `creation_allowed` = `enabled and creation_enabled`. Essa migration também executa
  `update lfg_private.settings set enabled=true, creation_enabled=true, test_enabled=false…`,
  ou seja, **aplicá-la liga o módulo**. `legal_reviewed` e `moderation_ready` continuam
  na tabela, mas **não** fazem mais parte do gate.
- Modo de teste controlado (`…180903`): `test_enabled`, `test_creation_enabled`,
  `test_accounts` (lista aprovada, validade ≤ 30 dias) e `test_registration_cutoff`
  permanecem no schema; com `test_enabled=false` não têm efeito.
- A resposta `access` não expõe mais `age_verified` (o wrapper `public.xensi_lfg` o remove).
- Moderadores ficam em `lfg_private.moderators` (nunca em metadata do usuário) e precisam
  de e-mail confirmado. Em modo de teste também precisam ser elegíveis.
- O navegador nunca recebe chave de serviço.

## Banco e fronteiras de segurança

Tabelas públicas: `lfg_rooms`, `lfg_requests`, `lfg_room_contacts`, `lfg_request_contacts`,
`lfg_reports`, `lfg_blocks`, `lfg_moderation_actions`. Schema privado `lfg_private`:
`settings`, `registry`, `age_assurances`, `moderators`, `restrictions`, `events`, `audit`,
`attempts`, `test_accounts`, `discord_handles`, `push_subscriptions`, `push_config`.

Todas têm RLS habilitada e **nenhum grant direto** de SELECT/INSERT/UPDATE/DELETE para
`anon`/`authenticated`. Há políticas de leitura de dono em salas, solicitações e bloqueios
como defesa em profundidade; contatos, denúncias e moderação não têm política genérica.

`public.xensi_lfg(action, payload, expected_user_id)` é um wrapper `security invoker` do
dispatcher privado (`lfg_private.api` → `api_core`, `security definer`, `search_path` vazio).
A cada ação valida `auth.uid()` contra o usuário esperado, sessão viva (`session_valid`),
elegibilidade e, nas escritas, limites. Funções auxiliares não são executáveis por clientes.
Respostas levam `Cache-Control: no-store, private`.

### RPCs e ações

Dispatcher `xensi_lfg` — leitura: `access`, `list`, `mine`, `requests`, `notifications`,
`blocks`, `mod_list`. Escrita: `create`, `request`, `accept`, `decline`, `withdraw`,
`host_contact`, `release`, `confirm`, `cancel`, `report`, `block`, `unblock`, `mod_decide`,
`mod_capacity`. Ações `mod_*` exigem moderador. Ação desconhecida falha (a contagem de
tentativas a registra como `invalid`).

Outras RPCs `public`:

| RPC | Quem executa | Função |
|---|---|---|
| `xensi_lfg_record_age(user,provider,ref,valid_until)` | `service_role` | adaptador de evidência de idade; **não é pré-requisito** de acesso |
| `lfg_private.sweep()` | `service_role` (e pg_cron) | expiração e retenção |
| `xensi_notifications_clear()` | `authenticated` | apaga o histórico de notificações da própria conta |
| `xensi_discord_get()` / `xensi_discord_set(text)` | `authenticated` | Discord salvo (set exige elegibilidade) |
| `xensi_push_subscribe(endpoint,p256dh,auth,lang)` / `xensi_push_unsubscribe(endpoint)` | `authenticated` | inscrição de push da própria conta |
| `xensi_push_targets(user)` / `xensi_push_drop(id)` | **somente** `service_role` | usadas pela função de borda |

## Salas, vagas e transições

Sala: 1–4 vagas (`max_open_slots`, escolhido pelo host; padrão 1 se omitido). Cada solicitação
aceita ocupa uma vaga e tem o próprio `reserved_until`. Status de sala: `open`, `reserved`,
`closed`, `expired`, `cancelled`.

| Entidade | De | Operação | Para |
|---|---|---|---|
| Sala | open | aceitar a última vaga livre | reserved (todas as vagas ocupadas, alguma sem confirmação) |
| Sala | reserved | liberar / expirar / bloqueio de uma reserva | open (volta a ter vaga) |
| Sala | open/reserved | todas as vagas confirmadas | closed (automático) |
| Sala | open/reserved | host encerra com ≥ 1 entrada confirmada | closed |
| Sala | open/reserved | host encerra sem ninguém confirmado; moderação (cancel_room/restrict/suspend) | cancelled |
| Sala | open/reserved | prazo da sala | expired |
| Solicitação | pending | host aceita (vaga livre) | accepted |
| Solicitação | pending | host recusa | declined |
| Solicitação | pending | última vaga é aceita | declined (automático, com notificação) |
| Solicitação | pending | solicitante cancela | withdrawn |
| Solicitação | accepted | host confirma antes do prazo | joined |
| Solicitação | accepted | host libera / prazo da reserva / bloqueio / suspensão | cancelled |
| Solicitação | pending/accepted | sala termina, bloqueio, suspensão | cancelled |

Salas e solicitações em estado final não reabrem. `joined` permanece após o fim da sala.
Um solicitante só pode pedir uma vez por sala (`lfg_duplicate`), inclusive após cancelar.
O host controla aceitação, confirmação e encerramento. Aceitar exige sala `open` e vaga livre
(`lfg_reserved` caso contrário). Solicitar exige sala `open`, host elegível e não bloqueado,
consentimento explícito (`consent: true`) e plataforma na lista (`lfg_platform`).

Concorrência: lock consultivo de transação (`xensi:lfg:transaction`, `lock_timeout` 2 s →
`lfg_busy`) e `FOR UPDATE` na sala serializam as ações; índice parcial único garante uma sala
ativa por host (`lfg_one_active_room`). Prazos são rechecados após adquirir o lock da sala.
Uma transação com erro desfaz dados e notificações juntos.

Limites por conta: 3 salas/hora, 5 solicitações/10 min, 5 denúncias/hora, 30 escritas/min
e 60 chamadas/min (a contagem de tentativas sobrevive a rollback). **Limites de perímetro
para tentativas anônimas/falhas HTTP não existem aqui** (ver pendências).

### Registro de jogos e campos de sala

- 17 jogos: Valorant, CS2, Fortnite, Rainbow Six Siege X, Call of Duty, Apex Legends, PUBG,
  Overwatch 2, Marvel Rivals, Delta Force, The Finals, Battlefield 6, League of Legends,
  Dota 2, Deadlock, Rocket League, EA Sports FC.
- Todos aceitam todas as plataformas (`pc`, `xbox_series`, `ps5`, `xbox_one`, `ps4`); o host
  escolhe a da sala e cada solicitante informa a sua.
- Modo e rank são texto livre de até 24 caracteres, validado por `lfg_private.free_text_ok`
  (sem `@ # : / \ < >`, sem `http`, `www`, `discord`, `.gg`, `.com`, `.net`) e espelhado em
  `registry.ts`. Rank é autodeclarado, sem verificação por API de jogo.
- Regiões: `sa`, `na`, `eu`, `as`, `oc`.
- `crossplay` continua sendo um booleano obrigatório na sala, mas a UI sempre envia `true` e não o exibe; **não restringe** quem pode solicitar.
- Discord: usuário em minúsculas `[a-z0-9_.]{2,32}`, sem `..`. Referência das regras:
  [Discord: usernames](https://support.discord.com/hc/en-us/articles/12620128861463-New-Usernames-Display-Names).

## Visibilidade do Discord

Listagens trazem apenas dados estruturados da sala, nickname/avatar e handle opaco de ação;
nunca UUID do host, e-mail nem Discord.

- O host vê o Discord do solicitante enquanto a solicitação está `pending` ou `accepted` com
  reserva ativa, a sala está `open`/`reserved` e não expirou, e ambos seguem elegíveis e sem bloqueio.
- Somente o solicitante com reserva ativa pode chamar `host_contact` (sala ativa, host elegível,
  sem bloqueio). A resposta inclui o `reserved_until`. Cada leitura é auditada.
- Cancelamento, bloqueio, suspensão, liberação, expiração ou confirmação negam leituras
  seguintes. Contatos são apagados pelo `sweep` quando a sala/solicitação é finalizada.
- No navegador não há cache persistente de contato do host; ele é limpo ao trocar de conta,
  de área, em falha de autorização, no prazo da reserva e em mudanças de visibilidade da aba.
  Revogação não desfaz o que alguém já copiou.
- **Discord salvo** (`…210000_saved_discord`): `lfg_private.discord_handles` (RLS, sem grants),
  lido/gravado só por `xensi_discord_get/set` da própria conta. Os diálogos pré-preenchem o
  valor e, com a caixa "lembrar" (ligada por padrão), salvam alterações; a barra lateral
  "Meu Discord" o edita. É removido com a conta. Substitui a regra antiga de reuso só em memória.
- Valores do Discord não entram em logs, notificações, cards públicos nem HTML inicial.

## Moderação, expiração e retenção

- Denúncias usam categorias fixas, sem texto livre ou upload (`harassment`, `abuse`, `spam`,
  `suspicious`, `privacy`, `other`). Moderadores veem denúncias, bloqueios, restrições e
  histórico; podem dispensar/resolver, restringir publicação, suspender, restaurar, cancelar
  sala ou pausar a criação de salas (`mod_capacity`, também com o módulo em modo restrito).
  Suspensão cancela salas hospedadas e a participação pendente/reservada.
- Bloqueios valem nos dois sentidos e cancelam solicitações/reservas afetadas.
- Prazos padrão em `settings`: sala 30 min (5–60) e reserva 10 min (1–20), limitada ao prazo
  da sala. Prazos negam contato/participação imediatamente, mesmo com a limpeza física atrasada.
- `lfg_private.sweep()` (SKIP LOCKED) expira salas, libera reservas vencidas, apaga contatos
  finalizados e remove `events` e `audit` com mais de 30 dias e `attempts` com mais de 1 dia.
  Roda em toda chamada da API e, via `pg_cron` (`…185312_scheduled_cleanup`), em um job
  `xensi-lfg-expiry` a cada minuto com `lock_timeout=2s` e `statement_timeout=30s`; a migration
  aborta se já existir um job de mesmo nome com outro comando.
  O job foi confirmado em execução segundo `squad-live-deployment.md` (não reverificado).
- Retenção de denúncias e ações de moderação **não tem prazo definido**; depende de política.
- Remoção de conta: a FK composta antiga da reserva única foi removida na migration de vagas;
  efeito da remoção de conta com reservas ativas no modelo atual: não verificado.

### Notificações

Eventos privados (`lfg_private.events`): `new_request`, `request_withdrawn`, `request_accepted`,
`request_declined`, `joined`, `reservation_expired`, `reservation_cancelled`, `room_closed`,
`room_cancelled`, `room_expired`. O sino lista os 20 mais recentes.
`xensi_notifications_clear()` (`…170000`) apaga **todos** os eventos da própria conta
(botão "Limpar tudo" no sino e na área do módulo). Notificação in-app: aba aberta com som
(`sound.ts`, desbloqueado no primeiro gesto) e toast.

## Web Push

Push do navegador apenas para `new_request` (host) e `request_accepted` (solicitante). O
payload é genérico e nunca carrega Discord; tocar na notificação abre `/squad/my-room` ou
`/squad/requests`, onde `host_contact` é buscado sob as regras normais.

**Peças:** `public/sw.js` (somente push, sem cache/offline), `src/squad/push.ts`, migrations
`20261012165854_web_push` (tabela de inscrições, RPCs de subscribe/unsubscribe, extensão
`pg_net`, trigger `lfg_events_push` em `lfg_private.events`), `20261012170010_push_service_rpcs`
(targets/drop só `service_role`), `20261013235902_push_endpoint_allowlist`, e a função de borda
`supabase/functions/squad-push`.

**Entrega:** o trigger faz `net.http_post` (timeout 3 s, falhas engolidas — nunca desfazem a
transação social) para `function_url` em `lfg_private.push_config`, com o cabeçalho
`x-push-secret`. A função compara o segredo em tempo constante, busca as inscrições via
`xensi_push_targets` e envia com TTL 600 s e urgência alta. O payload inclui `kind`, `event_id`
e `tag = kind:event_id`; o service worker usa `renotify: true`, de modo que avisos sucessivos
não ficam mudos.

**Allowlist de endpoint (SSRF):** `lfg_private.push_endpoint_ok` e o `xensi_push_subscribe`
aceitam apenas `https`, porta 443 (ou omitida), sem userinfo, sem IP literal e com host em
`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.services.mozilla.com`,
`*.notify.windows.com`, `web.push.apple.com` ou `*.push.apple.com`; erro `lfg_invalid_endpoint`.
A função de borda revalida o host antes de enviar e descarta a inscrição inválida. Inscrições
antigas fora da allowlist, se existirem, só são removidas no primeiro envio.

**Limites:** até 5 inscrições por conta (`lfg_rate_limit`); exige elegibilidade.

**Remoção no servidor:** a função apaga a inscrição (`xensi_push_drop`) em resposta 404, 410,
401 ou 403 do serviço de push; outros status só são registrados (apenas `id` da inscrição e
código, nunca endpoint, chaves ou user_id). **Atenção: uma configuração errada de VAPID
(chaves trocadas ou assunto inválido) pode devolver 401/403 e apagar inscrições em massa.**

**Cliente:**
- Ao sair da conta, `AppNavigation.logout` chama `disablePush()` antes de `signOut()` (a RPC
  precisa de `auth.uid()`), com limite de 1,5 s e sem nunca bloquear ou falhar o logout.
- **Resincronização:** `pushState()` só olha o navegador, então a UI poderia mostrar "ligado"
  após o servidor apagar a inscrição. Quando `pushState()` resolve `'on'`, `SquadBell` e
  `SquadFinder` chamam `resyncPush(lang)` uma vez por montagem/conta, sem bloquear a UI nem
  exibir erro: ela reenvia a inscrição existente a `xensi_push_subscribe` (upsert idempotente),
  ignora `lfg_ineligible`/`lfg_auth`, não pede permissão e não cria inscrição nova — exceto
  quando a inscrição local usa outra chave VAPID que a `VITE_VAPID_PUBLIC_KEY` atual: nesse
  caso cancela a antiga (inclusive no servidor) e cria outra com a chave atual.
  Chamadas simultâneas compartilham uma execução. Como o upsert é por `endpoint`, se outra conta
  entra no mesmo navegador sem logout, a inscrição **é transferida automaticamente** para ela
  (a conta anterior deixa de receber push ali).

**Configuração do push:**
- [x] Migrations aplicadas e `pg_net` instalado.
- [x] `function_url` e `shared_secret` inseridos em `lfg_private.push_config`.
- [x] Função `squad-push` implantada (v1, desatualizada).
- [ ] Reimplantar com o código atual: `supabase functions deploy squad-push --no-verify-jwt` (manual).
- [ ] Gerar chaves VAPID (`npx web-push generate-vapid-keys`), definir `VITE_VAPID_PUBLIC_KEY` no
      GitHub Actions e `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:… PUSH_SHARED_SECRET=…`
      (a existência desses secrets e do `PUSH_SHARED_SECRET` igual ao `shared_secret` do banco: **não verificado**).

**Nomes das migrations:** os arquivos locais de 2026-10-12/13 foram renomeados para as versões
registradas no hospedado: `…165854_web_push`, `…170010_push_service_rpcs`, `…173142_clear_notifications`,
`…180025_games_and_slots`, `…181153_saved_discord` e `20261013235902_push_endpoint_allowlist`.
A ordem relativa não mudou e nenhuma migration depende de outra que passou a vir depois.

## Idade, privacidade e revisão jurídica (pendente)

O acesso **não depende** de verificação de idade. O adaptador `public.xensi_lfg_record_age`
e a tabela `age_assurances` continuam existindo (somente `service_role`; provedores de uma
lista configurável, validade máxima de um ano), mas não são consultados para elegibilidade e
não constituem um verificador de idade implementado ou certificado. O filtro de idade da UI e
o selo 18+ foram removidos. Nada de data de nascimento ou documento é coletado.

Questões que dependem de revisão jurídica e **não foram resolvidas**: aplicabilidade do ECA
Digital a um módulo social que troca identificadores externos de contato; bases legais da LGPD
(distintas do aviso de compartilhamento na interface); política de aferição de idade, caso
exigida; aviso de privacidade; direitos do titular; contratos com operadores e transferências
internacionais (inclusive serviços de push de terceiros); retenção de moderação; resposta a
incidentes.

Fontes oficiais citadas anteriormente:
- [ECA Digital e programa da ANPD](https://www.gov.br/anpd/pt-br/assuntos/eca-digital/)
- [Orientações preliminares da ANPD sobre aferição de idade](https://www.gov.br/anpd/pt-br/assuntos/eca-digital/mecanismos-confiaveis-de-afericao-de-idade-orientacoes-preliminares.pdf)
- [MJSP/ANPD sobre aferição confiável e minimização](https://www.gov.br/mj/pt-br/assuntos/noticias-1/regulamentacoes-do-eca-digital-e-do-marco-civil-sao-debatidas-em-webinar-com-mjsp-e-anpd)
- [LGPD, Lei 13.709](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

## Testes

Comandos: `npm run lint`, `npm run build`, `npm test`, `npm run test:squad:db`,
`npm run test:squad:security`, `npm run test:squad:slots`, `npm run test:squad:homologation`
e `npx playwright test --config playwright.squad.config.ts`.

- `test:squad:db` e `test:squad:slots` usam PGlite (um engine PostgreSQL real, uma conexão),
  com papéis/privilégios/RLS reais. O de vagas cobre jogos, vagas, Discord salvo e a
  allowlist de push (aceitos por serviço, casos de borda, IP, porta, `http://`, unsubscribe só
  do dono, `targets/drop` sem acesso de clientes). `pg_net` não existe no PGlite: o runner troca
  só a linha `create extension … pg_net`.
- `test:squad:security` usa PostgreSQL nativo (`embedded-postgres`) com várias conexões
  independentes para corridas de aceitação/cancelamento/confirmação. **Ele aplica apenas as
  duas primeiras migrations (modelo antigo de vaga única); a concorrência do modelo de vagas
  múltiplas não é exercitada em várias conexões.**
- Testes de navegador usam fixtures interceptadas; não certificam um backend implantado.
- `squad-validation.md` guarda resultados de execuções anteriores (não reconferido aqui).
- Service worker e função de borda não têm teste automatizado; validação só manual.

## Pendências para release

- [ ] Sem staging: tudo foi aplicado em produção. Decidir se cria um ambiente de staging antes de novas migrations.
- [ ] Teste de concorrência com várias conexões sobre o modelo de vagas (aceitar última vaga,
      confirmar × liberar, expirar × confirmar).
- [ ] Advisors de 13/10 só mostram avisos esperados; reexecutar após cada nova migration. Ativar **Leaked password protection** no painel de Auth e confirmar a intenção de `is_nickname_available` executável por `anon`.
- [ ] Rate limit de perímetro (tentativas anônimas e falhas HTTP).
- [ ] Definir moderadores e capacidade operacional.
- [ ] Definir retenção de denúncias e ações de moderação.
- [ ] Revisão jurídica (seção acima) e aviso de privacidade aprovado.
- [ ] Validar auth/RLS/cache HTTP no ambiente implantado.
- [ ] Confirmar o job `pg_cron` ativo no ambiente final.
- [ ] Setup do push restante: chaves VAPID, `VITE_VAPID_PUBLIC_KEY` no build, secrets da função e
      reimplantação de `squad-push` com o código atual (migrations, `push_config` e `pg_net` já estão feitos).
- [ ] Teste manual do push em staging: permissão → host aprova → notificação com a aba
      fechada → clique → rota correta; repetir com duas notificações seguidas; logout remove a
      inscrição; reinscrição após remoção no servidor.
- [ ] Verificar que erro de VAPID não apaga inscrições em massa (monitorar logs de `squad-push`).

Recursos adiados: chat, voz, OAuth/bot do Discord, convites automáticos, matchmaking por IA,
reputação, grupos permanentes, feed/comentários, upload e recomendação comportamental.

## Changelog

- 2026-10-11: V1 com vaga única, gate de idade e registro de jogos validado; endurecimento de
  segurança; modo de teste controlado; remoção do gate de idade; acesso para contas registradas;
  limpeza agendada via `pg_cron`.
- 2026-10-12: Web Push; limpeza de notificações; 17 jogos com plataformas livres, modo/rank em
  texto livre e regiões SA/NA/EU/AS/OC; salas de 1 a 4 vagas; Discord salvo.
- 2026-10-13: estado de implantação verificado no hospedado; migrations locais renomeadas para as versões hospedadas; allowlist aplicada em produção; `squad-push` v1 implantada, reimplantação pendente.
- 2026-10-12/13: allowlist de endpoint de push, limpeza da inscrição no logout, resincronização
  da inscrição, `event_id`/`renotify` nas notificações, comparação do segredo em tempo constante.

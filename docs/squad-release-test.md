# Publicação de teste do Squad Finder V1.0

> Registro histórico de preparação. A autorização posterior, o backup validado,
> as cinco migrations aplicadas e a liberação para contas registradas estão em
> [squad-live-deployment.md](squad-live-deployment.md). As pendências/flags de
> homologação descritas abaixo representam o estado anterior à implantação.

Preparação em 11/10/2026. Nenhuma migration hospedada ou alteração de flags
foi executada. O responsável autorizou commit e push do módulo, mantendo conta
registrada e login obrigatórios. Isso não autoriza migrations pendentes.

## Estado do repositório e deploy

- Checkout: `main`, HEAD `9a0855ddc648835abbfe8bc37ead1c31028bc9db`.
- Remote local: `https://github.com/kekelxd/Sensi.git`; o GitHub redireciona
  para o nome atual `kekelxd/Xensi`.
- Destino principal confirmado pelo responsável: VPS que consome
  `https://github.com/kekelxd/Xensi.git`, atendendo `https://xensi.app` pela
  Cloudflare. A automação/script interno da VPS ainda não foi inspecionado.
- **Base correta para a VPS: `/`**, já o padrão de `vite.config.ts` quando
  `VITE_BASE_PATH` não está definido. O build local final foi gerado nessa base.
- GitHub Pages é um destino secundário: `.github/workflows/deploy-pages.yml`,
  acionado por push em `main` ou `workflow_dispatch`, publica em
  https://kekelxd.github.io/Xensi/ (sem domínio customizado nesse serviço).
- Vercel também tem integração Git/produção ativa no projeto `sensi`, mas
  `xensi.app` não consta nos domínios desse projeto. Não é o destino principal.
- Último deploy desse HEAD: sucesso, run `38106450165`.
- Última suíte geral Playwright no GitHub: falha, run `38106450147`.
  Essa falha antecede esta preparação e não representa os testes locais do Squad.
- `xensi.app` serve assets em `/assets/`, como esperado para a raiz.
  O ajuste de `/Xensi/` fica exclusivo ao job secundário do Pages, usando o
  `base_path` de Configure Pages. DNS, VPS, Cloudflare e Vercel não foram alterados.

## Validação local desta entrega

| Verificação | Resultado |
|---|---|
| Build TypeScript/Vite | Aprovado em `/` para xensi.app; `/Xensi/` validado anteriormente para Pages |
| Unitários | 38 arquivos, 309 testes aprovados |
| SQL/PGlite, ambas as migrations | 31 verificações aprovadas |
| PostgreSQL nativo, conexões independentes | 18 verificações aprovadas |
| Playwright Squad, desktop e mobile | 20 testes aprovados |
| Regressão de navegação/design, desktop | 9 testes aprovados |
| Lint | Aprovado |
| `git diff --check` | Aprovado |
| Homologação com as quatro migrations, sem gate etário | 9 verificações SQL focadas aprovadas, incluindo negação de visitante sem login |

Nesta conclusão foram reexecutados build raiz, unitários, lint e o teste focado
de homologação. As 18 verificações de segurança e testes de navegador acima
são da preparação anterior; a auditoria completa não foi repetida.

Permanecem avisos de chunks acima de 500 kB. Os testes de navegador usam
fixtures interceptadas; os testes SQL usam bancos temporários locais e
identidades sintéticas. Não comprovam autenticação HTTP nem funcionamento
integrado no Supabase hospedado. A suíte geral de navegador não foi reexecutada
inteira nesta preparação.

## Banco e migrations pendentes

Projeto confirmado pelo conector: `xensi`, ref `zbdznwubrrkxuraispvr`,
PostgreSQL 17, estado `ACTIVE_HEALTHY`, organização no plano Free.
Não existem `lfg_private` nem `public.lfg_rooms` nesse projeto.
O histórico remoto tem nove migrations, terminando em `spatial_hunt_v1`.

Aplicar estes dois arquivos originais, nesta ordem, após backup e confirmação:

1. `supabase/migrations/20261011163626_squad_finder_v1.sql`: cria sete
   tabelas públicas de salas, solicitações, contatos privados, denúncias,
   bloqueios e ações de moderação; schema privado para configuração,
   aferição etária, moderadores, restrições, registro de jogos, eventos e
   auditoria; RLS, constraints, índices e RPCs com autorização no servidor.
2. `supabase/migrations/20261011173736_squad_finder_security_hardening.sql`:
   valida sessão vigente, cria contador privado de tentativas, acrescenta
   resultado das decisões de moderação, revalida autorização depois de locks,
   preserva tentativas inválidas no rate limit, protege contatos expirados e
   exclui tabelas sociais das publicações Realtime.

Para o acesso de homologação solicitado, aplicar em seguida a migration
complementar `20261011180903_squad_finder_controlled_testing.sql`, criada com
Supabase CLI e validada localmente junto das duas originais. Ela acrescenta
uma tabela privada de autorização e três campos de configuração, substitui
a decisão de elegibilidade e ajusta somente os gates do dispatcher existente.
Não habilita flags nem insere usuários. Essa terceira migration também exige
aprovação explícita; aplicar apenas as duas originais manteria o módulo fechado
inclusive para testadores. Não foi criada funcionalidade adicional de produto.

Decisão posterior do responsável: retirar agora a exigência etária e abordar
idade verificada em outra etapa. Aplicar por último
`20261011182551_squad_finder_remove_age_gate.sql`: remove `age_assurances` da
decisão de elegibilidade e `age_verified` da resposta de acesso. Os registros
e o adapter anteriores permanecem armazenados, sem serem usados como gate.
Não altera flags, aprovações nem dados existentes. Nenhuma conta é marcada
como adulta/verificada por essa mudança. O frontend remove as mensagens etárias
e o selo 18+. Essa quarta migration também está somente preparada localmente.

Ambas foram preservadas integralmente. SHA256:

```text
20261011163626: 03ECB041E4A50BB21E02EB469EF569116C9515A12428D8A9F952B5497B0DD4D8
20261011173736: E9FE1AB9C2B979A55A2FC5081D4AC7693C0084343352D0094393537DD70F1C6C
```

Não há DROP/TRUNCATE de tabelas nem remoção imediata de dados antigos nessas
duas migrations. Elas definem rotinas de expiração/limpeza de contatos sociais
e retenção de eventos/auditoria/tentativas; a segunda pode remover associações
de tabelas sociais ao Realtime. A publicação atual `supabase_realtime` é
explícita (`puballtables=false`), compatível com a migration de hardening.

Há divergências históricas de timestamp que impedem tratar todo arquivo local
como pendente: `create_user_profiles` está localmente em `20260927000850`,
mas remotamente em `20260927031613`; `enforce_unique_nicknames` está localmente
em `20260928005347`, mas remotamente em `20260928040140`. Não executar um
`db push` indiscriminado, reaplicar esses arquivos ou reparar o histórico sem
comparar o SQL já aplicado. O deploy GitHub Pages não aplica migrations.

`pg_cron` está disponível, mas não instalado. Portanto a primeira migration
não criará o job automático nesse estado. Antes de testes sociais ativos,
preparar e confirmar separadamente a instalação/agendamento, ou um worker
confiável. O acesso a contatos já verifica os prazos em cada operação.

## Backup e confirmação

Backup recuperável: **inexistente segundo o responsável e não verificado**.
O plugin confirmou o projeto e o schema, mas não dispõe de ferramenta de
exportação ou listagem de backups. A tentativa de consulta pela CLI
`supabase backups list --project-ref zbdznwubrrkxuraispvr` não pôde autenticar:
a sessão do plugin não fornece credenciais à CLI. Nenhum backup foi gerado.

Verificar no [painel de backups](https://supabase.com/dashboard/project/zbdznwubrrkxuraispvr/database/backups/scheduled)
ou obter uma exportação privada e recente. Registrar data/hora, método,
local seguro e evidência de restauração em banco separado; não guardar dados
de usuários ou credenciais no Git. O plano Free não deve ser tratado como
garantia de backup diário acessível: conferir a
[documentação de backups](https://supabase.com/docs/guides/platform/backups).

Procedimento antes de qualquer migration:

1. Autenticar a CLI Supabase no próprio ambiente, sem colar tokens/senhas no
   chat. Usar a conexão do projeto pelo painel Connect, preservando a senha
   existente; não resetar credenciais da aplicação para fazer backup.
2. Com Docker/CLI configurados, exportar roles, schema e dados para um diretório
   privado fora do repositório. A CLI atual aceita `--project-ref`:

   ```sh
   supabase db dump --project-ref zbdznwubrrkxuraispvr --role-only --file /CAMINHO_PRIVADO/roles.sql
   supabase db dump --project-ref zbdznwubrrkxuraispvr --file /CAMINHO_PRIVADO/schema.sql
   supabase db dump --project-ref zbdznwubrrkxuraispvr --data-only --use-copy --file /CAMINHO_PRIVADO/data.sql
   ```

3. Verificar saída sem erros, tamanho não vazio, hashes SHA256, data/hora e
   cobertura de `auth.users`, perfis, presets, rotinas, sessões e PBs. Exportar
   separadamente objetos de Storage, se houver; dump de banco não inclui arquivos.
4. Restaurar em uma instância Supabase separada e compatível, nunca no banco
   atual. Comparar contagens e constraints, conferir funções/RLS e executar
   smoke tests dos dados existentes. Registrar evidência da recuperação.
   Seguir o [procedimento oficial de backup/restauração](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
5. Só depois apresentar o resultado e solicitar autorização para as quatro
   migrations e, separadamente, para a ativação dos testadores elegíveis.

Depois dessa verificação, solicitar confirmação explícita para aplicar os
arquivos acima ao ref informado, inicialmente mantendo todos os gates desligados.
Não restaurar, resetar ou excluir dados como parte desta publicação.

## Restrição de acesso

Manter `enabled=false`, `creation_enabled=false`, `legal_reviewed=false`,
`moderation_ready=false` e `age_providers={}`. As migrations não os habilitam.
Não registrar evidência etária fictícia, não usar fixtures no banco hospedado
e não preencher flags jurídicas/moderação apenas para liberar testes.

A migration complementar prepara `lfg_private.test_accounts`, com RLS,
sem leitura/escrita direta para clientes e sem escrita de service_role.
Autorização administrativa tem responsável, referência, validade de até 30 dias
e revogação. Não usa metadata editável pelo usuário.

O responsável autorizou os usuários já cadastrados como candidatos: há
7 contas, 6 com e-mail confirmado. O corte fixo de cadastro é
`2026-10-11 18:09:03 UTC` (15:09:03 de Brasília); novos cadastros não entram.
Nenhum UUID/e-mail foi incluído no Git nem nenhuma conta foi ativada.

Para uma conta usar o módulo, são necessários **ao mesmo tempo**:
autorização privada vigente, e-mail confirmado, sessão válida, ausência de
suspensão e modo de homologação habilitado. Conforme a decisão atual, não há
exigência de aferição etária. A conta autorizada não é apresentada como adulta
ou verificada; a idade será tratada posteriormente.

Após nomear um moderador de homologação elegível,
autorizar administrativamente apenas os candidatos aprovados e então ativar
`test_enabled=true` e `test_creation_enabled=true`. Os quatro gates públicos
continuam false. Em modo de teste, a allowlist prevalece mesmo se flags públicas
forem alteradas por engano. O painel de moderação pode pausar apenas a criação
de teste, preservando a flag pública. Revogação/expiração são conferidas pelo
backend em cada operação; contatos de participantes inelegíveis deixam de ser
disponíveis. Desativar `test_enabled` fecha o piloto enquanto gates públicos
permanecerem false. Não emitir evidência fictícia nem aplicar fixtures hospedadas.

## Arquivos e escopo

Alterações existentes preservadas: `package.json`, `package-lock.json`,
`playwright.config.ts`, `scripts/prepare-pages-routes.mjs`, `src/App.tsx`,
`src/AppNavigation.tsx`, `src/authService.ts`, `src/routes.ts`.

Novos arquivos existentes do módulo a incluir na revisão: `src/squad/`
(inclusive teste do registro), `src/authService.test.ts`,
`playwright.squad.config.ts`, `tests/squad-finder.spec.ts`,
`scripts/test-squad-db.mjs`, `scripts/test-squad-security.mjs`,
`scripts/fixtures/squad-local.sql`, as duas migrations e os quatro documentos
`docs/squad-*` anteriores.

Esta preparação ajustou `.github/workflows/deploy-pages.yml`,
`.github/workflows/playwright.yml`, `vite.config.ts`, `src/routes.ts`,
`src/authService.ts`, `src/squad/SquadFinder.tsx` e
`scripts/prepare-pages-routes.mjs`. Acrescentou `src/vite-env.d.ts`,
`src/pagesBasePath.test.ts` e este roteiro.

A conclusão acrescentou as duas migrations complementares e
`scripts/test-squad-homologation.mjs`, com script npm dedicado e execução no
job secundário do Pages. Não modificou as duas migrations originais.

Existem diretórios locais não rastreados de skills/ferramentas, `.playwright-cli/`
e `supabase/.temp/`. Não incluí-los automaticamente no commit; usar staging
explícito de arquivos do módulo e desta preparação. Não executar `git add .`.

## Sequência de publicação

1. Criar/verificar backup pelo procedimento acima e obter confirmação para
   as duas migrations originais e as duas complementares. Aplicá-las
   sequencialmente, com registro no histórico e sem ativar o módulo.
2. Conferir histórico, flags, RLS/grants/RPCs e executar os advisors Supabase.
   Testar negação anônima, conta comum sem aferição e sessão revogada via HTTP.
3. Configuração realizada e conferida nos nomes de variables do repositório:
   `VITE_SUPABASE_URL=https://zbdznwubrrkxuraispvr.supabase.co` e
   `VITE_SUPABASE_PUBLISHABLE_KEY` com chave publishable ativa desse projeto.
   Foi usada a chave publishable ativa `default` obtida pelo conector Supabase,
   sem `service_role`/secret key. Repository variables foram criadas sem
   acionar o deploy; as listas de secrets/variables do environment
   `github-pages` estavam vazias. A chave é pública por definição e será
   incorporada ao bundle; sua autorização depende do banco/RLS.
   **Essas variables do GitHub não configuram a VPS.** Conferir as duas
   variáveis no ambiente real de build da VPS, sem sobrescrever sua configuração.
   Para xensi.app, remover eventual `VITE_BASE_PATH=/Xensi/` desse ambiente ou
   defini-lo como `/`. O Vercel consultado não tem envs de produção; isso não
   informa o estado da VPS, que ainda precisa ser inspecionado.
4. Confirmar no Supabase Auth as URLs permitidas de callback/reset para
   `https://xensi.app/auth/callback` e
   `https://xensi.app/reset-password`, preservando URLs existentes.
5. Revisar o diff e incluir somente os arquivos listados. O workflow Pages
   agora exige configuração pública do Supabase e executa unitários/SQL antes
   do build. O workflow Playwright também executa a suíte dedicada do Squad.
   Os workflows são independentes: o sucesso do deploy não garante sucesso
   da suíte geral Playwright.
6. Revisar o diff e obter autorização explícita para push. Usar o fluxo atual
   da VPS, sem substituí-lo por Pages/Vercel. Na VPS, executar os testes focados
   antes do build e servir `dist` na raiz. Validar xensi.app, assets, recarga de
   `/squad/*`, callback/reset, login/logout/troca de conta e gates.
7. Com autorização específica de ativação,
   cadastrar a allowlist privada, nomear moderador elegível e habilitar
   somente flags de teste. Homologar criação, solicitação, aprovação, contato,
   confirmação, bloqueio e revogação entre contas autorizadas. Confirmar negação
   de conta externa e novo cadastro. A verificação etária não é requisito nesta
   etapa; sua implementação futura exige nova decisão e validação.

Se algo falhar após publicação, manter os gates fechados e corrigir o frontend
em novo commit. Não desfazer migrations com DROP nem restaurar o banco sem
planejamento e autorização específica.

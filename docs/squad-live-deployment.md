# Squad Finder: implantação de 11/10/2026

O responsável autorizou criar backup e alterar o banco de produção. Foram
aplicadas cinco migrations no projeto Supabase `xensi`
(`zbdznwubrrkxuraispvr`), com seus timestamps originais:

1. `20261011163626_squad_finder_v1.sql`
2. `20261011173736_squad_finder_security_hardening.sql`
3. `20261011180903_squad_finder_controlled_testing.sql`
4. `20261011182551_squad_finder_remove_age_gate.sql`
5. `20261011184403_squad_finder_registered_access.sql`

As duas migrations originais foram preservadas. A quinta atende à decisão
posterior de liberar o módulo para contas cadastradas: habilita acesso e
criação, desativa o modo de homologação e retira a dependência de flags de
aprovação jurídica/moderação. Essas flags continuam falsas; nenhuma aprovação
ou comprovação etária foi fabricada. A lista de homologação permanece disponível,
mas não é requisito no modo publicado.

## Backup e validação

Backup privado, fora do Git, em
`%LOCALAPPDATA%\Xensi\backups\20261011-before-squad`:

- `database.dump`: archive PostgreSQL completo, 447.929 bytes, snapshot consistente.
- `roles.sql`: roles e permissões; senhas de roles não exportadas.
- `manifest.json`: hash SHA256, contagens/digests das tabelas e prova de restauração.
- `archive-list.txt`: inventário dos objetos exportados.
- `deployment-report.json`: verificação posterior das migrations e dados atuais.

SHA256 do archive:
`1335f002fdc313bf9bcbae3f385454cded9a0655b580c7b50734d5f0a9ce740e`.

Restauração realizada em PostgreSQL 17.6 local isolado: conteúdo de 45 tabelas
conferido por contagem e digest, incluindo Auth, seis tabelas atuais da aplicação,
Storage, Realtime e histórico de migrations. A extensão gerenciada `supabase_vault`
não está disponível para o PostgreSQL local Windows; foi excluída somente do
ensaio local. Sua tabela `vault.secrets` está vazia e o archive original contém
seus objetos/dados. Os grantors de memberships gerenciados foram adaptados
somente em `local-roles.sql` para o administrador local; `roles.sql` é original.
As cinco migrations passaram também sobre essa cópia recuperada.

Uma recuperação em outro Supabase exige as extensões/plataforma correspondentes,
adaptação das roles já existentes e reconfiguração de Auth/API/SMTP. O dump não
inclui configurações externas ao PostgreSQL. O Storage não tinha arquivos.
Não restaurar diretamente na produção nem executar `--clean`/DROP.

As ferramentas/roteiros usados estão em `%LOCALAPPDATA%\Xensi\postgres-tools`.
Por decisão do responsável, uma segunda cópia privada foi criada em
`%USERPROFILE%\Documents\Xensi Backups\20261011-before-squad`, com o mesmo
SHA256 do archive original. As duas cópias ficam no mesmo computador.

## Acesso publicado no banco

- Conta cadastrada, não anônima, e-mail confirmado e sessão vigente obrigatórios.
- Nenhuma aferição etária é exigida nesta versão.
- Suspensões, restrições de publicação, RLS, rate limits e autorização de contatos
  permanecem ativos no backend.
- Visitantes sem login não têm EXECUTE na RPC; sessão ausente retorna `lfg_auth`.
- `enabled=true`, `creation_enabled=true`, `test_enabled=false`.
- Seis das sete contas atuais atendem à elegibilidade; login continua necessário.
- Os conteúdos das seis tabelas anteriores do XENSI foram conferidos contra o
  backup e permaneceram idênticos. Contas/perfis continuam em sete.
- Teste focado de homologação/liberação: 12 verificações aprovadas.

Para pausar o módulo sem remover dados, desativar `lfg_private.settings.enabled`.
Para pausar apenas novas salas, desativar `creation_enabled`.

## Frontend e operação

O destino principal continua sendo a VPS de `xensi.app`, com Vite base `/`.
GitHub Pages é secundário, com `/Xensi/`; o deploy do commit `2457bce` no Pages
terminou com sucesso. Nenhuma infraestrutura foi substituída.

O ambiente de build da VPS precisa de `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`. Variables no GitHub não configuram a VPS.
Foi confirmada a versão atual servida em `https://xensi.app/squad`: bundle
`index-BU1Grk6o.js`, módulo `SquadFinder-BPycHWFp.js` com HTTP 200, configuração
do projeto Supabase presente e sem `age_verified`. Os hashes correspondem ao
build local em base `/`. O frontend já está disponível no domínio principal.

Build raiz e lint foram aprovados após a configuração local do Supabase.
O preview em localhost usa `.env.local` ignorado pelo Git, apenas com URL e chave
publishable pública. Nenhuma credencial administrativa foi incorporada ao frontend.
A chamada HTTP anônima à RPC hospedada retornou 401/42501, como esperado.

Os advisors foram consultados após o DDL: os avisos informativos de RLS sem
policies nas tabelas internas/contatos são intencionais, pois acesso direto é
negado e as operações passam pelas RPCs. Não se adicionaram policies amplas
para ocultar esse aviso. Veja a [descrição do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Os avisos relativos à RPC de disponibilidade de nickname e à proteção de senhas
do Auth foram preservados fora do escopo desta implantação:
[RPC anônima](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[RPC autenticada](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e
[proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

A expiração é verificada nas RPCs. Posteriormente, com autorização do responsável,
foi aplicada `20261011185312_squad_finder_scheduled_cleanup.sql`: instala `pg_cron`
e agenda `xensi-lfg-expiry` a cada minuto, executando a rotina existente
`lfg_private.sweep()`. Mantém as regras de expiração/retenção já implementadas,
com `lock_timeout=2s` e `statement_timeout=30s`, sem modificar outros jobs.
Uma execução automática foi confirmada com status `succeeded` em 11/10/2026,
às 15:56, horário de Brasília (18:56 UTC), duração aproximada de 10 ms.

A conta do responsável foi identificada, conferida como confirmada/não suspensa
e adicionada à lista privada de moderadores por operação administrativa.
Nenhum e-mail/UUID pessoal foi incluído em migrations ou no repositório.

O roteiro de teste entre duas contas está em
[squad-functional-test.md](squad-functional-test.md). Esse fluxo depende dos
logins efetuados pelo responsável, sem redefinir senhas ou criar contas
automaticamente. A operação contínua da moderação e eventual aferição etária
continuam como etapas posteriores.

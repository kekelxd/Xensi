# Verificação do Squad Finder — 11/10/2026

Atualização da decisão de acesso: a quarta migration complementar remove o
gate etário; a UI não exibe selo 18+ nem bloqueio por idade. O teste focado de
homologação aplica as quatro migrations e verifica criação/solicitação/contato
sem registros etários, preservando autorização, e-mail, expiração e suspensão.
As verificações etárias abaixo são o histórico das migrations originais.

Implementação local; nenhuma alteração aplicada ao banco hospedado, nenhum deploy.

| Verificação executada | Resultado |
|---|---|
| `npm test` | 36 arquivos, 302 testes aprovados |
| `npm run test:squad:db` | Migração aplicada em PostgreSQL/PGlite; 31 verificações aprovadas |
| `npx playwright test --config playwright.squad.config.ts --workers 4` | 20 testes aprovados: desktop e celular |
| `npx playwright test tests/navigation.spec.ts tests/universal-design.spec.ts --project desktop --workers 2` | 9 testes de regressão aprovados |
| `npm run build` | Typecheck e build aprovados; rotas estáticas geradas |
| `npm run lint` | Aprovado; após ajuste final, sem avisos |
| Auditoria UI estrita de `src/squad` | Zero achados; configuração e JSON neste diretório |
| `git diff --check` | Aprovado |

Banco: autenticação, e-mail e maioridade, gravação de evidência negada ao cliente,
troca de identidade, validação de jogo/plataforma/rank/Discord, segunda sala,
solicitação duplicada/sem consentimento, privilégios de tabelas e RLS,
Discord privado, aprovação exclusiva, reserva, confirmação, recusa,
desistência, expiração, bloqueio, denúncias, suspensão/restauração,
controle emergencial e limites de frequência foram executados na migração real.

Navegador: gate guest/etário, criação, consentimento, privacidade do contato,
aprovação e fechamento, falha/retry, moderação, denúncia, cancelamento de bloqueio,
filtros em URL, logout/troca de conta, foco/Escape, inglês, movimento reduzido e
layout móvel. As chamadas Supabase do navegador usam fixtures interceptadas;
a autorização de banco foi testada separadamente com SQL e roles reais.

Capturas inspecionadas: `test-results/squad-list-desktop.png` e
`test-results/squad-request-mobile.png`. Confirmam o reaproveitamento da logo,
navbar, ambiente e tokens, com diálogo legível no celular.

Limites da evidência: PGlite tem uma conexão serializada; a exclusividade de
aprovações rápidas e constraints passou, mas a contenção simultânea com múltiplas
conexões precisa ser verificada em staging Supabase. Não foram executados
advisors de um projeto hospedado, webhook real de idade ou job pg_cron real.
O build mantém os avisos existentes de chunks acima de 500 kB.

A auditoria inicial do repositório inteiro também apontou pendências antigas
em formulários/selects/scrollbars de outros módulos. Elas não foram modificadas
neste trabalho; o relatório final é explicitamente restrito ao Squad Finder.

As flags do módulo, de revisão jurídica e de capacidade de moderação permanecem
desligadas. A allowlist de provedores etários permanece vazia. Consulte
`squad-finder.md` para arquitetura, fontes oficiais e requisitos de liberação.

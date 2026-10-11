# Homologação funcional entre duas contas

Usar o domínio publicado `https://xensi.app/squad`. Duas contas existentes,
com e-mail confirmado, fazem login pelo fluxo normal. Nenhuma senha ou token
precisa ser enviado ao assistente. Usar contatos fictícios exclusivos do teste.

| Etapa | Ação | Resultado esperado |
|---|---|---|
| Visitante | Abrir Squad sem login | Solicitação de login; nenhuma sala/contato exposto |
| Conta A | Entrar e criar sala, contato `xensi.test.host` | Sala aparece na lista e em Minha Sala |
| Conta B | Entrar, localizar sala A e solicitar vaga, contato `xensi.test.guest` | Pedido pendente; contato do anfitrião ainda indisponível |
| Conta A | Abrir Minha Sala e aprovar a solicitação B | Sala fica reservada; contato de B disponível ao anfitrião |
| Conta B | Abrir Minhas Solicitações e consultar aprovação | Contato fictício de A disponível durante a reserva |
| Conta A | Confirmar entrada pelo controle existente | Sala finalizada; contato deixa de ser acessível |
| Ambas | Sair da conta, recarregar a rota e trocar de conta | Dados anteriores não permanecem visíveis; sessão correta exigida |

Se só houver um navegador/sessão disponível, alternar A/B com logout e login
entre as etapas. Não abrir duas abas esperando contas diferentes: elas podem
compartilhar a sessão. A comparação com o banco é feita por IDs da sala/pedido,
estados e registros técnicos, sem divulgar contatos ou credenciais.

O teste grava dados fictícios reais no banco publicado; finalizar a sala pelos
controles do produto. Não eliminar registros diretamente nem mudar contas/perfis.
Registrar o resultado efetivamente observado de cada etapa, incluindo falhas.

## Estado desta preparação

- Conta A identificada pelo responsável; conta B ainda precisa ser identificada.
- Login da conta A solicitado no navegador, aguardando conclusão pelo responsável.
- Conta do responsável habilitada para moderação no backend.
- Nenhuma sala/pedido de homologação foi criado automaticamente.
- Fluxo completo entre duas contas ainda não executado.

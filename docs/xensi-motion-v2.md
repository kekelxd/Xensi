# XENSI — Premium Motion Experience V2

Entrega de UX implementada sobre a base V1, preservando identidade, fotografia,
textos, presets, rotinas e previews. O briefing fornecido termina no item 16,
“Spatial Hunt durante”; nenhuma exigência posterior foi presumida.

## Experiência implementada

- Hero em sequência: atmosfera 900ms; título técnico em duas linhas com máscara;
  descrição; CTAs com intervalo de 80ms. Botões continuam disponíveis durante a entrada.
- Home: luz radial e borda reativas apenas no hero e nos dois caminhos. Coral no
  treino e tom frio discreto no diagnóstico. Foco por teclado mantém feedback equivalente.
- Seções entram uma vez por montagem da Home em 560ms, com stagger curto entre
  cards. Scroll continua nativo; barras permanecem invisíveis por orientação do usuário.
- CTAs: highlight direcional, escala de pressão e deslocamento pequeno dos ícones.
  A área de clique fica estável; tilt e magnetismo do botão inteiro foram dispensados
  para preservar leitura e precisão.
- Navbar: indicador compartilhado de posição; dropdowns reaproveitam a superfície V1.
- Páginas de apresentação: saída de 140ms e entrada de 300ms só no conteúdo,
  preservando navbar e footer. History API atualiza imediatamente e a última
  navegação prevalece. Fallback Motion funciona sem View Transition API.
- Catálogo: previews continuam montados conforme a interação existente; título,
  descrição e “Configurar treino” ficam legíveis sobre o preview.
- PB, resultado de aquecimento, relatório de calibração e resumo de análise:
  transição entre snapshots formatados reais; sem contagem por números fictícios.
  O valor acessível final está disponível imediatamente.
- Ajuste responsivo da Home: regras antigas de desktop cortavam texto e CTA no
  mobile. Grid e ações agora se adaptam mantendo a composição fotográfica.

As quatro assinaturas reutilizáveis são reveal técnico, luz radial/borda, highlight
direcional e indicador compartilhado. Tokens canônicos ficam em `src/design/motion.ts`.
HomeMotion, useHomeLighting e premium-motion.css são carregados com a Home lazy.
Motion for React é a única biblioteca de animação adicionada na fundação V1.

## Isolamento e acessibilidade

Home usa um listener delegado e um frame solicitado por movimento, limitado a
cerca de 30 atualizações/s. Bounds são lidos ao entrar na superfície e invalidados
em scroll/resize. Não há setState por movimento nem loop permanente de JavaScript.
A única atmosfera contínua é um transform CSS de 18s, pausado quando o hero sai
da viewport ou o documento fica oculto. Cleanup remove listeners e observer.

Não se aplica transição de página entre rotas de treino/calibração e ferramentas
de input em tempo real; Pointer Lock e sessão ativa também bloqueiam essa camada.
Nenhuma arena, timer ou cálculo de resultado foi alterado. Não ficam dois conteúdos
React montados para sustentar a saída de uma página.

Reduced motion remove drift, tracking luminoso, máscaras, entradas e deslocamentos
decorativos. As métricas usam uma troca curta de opacidade; dados e foco permanecem.
Não há smooth scroll, scroll hijack nem dependência do hover para acessar CTAs.

## Evidências de validação

| Verificação | Resultado |
|---|---|
| ESLint | passou, sem avisos |
| TypeScript + build de produção | passou |
| Unitários | 35 arquivos, 297 testes passaram |
| Home + Premium Motion | 44 passaram nas quatro resoluções/projetos |
| PB e fluxo de preset desktop | 5 passaram |
| Sessão completa Target Switch e saída por ESC | 2 passaram com Pointer Lock e IndexedDB |
| Inspeção visual | desktop 1440/1366 e mobile 393, Home/spotlight/preview |
| Inspeção runtime | pausa/retomada por visibilidade, preview DOM estável, sem pageerrors |
| DESIGN.md lint | 0 erros; mesmos 12 avisos anteriores |
| Auditoria UX estática strict | mesmos 11 achados anteriores; nenhum novo |

Os testes premium incluem navegação interrompida repetidamente, histórico,
reduced motion, fallback sem API nativa, bounds do título/texto/CTAs, filtros rápidos,
preview legível e isolamento da luz fora da Home. Foram corrigidos um adiamento
do histórico durante captura e a rejeição esperada de `ViewTransition.ready` ao
interromper a transição. O teste antigo de hover verificava uma duração literal
de 200ms; agora verifica o efeito perceptível e a ação acessível.

Auditoria global: 7 sinalizações de ownership de select (o contrato já documenta
native), 2 formulários sem declaração noValidate, 1 evidência literal de resize de
textarea e 1 regra de tema scrollbar. São achados da base; o último diverge da
orientação explícita de barras invisíveis. A auditoria global não está verde.
Os 5 problemas anteriores de E2E de auth/feedback/perfil registrados na V1
continuam como limitações da suíte global; esta entrega não declara a suíte inteira verde.

Não houve profiling de GPU, medição de FPS/input latency ou certificação WCAG.
Conta autenticada real e sincronização cloud não foram exercitadas nesta rodada.

## Bundle final

| Chunk | V1 gzip | V2 gzip |
|---|---:|---:|
| JavaScript principal | 328.26 kB | 328.40 kB |
| Home lazy JS | incluído no principal | 6.71 kB |
| CSS principal | 80.08 kB | 80.68 kB |
| Home lazy CSS | incluído no principal | 1.57 kB |
| Spatial Hunt JS | 137.72 kB | 137.72 kB |

Principal bruto: 1141.00 → 1139.11 kB. A Home foi separada, portanto a variação do
principal isolado não representa o custo total da Home. Sem nova dependência V2.
O aviso preexistente de chunks acima de 500 kB permanece. A fotografia existente
de 1711.51 kB foi preservada.

Referências técnicas: [Motion viewport](https://motion.dev/docs/react-motion-component)
e [ViewTransition](https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition).

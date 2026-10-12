---
name: plan-writing
description: Planejamento estruturado de tarefas com decomposições claras, dependências e critérios de verificação. Use ao implementar features, refatorar ou qualquer trabalho de múltiplas etapas.
when_to_use: "Ao criar planos de tarefas estruturados, decompor features em tarefas ou definir critérios de verificação. Use com o workflow /plan."
allowed-tools: Read, Glob, Grep
---

# Escrita de Planos

> Fonte: obra/superpowers

## Visão Geral
Esta skill fornece um framework para decompor o trabalho em tarefas claras e acionáveis com critérios de verificação.

## Princípios de Decomposição de Tarefas

### 1. Tarefas Pequenas e Focadas
- Cada tarefa deve levar de 2 a 5 minutos
- Um resultado claro por tarefa
- Verificável de forma independente

### 2. Verificação Clara
- Como você sabe que está concluída?
- O que você pode verificar/testar?
- Qual é a saída esperada?

### 3. Ordenação Lógica
- Dependências identificadas
- Trabalho em paralelo onde possível
- Caminho crítico destacado
- **Fase X: A Verificação é sempre a ÚLTIMA**

### 4. Nomeação Dinâmica na Raiz do Projeto
- Os arquivos de plano são salvos como `{task-slug}.md` na RAIZ DO PROJETO
- O nome é derivado da tarefa (ex: "add auth" → `auth-feature.md`)
- **NUNCA** dentro de `.claude/`, `docs/` ou pastas temporárias

## Princípios de Planejamento (NÃO São Templates!)

> 🔴 **SEM templates fixos. Cada plano é ÚNICO para a tarefa.**

### Princípio 1: Mantenha CURTO

| ❌ Errado | ✅ Certo |
|----------|----------|
| 50 tarefas com sub-sub-tarefas | Máximo de 5-10 tarefas claras |
| Cada micro-passo listado | Apenas itens acionáveis |
| Descrições verbosas | Uma linha por tarefa |

> **Regra:** Se o plano for maior que 1 página, está longo demais. Simplifique.

---

### Princípio 2: Seja ESPECÍFICO, Não Genérico

| ❌ Errado | ✅ Certo |
|----------|----------|
| "Configurar o projeto" | "Execute `npx create-next-app`" |
| "Adicionar autenticação" | "Instale next-auth, crie `/api/auth/[...nextauth].ts`" |
| "Estilizar a UI" | "Adicione classes Tailwind ao `Header.tsx`" |

> **Regra:** Cada tarefa deve ter um resultado claro e verificável.

---

### Princípio 3: Conteúdo Dinâmico com Base no Tipo de Projeto

**Para PROJETO NOVO:**
- Qual stack de tecnologia? (decida primeiro)
- Qual é o MVP? (features mínimas)
- Qual é a estrutura de arquivos?

**Para ADIÇÃO DE FEATURE:**
- Quais arquivos são afetados?
- Quais dependências são necessárias?
- Como verificar se funciona?

**Para CORREÇÃO DE BUG:**
- Qual é a causa raiz?
- Qual arquivo/linha alterar?
- Como testar a correção?

---

### Princípio 4: Scripts São Específicos do Projeto

> 🔴 **NÃO copie e cole comandos de script. Escolha com base no tipo de projeto.**

| Tipo de Projeto | Scripts Relevantes |
|--------------|------------------|
| Frontend/React | `ux_audit.py`, `accessibility_checker.py` |
| Backend/API | `api_validator.py`, `security_scan.py` |
| Mobile | `mobile_audit.py` |
| Banco de Dados | `schema_validator.py` |
| Full-stack | Mistura dos acima com base no que você tocou |

**Errado:** Adicionar todos os scripts a todo plano
**Certo:** Apenas os scripts relevantes para ESTA tarefa

---

### Princípio 5: A Verificação é Simples

| ❌ Errado | ✅ Certo |
|----------|----------|
| "Verifique se o componente funciona corretamente" | "Execute `npm run dev`, clique no botão, veja o toast" |
| "Teste a API" | "curl localhost:3000/api/users retorna 200" |
| "Verifique os estilos" | "Abra o navegador, verifique se o toggle de dark mode funciona" |

---

## Estrutura do Plano (Flexível, Não Fixa!)

```
# [Nome da Tarefa]

## Objetivo
Uma frase: O que estamos construindo/corrigindo?

## Tarefas
- [ ] Tarefa 1: [Ação específica] → Verificar: [Como checar]
- [ ] Tarefa 2: [Ação específica] → Verificar: [Como checar]
- [ ] Tarefa 3: [Ação específica] → Verificar: [Como checar]

## Concluído Quando
- [ ] [Critério principal de sucesso]
```

> **É isso.** Sem fases, sem subseções, a menos que seja realmente necessário.
> Mantenha mínimo. Adicione complexidade apenas quando for exigido.

## Notas
[Quaisquer considerações importantes]
```

---

## Boas Práticas (Referência Rápida)

1. **Comece com o objetivo** - O que estamos construindo/corrigindo?
2. **Máximo de 10 tarefas** - Se mais, divida em múltiplos planos
3. **Cada tarefa verificável** - Critérios claros de "concluído"
4. **Específico do projeto** - Sem templates de copiar e colar
5. **Atualize conforme avança** - Marque `[x]` quando concluir

---

## Quando Usar

- Projeto novo do zero
- Adicionar uma feature
- Corrigir um bug (se complexo)
- Refatorar múltiplos arquivos

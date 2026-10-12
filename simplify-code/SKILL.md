---
name: simplify-code
description: Reduz a complexidade de código superengenhado. Identifica abstrações desnecessárias, remove código morto, achata aninhamentos profundos e simplifica a lógica preservando o comportamento.
when_to_use: "Quando o código está superengenhado, excessivamente abstrato, profundamente aninhado ou mais complexo do que o necessário. Quando o usuário pede para 'simplificar', 'limpar', 'reduzir a complexidade' ou 'tornar isso mais simples'. NÃO para adicionar novas funcionalidades."
allowed-tools: Read, Write, Edit, Grep, Glob
effort: medium
---

# Simplify Code — Reduzir Complexidade Desnecessária

> O melhor código é o código que você não precisa escrever. O segundo melhor é o código que qualquer um consegue ler.

## Princípio Central

```
A complexidade é um custo. Cada abstração, cada indireção, cada padrão engenhoso
adiciona carga cognitiva. Simplifique implacavelmente, a menos que a complexidade sirva a um propósito claro.
```

---

## Checklist de Simplificação

### 1. Abstrações Desnecessárias
| Sintoma | Simplificação |
|---|---|
| Classe wrapper que apenas delega | Remover o wrapper, usar a classe interna diretamente |
| Factory que cria apenas um tipo | Substituir por construtor direto |
| Padrão strategy com uma única estratégia | Substituir por uma função simples |
| Interface com uma única implementação | Remover a interface, usar a classe |
| Classe abstrata com um único filho | Mesclar na classe filha |
| Objeto de config para 2 valores | Usar parâmetros de função |

### 2. Código Morto
| Sintoma | Ação |
|---|---|
| Imports não utilizados | Remover |
| Branches inalcançáveis | Remover (verificar os testes primeiro) |
| Código comentado | Remover (está no histórico do git) |
| Variáveis/funções não utilizadas | Remover |
| Comentários TODO com mais de 6 meses | Remover ou criar uma issue |
| Feature flags de funcionalidades já lançadas | Remover a flag, manter o código |

### 3. Aninhamento Profundo
```javascript
// ❌ Antes: 4 níveis de profundidade
function process(data) {
  if (data) {
    if (data.items) {
      for (const item of data.items) {
        if (item.active) {
          doSomething(item)
        }
      }
    }
  }
}

// ✅ Depois: Early returns + filter
function process(data) {
  if (!data?.items) return

  data.items
    .filter(item => item.active)
    .forEach(doSomething)
}
```

### 4. Funções com Excesso de Parâmetros
```typescript
// ❌ Antes: 8 parâmetros
function createUser(name, email, age, role, dept, active, verified, avatar) { }

// ✅ Depois: Parâmetro como objeto
function createUser(opts: CreateUserOpts) { }
```

### 5. Otimização Prematura
| Sintoma | Simplificação |
|---|---|
| Cache customizado para <100 itens | Remover o cache, medir primeiro |
| Memoization em funções baratas | Remover o memo |
| Lazy loading para módulos pequenos | Usar import direto |
| Máquina de estados complexa para 3 estados | Usar um simples if/else ou switch |

---

## Protocolo de Simplificação

### Passo 1: Identificar a Complexidade
```
- Conte os níveis de aninhamento (alvo: ≤3)
- Conte os parâmetros de função (alvo: ≤4)
- Conte as linhas por função (alvo: ≤30)
- Conte as abstrações por funcionalidade (alvo: ≤2)
- Verifique a existência de código morto (alvo: 0)
```

### Passo 2: Verificar o Entendimento
Antes de simplificar, certifique-se de que você entende:
- O que o código faz (não o que parece fazer)
- Por que ele foi escrito desta forma (talvez haja um motivo)
- Quais testes o cobrem (a simplificação não pode quebrar os testes)

### Passo 3: Simplificar Incrementalmente
```
1. Remover o código morto primeiro (mais seguro)
2. Achatar o aninhamento com early returns
3. Fazer inline de abstrações triviais
4. Mesclar funções relacionadas
5. Simplificar estruturas de dados
```

### Passo 4: Verificar se o Comportamento Foi Preservado
```bash
npm run test    # Todos os testes existentes continuam passando
npm run build   # Continua compilando
```

---

## Quando NÃO Simplificar

| Situação | Por Que Manter a Complexidade |
|---|---|
| Hot path crítico para performance | A otimização pode parecer complexa, mas é necessária |
| Exigido por framework/biblioteca | Restrições externas |
| Padrão explicitamente solicitado | O usuário escolheu esta arquitetura |
| Precisará de extensão em breve | A abstração prepara para um crescimento conhecido |

> **Pergunte primeiro:** "Este padrão parece superengenhado. Devo simplificá-lo, ou existe um motivo para a abstração?"

---
name: systematic-debugging
description: Metodologia de debugging sistemático em 4 fases com análise de causa raiz e verificação baseada em evidências. Use ao depurar problemas complexos.
when_to_use: "Ao depurar problemas complexos, realizar análise de causa raiz ou usar resolução de problemas baseada em evidências. Use com o workflow /debug."
allowed-tools: Read, Glob, Grep
---

# Systematic Debugging

> Fonte: obra/superpowers

## Visão Geral
Esta skill fornece uma abordagem estruturada para debugging que evita suposições aleatórias e garante que os problemas sejam devidamente compreendidos antes de serem resolvidos.

## Processo de Debugging em 4 Fases

### Fase 1: Reproduzir
Antes de corrigir, reproduza o problema de forma confiável.

```markdown
## Passos de Reprodução
1. [Passo exato para reproduzir]
2. [Próximo passo]
3. [Resultado esperado vs real]

## Taxa de Reprodução
- [ ] Sempre (100%)
- [ ] Frequentemente (50-90%)
- [ ] Às vezes (10-50%)
- [ ] Raramente (<10%)
```

### Fase 2: Isolar
Reduza a origem do problema.

```markdown
## Perguntas de Isolamento
- Quando isso começou a acontecer?
- O que mudou recentemente?
- Acontece em todos os ambientes?
- Conseguimos reproduzir com código mínimo?
- Qual é a menor alteração que dispara o problema?
```

### Fase 3: Entender
Encontre a causa raiz, não apenas os sintomas.

```markdown
## Análise de Causa Raiz
### Os 5 Porquês
1. Por quê: [Primeira observação]
2. Por quê: [Razão mais profunda]
3. Por quê: [Ainda mais profundo]
4. Por quê: [Chegando mais perto]
5. Por quê: [Causa raiz]
```

### Fase 4: Corrigir e Verificar
Corrija e verifique se foi realmente corrigido.

```markdown
## Verificação da Correção
- [ ] O bug não reproduz mais
- [ ] A funcionalidade relacionada continua funcionando
- [ ] Nenhum novo problema introduzido
- [ ] Teste adicionado para prevenir regressão
```

## Checklist de Debugging

```markdown
## Antes de Começar
- [ ] Consigo reproduzir de forma consistente
- [ ] Tenho um caso mínimo de reprodução
- [ ] Entendo o comportamento esperado

## Durante a Investigação
- [ ] Verificar alterações recentes (git log)
- [ ] Verificar os logs em busca de erros
- [ ] Adicionar logging se necessário
- [ ] Usar debugger/breakpoints

## Após a Correção
- [ ] Causa raiz documentada
- [ ] Correção verificada
- [ ] Teste de regressão adicionado
- [ ] Código similar verificado
```

## Comandos Comuns de Debugging

```bash
# Alterações recentes
git log --oneline -20
git diff HEAD~5

# Buscar por um padrão
grep -r "errorPattern" --include="*.ts"

# Verificar os logs
pm2 logs app-name --err --lines 100
```

## Anti-Padrões

❌ **Alterações aleatórias** - "Talvez se eu mudar isso..."
❌ **Ignorar evidências** - "Isso não pode ser a causa"
❌ **Supor** - "Deve ser X" sem prova
❌ **Não reproduzir primeiro** - Corrigir às cegas
❌ **Parar nos sintomas** - Não encontrar a causa raiz

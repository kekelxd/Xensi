---
name: lint-and-validate
description: "Controle de qualidade automático, linting e procedimentos de análise estática. Use após cada modificação de código para garantir a correção sintática e os padrões do projeto. Acionado pelas palavras-chave: lint, format, check, validate, types, análise estática."
when_to_use: "Ao executar linters, type checkers ou formatadores de código. Após qualquer alteração de código que precise de validação de qualidade."
allowed-tools: Read, Glob, Grep, Bash
---

# Skill Lint and Validate

> **OBRIGATÓRIO:** Execute as ferramentas de validação apropriadas após CADA alteração de código. Não finalize uma tarefa enquanto o código não estiver livre de erros.

### Procedimentos por Ecossistema

#### Node.js / TypeScript
1. **Lint/Fix:** `npm run lint` ou `npx eslint "path" --fix`
2. **Types:** `npx tsc --noEmit`
3. **Segurança:** `npm audit --audit-level=high`

#### Python
1. **Linter (Ruff):** `ruff check "path" --fix` (Rápido e Moderno)
2. **Segurança (Bandit):** `bandit -r "path" -ll`
3. **Types (MyPy):** `mypy "path"`

## O Loop de Qualidade
1. **Escrever/Editar Código**
2. **Executar Auditoria:** `npm run lint && npx tsc --noEmit`
3. **Analisar Relatório:** Verifique a seção "FINAL AUDIT REPORT".
4. **Corrigir e Repetir:** Submeter código com falhas de "FINAL AUDIT" NÃO é permitido.

## Tratamento de Erros
- Se o `lint` falhar: Corrija os problemas de estilo ou sintaxe imediatamente.
- Se o `tsc` falhar: Corrija as incompatibilidades de type antes de prosseguir.
- Se nenhuma ferramenta estiver configurada: Verifique a raiz do projeto por `.eslintrc`, `tsconfig.json`, `pyproject.toml` e sugira criar um.

---
**Regra Estrita:** Nenhum código deve ser commitado ou reportado como "concluído" sem passar por essas verificações.

---

## Scripts

| Script | Propósito | Comando |
|--------|---------|---------|
| `scripts/lint_runner.py` | Verificação de lint unificada | `python scripts/lint_runner.py <project_path>` |
| `scripts/type_coverage.py` | Análise de type coverage | `python scripts/type_coverage.py <project_path>` |

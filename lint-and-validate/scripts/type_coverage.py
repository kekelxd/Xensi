#!/usr/bin/env python3
"""
Type Coverage Checker - Mede o type coverage de TypeScript/Python.
Identifica funções sem tipo, uso de any e problemas de type safety.
"""
import sys
import re
import subprocess
from pathlib import Path

# Corrige a codificação do console no Windows para saída Unicode
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass  # Python < 3.7

def check_typescript_coverage(project_path: Path) -> dict:
    """Verifica o type coverage de TypeScript."""
    issues = []
    passed = []
    stats = {'any_count': 0, 'untyped_functions': 0, 'total_functions': 0}

    ts_files = list(project_path.rglob("*.ts")) + list(project_path.rglob("*.tsx"))
    ts_files = [f for f in ts_files if 'node_modules' not in str(f) and '.d.ts' not in str(f)]

    if not ts_files:
        return {'type': 'typescript', 'files': 0, 'passed': [], 'issues': ["[!] Nenhum arquivo TypeScript encontrado"], 'stats': stats}

    for file_path in ts_files[:30]:  # Limite
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')

            # Conta o uso de 'any'
            any_matches = re.findall(r':\s*any\b', content)
            stats['any_count'] += len(any_matches)

            # Encontra funções sem tipo de retorno
            # function name(params) { - sem tipo de retorno
            untyped = re.findall(r'function\s+\w+\s*\([^)]*\)\s*{', content)
            # Arrow functions sem tipos: const fn = (x) => ou (x) =>
            untyped += re.findall(r'=\s*\([^:)]*\)\s*=>', content)
            stats['untyped_functions'] += len(untyped)

            # Conta funções tipadas
            typed = re.findall(r'function\s+\w+\s*\([^)]*\)\s*:\s*\w+', content)
            typed += re.findall(r':\s*\([^)]*\)\s*=>\s*\w+', content)
            stats['total_functions'] += len(typed) + len(untyped)

        except Exception:
            continue

    # Analisa os resultados
    if stats['any_count'] == 0:
        passed.append("[OK] Nenhum type 'any' encontrado")
    elif stats['any_count'] <= 5:
        issues.append(f"[!] {stats['any_count']} types 'any' encontrados (aceitável)")
    else:
        issues.append(f"[X] {stats['any_count']} types 'any' encontrados (demais)")

    if stats['total_functions'] > 0:
        typed_ratio = (stats['total_functions'] - stats['untyped_functions']) / stats['total_functions'] * 100
        if typed_ratio >= 80:
            passed.append(f"[OK] Type coverage: {typed_ratio:.0f}%")
        elif typed_ratio >= 50:
            issues.append(f"[!] Type coverage: {typed_ratio:.0f}% (melhore)")
        else:
            issues.append(f"[X] Type coverage: {typed_ratio:.0f}% (muito baixo)")

    passed.append(f"[OK] {len(ts_files)} arquivos TypeScript analisados")

    return {'type': 'typescript', 'files': len(ts_files), 'passed': passed, 'issues': issues, 'stats': stats}

def check_python_coverage(project_path: Path) -> dict:
    """Verifica o coverage de type hints de Python."""
    issues = []
    passed = []
    stats = {'untyped_functions': 0, 'typed_functions': 0, 'any_count': 0}

    py_files = list(project_path.rglob("*.py"))
    py_files = [f for f in py_files if not any(x in str(f) for x in ['venv', '__pycache__', '.git', 'node_modules'])]

    if not py_files:
        return {'type': 'python', 'files': 0, 'passed': [], 'issues': ["[!] Nenhum arquivo Python encontrado"], 'stats': stats}

    for file_path in py_files[:30]:  # Limite
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')

            # Conta o uso de Any
            any_matches = re.findall(r':\s*Any\b', content)
            stats['any_count'] += len(any_matches)

            # Encontra funções com type hints
            typed_funcs = re.findall(r'def\s+\w+\s*\([^)]*:[^)]+\)', content)
            typed_funcs += re.findall(r'def\s+\w+\s*\([^)]*\)\s*->', content)
            stats['typed_functions'] += len(typed_funcs)

            # Encontra funções sem type hints
            all_funcs = re.findall(r'def\s+\w+\s*\(', content)
            stats['untyped_functions'] += len(all_funcs) - len(typed_funcs)

        except Exception:
            continue

    total = stats['typed_functions'] + stats['untyped_functions']

    if total > 0:
        typed_ratio = stats['typed_functions'] / total * 100
        if typed_ratio >= 70:
            passed.append(f"[OK] Coverage de type hints: {typed_ratio:.0f}%")
        elif typed_ratio >= 40:
            issues.append(f"[!] Coverage de type hints: {typed_ratio:.0f}%")
        else:
            issues.append(f"[X] Coverage de type hints: {typed_ratio:.0f}% (adicione type hints)")

    if stats['any_count'] == 0:
        passed.append("[OK] Nenhum type 'Any' encontrado")
    elif stats['any_count'] <= 3:
        issues.append(f"[!] {stats['any_count']} types 'Any' encontrados")
    else:
        issues.append(f"[X] {stats['any_count']} types 'Any' encontrados")

    passed.append(f"[OK] {len(py_files)} arquivos Python analisados")

    return {'type': 'python', 'files': len(py_files), 'passed': passed, 'issues': issues, 'stats': stats}

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    project_path = Path(target)

    print("\n" + "=" * 60)
    print("  TYPE COVERAGE CHECKER")
    print("=" * 60 + "\n")

    results = []

    # Verifica TypeScript
    ts_result = check_typescript_coverage(project_path)
    if ts_result['files'] > 0:
        results.append(ts_result)

    # Verifica Python
    py_result = check_python_coverage(project_path)
    if py_result['files'] > 0:
        results.append(py_result)

    if not results:
        print("[!] Nenhum arquivo TypeScript ou Python encontrado.")
        sys.exit(0)

    # Imprime os resultados
    critical_issues = 0
    for result in results:
        print(f"\n[{result['type'].upper()}]")
        print("-" * 40)
        for item in result['passed']:
            print(f"  {item}")
        for item in result['issues']:
            print(f"  {item}")
            if item.startswith("[X]"):
                critical_issues += 1

    print("\n" + "=" * 60)
    if critical_issues == 0:
        print("[OK] TYPE COVERAGE: ACEITÁVEL")
        sys.exit(0)
    else:
        print(f"[X] TYPE COVERAGE: {critical_issues} problemas críticos")
        sys.exit(1)

if __name__ == "__main__":
    main()

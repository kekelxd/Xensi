#!/usr/bin/env python3
"""
Lint Runner - Linting e type checking unificados
Executa os linters apropriados com base no tipo de projeto.

Uso:
    python lint_runner.py <project_path>

Suporta:
    - Node.js: npm run lint, npx tsc --noEmit
    - Python: ruff check, mypy
"""

import subprocess
import sys
import json
import platform
import shutil
from pathlib import Path
from datetime import datetime

# Corrige a codificação do console no Windows
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except:
    pass


def detect_project_type(project_path: Path) -> dict:
    """Detecta o tipo de projeto e os linters disponíveis."""
    result = {
        "type": "unknown",
        "linters": []
    }

    # Projeto Node.js
    package_json = project_path / "package.json"
    if package_json.exists():
        result["type"] = "node"
        try:
            pkg = json.loads(package_json.read_text(encoding='utf-8'))
            scripts = pkg.get("scripts", {})
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

            # Verifica se há script de lint
            if "lint" in scripts:
                result["linters"].append({"name": "npm lint", "cmd": ["npm", "run", "lint"]})
            elif "eslint" in deps:
                result["linters"].append({"name": "eslint", "cmd": ["npx", "eslint", "."]})

            # Verifica se há TypeScript
            if "typescript" in deps or (project_path / "tsconfig.json").exists():
                result["linters"].append({"name": "tsc", "cmd": ["npx", "tsc", "--noEmit"]})

        except:
            pass

    # Projeto Python
    if (project_path / "pyproject.toml").exists() or (project_path / "requirements.txt").exists():
        result["type"] = "python"

        # Verifica se há ruff
        result["linters"].append({"name": "ruff", "cmd": ["ruff", "check", "."]})

        # Verifica se há mypy
        if (project_path / "mypy.ini").exists() or (project_path / "pyproject.toml").exists():
            result["linters"].append({"name": "mypy", "cmd": ["mypy", "."]})

    return result


def run_linter(linter: dict, cwd: Path) -> dict:
    """Executa um único linter e retorna os resultados."""
    result = {
        "name": linter["name"],
        "passed": False,
        "output": "",
        "error": ""
    }

    try:
        cmd = linter["cmd"]

        # Compatibilidade com Windows para npm/npx
        if platform.system() == "Windows":
            if cmd[0] in ["npm", "npx"]:
                # Força a extensão .cmd no Windows
                if not cmd[0].lower().endswith(".cmd"):
                    cmd[0] = f"{cmd[0]}.cmd"

        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=120,
            shell=platform.system() == "Windows" # Shell=True frequentemente ajuda na resolução de caminhos no Windows
        )

        result["output"] = proc.stdout[:2000] if proc.stdout else ""
        result["error"] = proc.stderr[:500] if proc.stderr else ""
        result["passed"] = proc.returncode == 0

    except FileNotFoundError:
        result["error"] = f"Comando não encontrado: {linter['cmd'][0]}"
    except subprocess.TimeoutExpired:
        result["error"] = "Timeout após 120s"
    except Exception as e:
        result["error"] = str(e)

    return result


def main():
    project_path = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

    print(f"\n{'='*60}")
    print(f"[LINT RUNNER] Linting Unificado")
    print(f"{'='*60}")
    print(f"Projeto: {project_path}")
    print(f"Horário: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Detecta o tipo de projeto
    project_info = detect_project_type(project_path)
    print(f"Tipo: {project_info['type']}")
    print(f"Linters: {len(project_info['linters'])}")
    print("-"*60)

    if not project_info["linters"]:
        print("Nenhum linter encontrado para este tipo de projeto.")
        output = {
            "script": "lint_runner",
            "project": str(project_path),
            "type": project_info["type"],
            "checks": [],
            "passed": True,
            "message": "Nenhum linter configurado"
        }
        print(json.dumps(output, indent=2))
        sys.exit(0)

    # Executa cada linter
    results = []
    all_passed = True

    for linter in project_info["linters"]:
        print(f"\nExecutando: {linter['name']}...")
        result = run_linter(linter, project_path)
        results.append(result)

        if result["passed"]:
            print(f"  [PASS] {linter['name']}")
        else:
            print(f"  [FAIL] {linter['name']}")
            if result["error"]:
                print(f"  Erro: {result['error'][:200]}")
            all_passed = False

    # Resumo
    print("\n" + "="*60)
    print("RESUMO")
    print("="*60)

    for r in results:
        icon = "[PASS]" if r["passed"] else "[FAIL]"
        print(f"{icon} {r['name']}")

    output = {
        "script": "lint_runner",
        "project": str(project_path),
        "type": project_info["type"],
        "checks": results,
        "passed": all_passed
    }

    print("\n" + json.dumps(output, indent=2))

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()

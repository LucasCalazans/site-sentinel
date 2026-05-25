"""Disparo e controle de processos no WSL a partir do Windows.

Estrategia de parada confiavel:
  - O comando do usuario roda num grupo de processos proprio (`set -m` + job
    em background), e o PID do lider do grupo eh gravado num pidfile em /tmp.
  - Parar envia o sinal para o grupo inteiro (`kill -- -PGID`), derrubando
    tambem os filhos (ex.: vite/esbuild disparados pelo `npm run dev`).
  - O status eh lido direto dos pidfiles, entao continua correto mesmo apos
    reiniciar a interface.
"""

from __future__ import annotations

import subprocess
import sys

from .config import Config, Service

IS_WINDOWS = sys.platform.startswith("win")

# Em Windows, evita abrir uma janela de console preta a cada chamada.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if IS_WINDOWS else 0


def _pidfile(service_id: str) -> str:
    return f"/tmp/appmgr-{service_id}.pid"


def _logfile(service_id: str) -> str:
    return f"/tmp/appmgr-{service_id}.log"


def wsl_argv(distro: str, script: str) -> list[str]:
    """Monta o argv do wsl.exe rodando `script` num bash de login."""
    argv = ["wsl.exe"]
    if distro:
        argv += ["-d", distro]
    argv += ["--", "bash", "-lc", script]
    return argv


def build_launch_script(service: Service, shell_init: str) -> str:
    pid = _pidfile(service.id)
    log = _logfile(service.id)
    lines = []
    if shell_init.strip():
        lines.append(shell_init.strip())
    lines.append("set -m")
    lines.append(
        f"cd '{service.directory}' || {{ echo 'appmgr: cd falhou' >&2; exit 1; }}"
    )
    # O grupo `{ ...; } &` vira lider de process group por causa do `set -m`.
    lines.append(f"{{ {service.command} ; }} </dev/null >'{log}' 2>&1 &")
    lines.append(f"echo $! >'{pid}'")
    lines.append("wait")
    return "\n".join(lines)


def build_stop_script(service_id: str) -> str:
    pid = _pidfile(service_id)
    return (
        f"p=$(cat '{pid}' 2>/dev/null); "
        'if [ -n "$p" ]; then '
        'kill -TERM -- -"$p" 2>/dev/null; '
        'for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$p" 2>/dev/null || break; sleep 0.3; done; '
        'kill -KILL -- -"$p" 2>/dev/null; '
        "fi; "
        f"rm -f '{pid}'"
    )


def build_status_script() -> str:
    # Imprime o id de cada servico cujo pidfile aponta para um processo vivo.
    return (
        "for f in /tmp/appmgr-*.pid; do "
        '[ -e "$f" ] || continue; '
        'p=$(cat "$f" 2>/dev/null); '
        'if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then '
        'b=$(basename "$f" .pid); echo "${b#appmgr-}"; '
        "fi; "
        "done"
    )


class ProcessManager:
    """Dispara, para e consulta servicos no WSL."""

    def __init__(self, config: Config):
        self.config = config
        # service_id -> Popen do relay wsl.exe (enquanto esta sessao o iniciou)
        self._relays: dict[str, subprocess.Popen] = {}

    def start(self, service: Service) -> None:
        script = build_launch_script(service, self.config.shell_init)
        argv = wsl_argv(self.config.distro, script)
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=_NO_WINDOW,
        )
        self._relays[service.id] = proc

    def stop(self, service_id: str) -> None:
        script = build_stop_script(service_id)
        argv = wsl_argv(self.config.distro, script)
        subprocess.run(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=_NO_WINDOW,
            timeout=30,
        )
        relay = self._relays.pop(service_id, None)
        if relay and relay.poll() is None:
            try:
                relay.terminate()
            except Exception:
                pass

    def running_ids(self) -> set[str]:
        """Consulta sincrona dos servicos vivos (usada fora da thread da UI)."""
        argv = wsl_argv(self.config.distro, build_status_script())
        try:
            out = subprocess.run(
                argv,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                creationflags=_NO_WINDOW,
                timeout=15,
            ).stdout
        except Exception:
            return set()
        return {line.strip() for line in out.splitlines() if line.strip()}

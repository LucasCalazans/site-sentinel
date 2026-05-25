"""Carregamento, persistência e modelos de configuração do gerenciador."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path


CONFIG_DIR = Path.home() / ".server-app-manager"
CONFIG_PATH = CONFIG_DIR / "config.json"


def new_id() -> str:
    return uuid.uuid4().hex


@dataclass
class Service:
    """Um processo iniciável (ex.: Backend em Python, Frontend em npm)."""

    name: str
    directory: str
    command: str
    url: str = ""
    id: str = field(default_factory=new_id)

    @classmethod
    def from_dict(cls, data: dict) -> "Service":
        return cls(
            id=data.get("id") or new_id(),
            name=data.get("name", ""),
            directory=data.get("directory", ""),
            command=data.get("command", ""),
            url=data.get("url", ""),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "directory": self.directory,
            "command": self.command,
            "url": self.url,
        }


@dataclass
class Application:
    """Uma aplicação que agrupa um ou mais serviços (ex.: front + back)."""

    name: str
    services: list[Service] = field(default_factory=list)
    id: str = field(default_factory=new_id)

    @classmethod
    def from_dict(cls, data: dict) -> "Application":
        return cls(
            id=data.get("id") or new_id(),
            name=data.get("name", ""),
            services=[Service.from_dict(s) for s in data.get("services", [])],
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "services": [s.to_dict() for s in self.services],
        }


@dataclass
class Config:
    # Nome da distro WSL (ex.: "Ubuntu"). Vazio = distro padrão do wsl.exe.
    distro: str = ""
    # Trecho de shell prependido a cada comando, util para carregar nvm/venv
    # quando o ~/.bashrc nao roda em shell nao-interativo. Ex.:
    #   "export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh"
    shell_init: str = ""
    applications: list[Application] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "Config":
        return cls(
            distro=data.get("distro", ""),
            shell_init=data.get("shell_init", ""),
            applications=[
                Application.from_dict(a) for a in data.get("applications", [])
            ],
        )

    def to_dict(self) -> dict:
        return {
            "distro": self.distro,
            "shell_init": self.shell_init,
            "applications": [a.to_dict() for a in self.applications],
        }


def load_config(path: Path = CONFIG_PATH) -> Config:
    if not path.exists():
        cfg = Config()
        save_config(cfg, path)
        return cfg
    with path.open("r", encoding="utf-8") as fh:
        return Config.from_dict(json.load(fh))


def save_config(cfg: Config, path: Path = CONFIG_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(cfg.to_dict(), fh, indent=2, ensure_ascii=False)

"""Janela principal do gerenciador de aplicacoes."""

from __future__ import annotations

from PySide6.QtCore import QProcess, Qt, QTimer, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from .config import CONFIG_PATH, Application, Config, load_config, save_config
from .dialogs import ApplicationDialog
from .process import ProcessManager, build_status_script, wsl_argv

STATUS_INTERVAL_MS = 3000
DOT_RUNNING = "color: #2ecc71; font-size: 18px;"
DOT_STOPPED = "color: #bdc3c7; font-size: 18px;"


class SettingsDialog(QDialog):
    def __init__(self, parent, config: Config):
        super().__init__(parent)
        self.setWindowTitle("Configuracoes")
        self.setMinimumWidth(480)

        self.distro_edit = QLineEdit(config.distro)
        self.distro_edit.setPlaceholderText("Ex.: Ubuntu (vazio = distro padrao)")
        self.init_edit = QLineEdit(config.shell_init)
        self.init_edit.setPlaceholderText("export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh")

        form = QFormLayout()
        form.addRow("Distro WSL:", self.distro_edit)
        form.addRow("Shell init:", self.init_edit)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.addLayout(form)
        hint = QLabel(
            "Shell init eh prependido a cada comando. Util quando o npm vem do "
            "nvm e o ~/.bashrc nao carrega em shell nao-interativo."
        )
        hint.setWordWrap(True)
        hint.setStyleSheet("color: #7f8c8d;")
        layout.addWidget(hint)
        layout.addWidget(buttons)


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Server App Manager")
        self.resize(640, 720)

        self.config: Config = load_config()
        self.manager = ProcessManager(self.config)

        # service_id -> QLabel do indicador de status
        self._dots: dict[str, QLabel] = {}
        self._running: set[str] = set()
        self._status_proc: QProcess | None = None

        self._build_ui()
        self.rebuild()

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._poll_status)
        self._timer.start(STATUS_INTERVAL_MS)
        self._poll_status()

    # ----- construcao da UI ---------------------------------------------
    def _build_ui(self) -> None:
        root = QVBoxLayout(self)

        toolbar = QHBoxLayout()
        add_btn = QPushButton("+ Aplicacao")
        reload_btn = QPushButton("Recarregar")
        settings_btn = QPushButton("Configuracoes")
        open_cfg_btn = QPushButton("Abrir config")
        add_btn.clicked.connect(self._add_application)
        reload_btn.clicked.connect(self._reload)
        settings_btn.clicked.connect(self._open_settings)
        open_cfg_btn.clicked.connect(self._open_config_file)
        toolbar.addWidget(add_btn)
        toolbar.addWidget(reload_btn)
        toolbar.addStretch()
        toolbar.addWidget(settings_btn)
        toolbar.addWidget(open_cfg_btn)
        root.addLayout(toolbar)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.container = QWidget()
        self.cards_layout = QVBoxLayout(self.container)
        self.cards_layout.setAlignment(Qt.AlignTop)
        self.scroll.setWidget(self.container)
        root.addWidget(self.scroll)

    def rebuild(self) -> None:
        """Recria os cards a partir da config atual."""
        self._dots.clear()
        while self.cards_layout.count():
            item = self.cards_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

        if not self.config.applications:
            empty = QLabel(
                "Nenhuma aplicacao cadastrada.\n\nClique em \"+ Aplicacao\" para comecar."
            )
            empty.setAlignment(Qt.AlignCenter)
            empty.setStyleSheet("color: #7f8c8d; padding: 40px;")
            self.cards_layout.addWidget(empty)
            return

        for app in self.config.applications:
            self.cards_layout.addWidget(self._build_card(app))
        self._apply_status()

    def _build_card(self, app: Application) -> QFrame:
        card = QFrame()
        card.setFrameShape(QFrame.StyledPanel)
        card.setStyleSheet(
            "QFrame { background: #ffffff; border: 1px solid #e1e4e8; border-radius: 8px; }"
        )
        layout = QVBoxLayout(card)

        header = QHBoxLayout()
        title = QLabel(app.name)
        title.setStyleSheet("font-size: 16px; font-weight: bold; border: none;")
        header.addWidget(title)
        header.addStretch()

        start_all = QPushButton("Iniciar tudo")
        stop_all = QPushButton("Parar tudo")
        edit_app = QPushButton("Editar")
        del_app = QPushButton("Remover")
        start_all.clicked.connect(lambda _, a=app: self._start_all(a))
        stop_all.clicked.connect(lambda _, a=app: self._stop_all(a))
        edit_app.clicked.connect(lambda _, a=app: self._edit_application(a))
        del_app.clicked.connect(lambda _, a=app: self._delete_application(a))
        for b in (start_all, stop_all, edit_app, del_app):
            header.addWidget(b)
        layout.addLayout(header)

        for svc in app.services:
            layout.addWidget(self._build_service_row(svc))

        if not app.services:
            none_lbl = QLabel("(sem servicos — edite a aplicacao para adicionar)")
            none_lbl.setStyleSheet("color: #7f8c8d; border: none;")
            layout.addWidget(none_lbl)

        return card

    def _build_service_row(self, svc) -> QWidget:
        row = QWidget()
        h = QHBoxLayout(row)
        h.setContentsMargins(0, 0, 0, 0)

        dot = QLabel("●")
        dot.setStyleSheet(DOT_STOPPED)
        self._dots[svc.id] = dot
        h.addWidget(dot)

        name = QLabel(svc.name)
        name.setStyleSheet("border: none;")
        name.setMinimumWidth(120)
        h.addWidget(name)
        h.addStretch()

        start = QPushButton("Iniciar")
        stop = QPushButton("Parar")
        start.clicked.connect(lambda _, s=svc: self._start(s))
        stop.clicked.connect(lambda _, s=svc: self._stop(s))
        h.addWidget(start)
        h.addWidget(stop)

        if svc.url:
            open_btn = QPushButton("Abrir")
            open_btn.clicked.connect(lambda _, u=svc.url: QDesktopServices.openUrl(QUrl(u)))
            h.addWidget(open_btn)

        return row

    # ----- acoes de processo --------------------------------------------
    def _start(self, svc) -> None:
        self.manager.start(svc)
        self._running.add(svc.id)  # otimista; o poll confirma
        self._apply_status()

    def _stop(self, svc) -> None:
        self.manager.stop(svc.id)
        self._running.discard(svc.id)
        self._apply_status()

    def _start_all(self, app: Application) -> None:
        for svc in app.services:
            self._start(svc)

    def _stop_all(self, app: Application) -> None:
        for svc in app.services:
            self._stop(svc)

    # ----- status (polling nao-bloqueante via QProcess) -----------------
    def _poll_status(self) -> None:
        if self._status_proc is not None:
            return  # ainda processando o tick anterior
        argv = wsl_argv(self.config.distro, build_status_script())
        proc = QProcess(self)
        proc.finished.connect(lambda *_: self._on_status_done(proc))
        proc.errorOccurred.connect(lambda *_: self._on_status_done(proc))
        self._status_proc = proc
        proc.start(argv[0], argv[1:])

    def _on_status_done(self, proc: QProcess) -> None:
        if self._status_proc is not proc:
            return
        out = bytes(proc.readAllStandardOutput()).decode("utf-8", "replace")
        self._running = {line.strip() for line in out.splitlines() if line.strip()}
        self._status_proc = None
        self._apply_status()

    def _apply_status(self) -> None:
        for sid, dot in self._dots.items():
            dot.setStyleSheet(DOT_RUNNING if sid in self._running else DOT_STOPPED)

    # ----- config / CRUD -------------------------------------------------
    def _save_and_rebuild(self) -> None:
        save_config(self.config)
        self.manager.config = self.config
        self.rebuild()

    def _add_application(self) -> None:
        dlg = ApplicationDialog(self)
        if dlg.exec() == QDialog.Accepted:
            self.config.applications.append(dlg.result_application())
            self._save_and_rebuild()

    def _edit_application(self, app: Application) -> None:
        dlg = ApplicationDialog(self, app)
        if dlg.exec() == QDialog.Accepted:
            idx = self.config.applications.index(app)
            self.config.applications[idx] = dlg.result_application()
            self._save_and_rebuild()

    def _delete_application(self, app: Application) -> None:
        resp = QMessageBox.question(
            self, "Remover", f"Remover a aplicacao \"{app.name}\"?"
        )
        if resp == QMessageBox.Yes:
            self.config.applications.remove(app)
            self._save_and_rebuild()

    def _reload(self) -> None:
        self.config = load_config()
        self.manager.config = self.config
        self.rebuild()

    def _open_settings(self) -> None:
        dlg = SettingsDialog(self, self.config)
        if dlg.exec() == QDialog.Accepted:
            self.config.distro = dlg.distro_edit.text().strip()
            self.config.shell_init = dlg.init_edit.text().strip()
            self._save_and_rebuild()

    def _open_config_file(self) -> None:
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(CONFIG_PATH)))

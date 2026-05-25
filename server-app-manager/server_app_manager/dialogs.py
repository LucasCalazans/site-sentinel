"""Dialogos para cadastrar/editar aplicacoes e servicos pela interface."""

from __future__ import annotations

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)

from .config import Application, Service


class ServiceDialog(QDialog):
    """Edita um servico (nome, pasta WSL, comando e URL opcional)."""

    def __init__(self, parent=None, service: Service | None = None):
        super().__init__(parent)
        self.setWindowTitle("Servico")
        self.setMinimumWidth(460)

        self.name_edit = QLineEdit(service.name if service else "")
        self.dir_edit = QLineEdit(service.directory if service else "")
        self.cmd_edit = QLineEdit(service.command if service else "")
        self.url_edit = QLineEdit(service.url if service else "")

        self.name_edit.setPlaceholderText("Ex.: Backend")
        self.dir_edit.setPlaceholderText("/home/usuario/projeto/api")
        self.cmd_edit.setPlaceholderText("source .venv/bin/activate && python manage.py runserver")
        self.url_edit.setPlaceholderText("http://localhost:8000 (opcional)")

        form = QFormLayout()
        form.addRow("Nome:", self.name_edit)
        form.addRow("Pasta (WSL):", self.dir_edit)
        form.addRow("Comando:", self.cmd_edit)
        form.addRow("URL:", self.url_edit)

        buttons = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel
        )
        buttons.accepted.connect(self._on_accept)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.addLayout(form)
        layout.addWidget(buttons)

        self._service_id = service.id if service else None

    def _on_accept(self) -> None:
        if not self.name_edit.text().strip():
            QMessageBox.warning(self, "Campo obrigatorio", "Informe o nome do servico.")
            return
        if not self.dir_edit.text().strip():
            QMessageBox.warning(self, "Campo obrigatorio", "Informe a pasta do servico.")
            return
        if not self.cmd_edit.text().strip():
            QMessageBox.warning(self, "Campo obrigatorio", "Informe o comando do servico.")
            return
        self.accept()

    def result_service(self) -> Service:
        svc = Service(
            name=self.name_edit.text().strip(),
            directory=self.dir_edit.text().strip(),
            command=self.cmd_edit.text().strip(),
            url=self.url_edit.text().strip(),
        )
        if self._service_id:
            svc.id = self._service_id
        return svc


class ApplicationDialog(QDialog):
    """Edita uma aplicacao: nome + lista de servicos."""

    def __init__(self, parent=None, application: Application | None = None):
        super().__init__(parent)
        self.setWindowTitle("Aplicacao")
        self.setMinimumWidth(520)

        self._app_id = application.id if application else None
        self._services: list[Service] = (
            [Service.from_dict(s.to_dict()) for s in application.services]
            if application
            else []
        )

        self.name_edit = QLineEdit(application.name if application else "")
        self.name_edit.setPlaceholderText("Ex.: Meu Site")

        self.list = QListWidget()
        self._refresh_list()

        add_btn = QPushButton("Adicionar servico")
        edit_btn = QPushButton("Editar")
        del_btn = QPushButton("Remover")
        add_btn.clicked.connect(self._add_service)
        edit_btn.clicked.connect(self._edit_service)
        del_btn.clicked.connect(self._del_service)

        svc_buttons = QHBoxLayout()
        svc_buttons.addWidget(add_btn)
        svc_buttons.addWidget(edit_btn)
        svc_buttons.addWidget(del_btn)
        svc_buttons.addStretch()

        buttons = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel
        )
        buttons.accepted.connect(self._on_accept)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.addRow("Nome:", self.name_edit)
        layout.addLayout(form)
        layout.addWidget(QLabel("Servicos:"))
        layout.addWidget(self.list)
        layout.addLayout(svc_buttons)
        layout.addWidget(buttons)

    def _refresh_list(self) -> None:
        self.list.clear()
        for svc in self._services:
            item = QListWidgetItem(f"{svc.name}  —  {svc.command}")
            self.list.addItem(item)

    def _selected_index(self) -> int:
        return self.list.currentRow()

    def _add_service(self) -> None:
        dlg = ServiceDialog(self)
        if dlg.exec() == QDialog.Accepted:
            self._services.append(dlg.result_service())
            self._refresh_list()

    def _edit_service(self) -> None:
        idx = self._selected_index()
        if idx < 0:
            return
        dlg = ServiceDialog(self, self._services[idx])
        if dlg.exec() == QDialog.Accepted:
            self._services[idx] = dlg.result_service()
            self._refresh_list()

    def _del_service(self) -> None:
        idx = self._selected_index()
        if idx < 0:
            return
        del self._services[idx]
        self._refresh_list()

    def _on_accept(self) -> None:
        if not self.name_edit.text().strip():
            QMessageBox.warning(self, "Campo obrigatorio", "Informe o nome da aplicacao.")
            return
        self.accept()

    def result_application(self) -> Application:
        app = Application(
            name=self.name_edit.text().strip(),
            services=self._services,
        )
        if self._app_id:
            app.id = self._app_id
        return app

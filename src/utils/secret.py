"""Local secret encryption helpers."""

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from src.config.settings import Settings, ensure_app_dirs

ENCRYPTED_SECRET_PREFIX: str = "enc:v1:"


class SecretEncryptionError(RuntimeError):
    """Raised when a persisted secret can no longer be decrypted."""


class LocalSecretCipher:
    """Encrypt and decrypt locally persisted secrets with a file-backed Fernet key."""

    def __init__(self, settings: Settings) -> None:
        self.settings: Settings = settings
        ensure_app_dirs(settings)
        self.key_path: Path = settings.resolved_model_config_secret_path
        self._fernet: Fernet | None = None

    def encrypt(self, value: str) -> str:
        token: bytes = self._get_fernet().encrypt(value.encode("utf-8"))
        return f"{ENCRYPTED_SECRET_PREFIX}{token.decode('utf-8')}"

    def decrypt(self, value: str) -> str:
        if not value:
            return ""
        if not value.startswith(ENCRYPTED_SECRET_PREFIX):
            raise SecretEncryptionError("已保存的 API Key 不是当前加密格式，请重新保存一次模型配置。")

        token: bytes = value.removeprefix(ENCRYPTED_SECRET_PREFIX).encode("utf-8")
        try:
            return self._get_fernet().decrypt(token).decode("utf-8")
        except InvalidToken as exc:
            raise SecretEncryptionError("无法解密已保存的 API Key，请重新保存一次模型配置。") from exc

    def is_encrypted(self, value: str | None) -> bool:
        return bool(value and value.startswith(ENCRYPTED_SECRET_PREFIX))

    def _get_fernet(self) -> Fernet:
        if self._fernet is None:
            self._fernet = Fernet(self._load_or_create_key())
        return self._fernet

    def _load_or_create_key(self) -> bytes:
        if self.key_path.exists():
            return self.key_path.read_bytes().strip()

        key: bytes = Fernet.generate_key()
        self.key_path.parent.mkdir(parents=True, exist_ok=True)
        self.key_path.write_bytes(key)
        self._best_effort_harden_permissions(self.key_path)
        return key

    def _best_effort_harden_permissions(self, path: Path) -> None:
        try:
            os.chmod(path, 0o600)
        except OSError:
            return

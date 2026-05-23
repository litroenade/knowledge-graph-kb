"""Model configuration service."""

from typing import Final

from src.config import Settings
from src.kb.common import RuntimeModelConfiguration
from src.kb.infrastructure.storage import ModelConfigStore, VectorIndex
from src.utils.logger import get_logger
from src.utils.secret import LocalSecretCipher, SecretEncryptionError

MODEL_PROVIDER_BASE_URLS: Final[dict[str, str]] = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com",
    "openrouter": "https://openrouter.ai/api/v1",
    "siliconflow": "https://api.siliconflow.cn/v1",
    "custom": "",
}
DEFAULT_MODEL_PROVIDER: Final[str] = "openai"
DEFAULT_LLM_MODEL: Final[str] = "gpt-5.4-mini"
DEFAULT_EMBEDDING_MODEL: Final[str] = "text-embedding-3-large"
REINDEX_NOTICE: Final[str] = "嵌入模型已变更，现有向量索引已重置，请重新导入内容。"
INVALID_SAVED_API_KEY_NOTICE: Final[str] = "已保存的 API Key 无法解密，请重新保存一次模型配置。"

logger = get_logger(__name__)


class ModelConfigService:
    """Manage persisted model configuration and runtime settings."""

    def __init__(
        self,
        *,
        settings: Settings,
        store: ModelConfigStore,
        vector_index: VectorIndex,
    ) -> None:
        self.settings = settings
        self.store = store
        self.vector = vector_index
        self.secret_cipher = LocalSecretCipher(settings)

    def resolve_runtime_configuration(self) -> RuntimeModelConfiguration:
        runtime_config, _ = self._resolve_runtime_configuration_with_notice()
        logger.debug(
            "运行时模型配置已解析：llm_provider=%s llm_base_url=%s llm_model=%s embedding_provider=%s embedding_base_url=%s embedding_model=%s llm_key_source=%s embedding_key_source=%s",
            runtime_config.llm_provider,
            runtime_config.llm_base_url,
            runtime_config.llm_model,
            runtime_config.embedding_provider,
            runtime_config.embedding_base_url,
            runtime_config.embedding_model,
            runtime_config.llm_api_key_source,
            runtime_config.embedding_api_key_source,
        )
        return runtime_config

    def _resolve_runtime_configuration_with_notice(self) -> tuple[RuntimeModelConfiguration, str | None]:
        model_config = self.store.get()
        legacy_provider = self._normalize_provider(
            self._read_config_value(model_config, "provider", DEFAULT_MODEL_PROVIDER),
        )
        legacy_base_url = self._read_config_value(model_config, "base_url", "")
        llm_provider = self._normalize_provider(
            self._read_config_value(model_config, "llm_provider", legacy_provider),
        )
        embedding_provider = self._normalize_provider(
            self._read_config_value(model_config, "embedding_provider", legacy_provider),
        )
        llm_base_url = self._normalize_base_url(
            llm_provider,
            self._read_config_value(model_config, "llm_base_url", legacy_base_url),
        )
        embedding_base_url = self._normalize_base_url(
            embedding_provider,
            self._read_config_value(model_config, "embedding_base_url", legacy_base_url),
        )

        llm_api_key = ""
        embedding_api_key = ""
        notice: str | None = None
        llm_key_invalid = False
        embedding_key_invalid = False
        llm_api_key_value = self._read_config_value(model_config, "llm_api_key", "")
        if not llm_api_key_value and model_config is not None and "llm_api_key" not in model_config:
            llm_api_key_value = str(model_config.get("api_key") or "")
        embedding_api_key_value = self._read_config_value(model_config, "embedding_api_key", "")
        if not embedding_api_key_value and model_config is not None and "embedding_api_key" not in model_config:
            embedding_api_key_value = str(model_config.get("api_key") or "")
        if llm_api_key_value:
            try:
                llm_api_key = self._resolve_saved_api_key(llm_api_key_value)
            except SecretEncryptionError:
                notice = INVALID_SAVED_API_KEY_NOTICE
                llm_key_invalid = True
                logger.warning("已保存的 LLM API Key 无法解密，需要重新保存模型配置。")
        if embedding_api_key_value:
            try:
                embedding_api_key = self._resolve_saved_api_key(embedding_api_key_value)
            except SecretEncryptionError:
                notice = INVALID_SAVED_API_KEY_NOTICE
                embedding_key_invalid = True
                logger.warning("已保存的 Embedding API Key 无法解密，需要重新保存模型配置。")

        llm_model = (
            str(model_config["llm_model"]).strip()
            if model_config is not None and str(model_config.get("llm_model") or "").strip()
            else DEFAULT_LLM_MODEL
        )
        embedding_model = (
            str(model_config["embedding_model"]).strip()
            if model_config is not None and str(model_config.get("embedding_model") or "").strip()
            else DEFAULT_EMBEDDING_MODEL
        )
        llm_key_source = "invalid" if llm_key_invalid else "saved" if llm_api_key else "none"
        embedding_key_source = "invalid" if embedding_key_invalid else "saved" if embedding_api_key else "none"
        if not embedding_api_key and not embedding_key_invalid and self._is_same_endpoint(
            llm_provider=llm_provider,
            llm_base_url=llm_base_url,
            embedding_provider=embedding_provider,
            embedding_base_url=embedding_base_url,
        ):
            embedding_api_key = llm_api_key
            embedding_key_source = "llm-saved" if llm_api_key else "none"

        return (
            RuntimeModelConfiguration(
                llm_provider=llm_provider,
                llm_base_url=llm_base_url,
                llm_api_key=llm_api_key,
                llm_model=llm_model,
                llm_api_key_source=llm_key_source,
                embedding_provider=embedding_provider,
                embedding_base_url=embedding_base_url,
                embedding_api_key=embedding_api_key,
                embedding_model=embedding_model,
                embedding_api_key_source=embedding_key_source,
            ),
            notice,
        )

    def get_public_configuration(
        self,
        *,
        reindex_required: bool = False,
        notice: str | None = None,
    ) -> dict[str, object]:
        runtime_config, runtime_notice = self._resolve_runtime_configuration_with_notice()
        combined_notice = notice or runtime_notice
        return {
            "llm_provider": runtime_config.llm_provider,
            "llm_base_url": runtime_config.llm_base_url,
            "llm_model": runtime_config.llm_model,
            "llm_has_api_key": bool(runtime_config.llm_api_key),
            "llm_api_key_preview": self._mask_api_key(runtime_config.llm_api_key)
            if runtime_config.llm_api_key
            else None,
            "llm_api_key_source": runtime_config.llm_api_key_source,
            "embedding_provider": runtime_config.embedding_provider,
            "embedding_base_url": runtime_config.embedding_base_url,
            "embedding_model": runtime_config.embedding_model,
            "embedding_has_api_key": bool(runtime_config.embedding_api_key),
            "embedding_api_key_preview": self._mask_api_key(runtime_config.embedding_api_key)
            if runtime_config.embedding_api_key
            else None,
            "embedding_api_key_source": runtime_config.embedding_api_key_source,
            "reindex_required": reindex_required,
            "notice": combined_notice,
        }

    def update_configuration(self, payload: dict[str, object]) -> dict[str, object]:
        previous = self.resolve_runtime_configuration()

        llm_provider = self._normalize_provider(str(payload.get("llm_provider") or payload.get("provider") or ""))
        llm_base_url = self._normalize_base_url(
            llm_provider,
            str(payload.get("llm_base_url") or payload.get("base_url") or ""),
        )
        llm_model = self._require_non_empty(str(payload.get("llm_model") or ""), "聊天模型名称不能为空。")
        embedding_provider = self._normalize_provider(
            str(payload.get("embedding_provider") or payload.get("provider") or ""),
        )
        embedding_base_url = self._normalize_base_url(
            embedding_provider,
            str(payload.get("embedding_base_url") or payload.get("base_url") or ""),
        )
        embedding_model = self._require_non_empty(
            str(payload.get("embedding_model") or ""),
            "嵌入模型名称不能为空。",
        )

        existing = self.store.get()
        saved_llm_api_key = self._read_encrypted_key(existing, "llm_api_key")
        saved_embedding_api_key = self._read_encrypted_key(existing, "embedding_api_key")

        clear_llm_api_key = bool(payload.get("clear_llm_api_key") or payload.get("clear_api_key"))
        clear_embedding_api_key = bool(payload.get("clear_embedding_api_key") or payload.get("clear_api_key"))
        raw_llm_api_key = payload.get("llm_api_key")
        if raw_llm_api_key is None and "api_key" in payload:
            raw_llm_api_key = payload.get("api_key")
        raw_embedding_api_key = payload.get("embedding_api_key")
        if raw_embedding_api_key is None and "api_key" in payload:
            raw_embedding_api_key = payload.get("api_key")
        encrypted_llm_api_key = saved_llm_api_key
        encrypted_embedding_api_key = saved_embedding_api_key

        if clear_llm_api_key:
            encrypted_llm_api_key = None
        elif raw_llm_api_key is not None:
            cleaned_llm_api_key = str(raw_llm_api_key).strip()
            encrypted_llm_api_key = self.secret_cipher.encrypt(cleaned_llm_api_key) if cleaned_llm_api_key else None

        if clear_embedding_api_key:
            encrypted_embedding_api_key = None
        elif raw_embedding_api_key is not None:
            cleaned_embedding_api_key = str(raw_embedding_api_key).strip()
            encrypted_embedding_api_key = (
                self.secret_cipher.encrypt(cleaned_embedding_api_key) if cleaned_embedding_api_key else None
            )

        logger.info(
            "开始更新模型配置：llm_provider=%s llm_model=%s embedding_provider=%s embedding_model=%s clear_llm_key=%s clear_embedding_key=%s provided_llm_key=%s provided_embedding_key=%s",
            llm_provider,
            llm_model,
            embedding_provider,
            embedding_model,
            clear_llm_api_key,
            clear_embedding_api_key,
            raw_llm_api_key is not None,
            raw_embedding_api_key is not None,
        )
        self.store.upsert(
            llm_provider=llm_provider,
            llm_base_url=llm_base_url,
            llm_model=llm_model,
            llm_api_key=encrypted_llm_api_key,
            embedding_provider=embedding_provider,
            embedding_base_url=embedding_base_url,
            embedding_model=embedding_model,
            embedding_api_key=encrypted_embedding_api_key,
        )

        reindex_required = (
            previous.embedding_provider != embedding_provider
            or previous.embedding_base_url != embedding_base_url
            or previous.embedding_model != embedding_model
        )
        notice = None
        if reindex_required:
            self.vector.reset()
            notice = REINDEX_NOTICE
            logger.info(
                "嵌入端点已变更，已重置向量索引：previous=%s/%s/%s current=%s/%s/%s",
                previous.embedding_provider,
                previous.embedding_base_url,
                previous.embedding_model,
                embedding_provider,
                embedding_base_url,
                embedding_model,
            )

        logger.info(
            "模型配置更新完成：llm_provider=%s llm_model=%s embedding_provider=%s embedding_model=%s reindex_required=%s",
            llm_provider,
            llm_model,
            embedding_provider,
            embedding_model,
            reindex_required,
        )
        return self.get_public_configuration(reindex_required=reindex_required, notice=notice)

    def build_runtime_configuration_for_test(self, payload: dict[str, object]) -> RuntimeModelConfiguration:
        current = self.resolve_runtime_configuration()
        llm_provider = self._normalize_provider(str(payload.get("llm_provider") or payload.get("provider") or ""))
        llm_base_url = self._normalize_base_url(
            llm_provider,
            str(payload.get("llm_base_url") or payload.get("base_url") or ""),
        )
        llm_model = self._require_non_empty(str(payload.get("llm_model") or ""), "聊天模型名称不能为空。")
        embedding_provider = self._normalize_provider(
            str(payload.get("embedding_provider") or payload.get("provider") or ""),
        )
        embedding_base_url = self._normalize_base_url(
            embedding_provider,
            str(payload.get("embedding_base_url") or payload.get("base_url") or ""),
        )
        embedding_model = self._require_non_empty(
            str(payload.get("embedding_model") or ""),
            "嵌入模型名称不能为空。",
        )

        explicit_llm_api_key = str(payload.get("llm_api_key") or payload.get("api_key") or "").strip()
        explicit_embedding_api_key = str(payload.get("embedding_api_key") or payload.get("api_key") or "").strip()
        use_saved_llm_api_key = bool(payload.get("use_saved_llm_api_key") or payload.get("use_saved_api_key"))
        use_saved_embedding_api_key = bool(
            payload.get("use_saved_embedding_api_key") or payload.get("use_saved_api_key"),
        )
        llm_api_key = explicit_llm_api_key or (current.llm_api_key if use_saved_llm_api_key else "")
        embedding_api_key = explicit_embedding_api_key or (
            current.embedding_api_key if use_saved_embedding_api_key else ""
        )
        inherited_embedding_key = False
        if not embedding_api_key and self._is_same_endpoint(
            llm_provider=llm_provider,
            llm_base_url=llm_base_url,
            embedding_provider=embedding_provider,
            embedding_base_url=embedding_base_url,
        ):
            embedding_api_key = llm_api_key
            inherited_embedding_key = bool(llm_api_key)

        llm_api_key_source = "request" if explicit_llm_api_key else current.llm_api_key_source
        embedding_api_key_source = "request" if explicit_embedding_api_key else current.embedding_api_key_source
        if inherited_embedding_key:
            embedding_api_key_source = "llm-request" if explicit_llm_api_key else "llm-saved"
        if not llm_api_key:
            raise ValueError("请先填写 LLM API Key，或保留已保存的可用密钥。")
        if not embedding_api_key:
            raise ValueError("请先填写 Embedding API Key，或保留已保存的可用密钥。")

        logger.info(
            "构造模型测试配置：llm_provider=%s llm_model=%s embedding_provider=%s embedding_model=%s llm_key_source=%s embedding_key_source=%s",
            llm_provider,
            llm_model,
            embedding_provider,
            embedding_model,
            llm_api_key_source,
            embedding_api_key_source,
        )
        logger.debug(
            "模型测试配置参数：llm_provider=%s llm_base_url=%s llm_model=%s embedding_provider=%s embedding_base_url=%s embedding_model=%s llm_key_source=%s embedding_key_source=%s use_saved_llm_key=%s use_saved_embedding_key=%s explicit_llm_key=%s explicit_embedding_key=%s",
            llm_provider,
            llm_base_url,
            llm_model,
            embedding_provider,
            embedding_base_url,
            embedding_model,
            llm_api_key_source,
            embedding_api_key_source,
            use_saved_llm_api_key,
            use_saved_embedding_api_key,
            bool(explicit_llm_api_key),
            bool(explicit_embedding_api_key),
        )
        return RuntimeModelConfiguration(
            llm_provider=llm_provider,
            llm_base_url=llm_base_url,
            llm_api_key=llm_api_key,
            llm_model=llm_model,
            llm_api_key_source=llm_api_key_source,
            embedding_provider=embedding_provider,
            embedding_base_url=embedding_base_url,
            embedding_api_key=embedding_api_key,
            embedding_model=embedding_model,
            embedding_api_key_source=embedding_api_key_source,
        )

    def build_test_result(
        self,
        runtime_config: RuntimeModelConfiguration,
        *,
        llm_ok: bool,
        embedding_ok: bool,
    ) -> dict[str, object]:
        message = "当前配置可以访问聊天模型和嵌入模型。"
        if not llm_ok and not embedding_ok:
            message = "当前配置无法访问聊天模型和嵌入模型，请检查提供商、Base URL、模型名称与 API Key。"
        elif not llm_ok:
            message = "嵌入模型可用，但聊天模型请求失败。"
        elif not embedding_ok:
            message = "聊天模型可用，但嵌入模型请求失败。"
        return {
            "llm_provider": runtime_config.llm_provider,
            "llm_base_url": runtime_config.llm_base_url,
            "llm_model": runtime_config.llm_model,
            "embedding_provider": runtime_config.embedding_provider,
            "embedding_base_url": runtime_config.embedding_base_url,
            "embedding_model": runtime_config.embedding_model,
            "llm_ok": llm_ok,
            "embedding_ok": embedding_ok,
            "message": message,
        }

    def embedding_model_signature(self) -> str:
        runtime_config = self.resolve_runtime_configuration()
        return (
            f"{runtime_config.embedding_provider}:"
            f"{runtime_config.embedding_base_url}:"
            f"{runtime_config.embedding_model}"
        )

    def _normalize_provider(self, raw_provider: str) -> str:
        provider = raw_provider.strip().lower()
        if provider not in MODEL_PROVIDER_BASE_URLS:
            raise ValueError("暂不支持该 API 提供商。")
        return provider

    def _normalize_base_url(self, provider: str, raw_base_url: str) -> str:
        base_url = raw_base_url.strip().rstrip("/")
        if provider == "custom":
            if not base_url:
                raise ValueError("自定义提供商必须填写 Base URL。")
            return base_url
        return base_url or MODEL_PROVIDER_BASE_URLS[provider]

    def _require_non_empty(self, value: str, message: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(message)
        return cleaned

    def _resolve_saved_api_key(self, stored_value: str | None) -> str:
        if not stored_value:
            return ""
        return self.secret_cipher.decrypt(stored_value).strip()

    def _read_config_value(self, model_config: dict[str, object] | None, key: str, fallback: str) -> str:
        if model_config is None:
            return fallback
        value = model_config.get(key)
        if value is None:
            return fallback
        cleaned = str(value).strip()
        return cleaned if cleaned else fallback

    def _read_encrypted_key(self, model_config: dict[str, object] | None, key: str) -> str | None:
        if model_config is None:
            return None
        value = model_config.get(key)
        if value is None and key not in model_config and key in {"llm_api_key", "embedding_api_key"}:
            value = model_config.get("api_key")
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    def _is_same_endpoint(
        self,
        *,
        llm_provider: str,
        llm_base_url: str,
        embedding_provider: str,
        embedding_base_url: str,
    ) -> bool:
        return llm_provider == embedding_provider and llm_base_url == embedding_base_url

    def _mask_api_key(self, api_key: str) -> str:
        trimmed = api_key.strip()
        if len(trimmed) <= 8:
            return f"{trimmed[:2]}***"
        return f"{trimmed[:4]}...{trimmed[-4:]}"


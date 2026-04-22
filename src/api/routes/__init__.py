"""Route object exports."""

from src.api.routes.chat import chat_router
from src.api.routes.graph import graph_router
from src.api.routes.import_jobs import router as imports_router
from src.api.routes.model_config import configuration_router
from src.api.routes.search import search_router
from src.api.routes.sources import source_router
from src.api.routes.system import router as system_router

__all__ = [
    "chat_router",
    "configuration_router",
    "graph_router",
    "imports_router",
    "search_router",
    "source_router",
    "system_router",
]

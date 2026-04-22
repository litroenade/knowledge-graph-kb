"""Route object exports."""

from src.api.routes.chat import chat_router
from src.api.routes.graph import graph_router
from src.api.routes.import_jobs import import_jobs_router
from src.api.routes.model_config import model_config_router
from src.api.routes.search import search_router
from src.api.routes.sources import source_router
from src.api.routes.system import router as system_router

__all__ = [
    "chat_router",
    "graph_router",
    "import_jobs_router",
    "model_config_router",
    "search_router",
    "source_router",
    "system_router",
]

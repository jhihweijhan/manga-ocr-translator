from typing import Any

from fastapi import APIRouter, Depends

from app.api_errors import api_error
from app.ollama_client import OllamaClient, OllamaConnectionError, OllamaTimeoutError

DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_TIMEOUT_SECONDS = 120.0

router = APIRouter()


def get_ollama_client() -> OllamaClient:
    return OllamaClient()


@router.get("/models")
async def list_models(
    base_url: str = DEFAULT_OLLAMA_BASE_URL,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ollama_client: OllamaClient = Depends(get_ollama_client),
) -> dict[str, list[dict[str, Any]]]:
    try:
        models = await ollama_client.list_models(base_url, timeout_seconds)
    except (OllamaTimeoutError, TimeoutError) as exc:
        raise api_error(
            status_code=504,
            code="timeout",
            stage="models",
            message="Timed out while loading the model list from Ollama.",
            details={"reason": str(exc)},
        ) from exc
    except OllamaConnectionError as exc:
        raise api_error(
            status_code=502,
            code="ollama_unreachable",
            stage="models",
            message="Could not reach Ollama while loading the model list.",
            details={"reason": str(exc)},
        ) from exc
    return {"models": models}

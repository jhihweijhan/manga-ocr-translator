import asyncio

import httpx
from app.main import app
from app.ollama_client import OllamaClient, OllamaConnectionError
from app.routes.models import get_ollama_client
from fastapi.testclient import TestClient


class StubOllamaClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, float]] = []

    async def list_models(
        self, base_url: str, timeout_seconds: float
    ) -> list[dict[str, object]]:
        self.calls.append((base_url, timeout_seconds))
        return [
            {
                "name": "gemma3:latest",
                "model": "gemma3:latest",
                "modified_at": "2026-06-05T03:00:00Z",
                "size": 123,
                "details": {"family": "gemma"},
            }
        ]


class FailingOllamaClient:
    async def list_models(
        self, base_url: str, timeout_seconds: float
    ) -> list[dict[str, object]]:
        raise OllamaConnectionError("Connection refused")


class TimeoutOllamaClient:
    async def list_models(
        self, base_url: str, timeout_seconds: float
    ) -> list[dict[str, object]]:
        raise TimeoutError("Timed out")


def test_models_route_proxies_to_ollama_with_requested_base_url() -> None:
    stub = StubOllamaClient()
    app.dependency_overrides[get_ollama_client] = lambda: stub

    try:
        response = TestClient(app).get(
            "/api/models",
            params={
                "base_url": "http://127.0.0.1:11435",
                "timeout_seconds": 9,
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json() == {
        "models": [
            {
                "name": "gemma3:latest",
                "model": "gemma3:latest",
                "modified_at": "2026-06-05T03:00:00Z",
                "size": 123,
                "details": {"family": "gemma"},
            }
        ]
    }
    assert stub.calls == [("http://127.0.0.1:11435", 9.0)]


def test_models_route_returns_common_error_envelope_when_ollama_is_unreachable() -> None:
    app.dependency_overrides[get_ollama_client] = lambda: FailingOllamaClient()

    try:
        response = TestClient(app).get("/api/models")
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "ollama_unreachable",
            "stage": "models",
            "message": "Could not reach Ollama while loading the model list.",
            "details": {"reason": "Connection refused"},
        }
    }


def test_models_route_returns_timeout_error_envelope_when_ollama_times_out() -> None:
    app.dependency_overrides[get_ollama_client] = lambda: TimeoutOllamaClient()

    try:
        response = TestClient(app).get("/api/models")
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 504
    assert response.json() == {
        "error": {
            "code": "timeout",
            "stage": "models",
            "message": "Timed out while loading the model list from Ollama.",
            "details": {"reason": "Timed out"},
        }
    }


def test_ollama_client_wraps_failed_upstream_status_as_connection_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "ollama unavailable"})

    client = OllamaClient(transport=httpx.MockTransport(handler))

    try:
        asyncio.run(client.list_models("http://ollama.test", 120))
    except OllamaConnectionError as exc:
        assert "Server error" in str(exc)
    else:
        raise AssertionError("expected OllamaConnectionError")


def test_ollama_client_rejects_non_object_tags_payload() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    client = OllamaClient(transport=httpx.MockTransport(handler))

    try:
        asyncio.run(client.list_models("http://ollama.test", 120))
    except OllamaConnectionError as exc:
        assert "Expected /api/tags to return a JSON object" in str(exc)
    else:
        raise AssertionError("expected OllamaConnectionError")

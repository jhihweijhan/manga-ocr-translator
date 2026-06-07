import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from app.main import app
from app.ollama_client import OllamaClient
from app.routes.prompts import get_prompt_file_path
from app.routes.translate import (
    ClientDisconnectedError,
    generate_translation_with_disconnect_watch,
    get_ollama_client,
)
from fastapi.testclient import TestClient


class TimeoutOllamaClient:
    async def generate(
        self,
        base_url: str,
        payload: dict[str, object],
        timeout_seconds: float,
    ) -> dict[str, object]:
        raise TimeoutError("Timed out")


def test_translate_route_uses_default_timeout_when_request_omits_timeout(
    tmp_path: Path,
) -> None:
    class CapturingOllamaClient:
        def __init__(self) -> None:
            self.timeout_seconds: float | None = None

        async def generate(
            self,
            base_url: str,
            payload: dict[str, object],
            timeout_seconds: float,
        ) -> dict[str, object]:
            self.timeout_seconds = timeout_seconds
            return {
                "model": "qwen3:latest",
                "response": json.dumps(
                    {"translations": [{"block_id": "block-1", "translated_text": "譯文"}]}
                ),
            }

    ollama_client = CapturingOllamaClient()
    app.dependency_overrides[get_ollama_client] = lambda: ollama_client
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert ollama_client.timeout_seconds == 120.0


def test_translate_route_sends_all_blocks_to_ollama_generate_and_returns_input_order(
    tmp_path: Path,
) -> None:
    captured_requests: list[dict[str, Any]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(
            {
                "method": request.method,
                "path": request.url.path,
                "payload": json.loads(request.content.decode("utf-8")),
            }
        )
        return httpx.Response(
            200,
            json={
                "model": "qwen3:latest",
                "response": json.dumps(
                    {
                        "translations": [
                            {"block_id": "block-2", "translated_text": "第二個譯文"},
                            {"block_id": "block-1", "translated_text": "第一個譯文"},
                        ]
                    }
                ),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "日文",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {
                        "id": "block-1",
                        "source_text": "はい",
                        "confidence": None,
                        "position": None,
                    },
                    {
                        "id": "block-2",
                        "source_text": "はい",
                        "confidence": None,
                        "position": None,
                    },
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json()["translations"] == [
        {"block_id": "block-1", "translated_text": "第一個譯文"},
        {"block_id": "block-2", "translated_text": "第二個譯文"},
    ]
    assert response.json()["prompt"]["source"] == "builtin"
    assert "日文" in response.json()["prompt"]["rendered_user"]
    assert "繁體中文" in response.json()["prompt"]["rendered_user"]
    assert response.json()["raw_model"] == {"model": "qwen3:latest"}

    assert len(captured_requests) == 1
    ollama_request = captured_requests[0]
    assert ollama_request["method"] == "POST"
    assert ollama_request["path"] == "/api/generate"
    payload = ollama_request["payload"]
    assert payload["model"] == "qwen3:latest"
    assert "Return only valid JSON" in payload["system"]
    assert "block-1" in payload["prompt"]
    assert "block-2" in payload["prompt"]
    assert "はい" in payload["prompt"]
    assert payload["stream"] is False
    assert payload["format"]["type"] == "object"
    assert "images" not in payload


def test_translate_route_can_send_direct_text_without_prompt_or_json_format(
    tmp_path: Path,
) -> None:
    captured_requests: list[dict[str, Any]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(
            200,
            json={
                "model": "sugoi-14b:latest",
                "response": json.dumps(
                    {
                        "translations": [
                            {"block_id": "block-2", "translated_text": "第二段譯文"},
                            {"block_id": "block-1", "translated_text": "第一段譯文"},
                        ]
                    }
                ),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "sugoi-14b:latest",
                "translation_prompt_mode": "direct",
                "source_language_hint": "日文",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {
                        "id": "block-1",
                        "source_text": "一つ目",
                        "confidence": None,
                        "position": None,
                    },
                    {
                        "id": "block-2",
                        "source_text": "二つ目",
                        "confidence": None,
                        "position": None,
                    },
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json()["translations"] == [
        {"block_id": "block-1", "translated_text": "第一段譯文"},
        {"block_id": "block-2", "translated_text": "第二段譯文"},
    ]
    assert response.json()["prompt"]["source"] == "direct"
    assert response.json()["prompt"]["rendered_system"] == ""
    assert response.json()["prompt"]["rendered_user"] == "一つ目\n\n二つ目"

    payload = captured_requests[0]
    assert payload["model"] == "sugoi-14b:latest"
    assert payload["prompt"] == "一つ目\n\n二つ目"
    assert payload["stream"] is False
    assert "system" not in payload
    assert "format" not in payload


def test_translate_route_rejects_direct_text_without_block_ids(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "sugoi-14b:latest",
                "response": "第一段譯文\n\n第二段譯文",
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "sugoi-14b:latest",
                "translation_prompt_mode": "direct",
                "source_language_hint": "日文",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {
                        "id": "block-1",
                        "source_text": "一つ目",
                        "confidence": None,
                        "position": None,
                    },
                    {
                        "id": "block-2",
                        "source_text": "二つ目",
                        "confidence": None,
                        "position": None,
                    },
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_rejects_duplicate_translation_block_id(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "qwen3:latest",
                "response": json.dumps(
                    {
                        "translations": [
                            {"block_id": "block-1", "translated_text": "譯文 A"},
                            {"block_id": "block-1", "translated_text": "譯文 B"},
                        ]
                    }
                ),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "同文", "confidence": None, "position": None},
                    {"id": "block-2", "source_text": "同文", "confidence": None, "position": None},
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_rejects_duplicate_input_block_ids_before_model_call(
    tmp_path: Path,
) -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"model": "qwen3:latest", "response": "{}"})

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {
                        "id": "block-1",
                        "source_text": "第一段",
                        "confidence": None,
                        "position": None,
                    },
                    {
                        "id": "block-1",
                        "source_text": "第二段",
                        "confidence": None,
                        "position": None,
                    },
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert response.json()["error"]["stage"] == "translation"
    assert calls == 0


def test_translate_route_rejects_unknown_translation_block_id(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "qwen3:latest",
                "response": json.dumps(
                    {
                        "translations": [
                            {"block_id": "block-1", "translated_text": "譯文 A"},
                            {"block_id": "block-404", "translated_text": "譯文 B"},
                        ]
                    }
                ),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "同文", "confidence": None, "position": None},
                    {"id": "block-2", "source_text": "同文", "confidence": None, "position": None},
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_rejects_count_mismatched_translation_blocks(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "qwen3:latest",
                "response": json.dumps(
                    {"translations": [{"block_id": "block-1", "translated_text": "譯文 A"}]}
                ),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {
                        "id": "block-1",
                        "source_text": "第一段",
                        "confidence": None,
                        "position": None,
                    },
                    {
                        "id": "block-2",
                        "source_text": "第二段",
                        "confidence": None,
                        "position": None,
                    },
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_rejects_missing_translation_block_id(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "qwen3:latest",
                "response": json.dumps({"translations": [{"translated_text": "譯文 A"}]}),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_rejects_invalid_ollama_response_json(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"model": "qwen3:latest", "response": "not json"})

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"
    assert response.json()["error"]["details"]["raw_model_response"] == "not json"


def test_translate_route_returns_timeout_error_envelope(tmp_path: Path) -> None:
    app.dependency_overrides[get_ollama_client] = lambda: TimeoutOllamaClient()
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "timeout"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_returns_model_request_failed_for_upstream_http_error(
    tmp_path: Path,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model not found"})

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "missing-model:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "model_request_failed"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_returns_unreachable_error_for_upstream_connection_error(
    tmp_path: Path,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "ollama_unreachable"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_returns_prompt_error_for_malformed_prompt_template(
    tmp_path: Path,
) -> None:
    prompt_file = tmp_path / "prompts.toml"
    prompt_file.write_text(
        """
[ocr]
system = "OCR system"
user = "OCR user {source_language_hint}"

[translation]
system = "Translation {"
user = "Translation user {target_language}"
""".strip(),
        encoding="utf-8",
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: prompt_file

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "prompt_toml_invalid"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_rejects_non_object_ollama_generate_payload_as_invalid_model_json(
    tmp_path: Path,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_route_rejects_invalid_ollama_generate_json_body_as_invalid_model_json(
    tmp_path: Path,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json")

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/translate",
            json={
                "ollama_base_url": "http://ollama.test",
                "translation_model": "qwen3:latest",
                "source_language_hint": "自動判斷",
                "target_language": "繁體中文",
                "timeout_seconds": 7,
                "blocks": [
                    {"id": "block-1", "source_text": "第一段", "confidence": None, "position": None}
                ],
            },
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "translation"


def test_translate_upstream_task_is_cancelled_when_client_disconnects() -> None:
    class DisconnectingRequest:
        def __init__(self) -> None:
            self.disconnect_checks = 0

        async def is_disconnected(self) -> bool:
            self.disconnect_checks += 1
            return self.disconnect_checks >= 2

    class HangingOllamaClient:
        def __init__(self) -> None:
            self.cancelled = False

        async def generate(
            self,
            base_url: str,
            payload: dict[str, object],
            timeout_seconds: float,
        ) -> dict[str, object]:
            try:
                await asyncio.Future[None]()
            except asyncio.CancelledError:
                self.cancelled = True
                raise
            raise AssertionError("generate should have been cancelled")

    request = DisconnectingRequest()
    ollama_client = HangingOllamaClient()

    with pytest.raises(ClientDisconnectedError):
        asyncio.run(
            generate_translation_with_disconnect_watch(
                request=request,
                ollama_client=ollama_client,
                ollama_base_url="http://ollama.test",
                request_payload={"model": "qwen3:latest"},
                timeout_seconds=120,
                poll_interval_seconds=0,
            )
        )

    assert ollama_client.cancelled is True

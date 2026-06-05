import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ollama_client import OllamaClient
from app.routes.ocr import (
    ClientDisconnectedError,
    generate_ocr_with_disconnect_watch,
    get_ollama_client,
)
from app.routes.prompts import get_prompt_file_path


class TimeoutOllamaClient:
    async def generate(
        self,
        base_url: str,
        payload: dict[str, object],
        timeout_seconds: float,
    ) -> dict[str, object]:
        raise TimeoutError("Timed out")


def test_ocr_route_sends_image_to_ollama_generate_and_returns_text_blocks(
    tmp_path: Path,
) -> None:
    captured_requests: list[dict[str, object]] = []

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
                "model": "gemma3:latest",
                "response": json.dumps(
                    {"blocks": [{"source_text": "こんにちは", "confidence": 0.9}]}
                ),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "日文",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json()["blocks"] == [
        {
            "id": "block-1",
            "source_text": "こんにちは",
            "confidence": 0.9,
            "position": None,
        }
    ]
    assert response.json()["prompt"]["source"] == "builtin"
    assert response.json()["prompt"]["rendered_user"].find("日文") >= 0
    assert response.json()["raw_model"] == {"model": "gemma3:latest"}

    assert len(captured_requests) == 1
    ollama_request = captured_requests[0]
    assert ollama_request["method"] == "POST"
    assert ollama_request["path"] == "/api/generate"
    payload = ollama_request["payload"]
    assert payload["model"] == "gemma3:latest"
    assert "Return only valid JSON" in payload["system"]
    assert "日文" in payload["prompt"]
    assert payload["images"] == ["iVBORw0KGgpzbWFsbA=="]
    assert payload["stream"] is False
    assert payload["format"]["type"] == "object"


def test_ocr_route_uses_plain_text_mode_for_glm_ocr_and_splits_text_blocks(
    tmp_path: Path,
) -> None:
    captured_requests: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(
            200,
            json={
                "model": "glm-ocr:latest",
                "response": (
                    "転生したらスライムだった件\n"
                    "Regarding Reincarnated to Slime\n\n"
                    "ヘチツ\n"
                    "何か\n"
                    "飛んで…？\n\n"
                    "むしみみみ！\n"
                    "ひええええ\n"
                    "わぁあお"
                ),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "glm-ocr:latest",
                "ocr_prompt_mode": "direct",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json()["blocks"] == [
        {
            "id": "block-1",
            "source_text": "転生したらスライムだった件\nRegarding Reincarnated to Slime",
            "confidence": None,
            "position": None,
        },
        {
            "id": "block-2",
            "source_text": "ヘチツ\n何か\n飛んで…？",
            "confidence": None,
            "position": None,
        },
        {
            "id": "block-3",
            "source_text": "むしみみみ！\nひええええ\nわぁあお",
            "confidence": None,
            "position": None,
        },
    ]
    assert response.json()["prompt"]["rendered_system"] == ""
    assert "Extract all readable text" in response.json()["prompt"]["rendered_user"]

    assert len(captured_requests) == 1
    payload = captured_requests[0]
    assert payload["model"] == "glm-ocr:latest"
    assert payload["images"] == ["iVBORw0KGgpzbWFsbA=="]
    assert payload["stream"] is False
    assert "system" not in payload
    assert "format" not in payload


def test_ocr_route_can_force_prompt_mode_for_glm_ocr(tmp_path: Path) -> None:
    captured_requests: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(
            200,
            json={
                "model": "glm-ocr:latest",
                "response": json.dumps({"blocks": [{"source_text": "こんにちは"}]}),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "glm-ocr:latest",
                "ocr_prompt_mode": "prompted",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json()["blocks"][0]["source_text"] == "こんにちは"
    payload = captured_requests[0]
    assert "Return only valid JSON" in payload["system"]
    assert payload["format"]["type"] == "object"


def test_ocr_route_auto_mode_uses_plain_text_mode_for_glm_ocr(tmp_path: Path) -> None:
    captured_requests: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(
            200,
            json={
                "model": "glm-ocr:latest",
                "response": "転生したらスライムだった件\nRegarding Reincarnated to Slime",
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "glm-ocr:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json()["blocks"] == [
        {
            "id": "block-1",
            "source_text": "転生したらスライムだった件\nRegarding Reincarnated to Slime",
            "confidence": None,
            "position": None,
        }
    ]
    payload = captured_requests[0]
    assert payload["model"] == "glm-ocr:latest"
    assert "Extract all readable text" in payload["prompt"]
    assert "system" not in payload
    assert "format" not in payload


def test_ocr_route_uses_default_timeout_when_timeout_is_omitted(tmp_path: Path) -> None:
    class CapturingTimeoutOllamaClient:
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
                "model": "gemma3:latest",
                "response": json.dumps({"blocks": []}),
            }

    ollama_client = CapturingTimeoutOllamaClient()
    app.dependency_overrides[get_ollama_client] = lambda: ollama_client
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert ollama_client.timeout_seconds == 120.0


def test_ocr_route_rejects_unsupported_image_type() -> None:
    response = TestClient(app).post(
        "/api/ocr",
        data={
            "ollama_base_url": "http://ollama.test",
            "ocr_model": "gemma3:latest",
            "source_language_hint": "日文",
            "timeout_seconds": "7",
        },
        files={"image": ("page.gif", b"GIF89a", "image/gif")},
    )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported_image_type"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_rejects_spoofed_image_content_type() -> None:
    response = TestClient(app).post(
        "/api/ocr",
        data={
            "ollama_base_url": "http://ollama.test",
            "ocr_model": "gemma3:latest",
            "source_language_hint": "日文",
            "timeout_seconds": "7",
        },
        files={"image": ("fake.png", b"GIF89a", "image/png")},
    )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported_image_type"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_rejects_images_over_10_mb() -> None:
    ten_mb_plus_one = 10 * 1024 * 1024 + 1
    image_bytes = b"\x89PNG\r\n\x1a\n" + b"x" * (ten_mb_plus_one - 8)
    response = TestClient(app).post(
        "/api/ocr",
        data={
            "ollama_base_url": "http://ollama.test",
            "ocr_model": "gemma3:latest",
            "source_language_hint": "日文",
            "timeout_seconds": "7",
        },
        files={"image": ("page.png", image_bytes, "image/png")},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "image_too_large"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_accepts_empty_blocks_result(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"model": "gemma3:latest", "response": '{"blocks":[]}'})

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.webp", b"RIFFxxxxWEBPsmall", "image/webp")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json()["blocks"] == []


def test_ocr_route_rejects_invalid_ollama_response_json(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"model": "gemma3:latest", "response": "not json"})

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.jpeg", b"\xff\xd8\xffjpeg", "image/jpeg")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_parses_only_ollama_response_field(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "gemma3:latest",
                "blocks": [{"source_text": "should not be parsed"}],
                "response": "not json",
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.jpg", b"\xff\xd8\xffjpeg", "image/jpeg")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"


def test_ocr_route_returns_prompt_toml_error_for_invalid_prompt_config(
    tmp_path: Path,
) -> None:
    prompt_file = tmp_path / "prompts.toml"
    prompt_file.write_text("[ocr]\nsystem = ", encoding="utf-8")
    app.dependency_overrides[get_prompt_file_path] = lambda: prompt_file

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "prompt_toml_invalid"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_returns_prompt_toml_error_for_unknown_prompt_placeholder(
    tmp_path: Path,
) -> None:
    prompt_file = tmp_path / "prompts.toml"
    prompt_file.write_text(
        """
[ocr]
system = "OCR {unknown}"
user = "OCR user {source_language_hint}"

[translation]
system = "Translation system"
user = "Translation user {target_language}"
""".strip(),
        encoding="utf-8",
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: prompt_file

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "prompt_toml_invalid"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_rejects_ocr_json_that_does_not_match_schema(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "gemma3:latest",
                "response": json.dumps({"blocks": [{"confidence": 0.5}]}),
            },
        )

    app.dependency_overrides[get_ollama_client] = lambda: OllamaClient(
        transport=httpx.MockTransport(handler)
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_json"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_returns_timeout_error_envelope(tmp_path: Path) -> None:
    app.dependency_overrides[get_ollama_client] = lambda: TimeoutOllamaClient()
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).post(
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "gemma3:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "timeout"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_returns_model_request_failed_for_upstream_http_error(
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
            "/api/ocr",
            data={
                "ollama_base_url": "http://ollama.test",
                "ocr_model": "missing-model:latest",
                "source_language_hint": "自動判斷",
                "timeout_seconds": "7",
            },
            files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
        )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "model_request_failed"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_route_returns_common_error_envelope_for_invalid_form_data() -> None:
    response = TestClient(app).post(
        "/api/ocr",
        data={
            "ollama_base_url": "http://ollama.test",
            "ocr_model": "gemma3:latest",
            "source_language_hint": "日文",
            "timeout_seconds": "not-a-number",
        },
        files={"image": ("page.png", b"\x89PNG\r\n\x1a\nsmall", "image/png")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert response.json()["error"]["stage"] == "ocr"


def test_ocr_upstream_task_is_cancelled_when_client_disconnects() -> None:
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
                await asyncio.Future()
            except asyncio.CancelledError:
                self.cancelled = True
                raise

    request = DisconnectingRequest()
    ollama_client = HangingOllamaClient()

    with pytest.raises(ClientDisconnectedError):
        asyncio.run(
            generate_ocr_with_disconnect_watch(
                request=request,
                ollama_client=ollama_client,
                ollama_base_url="http://ollama.test",
                request_payload={"model": "gemma3:latest"},
                timeout_seconds=120,
                poll_interval_seconds=0,
            )
        )

    assert ollama_client.cancelled is True

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.routes.prompts import get_prompt_file_path


def test_prompts_route_returns_builtin_templates_when_prompts_toml_is_absent(
    tmp_path: Path,
) -> None:
    app.dependency_overrides[get_prompt_file_path] = lambda: tmp_path / "prompts.toml"

    try:
        response = TestClient(app).get("/api/prompts")
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "builtin"
    assert "Return only valid JSON" in payload["ocr"]["system"]
    assert "{source_language_hint}" in payload["ocr"]["user"]
    assert "{target_language}" in payload["translation"]["user"]


def test_prompts_route_returns_templates_from_prompts_toml(tmp_path: Path) -> None:
    prompt_file = tmp_path / "prompts.toml"
    prompt_file.write_text(
        """
[ocr]
system = "Custom OCR system"
user = "Custom OCR user {source_language_hint}"

[translation]
system = "Custom translation system"
user = "Custom translation user {target_language}"
""".strip(),
        encoding="utf-8",
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: prompt_file

    try:
        response = TestClient(app).get("/api/prompts")
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 200
    assert response.json() == {
        "source": "toml",
        "ocr": {
            "system": "Custom OCR system",
            "user": "Custom OCR user {source_language_hint}",
        },
        "translation": {
            "system": "Custom translation system",
            "user": "Custom translation user {target_language}",
        },
    }


def test_prompts_route_returns_common_error_envelope_for_invalid_toml(
    tmp_path: Path,
) -> None:
    prompt_file = tmp_path / "prompts.toml"
    prompt_file.write_text("[ocr]\nsystem = ", encoding="utf-8")
    app.dependency_overrides[get_prompt_file_path] = lambda: prompt_file

    try:
        response = TestClient(app).get("/api/prompts")
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "prompt_toml_invalid"
    assert payload["error"]["stage"] == "prompts"
    assert payload["error"]["message"] == "prompts.toml could not be parsed."
    assert "reason" in payload["error"]["details"]


def test_prompts_route_returns_common_error_envelope_for_missing_required_fields(
    tmp_path: Path,
) -> None:
    prompt_file = tmp_path / "prompts.toml"
    prompt_file.write_text(
        """
[ocr]
system = "Only OCR system"
""".strip(),
        encoding="utf-8",
    )
    app.dependency_overrides[get_prompt_file_path] = lambda: prompt_file

    try:
        response = TestClient(app).get("/api/prompts")
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "prompt_toml_invalid"
    assert payload["error"]["stage"] == "prompts"
    assert "reason" in payload["error"]["details"]

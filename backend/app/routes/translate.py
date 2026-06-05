import asyncio
import contextlib
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.api_errors import api_error
from app.ollama_client import (
    OllamaClient,
    OllamaConnectionError,
    OllamaInvalidResponseError,
    OllamaRequestError,
    OllamaTimeoutError,
)
from app.prompts import PromptTomlInvalidError, load_prompt_templates
from app.routes.models import DEFAULT_OLLAMA_BASE_URL, DEFAULT_TIMEOUT_SECONDS
from app.routes.prompts import get_prompt_file_path

TRANSLATION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "translations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "block_id": {"type": "string"},
                    "translated_text": {"type": "string"},
                },
                "required": ["block_id", "translated_text"],
            },
        }
    },
    "required": ["translations"],
}

router = APIRouter()


class ClientDisconnectedError(Exception):
    pass


class TextBlockRequest(BaseModel):
    id: str
    source_text: str
    confidence: float | None = None
    position: Any = None


class TranslateRequest(BaseModel):
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL
    translation_model: str
    translation_prompt_mode: str = "prompted"
    source_language_hint: str = "自動判斷"
    target_language: str = "繁體中文"
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS
    blocks: list[TextBlockRequest]


def get_ollama_client() -> OllamaClient:
    return OllamaClient()


@router.post("/translate")
async def translate_blocks(
    http_request: Request,
    request: TranslateRequest,
    ollama_client: OllamaClient = Depends(get_ollama_client),
    prompt_file_path: Path = Depends(get_prompt_file_path),
) -> dict[str, Any]:
    if request.translation_prompt_mode not in {"prompted", "direct"}:
        raise api_error(
            status_code=422,
            code="invalid_request",
            stage="translation",
            message="Request did not match the expected API contract.",
            details={"reason": "translation_prompt_mode must be direct or prompted."},
        )

    block_ids = [block.id for block in request.blocks]
    if len(block_ids) != len(set(block_ids)):
        raise api_error(
            status_code=422,
            code="invalid_request",
            stage="translation",
            message="Request did not match the expected API contract.",
            details={"reason": "Input text block IDs must be unique."},
        )

    if request.translation_prompt_mode == "direct":
        prompt_source = "direct"
        system_template = ""
        user_template = ""
        rendered_system = ""
        rendered_user = "\n\n".join(block.source_text for block in request.blocks)
        request_payload = {
            "model": request.translation_model,
            "prompt": rendered_user,
            "stream": False,
        }
    else:
        try:
            prompt_templates = load_prompt_templates(prompt_file_path)
        except PromptTomlInvalidError as exc:
            raise api_error(
                status_code=400,
                code="prompt_toml_invalid",
                stage="translation",
                message="prompts.toml could not be parsed.",
                details={"reason": str(exc)},
            ) from exc

        text_blocks = json.dumps(
            [{"block_id": block.id, "source_text": block.source_text} for block in request.blocks],
            ensure_ascii=False,
        )
        try:
            rendered_system = prompt_templates.translation["system"].format(
                source_language_hint=request.source_language_hint,
                target_language=request.target_language,
                json_schema=json.dumps(TRANSLATION_JSON_SCHEMA, ensure_ascii=False),
                text_blocks=text_blocks,
            )
            rendered_user = prompt_templates.translation["user"].format(
                source_language_hint=request.source_language_hint,
                target_language=request.target_language,
                json_schema=json.dumps(TRANSLATION_JSON_SCHEMA, ensure_ascii=False),
                text_blocks=text_blocks,
            )
        except (KeyError, ValueError) as exc:
            raise api_error(
                status_code=400,
                code="prompt_toml_invalid",
                stage="translation",
                message="prompts.toml could not be parsed.",
                details={"reason": f"Unknown prompt variable: {exc}"},
            ) from exc
        prompt_source = prompt_templates.source
        system_template = prompt_templates.translation["system"]
        user_template = prompt_templates.translation["user"]
        request_payload = {
            "model": request.translation_model,
            "system": rendered_system,
            "prompt": rendered_user,
            "format": TRANSLATION_JSON_SCHEMA,
            "stream": False,
        }

    try:
        raw_model = await generate_translation_with_disconnect_watch(
            request=http_request,
            ollama_client=ollama_client,
            ollama_base_url=request.ollama_base_url,
            request_payload=request_payload,
            timeout_seconds=request.timeout_seconds,
        )
    except ClientDisconnectedError as exc:
        raise api_error(
            status_code=499,
            code="client_disconnected",
            stage="translation",
            message="Client disconnected before translation completed.",
            details={},
        ) from exc
    except (OllamaTimeoutError, TimeoutError) as exc:
        raise api_error(
            status_code=504,
            code="timeout",
            stage="translation",
            message="Timed out while waiting for translation from Ollama.",
            details={"reason": str(exc)},
        ) from exc
    except OllamaRequestError as exc:
        raise api_error(
            status_code=502,
            code="model_request_failed",
            stage="translation",
            message="Ollama rejected the translation model request.",
            details={"reason": str(exc)},
        ) from exc
    except OllamaInvalidResponseError as exc:
        raise _invalid_translation_json(str(exc)) from exc
    except OllamaConnectionError as exc:
        raise api_error(
            status_code=502,
            code="ollama_unreachable",
            stage="translation",
            message="Could not reach Ollama while running translation.",
            details={"reason": str(exc)},
        ) from exc

    translations = _parse_translations(raw_model, request.blocks)
    return {
        "translations": translations,
        "prompt": {
            "source": prompt_source,
            "system_template": system_template,
            "user_template": user_template,
            "rendered_system": rendered_system,
            "rendered_user": rendered_user,
        },
        "raw_model": {"model": raw_model.get("model", request.translation_model)},
    }


async def generate_translation_with_disconnect_watch(
    *,
    request: Request,
    ollama_client: OllamaClient,
    ollama_base_url: str,
    request_payload: dict[str, Any],
    timeout_seconds: float,
    poll_interval_seconds: float = 0.1,
) -> dict[str, Any]:
    generate_task = asyncio.create_task(
        ollama_client.generate(ollama_base_url, request_payload, timeout_seconds)
    )
    try:
        while True:
            done, _pending = await asyncio.wait({generate_task}, timeout=poll_interval_seconds)
            if done:
                return await generate_task
            if await request.is_disconnected():
                generate_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await generate_task
                raise ClientDisconnectedError
    except asyncio.CancelledError:
        generate_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await generate_task
        raise


def _parse_translations(
    raw_model: dict[str, Any], blocks: list[TextBlockRequest]
) -> list[dict[str, str]]:
    response_text = raw_model.get("response")
    if not isinstance(response_text, str):
        raise _invalid_translation_json("Ollama response field must be a JSON string.")
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise _invalid_translation_json(str(exc)) from exc

    if not isinstance(payload, dict) or not isinstance(payload.get("translations"), list):
        raise _invalid_translation_json("Expected object with translations array.")

    block_ids = [block.id for block in blocks]
    expected_block_ids = set(block_ids)
    if len(payload["translations"]) != len(block_ids):
        raise _invalid_translation_json("Translation count must match input text block count.")
    by_block_id: dict[str, str] = {}
    for translation in payload["translations"]:
        if not isinstance(translation, dict):
            raise _invalid_translation_json("Each translation must be an object.")
        block_id = translation.get("block_id")
        translated_text = translation.get("translated_text")
        if not isinstance(block_id, str) or not isinstance(translated_text, str):
            raise _invalid_translation_json(
                "Each translation must include block_id and translated_text."
            )
        if block_id in by_block_id:
            raise _invalid_translation_json("Translation block_id values must be unique.")
        if block_id not in expected_block_ids:
            raise _invalid_translation_json("Translation block_id must match an input text block.")
        by_block_id[block_id] = translated_text

    return [
        {"block_id": block_id, "translated_text": by_block_id[block_id]} for block_id in block_ids
    ]


def _invalid_translation_json(reason: str):
    return api_error(
        status_code=502,
        code="invalid_model_json",
        stage="translation",
        message="Model response did not match the expected JSON schema.",
        details={"reason": reason},
    )

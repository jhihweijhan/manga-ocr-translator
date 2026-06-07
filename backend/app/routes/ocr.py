import asyncio
import base64
import contextlib
import json
from pathlib import Path
from typing import Annotated, Any, Protocol

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

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

MAX_IMAGE_BYTES = 10 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}

OCR_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_text": {"type": "string"},
                    "confidence": {"type": ["number", "null"]},
                },
                "required": ["source_text"],
            },
        }
    },
    "required": ["blocks"],
}
GLM_OCR_PROMPT = "Extract all readable text from the image. Do not translate."

router = APIRouter()


class ClientDisconnectedError(Exception):
    pass


class DisconnectAwareRequest(Protocol):
    async def is_disconnected(self) -> bool: ...


class OllamaGenerateClient(Protocol):
    async def generate(
        self,
        base_url: str,
        payload: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]: ...


def get_ollama_client() -> OllamaClient:
    return OllamaClient()


@router.post("/ocr")
async def run_ocr(
    request: Request,
    image: Annotated[UploadFile, File()],
    ollama_base_url: Annotated[str, Form()] = DEFAULT_OLLAMA_BASE_URL,
    ocr_model: Annotated[str, Form()] = "",
    ocr_prompt_mode: Annotated[str, Form()] = "auto",
    source_language_hint: Annotated[str, Form()] = "自動判斷",
    timeout_seconds: Annotated[float, Form()] = DEFAULT_TIMEOUT_SECONDS,
    ollama_client: OllamaClient = Depends(get_ollama_client),
    prompt_file_path: Path = Depends(get_prompt_file_path),
) -> dict[str, Any]:
    effective_prompt_mode = _resolve_ocr_prompt_mode(ocr_model, ocr_prompt_mode)
    if image.content_type not in SUPPORTED_IMAGE_TYPES:
        raise api_error(
            status_code=415,
            code="unsupported_image_type",
            stage="ocr",
            message="Only PNG, JPEG, and WebP images are supported.",
            details={"content_type": image.content_type},
        )

    image_bytes = await image.read()
    if not _matches_image_type(image.content_type, image_bytes):
        raise api_error(
            status_code=415,
            code="unsupported_image_type",
            stage="ocr",
            message="Only PNG, JPEG, and WebP images are supported.",
            details={"content_type": image.content_type},
        )

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise api_error(
            status_code=413,
            code="image_too_large",
            stage="ocr",
            message="Image must be 10 MB or smaller.",
            details={"max_bytes": MAX_IMAGE_BYTES},
        )

    if effective_prompt_mode == "direct":
        prompt_source = "direct"
        system_template = ""
        user_template = ""
        rendered_system = ""
        rendered_user = GLM_OCR_PROMPT
        request_payload = {
            "model": ocr_model,
            "prompt": rendered_user,
            "images": [base64.b64encode(image_bytes).decode("ascii")],
            "stream": False,
        }
    else:
        try:
            prompt_templates = load_prompt_templates(prompt_file_path)
        except PromptTomlInvalidError as exc:
            raise api_error(
                status_code=400,
                code="prompt_toml_invalid",
                stage="ocr",
                message="prompts.toml could not be parsed.",
                details={"reason": str(exc)},
            ) from exc

        try:
            rendered_system = prompt_templates.ocr["system"].format(
                source_language_hint=source_language_hint,
                target_language="",
                json_schema=json.dumps(OCR_JSON_SCHEMA, ensure_ascii=False),
                text_blocks="",
            )
            rendered_user = prompt_templates.ocr["user"].format(
                source_language_hint=source_language_hint,
                target_language="",
                json_schema=json.dumps(OCR_JSON_SCHEMA, ensure_ascii=False),
                text_blocks="",
            )
        except KeyError as exc:
            raise api_error(
                status_code=400,
                code="prompt_toml_invalid",
                stage="ocr",
                message="prompts.toml could not be parsed.",
                details={"reason": f"Unknown prompt variable: {exc}"},
            ) from exc
        prompt_source = prompt_templates.source
        system_template = prompt_templates.ocr["system"]
        user_template = prompt_templates.ocr["user"]
        request_payload = {
            "model": ocr_model,
            "system": rendered_system,
            "prompt": rendered_user,
            "images": [base64.b64encode(image_bytes).decode("ascii")],
            "format": OCR_JSON_SCHEMA,
            "stream": False,
        }

    try:
        raw_model = await generate_ocr_with_disconnect_watch(
            request=request,
            ollama_client=ollama_client,
            ollama_base_url=ollama_base_url,
            request_payload=request_payload,
            timeout_seconds=timeout_seconds,
        )
    except ClientDisconnectedError as exc:
        raise api_error(
            status_code=499,
            code="client_disconnected",
            stage="ocr",
            message="Client disconnected before OCR completed.",
            details={},
        ) from exc
    except (OllamaTimeoutError, TimeoutError) as exc:
        raise api_error(
            status_code=504,
            code="timeout",
            stage="ocr",
            message="Timed out while waiting for OCR from Ollama.",
            details={"reason": str(exc)},
        ) from exc
    except OllamaRequestError as exc:
        raise api_error(
            status_code=502,
            code="model_request_failed",
            stage="ocr",
            message="Ollama rejected the OCR model request.",
            details={"reason": str(exc)},
        ) from exc
    except OllamaInvalidResponseError as exc:
        raise api_error(
            status_code=502,
            code="invalid_model_json",
            stage="ocr",
            message="Model response did not match the expected JSON schema.",
            details={"reason": str(exc)},
        ) from exc
    except OllamaConnectionError as exc:
        raise api_error(
            status_code=502,
            code="ollama_unreachable",
            stage="ocr",
            message="Could not reach Ollama while running OCR.",
            details={"reason": str(exc)},
        ) from exc

    blocks = (
        _parse_plain_text_ocr_blocks(raw_model)
        if effective_prompt_mode == "direct"
        else _parse_ocr_blocks(raw_model)
    )
    return {
        "blocks": blocks,
        "prompt": {
            "source": prompt_source,
            "system_template": system_template,
            "user_template": user_template,
            "rendered_system": rendered_system,
            "rendered_user": rendered_user,
        },
        "raw_model": {"model": raw_model.get("model", ocr_model)},
    }


def _resolve_ocr_prompt_mode(ocr_model: str, requested_prompt_mode: str) -> str:
    if requested_prompt_mode == "direct":
        return "direct"
    if requested_prompt_mode == "prompted":
        return "prompted"
    if requested_prompt_mode == "auto":
        return "direct" if ocr_model.split(":", 1)[0].lower() == "glm-ocr" else "prompted"
    raise api_error(
        status_code=422,
        code="invalid_request",
        stage="ocr",
        message="Request did not match the expected API contract.",
        details={"reason": "ocr_prompt_mode must be direct, prompted, or auto."},
    )


async def generate_ocr_with_disconnect_watch(
    *,
    request: DisconnectAwareRequest,
    ollama_client: OllamaGenerateClient,
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


def _parse_ocr_blocks(raw_model: dict[str, Any]) -> list[dict[str, Any]]:
    response_text = raw_model.get("response")
    if not isinstance(response_text, str):
        raise api_error(
            status_code=502,
            code="invalid_model_json",
            stage="ocr",
            message="Model response did not match the expected JSON schema.",
            details={"reason": "Ollama response field must be a JSON string."},
        )
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise api_error(
            status_code=502,
            code="invalid_model_json",
            stage="ocr",
            message="Model response did not match the expected JSON schema.",
            details={"reason": str(exc)},
        ) from exc

    if not isinstance(payload, dict) or not isinstance(payload.get("blocks"), list):
        raise api_error(
            status_code=502,
            code="invalid_model_json",
            stage="ocr",
            message="Model response did not match the expected JSON schema.",
            details={"reason": "Expected object with blocks array."},
        )

    blocks: list[dict[str, Any]] = []
    for index, block in enumerate(payload["blocks"], start=1):
        if not isinstance(block, dict) or not isinstance(block.get("source_text"), str):
            raise api_error(
                status_code=502,
                code="invalid_model_json",
                stage="ocr",
                message="Model response did not match the expected JSON schema.",
                details={"reason": "Each block must include source_text."},
            )
        confidence = block.get("confidence")
        if confidence is not None and not isinstance(confidence, int | float):
            raise api_error(
                status_code=502,
                code="invalid_model_json",
                stage="ocr",
                message="Model response did not match the expected JSON schema.",
                details={"reason": "Block confidence must be a number or null."},
            )
        blocks.append(
            {
                "id": f"block-{index}",
                "source_text": block["source_text"],
                "confidence": confidence,
                "position": None,
            }
        )
    return blocks


def _parse_plain_text_ocr_blocks(raw_model: dict[str, Any]) -> list[dict[str, Any]]:
    response_text = raw_model.get("response")
    if not isinstance(response_text, str):
        raise api_error(
            status_code=502,
            code="invalid_model_json",
            stage="ocr",
            message="Model response did not match the expected JSON schema.",
            details={"reason": "Ollama response field must be a string."},
        )

    text_blocks = [
        block.strip()
        for block in response_text.replace("\r\n", "\n").split("\n\n")
        if block.strip()
    ]
    return [
        {
            "id": f"block-{index}",
            "source_text": block,
            "confidence": None,
            "position": None,
        }
        for index, block in enumerate(text_blocks, start=1)
    ]


def _matches_image_type(content_type: str | None, image_bytes: bytes) -> bool:
    if content_type == "image/png":
        return image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return image_bytes.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP"
    return False

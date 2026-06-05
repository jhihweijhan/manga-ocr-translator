import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PromptTemplates:
    source: str
    ocr: dict[str, str]
    translation: dict[str, str]


class PromptTomlInvalidError(Exception):
    pass


BUILTIN_PROMPTS = PromptTemplates(
    source="builtin",
    ocr={
        "system": (
            "You are an OCR engine for manga and illustrated images.\n"
            "Return only valid JSON that matches the provided schema.\n"
            "Do not translate the text.\n"
            "Do not add commentary, markdown, or explanations."
        ),
        "user": (
            "Extract readable text from the image.\n"
            "Source language hint: {source_language_hint}\n\n"
            "Return the result as JSON using this schema:\n"
            "{json_schema}\n\n"
            "Each block should contain one independently translatable text fragment.\n"
            "If the image has no readable text, return an empty blocks array."
        ),
    },
    translation={
        "system": (
            "You are a professional manga translator.\n"
            "Return only valid JSON that matches the provided schema.\n"
            "Do not add commentary, markdown, or explanations.\n"
            "Preserve the input block order."
        ),
        "user": (
            "Translate all text blocks into {target_language}.\n"
            "Source language hint: {source_language_hint}\n\n"
            "Text blocks:\n"
            "{text_blocks}\n\n"
            "Return the result as JSON using this schema:\n"
            "{json_schema}\n\n"
            "Each translation must include the source block_id and translated_text.\n"
            "Do not invent, omit, duplicate, or reorder block_id values."
        ),
    },
)


def load_prompt_templates(prompt_file_path: Path) -> PromptTemplates:
    if not prompt_file_path.exists():
        return BUILTIN_PROMPTS
    try:
        payload = tomllib.loads(prompt_file_path.read_text(encoding="utf-8"))
        ocr = _prompt_section(payload, "ocr")
        translation = _prompt_section(payload, "translation")
    except tomllib.TOMLDecodeError as exc:
        raise PromptTomlInvalidError(str(exc)) from exc
    except (KeyError, TypeError) as exc:
        raise PromptTomlInvalidError(f"Missing required prompt field: {exc}") from exc
    return PromptTemplates(
        source="toml",
        ocr=ocr,
        translation=translation,
    )


def _prompt_section(payload: dict[str, object], section: str) -> dict[str, str]:
    section_payload = payload[section]
    if not isinstance(section_payload, dict):
        raise TypeError(section)
    system = section_payload["system"]
    user = section_payload["user"]
    if not isinstance(system, str) or not isinstance(user, str):
        raise TypeError(section)
    return {"system": system, "user": user}

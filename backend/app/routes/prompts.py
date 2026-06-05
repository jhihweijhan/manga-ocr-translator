from pathlib import Path

from fastapi import APIRouter, Depends

from app.api_errors import api_error
from app.prompts import PromptTemplates, PromptTomlInvalidError, load_prompt_templates

router = APIRouter()


def get_prompt_file_path() -> Path:
    return Path("prompts.toml")


@router.get("/prompts")
async def inspect_prompts(
    prompt_file_path: Path = Depends(get_prompt_file_path),
) -> PromptTemplates:
    try:
        return load_prompt_templates(prompt_file_path)
    except PromptTomlInvalidError as exc:
        raise api_error(
            status_code=400,
            code="prompt_toml_invalid",
            stage="prompts",
            message="prompts.toml could not be parsed.",
            details={"reason": str(exc)},
        ) from exc

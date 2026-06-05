from typing import Any

from fastapi import HTTPException


def api_error(
    *,
    status_code: int,
    code: str,
    stage: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "error": {
                "code": code,
                "stage": stage,
                "message": message,
                "details": details or {},
            }
        },
    )

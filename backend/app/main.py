from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.routes.models import router as models_router
from app.routes.ocr import router as ocr_router
from app.routes.prompts import router as prompts_router
from app.routes.translate import router as translate_router

app = FastAPI(title="Manga OCR Translator")
app.include_router(models_router, prefix="/api")
app.include_router(ocr_router, prefix="/api")
app.include_router(prompts_router, prefix="/api")
app.include_router(translate_router, prefix="/api")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "stage": _stage_from_path(request.url.path),
                "message": "Request did not match the expected API contract.",
                "details": {"errors": exc.errors()},
            }
        },
    )


def _stage_from_path(path: str) -> str:
    if path.startswith("/api/ocr"):
        return "ocr"
    if path.startswith("/api/models"):
        return "models"
    if path.startswith("/api/prompts"):
        return "prompts"
    if path.startswith("/api/translate"):
        return "translation"
    return "unknown"

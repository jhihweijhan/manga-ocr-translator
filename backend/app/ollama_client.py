from typing import Any

import httpx


class OllamaConnectionError(Exception):
    pass


class OllamaTimeoutError(Exception):
    pass


class OllamaRequestError(Exception):
    pass


class OllamaInvalidResponseError(Exception):
    pass


class OllamaClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def list_models(self, base_url: str, timeout_seconds: float) -> list[dict[str, Any]]:
        try:
            async with httpx.AsyncClient(
                timeout=timeout_seconds, transport=self._transport
            ) as client:
                response = await client.get(f"{base_url.rstrip('/')}/api/tags")
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise OllamaConnectionError("Expected /api/tags to return a JSON object.")
                models = payload.get("models", [])
                if not isinstance(models, list):
                    return []
                return models
        except httpx.TimeoutException as exc:
            raise OllamaTimeoutError(str(exc)) from exc
        except OllamaConnectionError:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise OllamaConnectionError(str(exc)) from exc

    async def generate(
        self,
        base_url: str,
        payload: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                timeout=timeout_seconds, transport=self._transport
            ) as client:
                response = await client.post(f"{base_url.rstrip('/')}/api/generate", json=payload)
                response.raise_for_status()
                try:
                    generated = response.json()
                except ValueError as exc:
                    raise OllamaInvalidResponseError(
                        "Expected /api/generate to return valid JSON."
                    ) from exc
                if not isinstance(generated, dict):
                    raise OllamaInvalidResponseError(
                        "Expected /api/generate to return a JSON object."
                    )
                return generated
        except httpx.TimeoutException as exc:
            raise OllamaTimeoutError(str(exc)) from exc
        except httpx.HTTPStatusError as exc:
            raise OllamaRequestError(str(exc)) from exc
        except OllamaConnectionError:
            raise
        except OllamaInvalidResponseError:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise OllamaConnectionError(str(exc)) from exc

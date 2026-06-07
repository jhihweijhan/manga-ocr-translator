# Stream Progress With Complete Results

Status: Proposed（尚未實作）

This ADR proposes using Ollama streaming only as a progress signal for long OCR and translation requests. The current implemented main flow remains the complete-response `/api/ocr` and `/api/translate` flow from ADR 0004. In the proposed future flow, the backend may call Ollama `/api/generate` with `stream: true`, consume newline-delimited JSON chunks, and emit progress events to the WebUI while it accumulates the `response` fragments. OCR blocks and translations remain unavailable to the WebUI until the backend receives the complete upstream response and validates the accumulated model output against the same structured-result contracts.

This keeps ADR 0003 and ADR 0004 intact: malformed model JSON is still rejected, no best-effort repair is introduced, and partial model output is never treated as a valid OCR or translation result. Streaming progress is non-authoritative UI feedback, not a data contract for blocks, translations, or `block_id` mapping.

The proposed WebUI flow would use POST streaming endpoints so OCR can still upload multipart image data and translation can still send the full JSON body without creating server-side task history. The backend would return `text/event-stream` events over the POST response. Browsers should read these responses with `fetch` and `ReadableStream`; `EventSource` is not required because it cannot send the existing POST request bodies.

If this proposal is implemented and the client cancels or disconnects, the backend must stop the response stream and cancel the upstream Ollama request. A completed stream ends with exactly one terminal application event: `result` with the same validated payload as the non-streaming endpoint, or `error` with the standard error envelope. A cancelled client-side request does not need an application terminal event because the browser has already aborted the response.

# Proxy Ollama Through a Local Backend

The browser-based UI calls a local application backend, and that backend calls the local Ollama server. This keeps Ollama request shaping, structured-result validation, upload limits, cancellation handling, and error normalization out of the browser while preserving the requirement that model execution stays local.

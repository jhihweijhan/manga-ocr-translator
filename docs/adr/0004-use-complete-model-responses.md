# Use Complete Model Responses

The first version waits for complete Ollama responses instead of streaming partial output. Structured OCR and translation results are only useful to the WebUI once the full JSON payload can be validated, so streaming would add intermediate states without improving the core workflow.

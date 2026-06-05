# Use Structured Model Results

OCR and translation calls to local Ollama models must return structured results instead of free-form prose. The WebUI needs stable text blocks and matching translations for display, quality checking, and reprocessing; parsing unconstrained model text would make the core workflow brittle.

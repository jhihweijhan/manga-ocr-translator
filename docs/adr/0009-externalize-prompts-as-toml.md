# Externalize Prompts as TOML

OCR and translation prompts are stored in an external TOML configuration file instead of being hidden in application code. Users need to inspect and tune the exact instructions sent to local models, and prompt behavior can vary significantly across Ollama models. The backend reloads this file for each OCR or translation request so prompt edits affect the next run without restarting the application, and the WebUI displays the effective prompt content whether it comes from `prompts.toml` or built-in defaults.

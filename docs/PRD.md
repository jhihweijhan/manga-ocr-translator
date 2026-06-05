## Problem Statement

Users who want to translate manga or illustrated image text with local models need a simple, inspectable workflow. Existing ad hoc model calls make it hard to choose separate OCR and translation models, see the exact prompts being sent, correct OCR mistakes, understand failures, or export structured results for later review.

## Solution

Build a local-first manga OCR translator that lets a user upload one image, select an OCR model and a translation model from their local Ollama model list, automatically run OCR and translation, inspect OCR text beside target-language translations, correct OCR text, rerun translation, and export a structured JSON result. The app must expose the effective prompt templates and per-run rendered prompts so users can understand and tune model behavior.

## User Stories

1. As a manga reader, I want to upload a single manga image, so that I can extract and translate the text on that page.
2. As a manga reader, I want PNG, JPEG, and WebP support, so that common manga image formats work without conversion.
3. As a manga reader, I want oversized images rejected before processing, so that I do not accidentally send slow or unstable requests to local models.
4. As a local model user, I want the app to default to `http://127.0.0.1:11434`, so that it works with a standard local Ollama install.
5. As a local model user, I want to change the Ollama base URL, so that I can use a different port, host mapping, or proxy.
6. As a local model user, I want the app to load the Ollama model list automatically, so that I can choose from models actually installed locally.
7. As a local model user, I want a manual model-list refresh action, so that I can start Ollama or pull models and update the UI without reloading the page.
8. As a local model user, I want clear feedback when Ollama is unreachable, so that I know the problem is local connectivity rather than my image.
9. As a manga translator, I want separate OCR model and translation model selectors, so that I can use a vision-capable model for OCR and a stronger language model for translation.
10. As a manga translator, I want the app not to guess model capability, so that a wrong automatic choice does not silently produce bad results.
11. As a repeat user, I want the app to remember my last Ollama URL, model choices, language settings, and timeout, so that I do not need to reconfigure every session.
12. As a first-time user, I want model selectors to remain unselected until I choose models, so that the app does not pick an unsuitable model for me.
13. As a manga translator, I want a source language hint, so that I can give the models a clue when the source language is known.
14. As a manga translator, I want the source language hint to default to automatic detection, so that mixed or unknown text can still be processed.
15. As a manga translator, I want the source language hint treated as a prompt hint rather than a guaranteed model feature, so that models like OCR-specialized models are not assumed to support language controls.
16. As a manga translator, I want to choose a target language, so that I can translate into Traditional Chinese by default but switch to Simplified Chinese, English, Japanese, or Korean.
17. As a manga translator, I want uploading a ready-to-process image to automatically run OCR and translation, so that the common path is fast.
18. As a manga translator, I want the app to wait until required models are selected before auto-processing, so that upload order and model selection order both work.
19. As a manga translator, I want setting changes after completion not to automatically rerun processing, so that I control when local model resources are used.
20. As a manga translator, I want OCR output as text blocks, so that each independently translatable fragment can be reviewed.
21. As a manga translator, I want text blocks to work without position data, so that first-version OCR does not depend on text-region detection.
22. As a manga translator, I want each translated block tied to a stable block ID, so that duplicate source text cannot be matched to the wrong translation.
23. As a manga translator, I want translations displayed next to OCR source text, so that I can compare quality quickly.
24. As a manga translator, I want OCR source text to be editable, so that I can fix recognition mistakes.
25. As a manga translator, I want editing OCR text not to auto-translate immediately, so that I can make several corrections before spending local model time.
26. As a manga translator, I want a retranslate action that uses the current text blocks, so that I can regenerate translations without rerunning OCR.
27. As a manga translator, I want a reprocess action that reruns OCR and translation, so that I can try another OCR model or prompt.
28. As a manga translator, I want target-language changes to prefer retranslation, so that OCR is not rerun unnecessarily.
29. As a manga translator, I want source-language hint changes to allow either reprocessing or retranslating, so that I can choose based on whether OCR or only translation should change.
30. As a manga translator, I want OCR failure to stop the workflow before translation, so that translation is not attempted on missing or invalid OCR text.
31. As a manga translator, I want translation failure to preserve OCR text blocks, so that I can adjust the translation model or prompt without losing OCR work.
32. As a manga translator, I want OCR success with zero text blocks to complete with an empty result, so that images with no readable text are handled cleanly.
33. As a local model user, I want invalid model JSON treated as a stage failure, so that the app does not guess and display unreliable results.
34. As a local model user, I want model responses processed only after complete JSON is available, so that partial streaming text does not produce unstable UI states.
35. As a local model user, I want a configurable timeout with a 120-second default, so that slow first model loads are tolerated but requests do not hang forever.
36. As a local model user, I want a cancel action during OCR or translation, so that I can stop a slow local model run.
37. As a local model user, I want cancelling OCR to clear unfinished OCR and translation results, so that stale partial data is not mistaken for current output.
38. As a local model user, I want cancelling translation to preserve completed OCR blocks, so that I can retry translation without losing OCR work.
39. As a local model user, I want stale responses ignored after cancellation or reprocessing, so that old requests cannot overwrite the current task.
40. As a prompt tuner, I want OCR and translation prompt templates stored in `prompts.toml`, so that prompts are visible outside the code.
41. As a prompt tuner, I want built-in default prompts when `prompts.toml` is absent, so that the first run works without configuration.
42. As a prompt tuner, I want TOML syntax errors to fail clearly, so that I know my prompt configuration needs correction.
43. As a prompt tuner, I want the WebUI to show effective prompt templates and their source, so that I know whether the app uses TOML or defaults.
44. As a prompt tuner, I want OCR and translation results to include the rendered prompt sent for that run, so that I can inspect the exact model instructions.
45. As a prompt tuner, I want the WebUI prompt view to be read-only in the first version, so that prompt editing remains a deliberate external file change.
46. As a user, I want unified error messages with a stage and error code, so that I can understand whether the failure happened in model loading, prompt parsing, OCR, or translation.
47. As a user, I want the app to clearly lock model and request settings while processing, so that the displayed settings match the request currently running.
48. As a user, I want only one translation task active at a time, so that local model resource usage and UI state stay understandable.
49. As a user, I want to export structured JSON, so that I can save results, prompts, model choices, language settings, blocks, and translations.
50. As a user, I want exported JSON to omit the image bytes, so that export files remain lightweight and avoid storing image content.
51. As a future implementer, I want text-region detection explicitly out of scope for the first version, so that no dead module, fake switch, or unused interface is added.

## Implementation Decisions

- The app is local-first: the browser talks to a local backend, and the backend talks to the local Ollama server.
- The public repository is `jhihweijhan/manga-ocr-translator`.
- The backend is FastAPI managed with uv.
- The frontend is React, Vite, and TypeScript.
- The repository is a single-context project with root domain vocabulary and ADRs.
- The WebUI has one active translation task at a time.
- The app supports one uploaded image per task.
- Accepted image formats are PNG, JPEG, and WebP.
- Maximum image size is 10 MB. The frontend pre-checks this, and the backend must enforce it too.
- The Ollama base URL defaults to `http://127.0.0.1:11434` and is user-editable.
- The model list is loaded from Ollama and refreshed manually on demand.
- OCR model and translation model are independent selectors sourced from the same Ollama model list.
- The app does not infer or filter model capabilities from the model list.
- The first version has fixed source language hint options: automatic, Japanese, English, Korean, Simplified Chinese, and Traditional Chinese.
- The first version has fixed target language options: Traditional Chinese, Simplified Chinese, English, Japanese, and Korean.
- Traditional Chinese is the default target language, not a hard-coded output language.
- Source language is a prompt hint, not a guaranteed model capability.
- The backend API is split into model listing, prompt inspection, OCR, and translation surfaces.
- The first version uses Ollama `POST /api/generate`, not `/api/chat` or OpenAI-compatible endpoints.
- OCR requests include model, rendered system prompt, rendered user prompt, base64 image, JSON schema format, and `stream:false`.
- Translation requests include model, rendered system prompt, rendered user prompt, JSON schema format, and `stream:false`, without image data.
- The backend parses only the Ollama `response` field as JSON.
- OCR model output must be structured JSON containing `blocks`.
- Translation model output must be structured JSON containing `translations`.
- Translations must include `block_id` and `translated_text`.
- The backend rejects missing, duplicate, unknown, or mismatched `block_id` values.
- Display order follows the original OCR text block order.
- Invalid or nonconforming model JSON fails the current stage; the app does not repair malformed model prose.
- OCR success with no text blocks completes the task without calling translation.
- Translation receives all text blocks in one request to preserve context.
- Prompt configuration file name is fixed as `prompts.toml`.
- `prompts.toml` contains global OCR and translation prompt templates for the first version.
- Per-model prompt overrides are out of scope until a real model-specific need exists.
- Prompt templates support source language hint, target language, JSON schema, and text block variables.
- The backend reloads prompt configuration for every OCR and translation request.
- If `prompts.toml` is absent, built-in defaults are used and surfaced to the WebUI.
- If `prompts.toml` is invalid, the related request fails clearly.
- The WebUI shows prompt templates and source; each result and export includes rendered prompts for the actual request.
- The frontend tracks task state explicitly: idle, ready, OCR running, OCR failed, translation running, translation failed, completed, and cancelled.
- Each processing attempt has a unique run ID.
- Frontend responses are accepted only if their run ID matches the current task.
- Cancelling OCR clears text blocks and translations.
- Cancelling translation preserves OCR blocks and clears unfinished translations.
- The backend should cancel upstream Ollama HTTP requests when the client disconnects.
- API errors use a common envelope with code, stage, message, and details.
- Initial error codes include Ollama unreachable, timeout, invalid model JSON, invalid prompt TOML, image too large, unsupported image type, and model request failure.
- The first version does not persist uploaded images, task history, or image bytes in exports.
- Export JSON includes version, image filename, settings, blocks, translations, prompt templates, rendered prompts, and prompt source.

## Testing Decisions

- Good tests assert externally visible behavior and API contracts, not private implementation details.
- Backend route-level contract tests are the highest-value seam for the backend.
- Backend tests should use a mock Ollama server to verify model listing, OCR, translation, request body shape, `response` parsing, structured JSON validation, and error envelopes.
- OCR contract tests should cover valid blocks, empty blocks, malformed JSON, unsupported image type, image too large, timeout, and Ollama unreachable.
- Translation contract tests should cover valid `block_id` mappings, missing `block_id`, duplicate `block_id`, unknown `block_id`, count mismatch, malformed JSON, and timeout.
- Prompt parser/render tests should cover missing `prompts.toml`, invalid TOML syntax, missing required sections, missing required fields, variable substitution, built-in defaults, template source display, and rendered prompt capture.
- Frontend tests should use mock API responses to test upload behavior, model-list states, local settings persistence, state transitions, button enablement, and error display.
- Frontend race-condition tests should verify cancelled or stale run IDs cannot overwrite current task results.
- Frontend cancellation tests should verify OCR cancellation clears blocks/translations and translation cancellation preserves blocks while clearing unfinished translations.
- Frontend workflow tests should verify auto-processing after prerequisites are met, no auto-rerun after completed setting changes, retranslation without OCR, and reprocessing with OCR plus translation.
- Export tests should verify JSON shape, settings, block IDs, translations, prompt templates, rendered prompts, and absence of image bytes.
- Manual validation should run against a real local Ollama install with at least one vision OCR model and one translation model.

## Out of Scope

- Batch processing multiple images.
- Task history or persistence across page reloads.
- Saving uploaded images on the backend.
- Importing exported JSON.
- Embedding translated text back into images.
- PDF, GIF, AVIF, CBZ, ZIP, or multi-page file support.
- Text-region detection in the first version.
- Any text-region detection module, fake switch, placeholder abstraction, or dead code.
- WebUI editing or saving of prompt templates.
- Per-model prompt overrides.
- Automatic model capability detection.
- Streaming partial model output.
- Cloud model hosting or non-local execution as a first-version requirement.

## Further Notes

- The adversarial review identified and resolved several design risks before publication: target language hard-coding, translation matching without `block_id`, vague Ollama endpoint contracts, stale response races, empty OCR block behavior, prompt template versus rendered prompt display, and missing error envelope shape.
- The implementation should respect the glossary in `CONTEXT.md` and the ADRs in `docs/adr/`.
- The repo is public for discoverability. SEO-relevant terms should appear in the repository name, description, README, topics, and issue titles: manga, OCR, translator, Ollama, local-first, image translation.

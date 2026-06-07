# Text Region Detection

Status: Proposed（尚未實作）

Some OCR models can return text-region position information with each text block. This ADR proposes using that structured position information as a future first phase of on-image translation overlay work, while keeping text blocks without position information valid. The current implementation may still return `position: null`; list-mode proofreading remains the active fallback. A separate lightweight text-region detection module remains a later fallback or exploration path and must be approved separately before adding dependencies.

## Proposed Decision

The proposed first implementation phase would extend the OCR structured-result contract so each text block may include `position`. The backend would ask the OCR model for position information and validate it when present, but `position: null` or an omitted position remains valid. The frontend would use available position information to align overlay affordances on the uploaded image and to synchronize the active text block with the image area. When position information is missing, the UI falls back to the existing image preview plus text-block list.

This proposal does not introduce a standalone text-region detection module in the first phase. If OCR-provided position quality is inconsistent, a later phase may evaluate a local-first detector that runs on the user's machine and does not require server-side image persistence. Any new model, image-processing library, runtime cost, or dependency must be proposed and approved before implementation.

## Position Schema

`position` should use a normalized rectangle:

```json
{
  "type": "rect",
  "x": 0.12,
  "y": 0.34,
  "width": 0.22,
  "height": 0.08,
  "unit": "ratio"
}
```

The rectangle describes the text region for one text block relative to the original uploaded image. `x` and `y` are the top-left corner. `width` and `height` are the rectangle size. All numeric values are ratios in the inclusive range `0..1`, and the backend must reject rectangles where `x + width > 1` or `y + height > 1`. `width` and `height` must be greater than `0`.

Normalized ratios are the contract because the same translation task is shown at different preview sizes, device widths, and image densities. Pixel coordinates would couple the API to one decoded image size and make import/export less stable across browsers, display scaling, and future image preprocessing. If a future detector works in pixels internally, the backend should convert to normalized ratios before returning API results.

`position` remains nullable:

```json
{
  "id": "block-1",
  "source_text": "原文",
  "position": null
}
```

## Backend Data Flow

The proposed OCR prompt and response schema would describe each text block as structured JSON with `source_text`, optional `confidence`, and optional `position`. The backend still assigns stable `id` values for frontend and translation mapping. This continues ADR 0001: the backend accepts structured model results, not free-form prose. When implemented, the backend should validate `position` only when present. Invalid rectangles are invalid model JSON for the OCR stage and should use the same error path as other schema violations, consistent with ADR 0003. Missing or null position is not an error and must not block translation.

When implemented, the backend should preserve `position` in OCR API responses. The WebUI should preserve the OCR API `position` values in exported JSON and restore them during import. Translation requests should continue to use `block_id` for one-to-one mapping and should not require, mutate, or infer position information. Importing an exported translation task should restore `position` values when present and keep existing `position: null` values valid, preserving #16 import/export compatibility.

When this proposal is implemented, the backend must not persist uploaded images while adding position support. Position validation should happen during the current OCR request, and no server-side image copy is saved for later overlay use, consistent with ADR 0008. Prompt changes for requesting position information should remain externalized through `prompts.toml` and reloaded per request, consistent with ADR 0009.

## Frontend Data Flow

When this proposal is implemented and a text block has a valid rectangle, the frontend can render an overlay layer above the image preview. Overlay geometry should be calculated from the displayed image bounds and the normalized rectangle, so resizing the preview does not change the data model. Selecting a text block in the list should highlight the matching image region; selecting or focusing an overlay region should activate the matching text block in the proofreading list.

The proposed overlay is an alignment and proofreading aid, not an embedded translation renderer. The primary translation surface remains the text-block list. If no blocks have position information, or only some blocks have it, the UI must remain usable in list mode. Blocks without position should still appear in the list and should not create empty or misleading overlay affordances.

When the proposed overlay is implemented on mobile, the image preview and overlay must not require precise pointer-only interaction. Overlay regions should be keyboard-focusable when exposed as controls, have accessible names that include the block order or source text excerpt, and preserve visible focus states. The active block state should be represented in both the overlay and list without relying on color alone.

## Compatibility And Migration

Existing OCR results and exported JSON with `position: null` remain valid. Importing v1 JSON must not fail because position is null, missing, or absent from older exports. After this proposal is implemented, the export format may include normalized `position` values for blocks that have them, but imported tasks still do not restore the image itself. If the image is unavailable after import, the frontend should not display an overlay and should keep the existing "JSON does not include the original image" fallback behavior from #16.

No migration is required for current users because there is no persisted task history. The API and import parser should treat position as additive data. Existing list-based proofreading, dirty-state handling, TXT export, and JSON import/export flows must continue to work when every block has `position: null`.

## Non-Goals

This decision does not implement embedded text written back into the image, server-side image persistence, task history, batch processing, or document/archive processing. It does not introduce a standalone text-region detection module in the first phase. It also does not model polygons, rotated rectangles, or multiple text regions per text block in the first phase; those are follow-up design questions if normalized rectangles are not enough. It also does not require the translation model to return position information; position belongs to OCR text blocks and translations continue to attach by `block_id`.

## Verification Plan

Future implementation should add backend tests for OCR responses with valid normalized rectangles, null position, omitted position, out-of-range values, zero-size rectangles, and rectangles that overflow the image bounds. Invalid position data should fail the OCR stage with the same invalid model JSON envelope used for other OCR schema errors.

Future frontend tests should cover rendering overlay regions from normalized rectangles, keeping list and overlay active states synchronized, preserving list-only behavior when positions are missing, retaining imported positions from JSON, and suppressing overlays after importing JSON without the original image. Browser-level checks should cover desktop and mobile preview resizing, keyboard focus movement, visible focus/highlight states, and no layout overlap between the image overlay and proofreading list.

## Open Questions

OCR-provided bounding boxes may be noisy, missing, or inconsistent across local models. Before adding a detector fallback, we should evaluate enough sample manga pages to answer: how often OCR returns usable rectangles, whether bad rectangles reduce proofreading speed, whether users need manual correction, and whether a local-first detector can improve alignment without adding unacceptable setup cost. A future detector proposal should include dependency size, CPU/GPU expectations, supported platforms, privacy behavior, and how its output maps back into the normalized `position` schema.

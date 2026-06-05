import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const IMAGE_ZOOM_MIN = 1;
const IMAGE_ZOOM_MAX = 3;
const IMAGE_ZOOM_STEP = 0.25;
const IMAGE_KEYBOARD_PAN_STEP = 48;
const IMAGE_KEYBOARD_SCROLL_STEP = 80;

type Model = {
  name: string;
  model: string;
};

type ApiError = {
  error: {
    code?: string;
    stage?: string;
    message: string;
    details?: {
      reason?: unknown;
      raw_model_response?: unknown;
      raw_model_response_truncated?: unknown;
    };
  };
};

type DebuggableError = Error & {
  debugOutput?: string;
};

type PromptTemplates = {
  source: string;
  ocr: {
    system: string;
    user: string;
  };
  translation: {
    system: string;
    user: string;
  };
};

type TextBlock = {
  id: string;
  source_text: string;
  confidence: number | null;
  position: null;
};

type RenderedPrompt = {
  source: string;
  system_template: string;
  user_template: string;
  rendered_system: string;
  rendered_user: string;
};

type OcrPromptMode = "auto" | "direct" | "prompted";
type TranslationPromptMode = "direct" | "prompted";

type OcrResponse = {
  blocks: TextBlock[];
  prompt: RenderedPrompt;
  raw_model: {
    model: string;
  };
};

type Translation = {
  block_id: string;
  translated_text: string;
};

type TaskSettings = {
  ollama_base_url: string;
  ocr_model: string;
  translation_model: string;
  ocr_prompt_mode: OcrPromptMode;
  translation_prompt_mode: TranslationPromptMode;
  source_language_hint: string;
  target_language: string;
  timeout_seconds: number;
};

type TranslationResponse = {
  translations: Translation[];
  prompt: RenderedPrompt;
  raw_model: {
    model: string;
  };
};

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SOURCE_LANGUAGE_OPTIONS = ["自動判斷", "日文", "英文", "韓文", "簡體中文", "繁體中文"];
const TARGET_LANGUAGE_OPTIONS = ["繁體中文", "簡體中文", "英文", "日文", "韓文"];
const SETTINGS_STORAGE_KEY = "manga-ocr-translator-settings";
const SETTINGS_STORAGE_VERSION = 2;
const THEME_STORAGE_KEY = "manga-ocr-translator-theme";

type ThemeMode = "light" | "dark";

function readInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // ignore unreadable storage
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function isOcrPromptMode(value: unknown): value is OcrPromptMode {
  return value === "auto" || value === "direct" || value === "prompted";
}

function isTranslationPromptMode(value: unknown): value is TranslationPromptMode {
  return value === "direct" || value === "prompted";
}

function readPersistedTaskSettings(): Partial<TaskSettings> {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawSettings) {
      return {};
    }
    const parsed = JSON.parse(rawSettings) as Record<string, unknown>;
    const settings: Partial<TaskSettings> = {};

    if (typeof parsed.ollama_base_url === "string" && parsed.ollama_base_url.trim()) {
      settings.ollama_base_url = parsed.ollama_base_url;
    }
    if (typeof parsed.ocr_model === "string") {
      settings.ocr_model = parsed.ocr_model;
    }
    if (typeof parsed.translation_model === "string") {
      settings.translation_model = parsed.translation_model;
    }
    if (parsed.version === SETTINGS_STORAGE_VERSION) {
      if (isOcrPromptMode(parsed.ocr_prompt_mode)) {
        settings.ocr_prompt_mode = parsed.ocr_prompt_mode;
      }
      if (isTranslationPromptMode(parsed.translation_prompt_mode)) {
        settings.translation_prompt_mode = parsed.translation_prompt_mode;
      }
    }
    if (
      typeof parsed.source_language_hint === "string" &&
      SOURCE_LANGUAGE_OPTIONS.includes(parsed.source_language_hint)
    ) {
      settings.source_language_hint = parsed.source_language_hint;
    }
    if (
      typeof parsed.target_language === "string" &&
      TARGET_LANGUAGE_OPTIONS.includes(parsed.target_language)
    ) {
      settings.target_language = parsed.target_language;
    }
    if (
      typeof parsed.timeout_seconds === "number" &&
      Number.isFinite(parsed.timeout_seconds) &&
      parsed.timeout_seconds >= 1
    ) {
      settings.timeout_seconds = parsed.timeout_seconds;
    }

    return settings;
  } catch {
    return {};
  }
}

function writePersistedTaskSettings(settings: TaskSettings) {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ version: SETTINGS_STORAGE_VERSION, ...settings })
  );
}

function isPromptTemplates(payload: PromptTemplates | ApiError): payload is PromptTemplates {
  return (
    "source" in payload &&
    typeof payload.source === "string" &&
    typeof payload.ocr?.system === "string" &&
    typeof payload.ocr?.user === "string" &&
    typeof payload.translation?.system === "string" &&
    typeof payload.translation?.user === "string"
  );
}

function isOcrResponse(payload: OcrResponse | ApiError): payload is OcrResponse {
  return (
    "blocks" in payload &&
    Array.isArray(payload.blocks) &&
    payload.blocks.every(
      (block) =>
        typeof block.id === "string" &&
        typeof block.source_text === "string" &&
        (block.confidence === null || typeof block.confidence === "number") &&
        block.position === null
    ) &&
    typeof payload.prompt?.rendered_system === "string" &&
    typeof payload.prompt?.rendered_user === "string" &&
    typeof payload.raw_model?.model === "string"
  );
}

function isTranslationResponse(
  payload: TranslationResponse | ApiError
): payload is TranslationResponse {
  return (
    "translations" in payload &&
    Array.isArray(payload.translations) &&
    payload.translations.every(
      (translation) =>
        typeof translation.block_id === "string" &&
        typeof translation.translated_text === "string"
    ) &&
    typeof payload.prompt?.rendered_system === "string" &&
    typeof payload.prompt?.rendered_user === "string" &&
    typeof payload.raw_model?.model === "string"
  );
}

function createApiError(payload: ApiError, fallbackMessage: string): DebuggableError {
  const error = new Error(payload.error.message || fallbackMessage) as DebuggableError;
  if (typeof payload.error.details?.raw_model_response === "string") {
    error.debugOutput = payload.error.details.raw_model_response;
    if (payload.error.details.raw_model_response_truncated === true) {
      error.debugOutput += "\n\n[輸出已截斷]";
    }
  }
  return error;
}

function clampReadingPanX(frame: HTMLDivElement | null, zoom: number, panX: number) {
  if (!frame || zoom <= IMAGE_ZOOM_MIN) {
    return 0;
  }
  const maxPanX = (frame.clientWidth * (zoom - IMAGE_ZOOM_MIN)) / 2;
  return Math.min(maxPanX, Math.max(-maxPanX, panX));
}

function roundZoom(zoom: number) {
  return Number(zoom.toFixed(2));
}

function scrollReadingFrameTo(frame: HTMLDivElement | null, top: number, left?: number) {
  if (!frame) {
    return;
  }
  frame.scrollTop = top;
  if (typeof left === "number") {
    frame.scrollLeft = left;
  }
}

export default function App() {
  const persistedTaskSettings = useRef(readPersistedTaskSettings()).current;
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(
    persistedTaskSettings.ollama_base_url ?? DEFAULT_OLLAMA_BASE_URL
  );
  const [models, setModels] = useState<Model[]>([]);
  const [modelStatus, setModelStatus] = useState<"loading" | "success" | "error">("loading");
  const [modelErrorMessage, setModelErrorMessage] = useState<string | null>(null);
  const [promptStatus, setPromptStatus] = useState<"loading" | "success" | "error">("loading");
  const [promptErrorMessage, setPromptErrorMessage] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptTemplates | null>(null);
  const [selectedOcrModel, setSelectedOcrModel] = useState(
    persistedTaskSettings.ocr_model ?? ""
  );
  const [selectedTranslationModel, setSelectedTranslationModel] = useState(
    persistedTaskSettings.translation_model ?? ""
  );
  const [ocrPromptMode, setOcrPromptMode] = useState<OcrPromptMode>(
    persistedTaskSettings.ocr_prompt_mode ?? "auto"
  );
  const [translationPromptMode, setTranslationPromptMode] = useState<TranslationPromptMode>(
    persistedTaskSettings.translation_prompt_mode ?? "prompted"
  );
  const [sourceLanguageHint, setSourceLanguageHint] = useState(
    persistedTaskSettings.source_language_hint ?? "自動判斷"
  );
  const [targetLanguage, setTargetLanguage] = useState(
    persistedTaskSettings.target_language ?? "繁體中文"
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    persistedTaskSettings.timeout_seconds ?? 120
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageErrorMessage, setImageErrorMessage] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<
    | "idle"
    | "ready"
    | "ocr_running"
    | "ocr_cancelled"
    | "ocr_failed"
    | "translation_running"
    | "translation_cancelled"
    | "translation_failed"
    | "completed"
  >("idle");
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null);
  const [translationErrorMessage, setTranslationErrorMessage] = useState<string | null>(null);
  const [translationErrorDebugOutput, setTranslationErrorDebugOutput] = useState<string | null>(
    null
  );
  const [ocrBlocks, setOcrBlocks] = useState<TextBlock[]>([]);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [ocrPrompt, setOcrPrompt] = useState<RenderedPrompt | null>(null);
  const [translationPrompt, setTranslationPrompt] = useState<RenderedPrompt | null>(null);
  const [lastTaskSettings, setLastTaskSettings] = useState<TaskSettings | null>(null);
  const latestModelRequestId = useRef(0);
  const initialOllamaBaseUrl = useRef(ollamaBaseUrl);
  const latestOcrRunId = useRef(0);
  const latestTranslationRunId = useRef(0);
  const activeOcrAbortController = useRef<AbortController | null>(null);
  const activeTranslationAbortController = useRef<AbortController | null>(null);
  const readingImageFrameRef = useRef<HTMLDivElement | null>(null);
  const readingPanDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startScrollTop: number;
  } | null>(null);
  const isProcessing = taskStatus === "ocr_running" || taskStatus === "translation_running";
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [isDragging, setIsDragging] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePanX, setImagePanX] = useState(0);
  const [isReadingPanning, setIsReadingPanning] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore unwritable storage
    }
  }, [theme]);

  useEffect(() => {
    setImageZoom(1);
    setImagePanX(0);
    scrollReadingFrameTo(readingImageFrameRef.current, 0, 0);
  }, [imagePreviewUrl]);

  useEffect(() => {
    const handleResize = () => {
      setImagePanX((currentPanX) =>
        clampReadingPanX(readingImageFrameRef.current, imageZoom, currentPanX)
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [imageZoom]);

  const startTranslation = useCallback(
    (runId: number, blocks: TextBlock[], translationModel: string, ocrModel: string) => {
      const translationRunId = latestTranslationRunId.current + 1;
      latestTranslationRunId.current = translationRunId;
      activeTranslationAbortController.current?.abort();
      const abortController = new AbortController();
      activeTranslationAbortController.current = abortController;
      const requestSettings = {
        ollama_base_url: ollamaBaseUrl,
        ocr_model: ocrModel,
        translation_model: translationModel,
        ocr_prompt_mode: ocrPromptMode,
        translation_prompt_mode: translationPromptMode,
        source_language_hint: sourceLanguageHint,
        target_language: targetLanguage,
        timeout_seconds: timeoutSeconds
      };

      setTaskStatus("translation_running");
      setTranslationErrorMessage(null);
      setTranslationErrorDebugOutput(null);
      setTranslations([]);
      setTranslationPrompt(null);
      setLastTaskSettings(requestSettings);

      fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ollama_base_url: requestSettings.ollama_base_url,
          translation_model: translationModel,
          translation_prompt_mode: requestSettings.translation_prompt_mode,
          source_language_hint: requestSettings.source_language_hint,
          target_language: requestSettings.target_language,
          timeout_seconds: requestSettings.timeout_seconds,
          blocks
        }),
        signal: abortController.signal
      })
        .then(async (response) => {
          const payload = (await response.json()) as TranslationResponse | ApiError;
          if (!response.ok || "error" in payload) {
            throw "error" in payload ? createApiError(payload, "翻譯失敗") : new Error("翻譯失敗");
          }
          if (!isTranslationResponse(payload)) {
            throw new Error("翻譯回應格式不符合預期");
          }
          return payload;
        })
        .then((payload) => {
          if (
            runId !== latestOcrRunId.current ||
            translationRunId !== latestTranslationRunId.current
          ) {
            return;
          }
          setTranslations(payload.translations);
          setTranslationPrompt(payload.prompt);
          setTaskStatus("completed");
        })
        .catch((error: DebuggableError) => {
          if (
            runId !== latestOcrRunId.current ||
            translationRunId !== latestTranslationRunId.current
          ) {
            return;
          }
          if (error.name === "AbortError") {
            return;
          }
          setTranslationErrorMessage(error.message);
          setTranslationErrorDebugOutput(error.debugOutput ?? null);
          setTaskStatus("translation_failed");
        })
        .finally(() => {
          if (
            translationRunId === latestTranslationRunId.current &&
            activeTranslationAbortController.current === abortController
          ) {
            activeTranslationAbortController.current = null;
          }
        });
    },
    [ocrPromptMode, ollamaBaseUrl, sourceLanguageHint, targetLanguage, timeoutSeconds, translationPromptMode]
  );

  const startOcr = useCallback(
    (file: File, ocrModel: string, translationModel: string) => {
      const runId = latestOcrRunId.current + 1;
      latestOcrRunId.current = runId;
      activeOcrAbortController.current?.abort();
      activeTranslationAbortController.current?.abort();
      activeTranslationAbortController.current = null;
      const abortController = new AbortController();
      activeOcrAbortController.current = abortController;
      const formData = new FormData();
      formData.append("image", file);
      formData.append("ollama_base_url", ollamaBaseUrl);
      formData.append("ocr_model", ocrModel);
      formData.append("ocr_prompt_mode", ocrPromptMode);
      formData.append("source_language_hint", sourceLanguageHint);
      formData.append("timeout_seconds", String(timeoutSeconds));
      const requestSettings = {
        ollama_base_url: ollamaBaseUrl,
        ocr_model: ocrModel,
        translation_model: translationModel,
        ocr_prompt_mode: ocrPromptMode,
        translation_prompt_mode: translationPromptMode,
        source_language_hint: sourceLanguageHint,
        target_language: targetLanguage,
        timeout_seconds: timeoutSeconds
      };

      setTaskStatus("ocr_running");
      setOcrErrorMessage(null);
      setTranslationErrorMessage(null);
      setTranslationErrorDebugOutput(null);
      setOcrBlocks([]);
      setTranslations([]);
      setOcrPrompt(null);
      setTranslationPrompt(null);
      setLastTaskSettings(requestSettings);

      fetch("/api/ocr", { method: "POST", body: formData, signal: abortController.signal })
        .then(async (response) => {
          const payload = (await response.json()) as OcrResponse | ApiError;
          if (!response.ok || "error" in payload) {
            throw new Error("error" in payload ? payload.error.message : "OCR 失敗");
          }
          if (!isOcrResponse(payload)) {
            throw new Error("OCR 回應格式不符合預期");
          }
          return payload;
        })
        .then((payload) => {
          if (runId !== latestOcrRunId.current) {
            return;
          }
          setOcrBlocks(payload.blocks);
          setOcrPrompt(payload.prompt);
          if (payload.blocks.length > 0 && translationModel) {
            startTranslation(runId, payload.blocks, translationModel, ocrModel);
          } else {
            setTaskStatus("completed");
          }
        })
        .catch((error: Error) => {
          if (runId !== latestOcrRunId.current) {
            return;
          }
          if (error.name === "AbortError") {
            return;
          }
          setOcrErrorMessage(error.message);
          setTaskStatus("ocr_failed");
        })
        .finally(() => {
          if (
            runId === latestOcrRunId.current &&
            activeOcrAbortController.current === abortController
          ) {
            activeOcrAbortController.current = null;
          }
        });
    },
    [
      ocrPromptMode,
      ollamaBaseUrl,
      sourceLanguageHint,
      startTranslation,
      targetLanguage,
      timeoutSeconds,
      translationPromptMode
    ]
  );

  const loadModelsFor = useCallback((baseUrl: string) => {
    const requestId = latestModelRequestId.current + 1;
    latestModelRequestId.current = requestId;
    const params = new URLSearchParams({ base_url: baseUrl });
    setModelStatus("loading");

    fetch(`/api/models?${params.toString()}`, { method: "GET" })
      .then(async (response) => {
        const payload = (await response.json()) as { models?: Model[] } | ApiError;
        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error.message : "模型清單載入失敗");
        }
        return payload;
      })
      .then((payload) => {
        if (requestId !== latestModelRequestId.current) {
          return;
        }
        const nextModels = payload.models ?? [];
        const availableModelNames = new Set(nextModels.map((model) => model.name));
        setModelErrorMessage(null);
        setModels(nextModels);
        setSelectedOcrModel((currentModel) =>
          currentModel && availableModelNames.has(currentModel) ? currentModel : ""
        );
        setSelectedTranslationModel((currentModel) =>
          currentModel && availableModelNames.has(currentModel) ? currentModel : ""
        );
        setModelStatus("success");
      })
      .catch((error: Error) => {
        if (requestId !== latestModelRequestId.current) {
          return;
        }
        setModelErrorMessage(error.message);
        setModelStatus("error");
      });
  }, []);

  const clearImagePreview = () => {
    setImagePreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return null;
    });
  };

  const handleImageChange = (file: File | undefined) => {
    activeOcrAbortController.current?.abort();
    activeOcrAbortController.current = null;
    activeTranslationAbortController.current?.abort();
    activeTranslationAbortController.current = null;
    latestOcrRunId.current += 1;
    latestTranslationRunId.current += 1;
    setOcrBlocks([]);
    setTranslations([]);
    setOcrPrompt(null);
    setTranslationPrompt(null);
    setLastTaskSettings(null);
    setOcrErrorMessage(null);
    setTranslationErrorMessage(null);
    setTranslationErrorDebugOutput(null);

    if (!file) {
      setImageFile(null);
      clearImagePreview();
      setTaskStatus("idle");
      return;
    }

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setImageFile(null);
      clearImagePreview();
      setImageErrorMessage("只支援 PNG、JPEG 或 WebP 圖片");
      setTaskStatus("idle");
      return;
    }

    if (file.size > IMAGE_MAX_BYTES) {
      setImageFile(null);
      clearImagePreview();
      setImageErrorMessage("圖片大小不可超過 10 MB");
      setTaskStatus("idle");
      return;
    }

    setImageFile(file);
    setImageErrorMessage(null);
    setImagePreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return URL.createObjectURL(file);
    });

    if (selectedOcrModel) {
      startOcr(file, selectedOcrModel, selectedTranslationModel);
    } else {
      setTaskStatus("ready");
    }
  };

  const handleOcrModelChange = (ocrModel: string) => {
    setSelectedOcrModel(ocrModel);
    if (imageFile && ocrModel && (taskStatus === "ready" || taskStatus === "ocr_failed")) {
      startOcr(imageFile, ocrModel, selectedTranslationModel);
    }
  };

  const handleTranslationModelChange = (translationModel: string) => {
    setSelectedTranslationModel(translationModel);
    if (
      translationModel &&
      ocrBlocks.length > 0 &&
      translations.length === 0 &&
      (taskStatus === "completed" ||
        taskStatus === "translation_cancelled" ||
        taskStatus === "translation_failed")
    ) {
      startTranslation(
        latestOcrRunId.current,
        ocrBlocks,
        translationModel,
        lastTaskSettings?.ocr_model ?? selectedOcrModel
      );
    }
  };

  const handleSourceTextChange = (blockId: string, sourceText: string) => {
    setOcrBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === blockId ? { ...block, source_text: sourceText } : block
      )
    );
  };

  const handleRetranslate = () => {
    if (!selectedTranslationModel || ocrBlocks.length === 0) {
      return;
    }

    startTranslation(
      latestOcrRunId.current,
      ocrBlocks,
      selectedTranslationModel,
      lastTaskSettings?.ocr_model ?? selectedOcrModel
    );
  };

  const handleReprocess = () => {
    if (!imageFile || !selectedOcrModel) {
      return;
    }

    startOcr(imageFile, selectedOcrModel, selectedTranslationModel);
  };

  const handleCancelOcr = () => {
    if (taskStatus !== "ocr_running") {
      return;
    }

    latestOcrRunId.current += 1;
    latestTranslationRunId.current += 1;
    activeOcrAbortController.current?.abort();
    activeOcrAbortController.current = null;
    activeTranslationAbortController.current?.abort();
    activeTranslationAbortController.current = null;
    setOcrBlocks([]);
    setTranslations([]);
    setOcrErrorMessage(null);
    setTranslationErrorMessage(null);
    setTranslationErrorDebugOutput(null);
    setTaskStatus("ocr_cancelled");
  };

  const handleCancelTranslation = () => {
    if (taskStatus !== "translation_running") {
      return;
    }

    latestTranslationRunId.current += 1;
    activeTranslationAbortController.current?.abort();
    activeTranslationAbortController.current = null;
    setTranslations([]);
    setTranslationPrompt(null);
    setTranslationErrorMessage(null);
    setTranslationErrorDebugOutput(null);
    setTaskStatus("translation_cancelled");
  };

  const handleExportJson = () => {
    if (!imageFile || !ocrPrompt) {
      return;
    }

    const exportDocument = {
      version: 1,
      image: {
        filename: imageFile.name
      },
      settings: lastTaskSettings ?? {
        ollama_base_url: ollamaBaseUrl,
        ocr_model: selectedOcrModel,
        translation_model: selectedTranslationModel,
        ocr_prompt_mode: ocrPromptMode,
        translation_prompt_mode: translationPromptMode,
        source_language_hint: sourceLanguageHint,
        target_language: targetLanguage,
        timeout_seconds: timeoutSeconds
      },
      blocks: ocrBlocks.map((block) => ({
        block_id: block.id,
        source_text: block.source_text,
        confidence: block.confidence,
        position: block.position
      })),
      translations: Object.fromEntries(
        translations.map((translation) => [translation.block_id, translation.translated_text])
      ),
      prompts: {
        ocr: ocrPrompt,
        translation: translationPrompt
      }
    };
    const blob = new Blob([JSON.stringify(exportDocument, null, 2)], {
      type: "application/json"
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${imageFile.name}.translation-task.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  const translationByBlockId = new Map(
    translations.map((translation) => [translation.block_id, translation.translated_text])
  );
  const hasEditableResults =
    (taskStatus === "completed" ||
      taskStatus === "translation_cancelled" ||
      taskStatus === "translation_failed") &&
    ocrBlocks.length > 0;
  const hasExportableResult =
    Boolean(imageFile && ocrPrompt) &&
    (taskStatus === "completed" ||
      taskStatus === "translation_cancelled" ||
      taskStatus === "translation_failed");
  const readingImageStyle = {
    "--reading-pan-x": `${imagePanX}px`,
    "--reading-zoom": imageZoom
  } as CSSProperties;
  const canZoomOut = imageZoom > IMAGE_ZOOM_MIN;
  const canZoomIn = imageZoom < IMAGE_ZOOM_MAX;
  const canPanReadingImage = imageZoom > IMAGE_ZOOM_MIN;
  const handleZoomOut = () => {
    setImageZoom((currentZoom) => {
      const nextZoom = Math.max(IMAGE_ZOOM_MIN, roundZoom(currentZoom - IMAGE_ZOOM_STEP));
      setImagePanX((currentPanX) =>
        clampReadingPanX(readingImageFrameRef.current, nextZoom, currentPanX)
      );
      return nextZoom;
    });
  };
  const handleZoomIn = () => {
    setImageZoom((currentZoom) =>
      Math.min(IMAGE_ZOOM_MAX, roundZoom(currentZoom + IMAGE_ZOOM_STEP))
    );
  };
  const handleZoomReset = () => {
    setImageZoom(IMAGE_ZOOM_MIN);
    setImagePanX(0);
    scrollReadingFrameTo(readingImageFrameRef.current, 0, 0);
  };
  const stopReadingPan = (pointerId?: number) => {
    const frame = readingImageFrameRef.current;
    if (typeof pointerId === "number" && frame?.hasPointerCapture(pointerId)) {
      frame.releasePointerCapture(pointerId);
    }
    readingPanDragRef.current = null;
    setIsReadingPanning(false);
  };
  const handleReadingPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canPanReadingImage || event.button !== 0) {
      return;
    }
    const frame = readingImageFrameRef.current;
    if (!frame) {
      return;
    }
    event.preventDefault();
    frame.setPointerCapture(event.pointerId);
    readingPanDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: imagePanX,
      startScrollTop: frame.scrollTop
    };
    setIsReadingPanning(true);
  };
  const handleReadingPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = readingPanDragRef.current;
    const frame = readingImageFrameRef.current;
    if (!dragState || !frame || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setImagePanX(
      clampReadingPanX(frame, imageZoom, dragState.startPanX + event.clientX - dragState.startX)
    );
    frame.scrollTop = dragState.startScrollTop - (event.clientY - dragState.startY);
  };
  const handleReadingPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (readingPanDragRef.current?.pointerId === event.pointerId) {
      stopReadingPan(event.pointerId);
    }
  };
  const handleReadingKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const frame = readingImageFrameRef.current;
    if (!frame) {
      return;
    }
    if (event.key === "ArrowLeft" && canPanReadingImage) {
      event.preventDefault();
      setImagePanX((currentPanX) =>
        clampReadingPanX(frame, imageZoom, currentPanX + IMAGE_KEYBOARD_PAN_STEP)
      );
      return;
    }
    if (event.key === "ArrowRight" && canPanReadingImage) {
      event.preventDefault();
      setImagePanX((currentPanX) =>
        clampReadingPanX(frame, imageZoom, currentPanX - IMAGE_KEYBOARD_PAN_STEP)
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      scrollReadingFrameTo(frame, frame.scrollTop - IMAGE_KEYBOARD_SCROLL_STEP);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      scrollReadingFrameTo(frame, frame.scrollTop + IMAGE_KEYBOARD_SCROLL_STEP);
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      scrollReadingFrameTo(frame, frame.scrollTop - frame.clientHeight);
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      scrollReadingFrameTo(frame, frame.scrollTop + frame.clientHeight);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      scrollReadingFrameTo(frame, 0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      scrollReadingFrameTo(frame, frame.scrollHeight);
    }
  };
  const handleOpenOriginalImage = () => {
    if (!imagePreviewUrl) {
      return;
    }
    window.open(imagePreviewUrl, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    loadModelsFor(initialOllamaBaseUrl.current);
  }, [loadModelsFor]);

  useEffect(() => {
    writePersistedTaskSettings({
      ollama_base_url: ollamaBaseUrl,
      ocr_model: selectedOcrModel,
      translation_model: selectedTranslationModel,
      ocr_prompt_mode: ocrPromptMode,
      translation_prompt_mode: translationPromptMode,
      source_language_hint: sourceLanguageHint,
      target_language: targetLanguage,
      timeout_seconds: timeoutSeconds
    });
  }, [
    ocrPromptMode,
    ollamaBaseUrl,
    selectedOcrModel,
    selectedTranslationModel,
    sourceLanguageHint,
    targetLanguage,
    timeoutSeconds,
    translationPromptMode
  ]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    fetch("/api/prompts", { method: "GET" })
      .then(async (response) => {
        const payload = (await response.json()) as PromptTemplates | ApiError;
        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error.message : "提示詞設定載入失敗");
        }
        if (!isPromptTemplates(payload)) {
          throw new Error("提示詞設定格式不符合預期");
        }
        return payload;
      })
      .then((payload) => {
        setPrompts(payload);
        setPromptErrorMessage(null);
        setPromptStatus("success");
      })
      .catch((error: Error) => {
        setPrompts(null);
        setPromptErrorMessage(error.message);
        setPromptStatus("error");
      });
  }, []);

  return (
    <main>
      <header className="app-header">
        <div className="wordmark">
          <span className="wordmark-stamp">漫畫翻譯神器</span>
          <p className="wordmark-sub">本機 Ollama OCR 翻譯，圖片不離開你的電腦</p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          aria-label={theme === "dark" ? "切換到淺色主題" : "切換到深色主題"}
        >
          {theme === "dark" ? "☀ 淺色" : "☾ 深色"}
        </button>
      </header>

      <div className="app-shell">
        <div className="control-col">
          <section className="panel" aria-labelledby="task-settings-heading">
            <h2 id="task-settings-heading">翻譯任務</h2>
            <div className="default-fields">
              <div className="field">
                <label htmlFor="ocr-model">OCR 模型</label>
                <select
                  disabled={isProcessing}
                  id="ocr-model"
                  value={selectedOcrModel}
                  onChange={(event) => handleOcrModelChange(event.target.value)}
                >
                  <option value="">請選擇 OCR 模型</option>
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>
                      OCR：{model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="translation-model">翻譯模型</label>
                <select
                  disabled={isProcessing}
                  id="translation-model"
                  value={selectedTranslationModel}
                  onChange={(event) => handleTranslationModelChange(event.target.value)}
                >
                  <option value="">請選擇翻譯模型</option>
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>
                      翻譯：{model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="target-language">目標語言</label>
                <select
                  disabled={isProcessing}
                  id="target-language"
                  value={targetLanguage}
                  onChange={(event) => setTargetLanguage(event.target.value)}
                >
                  {TARGET_LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className={isDragging ? "upload-zone is-dragging" : "upload-zone"}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isProcessing) {
                  setIsDragging(true);
                }
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (isProcessing) {
                  return;
                }
                handleImageChange(event.dataTransfer.files?.[0]);
              }}
              style={{ marginTop: "16px" }}
            >
              <span className="upload-cta">拖入或選擇漫畫圖片</span>
              <p>PNG／JPEG／WebP，單張上限 10 MB</p>
              <input
                accept="image/png,image/jpeg,image/webp"
                aria-label="上傳圖片"
                disabled={isProcessing}
                id="image-upload"
                onChange={(event) => {
                  const selectedFile = event.currentTarget.files?.[0];
                  handleImageChange(selectedFile);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </div>
            {imageErrorMessage ? <p className="error-message">{imageErrorMessage}</p> : null}
          </section>

          <details className="advanced">
            <summary>進階設定</summary>
            <div className="advanced-body">
              <div className="inline-row">
                <div className="field">
                  <label htmlFor="ollama-base-url">Ollama 位址</label>
                  <input
                    disabled={isProcessing}
                    id="ollama-base-url"
                    value={ollamaBaseUrl}
                    onChange={(event) => setOllamaBaseUrl(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isProcessing}
                  onClick={() => loadModelsFor(ollamaBaseUrl)}
                >
                  重新整理模型清單
                </button>
              </div>
              <div className="field">
                <label htmlFor="source-language-hint">來源語言提示</label>
                <select
                  disabled={isProcessing}
                  id="source-language-hint"
                  value={sourceLanguageHint}
                  onChange={(event) => setSourceLanguageHint(event.target.value)}
                >
                  {SOURCE_LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ocr-prompt-mode">OCR 提示詞模式</label>
                <select
                  disabled={isProcessing}
                  id="ocr-prompt-mode"
                  value={ocrPromptMode}
                  onChange={(event) => setOcrPromptMode(event.target.value as OcrPromptMode)}
                >
                  <option value="auto">自動：依模型選擇</option>
                  <option value="direct">直接圖片，不套用提示詞模板</option>
                  <option value="prompted">使用 OCR 提示詞與 JSON 格式</option>
                </select>
                <p className="field-help">自動模式會讓 glm-ocr 直接辨識，其他模型使用 JSON schema</p>
              </div>
              <div className="field">
                <label htmlFor="translation-prompt-mode">翻譯提示詞模式</label>
                <select
                  disabled={isProcessing}
                  id="translation-prompt-mode"
                  value={translationPromptMode}
                  onChange={(event) =>
                    setTranslationPromptMode(event.target.value as TranslationPromptMode)
                  }
                >
                  <option value="prompted">使用翻譯提示詞與 block 對齊</option>
                  <option value="direct">直接文字，不套用提示詞模板</option>
                </select>
                <p className="field-help">一般翻譯模型建議開啟；關閉時模型仍需回傳 block_id JSON</p>
              </div>
              <div className="field">
                <label htmlFor="timeout-seconds">逾時秒數</label>
                <input
                  disabled={isProcessing}
                  id="timeout-seconds"
                  min="1"
                  step="1"
                  type="number"
                  value={timeoutSeconds}
                  onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
                />
              </div>
            </div>
          </details>
        </div>

        <section className="result-col" aria-labelledby="ocr-result-heading">
          <div className="panel result-panel">
            <h2 id="ocr-result-heading">翻譯結果</h2>
            {taskStatus === "idle" ? (
              <div className="result-empty">
                <span className="empty-badge">訳</span>
                <p>
                  <strong>選好 OCR 與翻譯模型、上傳一張漫畫圖片</strong>
                  ，系統會自動辨識文字並翻成你的目標語言。圖片只在你的電腦上處理。
                </p>
              </div>
            ) : null}
            {taskStatus === "ready" ? (
              <p className="status-line">
                <span className="status-dot" aria-hidden="true" />
                已就緒，請選擇 OCR 模型後自動開始
              </p>
            ) : null}
            {taskStatus === "ocr_running" ? (
              <div className="running-status">
                <p>OCR 處理中</p>
                <button type="button" className="secondary-button" onClick={handleCancelOcr}>
                  取消 OCR
                </button>
              </div>
            ) : null}
            {taskStatus === "ocr_cancelled" ? (
              <p className="status-line">
                <span className="status-dot" aria-hidden="true" />
                OCR 已取消
              </p>
            ) : null}
            {taskStatus === "translation_running" ? (
              <div className="running-status">
                <p>翻譯處理中</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleCancelTranslation}
                >
                  取消翻譯
                </button>
              </div>
            ) : null}
            {taskStatus === "translation_cancelled" ? (
              <p className="status-line">
                <span className="status-dot" aria-hidden="true" />
                翻譯已取消
              </p>
            ) : null}
            {taskStatus === "ocr_failed" ? (
              <>
                <p className="status-line">
                  <span className="status-dot is-error" aria-hidden="true" />
                  OCR 失敗
                </p>
                {ocrErrorMessage ? <p className="error-message">{ocrErrorMessage}</p> : null}
              </>
            ) : null}
            {taskStatus === "translation_failed" ? (
              <>
                <p className="status-line">
                  <span className="status-dot is-error" aria-hidden="true" />
                  翻譯失敗
                </p>
                {translationErrorMessage ? (
                  <p className="error-message">{translationErrorMessage}</p>
                ) : null}
                {translationErrorDebugOutput ? (
                  <details className="debug-output" open>
                    <summary>模型原始輸出</summary>
                    <pre>{translationErrorDebugOutput}</pre>
                  </details>
                ) : null}
              </>
            ) : null}
            {taskStatus === "completed" ? (
              <>
                <p className="status-line">
                  <span className="status-dot is-ok" aria-hidden="true" />
                  {translations.length > 0 ? "翻譯完成" : "OCR 完成"}
                </p>
                {ocrBlocks.length === 0 ? <p className="muted">未偵測到可翻譯文字</p> : null}
              </>
            ) : null}
            {hasExportableResult ? (
              <div className="result-actions">
                {ocrBlocks.length > 0 ? (
                  <>
                    <button
                      type="button"
                      disabled={!selectedTranslationModel}
                      onClick={handleRetranslate}
                    >
                      重新翻譯
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!imageFile || !selectedOcrModel}
                      onClick={handleReprocess}
                    >
                      重新處理
                    </button>
                  </>
                ) : null}
                <button type="button" className="secondary-button" onClick={handleExportJson}>
                  匯出 JSON
                </button>
              </div>
            ) : null}
            {imagePreviewUrl ? (
              <div className="reading-view">
                <div className="reading-media">
                  <div className="reading-toolbar" role="toolbar" aria-label="閱讀控制">
                    <button
                      type="button"
                      className="reading-tool-button"
                      aria-label="縮小"
                      disabled={!canZoomOut}
                      onClick={handleZoomOut}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      className="reading-tool-button"
                      aria-label="放大"
                      disabled={!canZoomIn}
                      onClick={handleZoomIn}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="reading-tool-button"
                      aria-label="重設縮放"
                      onClick={handleZoomReset}
                    >
                      Fit
                    </button>
                    <button
                      type="button"
                      className="reading-tool-button"
                      aria-label="開啟原圖"
                      onClick={handleOpenOriginalImage}
                    >
                      ↗
                    </button>
                  </div>
                  <div
                    ref={readingImageFrameRef}
                    aria-label="漫畫頁閱讀區"
                    className={[
                      "reading-image-frame",
                      canPanReadingImage ? "is-pannable" : "",
                      isReadingPanning ? "is-panning" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onKeyDown={handleReadingKeyDown}
                    onPointerCancel={handleReadingPointerUp}
                    onPointerDown={handleReadingPointerDown}
                    onPointerMove={handleReadingPointerMove}
                    onPointerUp={handleReadingPointerUp}
                    role="region"
                    tabIndex={0}
                  >
                    <img
                      alt="上傳圖片預覽"
                      className={imageZoom === 1 ? "reading-image is-fit" : "reading-image"}
                      src={imagePreviewUrl}
                      style={readingImageStyle}
                    />
                  </div>
                </div>
                <div className="reading-side" role={hasEditableResults ? "list" : undefined}>
                  {hasEditableResults
                    ? ocrBlocks.map((block, blockIndex) => {
                        const translated = translationByBlockId.get(block.id);
                        const blockNumberId = `block-number-${block.id}`;
                        const translationLabelId = `translation-label-${block.id}`;
                        const translationTextId = `translation-text-${block.id}`;
                        return (
                          <article
                            className="block-card"
                            key={block.id}
                            role="listitem"
                            tabIndex={0}
                            aria-labelledby={`${blockNumberId} ${translationLabelId} ${translationTextId}`}
                          >
                            <span
                              className="block-tag"
                              id={blockNumberId}
                              aria-label={`第 ${blockIndex + 1} 段`}
                            >
                              {blockIndex + 1}
                            </span>
                            <div className="source-track">
                              <label
                                className="source-text-label"
                                htmlFor={`source-text-${block.id}`}
                              >
                                {block.id} 修正原文
                              </label>
                              <textarea
                                id={`source-text-${block.id}`}
                                value={block.source_text}
                                onChange={(event) =>
                                  handleSourceTextChange(block.id, event.target.value)
                                }
                              />
                            </div>
                            <div className="translation-track">
                              <span className="trans-label" id={translationLabelId}>
                                譯文
                              </span>
                              <p
                                className={translated ? "translated" : "translated is-empty"}
                                id={translationTextId}
                              >
                                {translated ?? "尚未翻譯"}
                              </p>
                            </div>
                          </article>
                        );
                      })
                    : isProcessing ? (
                        <p className="muted reading-hint">辨識與翻譯進行中，譯文會逐一出現在這裡…</p>
                      ) : (
                        <p className="muted reading-hint">選好兩個模型就會自動產生對照譯文。</p>
                      )}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <details className="debug-section">
        <summary>模型清單與提示詞檢視</summary>
        <div className="debug-grid">
          <section aria-labelledby="model-list-heading">
            <h3 id="model-list-heading">模型清單</h3>
            {modelStatus === "loading" ? <p className="muted">模型清單載入中</p> : null}
            {modelStatus === "success" && models.length > 0 ? (
              <p className="muted">已載入 {models.length} 個模型</p>
            ) : null}
            {modelStatus === "success" && models.length === 0 ? (
              <p className="muted">目前沒有可用模型</p>
            ) : null}
            {modelStatus === "error" ? (
              <>
                <p className="error-message">模型清單載入失敗</p>
                {modelErrorMessage ? <p className="muted">{modelErrorMessage}</p> : null}
              </>
            ) : null}
            <ul className="model-list">
              {models.map((model) => (
                <li key={model.name}>{model.name}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="prompt-heading">
            <h3 id="prompt-heading">提示詞設定</h3>
            {promptStatus === "loading" ? <p className="muted">提示詞設定載入中</p> : null}
            {promptStatus === "error" ? (
              <>
                <p className="error-message">提示詞設定載入失敗</p>
                {promptErrorMessage ? <p className="muted">{promptErrorMessage}</p> : null}
              </>
            ) : null}
            {promptStatus === "success" && prompts ? (
              <>
                <p className="muted">提示詞來源：{prompts.source}</p>
                <div className="prompt-grid">
                  <div className="field">
                    <label htmlFor="ocr-system-prompt">OCR system 提示詞</label>
                    <textarea id="ocr-system-prompt" readOnly value={prompts.ocr.system} />
                  </div>
                  <div className="field">
                    <label htmlFor="ocr-user-prompt">OCR user 提示詞</label>
                    <textarea id="ocr-user-prompt" readOnly value={prompts.ocr.user} />
                  </div>
                  <div className="field">
                    <label htmlFor="translation-system-prompt">翻譯 system 提示詞</label>
                    <textarea
                      id="translation-system-prompt"
                      readOnly
                      value={prompts.translation.system}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="translation-user-prompt">翻譯 user 提示詞</label>
                    <textarea
                      id="translation-user-prompt"
                      readOnly
                      value={prompts.translation.user}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </details>
    </main>
  );
}

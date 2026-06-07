import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

async function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

async function readDownloadedJson(): Promise<Record<string, unknown>> {
  const exportBlob = vi.mocked(URL.createObjectURL).mock.calls.find(
    ([value]) => value instanceof Blob && value.type === "application/json"
  )?.[0] as Blob;

  return JSON.parse(await readBlobAsText(exportBlob)) as Record<string, unknown>;
}

async function readDownloadedText(mimeType: string): Promise<string> {
  const exportBlob = vi.mocked(URL.createObjectURL).mock.calls.find(
    ([value]) => value instanceof Blob && value.type === mimeType
  )?.[0] as Blob;

  return readBlobAsText(exportBlob);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("顯示可編輯的預設 Ollama 位址", () => {
    render(<App />);

    const input = screen.getByLabelText("Ollama 位址");

    expect(input).toHaveValue("http://127.0.0.1:11434");
    expect(input).toBeEnabled();
  });

  it("顯示 OCR 與翻譯的提示詞模式選項與使用說明", () => {
    render(<App />);

    expect(screen.getByLabelText("OCR 提示詞模式")).toHaveValue("auto");
    expect(screen.getByLabelText("翻譯提示詞模式")).toHaveValue("prompted");
    expect(screen.getByText("自動模式會讓 glm-ocr 直接辨識，其他模型使用 JSON schema")).toBeInTheDocument();
    expect(screen.getByText("一般翻譯模型建議開啟；關閉時模型仍需回傳 block_id JSON")).toBeInTheDocument();
  });

  it("從 localStorage 還原任務設定，並用儲存的 Ollama URL 載入模型", async () => {
    localStorage.setItem(
      "manga-ocr-translator-settings",
      JSON.stringify({
        ollama_base_url: "http://ollama.saved:11434",
        ocr_model: "gemma3:latest",
        translation_model: "qwen3:latest",
        source_language_hint: "日文",
        target_language: "英文",
        timeout_seconds: 45
      })
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    expect(screen.getByLabelText("Ollama 位址")).toHaveValue("http://ollama.saved:11434");
    expect(screen.getByLabelText("OCR 模型")).toHaveValue("gemma3:latest");
    expect(screen.getByLabelText("翻譯模型")).toHaveValue("qwen3:latest");
    expect(screen.getByLabelText("來源語言提示")).toHaveValue("日文");
    expect(screen.getByLabelText("目標語言")).toHaveValue("英文");
    expect(screen.getByLabelText("逾時秒數")).toHaveValue(45);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/models?base_url=http%3A%2F%2Follama.saved%3A11434",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("使用者修改任務設定時寫入 localStorage", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("Ollama 位址"), {
      target: { value: "http://ollama.changed:11434" }
    });
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("來源語言提示"), {
      target: { value: "日文" }
    });
    fireEvent.change(screen.getByLabelText("目標語言"), {
      target: { value: "英文" }
    });
    fireEvent.change(screen.getByLabelText("逾時秒數"), {
      target: { value: "45" }
    });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("manga-ocr-translator-settings") ?? "{}")).toMatchObject({
        ollama_base_url: "http://ollama.changed:11434",
        ocr_model: "gemma3:latest",
        translation_model: "qwen3:latest",
        source_language_hint: "日文",
        target_language: "英文",
        timeout_seconds: 45
      });
    });
  });

  it("透過本機 backend 載入模型清單並顯示成功狀態", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "gemma3:latest",
              model: "gemma3:latest"
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<App />);

    expect(screen.getByText("模型清單載入中")).toBeInTheDocument();

    await screen.findByText("gemma3:latest");
    expect(screen.getByText("已載入 1 個模型")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/models?base_url=http%3A%2F%2F127.0.0.1%3A11434",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("idle 空狀態顯示上手教學且不阻擋上傳與模型選擇", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");

    expect(screen.getByRole("heading", { name: "開始第一個翻譯任務" })).toBeInTheDocument();
    expect(screen.getByText("確認 Ollama 位址與模型清單")).toBeInTheDocument();
    expect(screen.getByText("選擇 OCR 模型與翻譯模型")).toBeInTheDocument();
    expect(screen.getByText("上傳單張漫畫圖片後自動處理")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ollama 連線檢查" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("上傳圖片")).toBeEnabled();
    expect(screen.getByLabelText("OCR 模型")).toBeEnabled();
    expect(screen.getByLabelText("翻譯模型")).toBeEnabled();
  });

  it("模型清單為空時顯示 empty 狀態", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    render(<App />);

    expect(await screen.findByText("目前沒有可用模型")).toBeInTheDocument();
  });

  it("模型清單 API 失敗時保留錯誤並顯示 Ollama 修復引導", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "ollama_unreachable",
            stage: "models",
            message: "Could not reach Ollama while loading the model list.",
            details: {}
          }
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<App />);

    expect(await screen.findByText("模型清單載入失敗")).toBeInTheDocument();
    expect(screen.getByText("Could not reach Ollama while loading the model list.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ollama 連線檢查" })).toBeInTheDocument();
    expect(screen.getByText("安裝 Ollama：到 ollama.com 下載並完成安裝。")).toBeInTheDocument();
    expect(screen.getByText("ollama serve")).toBeInTheDocument();
    expect(screen.getByText("ollama pull gemma3:latest")).toBeInTheDocument();
    expect(screen.getByText("確認 Ollama 位址是否為 http://127.0.0.1:11434，或改成你的本機服務位址。")).toBeInTheDocument();
  });

  it("顯示提示詞來源與只讀內容", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: {
                system: "Builtin OCR system",
                user: "Builtin OCR user"
              },
              translation: {
                system: "Builtin translation system",
                user: "Builtin translation user"
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);

    expect(await screen.findByText("提示詞來源：builtin")).toBeInTheDocument();
    expect(screen.getByLabelText("OCR system 提示詞")).toHaveValue("Builtin OCR system");
    expect(screen.getByLabelText("翻譯 user 提示詞")).toHaveValue("Builtin translation user");
    expect(screen.getByLabelText("OCR system 提示詞")).toHaveAttribute("readonly");
  });

  it("提示詞 API 失敗時顯示錯誤狀態", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "prompt_toml_invalid",
                stage: "prompts",
                message: "prompts.toml could not be parsed.",
                details: {}
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);

    expect(await screen.findByText("提示詞設定載入失敗")).toBeInTheDocument();
    expect(screen.getByText("prompts.toml could not be parsed.")).toBeInTheDocument();
  });

  it("提示詞 API 回傳非預期格式時顯示錯誤狀態", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(JSON.stringify({ source: "builtin" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);

    expect(await screen.findByText("提示詞設定載入失敗")).toBeInTheDocument();
    expect(screen.getByText("提示詞設定格式不符合預期")).toBeInTheDocument();
  });

  it("使用者可以手動重新整理模型清單", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      const modelName = fetchMock.mock.calls.length < 2 ? "first:latest" : "second:latest";
      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: modelName, model: modelName }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    expect(await screen.findByText("first:latest")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新整理模型清單" }));

    expect(await screen.findByText("second:latest")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/models"))).toHaveLength(2);
  });

  it("使用者修改 Ollama 位址後，重新整理會用新的 backend query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);
    await screen.findByText("目前沒有可用模型");

    fireEvent.change(screen.getByLabelText("Ollama 位址"), {
      target: { value: "http://127.0.0.1:11435" }
    });
    fireEvent.click(screen.getByRole("button", { name: "重新整理模型清單" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/models?base_url=http%3A%2F%2F127.0.0.1%3A11435",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  it("較舊的模型清單回應晚到時，不會覆蓋最新重新整理結果", async () => {
    let resolveFirstModels: (response: Response) => void = () => {};
    let resolveSecondModels: (response: Response) => void = () => {};
    const firstModels = new Promise<Response>((resolve) => {
      resolveFirstModels = resolve;
    });
    const secondModels = new Promise<Response>((resolve) => {
      resolveSecondModels = resolve;
    });

    let modelRequestCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      modelRequestCount += 1;
      return modelRequestCount === 1 ? firstModels : secondModels;
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "重新整理模型清單" }));

    resolveSecondModels(
      new Response(JSON.stringify({ models: [{ name: "new:latest", model: "new:latest" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    expect(await screen.findByText("new:latest")).toBeInTheDocument();

    resolveFirstModels(
      new Response(JSON.stringify({ models: [{ name: "old:latest", model: "old:latest" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await waitFor(() => {
      expect(screen.queryByText("old:latest")).not.toBeInTheDocument();
    });
  });

  it("使用者選定 OCR 模型後上傳 PNG，會顯示預覽並送出 OCR request", async () => {
    const createObjectURL = vi.fn(() => "blob:page-preview");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        const formData = init?.body as FormData;
        expect(formData.get("ocr_model")).toBe("gemma3:latest");
        expect(formData.get("source_language_hint")).toBe("日文");
        expect(formData.get("ollama_base_url")).toBe("http://127.0.0.1:11434");
        expect(formData.get("image")).toBeInstanceOf(File);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                {
                  id: "block-1",
                  source_text: "こんにちは",
                  confidence: 0.91,
                  position: null
                }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("來源語言提示"), {
      target: { value: "日文" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByAltText("上傳圖片預覽")).toHaveAttribute("src", "blob:page-preview");
    expect(await screen.findByText("OCR 完成")).toBeInTheDocument();
    expect(screen.getByText("こんにちは")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(1);
  });

  it("閱讀控制列固定在圖片內容區外，縮放後仍保留可及操作", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:page-preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        const formData = init?.body as FormData;
        expect(formData.get("ocr_model")).toBe("gemma3:latest");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                {
                  id: "block-1",
                  source_text: "こんにちは",
                  confidence: 0.91,
                  position: null
                }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    const preview = await screen.findByAltText("上傳圖片預覽");
    const toolbar = screen.getByRole("toolbar", { name: "閱讀控制" });
    const frame = screen.getByRole("region", { name: "漫畫頁閱讀區" });
    const toolbarStrip = toolbar.parentElement;

    expect(frame).not.toContainElement(toolbar);
    expect(toolbarStrip).toHaveClass("reading-toolbar-strip");
    expect(frame.previousElementSibling).toBe(toolbarStrip);
    expect(toolbar.compareDocumentPosition(frame)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole("button", { name: "縮小" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "放大" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重設縮放" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "開啟原圖" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "放大" }));

    expect(preview).toHaveStyle({ "--reading-zoom": "1.25" });
    expect(toolbar.parentElement).toBe(toolbarStrip);
    expect(toolbar.compareDocumentPosition(frame)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("上傳完成後清空圖片輸入，讓使用者可以再次選同一張圖片重新處理", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:page-preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        const formData = init?.body as FormData;
        expect(formData.get("ocr_prompt_mode")).toBe("auto");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });

    const imageInput = screen.getByLabelText("上傳圖片");
    Object.defineProperty(imageInput, "value", {
      configurable: true,
      writable: true,
      value: "C:\\fakepath\\page.png"
    });

    fireEvent.change(imageInput, {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("OCR 完成")).toBeInTheDocument();
    expect(imageInput).toHaveValue("");
  });

  it("前端會在上傳前拒絕不支援的圖片格式", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["gif"], "page.gif", { type: "image/gif" })] }
    });

    expect(screen.getByText("只支援 PNG、JPEG 或 WebP 圖片")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/ocr"))).toBe(false);
  });

  it("前端會在上傳前拒絕超過 10 MB 的圖片", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: {
        files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })]
      }
    });

    expect(screen.getByText("圖片大小不可超過 10 MB")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/ocr"))).toBe(false);
  });

  it("OCR 成功但沒有文字區塊時顯示空結果且不呼叫翻譯", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:empty") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.webp", { type: "image/webp" })] }
    });

    expect(await screen.findByText("OCR 完成")).toBeInTheDocument();
    expect(screen.getByText("未偵測到可翻譯文字")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/translate"))).toBe(false);
  });

  it("OCR 失敗時顯示 OCR 階段錯誤且不呼叫翻譯", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:error") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_model_json",
                stage: "ocr",
                message: "Model response did not match the expected JSON schema.",
                details: {}
              }
            }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.jpg", { type: "image/jpeg" })] }
    });

    expect(await screen.findByText("OCR 失敗")).toBeInTheDocument();
    expect(screen.getByText("Model response did not match the expected JSON schema.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/translate"))).toBe(false);
  });

  it("較舊的 OCR 回應晚到時，不會覆蓋目前 run 的文字區塊", async () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let resolveFirstOcr: (response: Response) => void = () => {};
    let resolveSecondOcr: (response: Response) => void = () => {};
    const firstOcr = new Promise<Response>((resolve) => {
      resolveFirstOcr = resolve;
    });
    const secondOcr = new Promise<Response>((resolve) => {
      resolveSecondOcr = resolve;
    });
    let ocrRequestCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        ocrRequestCount += 1;
        return ocrRequestCount === 1 ? firstOcr : secondOcr;
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["first"], "first.png", { type: "image/png" })] }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["second"], "second.png", { type: "image/png" })] }
    });

    resolveSecondOcr(
      new Response(
        JSON.stringify({
          blocks: [{ id: "block-1", source_text: "新的文字區塊", confidence: null, position: null }],
          prompt: {
            source: "builtin",
            system_template: "OCR system",
            user_template: "OCR user",
            rendered_system: "OCR system rendered",
            rendered_user: "OCR user rendered"
          },
          raw_model: { model: "gemma3:latest" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    expect(await screen.findByText("新的文字區塊")).toBeInTheDocument();

    resolveFirstOcr(
      new Response(
        JSON.stringify({
          blocks: [{ id: "block-1", source_text: "舊的文字區塊", confidence: null, position: null }],
          prompt: {
            source: "builtin",
            system_template: "OCR system",
            user_template: "OCR user",
            rendered_system: "OCR system rendered",
            rendered_user: "OCR user rendered"
          },
          raw_model: { model: "gemma3:latest" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await waitFor(() => {
      expect(screen.queryByText("舊的文字區塊")).not.toBeInTheDocument();
    });
  });

  it("OCR 執行中會鎖定影響請求的設定", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:running") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let resolveOcr: (response: Response) => void = () => {};
    const ocrResponse = new Promise<Response>((resolve) => {
      resolveOcr = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return ocrResponse;
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("OCR 處理中")).toBeInTheDocument();
    expect(screen.getByLabelText("Ollama 位址")).toBeDisabled();
    expect(screen.getByLabelText("OCR 模型")).toBeDisabled();
    expect(screen.getByLabelText("來源語言提示")).toBeDisabled();
    expect(screen.getByLabelText("逾時秒數")).toBeDisabled();
    expect(screen.getByLabelText("上傳圖片")).toBeDisabled();

    resolveOcr(
      new Response(
        JSON.stringify({
          blocks: [],
          prompt: {
            source: "builtin",
            system_template: "OCR system",
            user_template: "OCR user",
            rendered_system: "OCR system rendered",
            rendered_user: "OCR user rendered"
          },
          raw_model: { model: "gemma3:latest" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    expect(await screen.findByText("OCR 完成")).toBeInTheDocument();
    expect(screen.getByLabelText("Ollama 位址")).toBeEnabled();
  });

  it("OCR 執行中可取消，取消會 abort request 並清空未完成結果", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:cancel") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let ocrSignal: AbortSignal | undefined;
    let resolveOcr: (response: Response) => void = () => {};
    const ocrResponse = new Promise<Response>((resolve) => {
      resolveOcr = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        ocrSignal = init?.signal ?? undefined;
        return ocrResponse;
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("OCR 處理中")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消 OCR" }));

    expect(ocrSignal?.aborted).toBe(true);
    expect(screen.getByText("OCR 已取消")).toBeInTheDocument();
    expect(screen.queryByText("翻譯處理中")).not.toBeInTheDocument();

    resolveOcr(
      new Response(
        JSON.stringify({
          blocks: [{ id: "block-1", source_text: "取消後不應出現", confidence: null, position: null }],
          prompt: {
            source: "builtin",
            system_template: "OCR system",
            user_template: "OCR user",
            rendered_system: "OCR system rendered",
            rendered_user: "OCR user rendered"
          },
          raw_model: { model: "gemma3:latest" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await waitFor(() => {
      expect(screen.queryByText("取消後不應出現")).not.toBeInTheDocument();
    });
  });

  it("OCR 成功且翻譯模型已選時，自動翻譯並左右對照顯示", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:translate") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                { id: "block-1", source_text: "こんにちは", confidence: null, position: null },
                { id: "block-2", source_text: "またね", confidence: null, position: null }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        expect(init?.method).toBe("POST");
        const payload = JSON.parse(String(init?.body));
        expect(payload.translation_model).toBe("qwen3:latest");
        expect(payload.translation_prompt_mode).toBe("prompted");
        expect(payload.source_language_hint).toBe("日文");
        expect(payload.target_language).toBe("繁體中文");
        expect(payload.blocks).toEqual([
          { id: "block-1", source_text: "こんにちは", confidence: null, position: null },
          { id: "block-2", source_text: "またね", confidence: null, position: null }
        ]);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                { block_id: "block-1", translated_text: "你好" },
                { block_id: "block-2", translated_text: "再見" }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("來源語言提示"), {
      target: { value: "日文" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    expect(screen.getByText("こんにちは")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByText("またね")).toBeInTheDocument();
    expect(screen.getByText("再見")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(1);
  });

  it("翻譯提示詞模式切為直接文字時，翻譯 request 不要求提示詞模板模式", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:direct-translation") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "direct",
                system_template: "",
                user_template: "",
                rendered_system: "",
                rendered_user: "Extract all readable text from the image. Do not translate."
              },
              raw_model: { model: "glm-ocr:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        const payload = JSON.parse(String(init?.body));
        expect(payload.translation_prompt_mode).toBe("direct");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "你好" }],
              prompt: {
                source: "direct",
                system_template: "",
                user_template: "",
                rendered_system: "",
                rendered_user: "こんにちは"
              },
              raw_model: { model: "sugoi-14b:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "glm-ocr:latest", model: "glm-ocr:latest" },
              { name: "sugoi-14b:latest", model: "sugoi-14b:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("glm-ocr:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "glm-ocr:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "sugoi-14b:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯提示詞模式"), {
      target: { value: "direct" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(1);
  });

  it("使用者修正原文後不會自動重新翻譯", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:editable") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちわ", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "你好" }],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("block-1 修正原文"), {
      target: { value: "こんにちは" }
    });

    expect(screen.getByLabelText("block-1 修正原文")).toHaveValue("こんにちは");
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(1);
  });

  it("使用者修正原文時以 OCR 原值顯示已修改標記，改回原值後移除標記", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:dirty") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちわ", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "你好" }],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    expect(screen.queryByText("已修改")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("block-1 修正原文"), {
      target: { value: "こんにちは" }
    });

    expect(screen.getByText("已修改")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("block-1 修正原文"), {
      target: { value: "こんにちわ" }
    });

    expect(screen.queryByText("已修改")).not.toBeInTheDocument();
  });

  it("重新處理取得新 OCR 結果後會更新已修改標記基準", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:dirty-reprocess") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let ocrRequestCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        ocrRequestCount += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                {
                  id: "block-1",
                  source_text: ocrRequestCount === 1 ? "初次 OCR" : "重新處理 OCR",
                  confidence: null,
                  position: null
                }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "譯文" }],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("block-1 修正原文"), {
      target: { value: "手動修正" }
    });
    expect(screen.getByText("已修改")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新處理" }));

    expect(await screen.findByDisplayValue("重新處理 OCR")).toBeInTheDocument();
    expect(screen.queryByText("已修改")).not.toBeInTheDocument();
  });

  it("完成後可複製單段譯文與依區塊順序複製全部譯文", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:copy") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                { id: "panel-a", source_text: "一", confidence: null, position: null },
                { id: "panel-b", source_text: "二", confidence: null, position: null }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                { block_id: "panel-b", translated_text: "第二段譯文" },
                { block_id: "panel-a", translated_text: "第一段譯文" }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "panel-b 複製譯文" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("第二段譯文"));

    fireEvent.click(screen.getByRole("button", { name: "複製全部譯文" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("第一段譯文\n第二段譯文"));
  });

  it("完成 OCR-only 任務後選擇翻譯模型會自動翻譯", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:completed-settings") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "你好" }],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("OCR 完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    expect(screen.getByLabelText("block-1 修正原文")).toHaveValue("こんにちは");
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(1);
  });

  it("使用者按重新翻譯時只送出目前修正原文到翻譯 API", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:retranslate") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let translationRequestCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちわ", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        translationRequestCount += 1;
        const payload = JSON.parse(String(init?.body));
        if (translationRequestCount === 2) {
          expect(payload.blocks).toEqual([
            { id: "block-1", source_text: "こんにちは", confidence: null, position: null }
          ]);
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                {
                  block_id: "block-1",
                  translated_text: translationRequestCount === 1 ? "你好" : "你好，修正版"
                }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("block-1 修正原文"), {
      target: { value: "こんにちは" }
    });
    fireEvent.click(screen.getByRole("button", { name: "重新翻譯" }));

    expect(await screen.findByText("你好，修正版")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(2);
  });

  it("更改目標語言後不會自動重跑，重新翻譯會使用新的目標語言", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:target-language") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let translationRequestCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        translationRequestCount += 1;
        const payload = JSON.parse(String(init?.body));
        if (translationRequestCount === 2) {
          expect(payload.target_language).toBe("英文");
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                { block_id: "block-1", translated_text: translationRequestCount === 1 ? "你好" : "Hello" }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("目標語言"), {
      target: { value: "英文" }
    });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "重新翻譯" }));

    expect(await screen.findByText("Hello")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(2);
  });

  it("更改來源語言提示後不會自動重跑，使用者可以重新處理目前圖片", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:source-hint") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let ocrRequestCount = 0;
    let translationRequestCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        ocrRequestCount += 1;
        const formData = init?.body as FormData;
        if (ocrRequestCount === 2) {
          expect(formData.get("source_language_hint")).toBe("英文");
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                {
                  id: "block-1",
                  source_text: ocrRequestCount === 1 ? "こんにちは" : "Hello there",
                  confidence: null,
                  position: null
                }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        translationRequestCount += 1;
        const payload = JSON.parse(String(init?.body));
        if (translationRequestCount === 2) {
          expect(payload.source_language_hint).toBe("英文");
          expect(payload.blocks).toEqual([
            { id: "block-1", source_text: "こんにちは", confidence: null, position: null }
          ]);
        }
        if (translationRequestCount === 3) {
          expect(payload.source_language_hint).toBe("英文");
          expect(payload.blocks).toEqual([
            { id: "block-1", source_text: "Hello there", confidence: null, position: null }
          ]);
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                {
                  block_id: "block-1",
                  translated_text:
                    translationRequestCount === 1
                      ? "你好"
                      : translationRequestCount === 2
                        ? "Hello from hint"
                        : "嗨"
                }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("來源語言提示"), {
      target: { value: "英文" }
    });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "重新翻譯" }));

    expect(await screen.findByText("Hello from hint")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "重新處理" }));

    expect(await screen.findByText("嗨")).toBeInTheDocument();
    expect(screen.getByLabelText("block-1 修正原文")).toHaveValue("Hello there");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(3);
  });

  it("重新翻譯失敗時保留使用者已修正的原文", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:failed-retranslate") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let translationRequestCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちわ", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        translationRequestCount += 1;
        if (translationRequestCount === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "timeout",
                  stage: "translation",
                  message: "Translation request timed out.",
                  details: {}
                }
              }),
              { status: 504, headers: { "Content-Type": "application/json" } }
            )
          );
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "你好" }],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("block-1 修正原文"), {
      target: { value: "こんにちは" }
    });
    fireEvent.click(screen.getByRole("button", { name: "重新翻譯" }));

    expect(await screen.findByText("翻譯失敗")).toBeInTheDocument();
    expect(screen.getByText("Translation request timed out.")).toBeInTheDocument();
    expect(screen.getByLabelText("block-1 修正原文")).toHaveValue("こんにちは");
    expect(screen.getByText("尚未翻譯")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/ocr"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/translate"))).toHaveLength(2);
  });

  it("翻譯失敗時保留 OCR 文字區塊並顯示翻譯階段錯誤", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:translation-error") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_model_json",
                stage: "translation",
                message: "Model response did not match the expected JSON schema.",
                details: {
                  reason: "Expecting value: line 1 column 1 (char 0)",
                  raw_model_response: "not json\nmodel returned plain text"
                }
              }
            }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯失敗")).toBeInTheDocument();
    expect(screen.getByText("Model response did not match the expected JSON schema.")).toBeInTheDocument();
    expect(screen.getByText("模型原始輸出")).toBeInTheDocument();
    expect(screen.getByText(/model returned plain text/)).toBeInTheDocument();
    expect(screen.getByText("こんにちは")).toBeInTheDocument();
    expect(screen.getByText("尚未翻譯")).toBeInTheDocument();
  });

  it("翻譯執行中可取消，取消會保留 OCR 原文並忽略舊翻譯回應", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:cancel-translation") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let translationSignal: AbortSignal | undefined;
    let resolveTranslation: (response: Response) => void = () => {};
    const translationResponse = new Promise<Response>((resolve) => {
      resolveTranslation = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        translationSignal = init?.signal ?? undefined;
        return translationResponse;
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯處理中")).toBeInTheDocument();
    expect(screen.getByLabelText("Ollama 位址")).toBeDisabled();
    expect(screen.getByLabelText("OCR 模型")).toBeDisabled();
    expect(screen.getByLabelText("翻譯模型")).toBeDisabled();
    expect(screen.getByLabelText("來源語言提示")).toBeDisabled();
    expect(screen.getByLabelText("目標語言")).toBeDisabled();
    expect(screen.getByLabelText("逾時秒數")).toBeDisabled();
    expect(screen.getByLabelText("上傳圖片")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "取消翻譯" }));

    expect(translationSignal?.aborted).toBe(true);
    expect(screen.getByText("翻譯已取消")).toBeInTheDocument();
    expect(screen.getByLabelText("block-1 修正原文")).toHaveValue("こんにちは");
    expect(screen.getByText("尚未翻譯")).toBeInTheDocument();

    resolveTranslation(
      new Response(
        JSON.stringify({
          translations: [{ block_id: "block-1", translated_text: "取消後不應出現" }],
          prompt: {
            source: "builtin",
            system_template: "Translation system",
            user_template: "Translation user",
            rendered_system: "Translation system rendered",
            rendered_user: "Translation user rendered"
          },
          raw_model: { model: "qwen3:latest" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await waitFor(() => {
      expect(screen.queryByText("取消後不應出現")).not.toBeInTheDocument();
    });
  });

  it("重新翻譯執行中可取消，取消會保留修正原文並清空未完成譯文", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:cancel-retranslation") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    let translationRequestCount = 0;
    let retranslationSignal: AbortSignal | undefined;
    let resolveRetranslation: (response: Response) => void = () => {};
    const retranslationResponse = new Promise<Response>((resolve) => {
      resolveRetranslation = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちわ", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        translationRequestCount += 1;
        if (translationRequestCount === 2) {
          retranslationSignal = init?.signal ?? undefined;
          return retranslationResponse;
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "你好" }],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("block-1 修正原文"), {
      target: { value: "こんにちは" }
    });
    fireEvent.click(screen.getByRole("button", { name: "重新翻譯" }));

    expect(await screen.findByText("翻譯處理中")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消翻譯" }));

    expect(retranslationSignal?.aborted).toBe(true);
    expect(screen.getByText("翻譯已取消")).toBeInTheDocument();
    expect(screen.getByLabelText("block-1 修正原文")).toHaveValue("こんにちは");
    expect(screen.getByText("尚未翻譯")).toBeInTheDocument();
    expect(screen.queryByText("你好")).not.toBeInTheDocument();

    resolveRetranslation(
      new Response(
        JSON.stringify({
          translations: [{ block_id: "block-1", translated_text: "取消後不應出現" }],
          prompt: {
            source: "builtin",
            system_template: "Translation system",
            user_template: "Translation user",
            rendered_system: "Translation system rendered",
            rendered_user: "Translation user rendered"
          },
          raw_model: { model: "qwen3:latest" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await waitFor(() => {
      expect(screen.queryByText("取消後不應出現")).not.toBeInTheDocument();
    });
  });

  it("OCR 成功但沒有文字區塊時，即使翻譯模型已選也不呼叫翻譯", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:empty-translation") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.webp", { type: "image/webp" })] }
    });

    expect(await screen.findByText("OCR 完成")).toBeInTheDocument();
    expect(screen.getByText("未偵測到可翻譯文字")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/translate"))).toBe(false);
  });

  it("完成翻譯後可匯出結構化 JSON，且不包含圖片內容", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob | MediaSource) => (value instanceof Blob ? "blob:export-json" : "blob:preview"))
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                { id: "panel-a", source_text: "こんにちは", confidence: 0.87, position: null },
                { id: "panel-b", source_text: "世界", confidence: null, position: null }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                { block_id: "panel-a", translated_text: "你好" },
                { block_id: "panel-b", translated_text: "世界" }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("Ollama 位址"), {
      target: { value: "http://ollama.test:11434" }
    });
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("來源語言提示"), {
      target: { value: "日文" }
    });
    fireEvent.change(screen.getByLabelText("目標語言"), {
      target: { value: "英文" }
    });
    fireEvent.change(screen.getByLabelText("逾時秒數"), {
      target: { value: "45" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: {
        files: [new File(["data:image/png;base64,secret-image-bytes"], "page.png", { type: "image/png" })]
      }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "匯出 JSON" }));

    const exported = await readDownloadedJson();
    const exportedText = JSON.stringify(exported);

    expect(clickSpy).toHaveBeenCalled();
    expect(exported).toMatchObject({
      version: 1,
      image: { filename: "page.png" },
      settings: {
        ollama_base_url: "http://ollama.test:11434",
        ocr_model: "gemma3:latest",
        translation_model: "qwen3:latest",
        ocr_prompt_mode: "auto",
        translation_prompt_mode: "prompted",
        source_language_hint: "日文",
        target_language: "英文",
        timeout_seconds: 45
      },
      blocks: [
        { block_id: "panel-a", source_text: "こんにちは", confidence: 0.87, position: null },
        { block_id: "panel-b", source_text: "世界", confidence: null, position: null }
      ],
      translations: {
        "panel-a": "你好",
        "panel-b": "世界"
      },
      prompts: {
        ocr: {
          source: "builtin",
          system_template: "OCR system",
          user_template: "OCR user",
          rendered_system: "OCR system rendered",
          rendered_user: "OCR user rendered"
        },
        translation: {
          source: "builtin",
          system_template: "Translation system",
          user_template: "Translation user",
          rendered_system: "Translation system rendered",
          rendered_user: "Translation user rendered"
        }
      }
    });
    expect(exportedText).not.toContain("secret-image-bytes");
    expect(exportedText).not.toContain("data:image");
    expect(exportedText).not.toContain("blob:export-json");
  });

  it("可匯入先前匯出的 JSON 並還原任務內容但不偽造圖片預覽", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");

    const taskJson = {
      version: 1,
      image: { filename: "imported-page.png" },
      settings: {
        ollama_base_url: "http://ollama.imported:11434",
        ocr_model: "gemma3:latest",
        translation_model: "qwen3:latest",
        ocr_prompt_mode: "prompted",
        translation_prompt_mode: "direct",
        source_language_hint: "日文",
        target_language: "英文",
        timeout_seconds: 45
      },
      blocks: [
        { block_id: "panel-a", source_text: "こんにちは", confidence: 0.87, position: null },
        { block_id: "panel-b", source_text: "世界", confidence: null, position: null }
      ],
      translations: {
        "panel-a": "Hello",
        "panel-b": "World"
      },
      prompts: {
        ocr: {
          source: "builtin",
          system_template: "OCR system",
          user_template: "OCR user",
          rendered_system: "Imported OCR system rendered",
          rendered_user: "Imported OCR user rendered"
        },
        translation: {
          source: "builtin",
          system_template: "Translation system",
          user_template: "Translation user",
          rendered_system: "Imported translation system rendered",
          rendered_user: "Imported translation user rendered"
        }
      }
    };

    fireEvent.change(screen.getByLabelText("匯入 JSON"), {
      target: {
        files: [
          new File([JSON.stringify(taskJson)], "imported-page.translation-task.json", {
            type: "application/json"
          })
        ]
      }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    expect(screen.getByText("已匯入 imported-page.png；JSON 不包含原圖，重新處理前請重新選圖。")).toBeInTheDocument();
    expect(screen.queryByAltText("上傳圖片預覽")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ollama 位址")).toHaveValue("http://ollama.imported:11434");
    expect(screen.getByLabelText("OCR 模型")).toHaveValue("gemma3:latest");
    expect(screen.getByLabelText("翻譯模型")).toHaveValue("qwen3:latest");
    expect(screen.getByLabelText("OCR 提示詞模式")).toHaveValue("prompted");
    expect(screen.getByLabelText("翻譯提示詞模式")).toHaveValue("direct");
    expect(screen.getByLabelText("來源語言提示")).toHaveValue("日文");
    expect(screen.getByLabelText("目標語言")).toHaveValue("英文");
    expect(screen.getByLabelText("逾時秒數")).toHaveValue(45);
    expect(screen.getByLabelText("panel-a 修正原文")).toHaveValue("こんにちは");
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByLabelText("任務 OCR rendered system")).toHaveValue("Imported OCR system rendered");
    expect(screen.getByLabelText("任務翻譯 rendered user")).toHaveValue(
      "Imported translation user rendered"
    );
  });

  it("匯入壞格式 JSON 時拒絕並保留目前任務", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");

    const currentTaskJson = {
      version: 1,
      image: { filename: "current-page.png" },
      settings: {
        ollama_base_url: "http://ollama.current:11434",
        ocr_model: "gemma3:latest",
        translation_model: "qwen3:latest",
        ocr_prompt_mode: "auto",
        translation_prompt_mode: "prompted",
        source_language_hint: "自動判斷",
        target_language: "繁體中文",
        timeout_seconds: 120
      },
      blocks: [{ block_id: "current-block", source_text: "保留這段", confidence: null, position: null }],
      translations: {
        "current-block": "保留譯文"
      },
      prompts: {
        ocr: {
          source: "builtin",
          system_template: "OCR system",
          user_template: "OCR user",
          rendered_system: "Current OCR system rendered",
          rendered_user: "Current OCR user rendered"
        },
        translation: {
          source: "builtin",
          system_template: "Translation system",
          user_template: "Translation user",
          rendered_system: "Current translation system rendered",
          rendered_user: "Current translation user rendered"
        }
      }
    };

    fireEvent.change(screen.getByLabelText("匯入 JSON"), {
      target: {
        files: [
          new File([JSON.stringify(currentTaskJson)], "current.translation-task.json", {
            type: "application/json"
          })
        ]
      }
    });

    expect(await screen.findByText("保留譯文")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("匯入 JSON"), {
      target: {
        files: [
          new File([JSON.stringify({ version: 1, image: { filename: "bad.png" } })], "bad.json", {
            type: "application/json"
          })
        ]
      }
    });

    expect(await screen.findByText("匯入失敗：JSON 欄位不符合匯出格式")).toBeInTheDocument();
    expect(screen.getByLabelText("current-block 修正原文")).toHaveValue("保留這段");
    expect(screen.getByText("保留譯文")).toBeInTheDocument();
    expect(screen.queryByText("bad.png")).not.toBeInTheDocument();
  });

  it("匯入不支援版本的 JSON 時拒絕", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("匯入 JSON"), {
      target: {
        files: [
          new File(
            [
              JSON.stringify({
                version: 2,
                image: { filename: "future.png" },
                settings: {},
                blocks: [],
                translations: {},
                prompts: {}
              })
            ],
            "future.json",
            { type: "application/json" }
          )
        ]
      }
    });

    expect(await screen.findByText("匯入失敗：不支援的 JSON 版本")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "開始第一個翻譯任務" })).toBeInTheDocument();
  });

  it("匯入非 JSON 文字時拒絕且顯示一致錯誤", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);

    await screen.findByText("目前沒有可用模型");
    fireEvent.change(screen.getByLabelText("匯入 JSON"), {
      target: {
        files: [new File(["not-json"], "broken.json", { type: "application/json" })]
      }
    });

    expect(await screen.findByText("匯入失敗：JSON 格式不符")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "開始第一個翻譯任務" })).toBeInTheDocument();
  });

  it("匯入 JSON 後即使模型不在目前清單仍顯示匯入設定", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    });

    render(<App />);

    await screen.findByText("目前沒有可用模型");
    fireEvent.change(screen.getByLabelText("匯入 JSON"), {
      target: {
        files: [
          new File(
            [
              JSON.stringify({
                version: 1,
                image: { filename: "missing-model-page.png" },
                settings: {
                  ollama_base_url: "http://ollama.imported:11434",
                  ocr_model: "old-ocr:latest",
                  translation_model: "old-translation:latest",
                  ocr_prompt_mode: "auto",
                  translation_prompt_mode: "prompted",
                  source_language_hint: "日文",
                  target_language: "繁體中文",
                  timeout_seconds: 60
                },
                blocks: [
                  {
                    block_id: "block-1",
                    source_text: "古い",
                    confidence: null,
                    position: null
                  }
                ],
                translations: { "block-1": "舊譯文" },
                prompts: {
                  ocr: {
                    source: "builtin",
                    system_template: "OCR system",
                    user_template: "OCR user",
                    rendered_system: "OCR system rendered",
                    rendered_user: "OCR user rendered"
                  },
                  translation: {
                    source: "builtin",
                    system_template: "Translation system",
                    user_template: "Translation user",
                    rendered_system: "Translation system rendered",
                    rendered_user: "Translation user rendered"
                  }
                }
              })
            ],
            "missing-model-page.translation-task.json",
            { type: "application/json" }
          )
        ]
      }
    });

    expect(await screen.findByText("舊譯文")).toBeInTheDocument();
    expect(screen.getByLabelText("OCR 模型")).toHaveValue("old-ocr:latest");
    expect(screen.getByLabelText("翻譯模型")).toHaveValue("old-translation:latest");
    expect(screen.getByRole("option", { name: "OCR：old-ocr:latest" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "翻譯：old-translation:latest" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新整理模型清單" }));

    await waitFor(() => {
      expect(screen.getByLabelText("OCR 模型")).toHaveValue("");
    });
    expect(screen.getByLabelText("翻譯模型")).toHaveValue("");
  });

  it("完成後可依目前文字區塊順序匯出純譯文 TXT", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob | MediaSource) => (value instanceof Blob ? "blob:export-txt" : "blob:preview"))
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                { id: "panel-a", source_text: "一", confidence: null, position: null },
                { id: "panel-b", source_text: "二", confidence: null, position: null },
                { id: "panel-c", source_text: "三", confidence: null, position: null }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                { block_id: "panel-b", translated_text: "第二段譯文" },
                { block_id: "panel-a", translated_text: "第一段譯文" }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    expect(screen.getByText("尚未翻譯")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "匯出 TXT" }));

    expect(clickSpy).toHaveBeenCalled();
    expect(await readDownloadedText("text/plain")).toBe("第一段譯文\n第二段譯文\n");
  });

  it("完成後以第一個無位置資訊文字區塊作為校對焦點並顯示同步狀態", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:proofreading-sync")
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                { id: "panel-a", source_text: "一", confidence: null, position: null },
                { id: "panel-b", source_text: "二", confidence: null, position: null },
                { id: "panel-c", source_text: "三", confidence: null, position: null }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                { block_id: "panel-a", translated_text: "第一段譯文" },
                { block_id: "panel-b", translated_text: "第二段譯文" },
                { block_id: "panel-c", translated_text: "第三段譯文" }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    const syncText = screen.getByText("正在校對第 1／共 3 段");
    const proofreadingList = screen.getByRole("list", { name: "校對文字區塊" });

    expect(syncText).toBeInTheDocument();
    expect(proofreadingList).not.toContainElement(syncText);
    expect([...proofreadingList.children].map((child) => child.getAttribute("role"))).toEqual([
      "listitem",
      "listitem",
      "listitem"
    ]);

    const firstBlock = screen.getByLabelText("panel-a 修正原文").closest("article");
    const secondBlock = screen.getByLabelText("panel-b 修正原文").closest("article");
    const thirdBlock = screen.getByLabelText("panel-c 修正原文").closest("article");

    await waitFor(() => expect(firstBlock).toHaveAttribute("aria-current", "true"));
    expect(secondBlock).not.toHaveAttribute("aria-current");
    expect(thirdBlock).not.toHaveAttribute("aria-current");
  });

  it("可用 ArrowDown 與 J/K 在無位置資訊文字區塊間移動校對焦點", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:proofreading-keyboard")
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [
                { id: "panel-a", source_text: "一", confidence: null, position: null },
                { id: "panel-b", source_text: "二", confidence: null, position: null },
                { id: "panel-c", source_text: "三", confidence: null, position: null }
              ],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                { block_id: "panel-a", translated_text: "第一段譯文" },
                { block_id: "panel-b", translated_text: "第二段譯文" },
                { block_id: "panel-c", translated_text: "第三段譯文" }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();

    const firstBlock = screen.getByLabelText("panel-a 修正原文").closest("article");
    const secondBlock = screen.getByLabelText("panel-b 修正原文").closest("article");

    firstBlock?.focus();
    expect(firstBlock).toHaveFocus();

    fireEvent.keyDown(firstBlock!, { key: "ArrowDown" });

    expect(screen.getByText("正在校對第 2／共 3 段")).toBeInTheDocument();
    expect(firstBlock).not.toHaveAttribute("aria-current");
    expect(secondBlock).toHaveAttribute("aria-current", "true");
    expect(secondBlock).toHaveFocus();

    const secondTextarea = screen.getByLabelText("panel-b 修正原文");
    secondTextarea.focus();
    fireEvent.keyDown(secondTextarea, { key: "j" });
    fireEvent.keyDown(secondTextarea, { key: "ArrowDown" });

    expect(screen.getByText("正在校對第 2／共 3 段")).toBeInTheDocument();
    expect(secondBlock).toHaveAttribute("aria-current", "true");

    const secondCopyButton = screen.getByRole("button", { name: "panel-b 複製譯文" });
    secondCopyButton.focus();
    fireEvent.keyDown(secondCopyButton, { key: "j" });

    expect(screen.getByText("正在校對第 2／共 3 段")).toBeInTheDocument();
    expect(secondBlock).toHaveAttribute("aria-current", "true");

    secondBlock?.focus();
    fireEvent.keyDown(secondBlock!, { key: "k" });

    expect(screen.getByText("正在校對第 1／共 3 段")).toBeInTheDocument();
    expect(firstBlock).toHaveAttribute("aria-current", "true");
    expect(firstBlock).toHaveFocus();
  });

  it("完成後變更目標語言但未重新翻譯時，匯出保留該次結果使用的設定", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob | MediaSource) => (value instanceof Blob ? "blob:stable-settings" : "blob:preview"))
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [{ block_id: "block-1", translated_text: "你好" }],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("目標語言"), {
      target: { value: "繁體中文" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("目標語言"), {
      target: { value: "英文" }
    });
    fireEvent.click(screen.getByRole("button", { name: "匯出 JSON" }));

    expect(await readDownloadedJson()).toMatchObject({
      settings: {
        target_language: "繁體中文"
      },
      translations: {
        "block-1": "你好"
      }
    });
  });

  it("OCR 完成但沒有文字區塊時可匯出空結果 JSON", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob | MediaSource) => (value instanceof Blob ? "blob:empty-export" : "blob:preview"))
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest", model: "gemma3:latest" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "empty.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("未偵測到可翻譯文字")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "匯出 JSON" }));

    expect(await readDownloadedJson()).toMatchObject({
      image: { filename: "empty.png" },
      blocks: [],
      translations: {},
      prompts: {
        ocr: {
          rendered_system: "OCR system rendered",
          rendered_user: "OCR user rendered"
        },
        translation: null
      }
    });
  });

  it("重新翻譯後匯出保留產生文字區塊的 OCR 模型", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((value: Blob | MediaSource) => (value instanceof Blob ? "blob:ocr-model-export" : "blob:preview"))
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    let translationRequestCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).startsWith("/api/prompts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "builtin",
              ocr: { system: "OCR system", user: "OCR user" },
              translation: { system: "Translation system", user: "Translation user" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/ocr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              blocks: [{ id: "block-1", source_text: "こんにちは", confidence: null, position: null }],
              prompt: {
                source: "builtin",
                system_template: "OCR system",
                user_template: "OCR user",
                rendered_system: "OCR system rendered",
                rendered_user: "OCR user rendered"
              },
              raw_model: { model: "gemma3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (String(input).startsWith("/api/translate")) {
        translationRequestCount += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              translations: [
                {
                  block_id: "block-1",
                  translated_text: translationRequestCount === 1 ? "你好" : "Hello"
                }
              ],
              prompt: {
                source: "builtin",
                system_template: "Translation system",
                user_template: "Translation user",
                rendered_system: "Translation system rendered",
                rendered_user: "Translation user rendered"
              },
              raw_model: { model: "qwen3:latest" }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            models: [
              { name: "gemma3:latest", model: "gemma3:latest" },
              { name: "other-ocr:latest", model: "other-ocr:latest" },
              { name: "qwen3:latest", model: "qwen3:latest" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    render(<App />);

    await screen.findByText("gemma3:latest");
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "gemma3:latest" }
    });
    fireEvent.change(screen.getByLabelText("翻譯模型"), {
      target: { value: "qwen3:latest" }
    });
    fireEvent.change(screen.getByLabelText("上傳圖片"), {
      target: { files: [new File(["small"], "page.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("翻譯完成")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("OCR 模型"), {
      target: { value: "other-ocr:latest" }
    });
    fireEvent.change(screen.getByLabelText("目標語言"), {
      target: { value: "英文" }
    });
    fireEvent.click(screen.getByRole("button", { name: "重新翻譯" }));

    expect(await screen.findByText("Hello")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "匯出 JSON" }));

    expect(await readDownloadedJson()).toMatchObject({
      settings: {
        ocr_model: "gemma3:latest",
        translation_model: "qwen3:latest",
        target_language: "英文"
      },
      translations: {
        "block-1": "Hello"
      }
    });
  });
});

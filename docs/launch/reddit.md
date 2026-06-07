# Reddit 發文草稿

## 共通原則

- 遵守 90/10 價值原則：90% 分享流程、限制、踩坑與可討論的技術問題，10% 說明工具。
- 發文前查 subreddit 最新規則、flair、自我推廣比例與標題格式；規則若禁止 project showcase，就不要發。
- 不 spam：同一天不要把同一篇文複製到多個 subreddit。依社群語境改寫，並在留言中回覆問題。
- 不要求 upvotes、不要用「請支持」語氣；自然分享 repo 與請求回饋即可。
- 不 clickbait：標題具體、保守、可驗證。
- 透明說明身分：I am the author/maintainer。
- 隱私說法要準確：backend 不保存上傳圖片，但圖片仍會經過 browser、本機 backend 與本機 Ollama。
- 不聲稱支援多張圖片批次、CBZ/ZIP、嵌字回圖、on-image overlay、任務歷史或匯入 JSON。

## r/LocalLLaMA

建議 flair：Project 或 Discussion。發文前查最新規則/flair。

Title:

```text
I built a local Ollama workflow for manga OCR + translation, with editable OCR blocks
```

Body:

```text
I am the author/maintainer of a small open-source tool called Manga OCR Translator.

The thing I wanted to solve was not "make manga translation fully automatic." It was the more boring problem I kept running into with local models: OCR mistakes are easy to miss, and a translation can look fluent even when the source text was read incorrectly.

The current workflow is:

- upload one image
- choose an OCR model and a translation model from local Ollama
- let the app run OCR and translation
- inspect each text block
- edit OCR text when the model misread something
- re-run only translation after proofreading

The backend does not persist uploaded images. That does not mean absolute privacy: the image still passes through the browser, local backend, and local Ollama. I am describing the project as local-first and lower-risk, not as a security guarantee.

What I would like to discuss with r/LocalLLaMA:

- Which local vision models have you found least painful for OCR-like text extraction?
- Do you prefer one model for OCR and another for translation, or one multimodal model for everything?
- What kind of structured JSON prompting has been reliable for you?

Project link: https://github.com/jhihweijhan/manga-ocr-translator
```

繁中備註：

- 重點放在 local model workflow 與 OCR 結構化輸出，不要包裝成一般漫畫迷宣傳。
- 若有人問支援度，回答第一版只處理單張圖片；沒有批次、CBZ/ZIP 或嵌字回圖。

## r/selfhosted

建議 flair：Showoff、Guide 或 Software。發文前查最新規則/flair。

Title:

```text
I made a small local-first manga OCR translator that runs through Ollama
```

Body:

```text
I am the author/maintainer of Manga OCR Translator. I built it for a self-hosted/local-first use case: translating text from a single manga image without sending the model work to a hosted API.

The architecture is intentionally simple:

- browser UI
- local FastAPI backend
- local Ollama server
- no backend persistence for uploaded images
- no task history

The important caveat: this is not "perfect privacy." The image still moves through the browser, local backend, and Ollama. The backend just does not save the upload after the current request.

The useful part for me is inspectability. The app shows OCR text blocks and translations separately, so you can check what the model read, fix source text, and re-translate without repeating OCR.

I am sharing it here because I would like feedback from people who self-host small tools:

- Is the browser -> local backend -> Ollama split reasonable?
- What setup docs would you expect before trying a tool like this?
- Would you rather see Docker docs first, or keep the first-run path focused on uv/npm/Ollama?

Project link: https://github.com/jhihweijhan/manga-ocr-translator
```

繁中備註：

- r/selfhosted 重點是部署、資料路徑、維運清楚，不要把工具描述成雲端替代品大全。
- 可以提 backend 不保存，但不要說完全私密。

## r/manga

建議 flair：Discussion、Fan Translation 或 Tools；發文前查最新規則/flair。若 subreddit 禁止工具宣傳、自我推廣或 AI 相關內容，就不要發。

Title:

```text
A proofreading-first tool for checking manga OCR before translation
```

Body:

```text
I am the author/maintainer of Manga OCR Translator, and I wanted to share it carefully because I know tool posts can easily become spammy.

The reason I built it: automatic OCR/translation can be useful for rough reading, but it is also easy to trust a fluent translation when the OCR text was wrong. For manga, that can change the meaning quickly.

This tool is focused on proofreading rather than fully automated release workflows:

- upload one image
- run OCR and translation with local Ollama models
- inspect the text blocks
- edit OCR text if it was misread
- re-translate after correction

It does not embed text back into the image, does not support batch chapters, and does not handle CBZ/ZIP. It is closer to a local reading/proofreading helper than a scanlation production tool.

Privacy note: the backend does not save uploaded images, but the image still passes through the browser, local backend, and Ollama.

Question for readers/translators: when you use OCR or machine translation as a helper, where do you most need manual checks: OCR text, names, tone, SFX, or final wording?

Project link: https://github.com/jhihweijhan/manga-ocr-translator
```

繁中備註：

- r/manga 可能對 AI、翻譯、scanlation 與自我推廣更敏感，發文前必須查規則。
- 避免「取代譯者」語氣。主軸是可檢查、可校對、輔助閱讀。

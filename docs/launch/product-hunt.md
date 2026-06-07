# Product Hunt 發布包

## 定位

Manga OCR Translator 是 local-first 的單張漫畫圖片 OCR + 翻譯工具。它讓使用者在本機 Ollama 模型上完成辨識與翻譯，並保留可檢查、可校對的文字區塊流程。

安全邊界要講清楚：backend 不保存上傳圖片；但圖片仍會經過 browser、本機 backend 與本機 Ollama。不要寫成完全安全、完全私密或零風險。

## Listing

- Product name: Manga OCR Translator
- Tagline: Local manga OCR and translation you can proofread
- Tagline 長度: 49 chars，60 chars 內，句尾不加句點
- Topics max 3:
  - Artificial Intelligence
  - Open Source
  - Productivity
- Short description:
  - Local-first manga OCR translator for single images. Run OCR and translation through local Ollama, inspect each text block, proofread OCR text, and re-translate without saving uploaded images on the backend.

## Gallery 1270x760

Product Hunt 建議每張 gallery image 使用 1270x760。第一張圖必須直接展示產品在做什麼，不用抽象插圖。

1. Hero, 1270x760: 單張漫畫圖片上傳後，右側/下方可看到 OCR 原文與區塊譯文。畫面文案：Local manga OCR + translation, inspect every block。
2. Proofread flow, 1270x760: 顯示使用者修正 OCR 原文，再按重新翻譯。畫面文案：Fix OCR text before re-translation。
3. Local-first path, 1270x760: browser -> local backend -> Ollama 的簡圖，附註 backend does not persist uploads。避免寫成 cloud-free security guarantee。
4. Model controls, 1270x760: 顯示 OCR 模型、翻譯模型、來源語言提示與目標語言設定。畫面文案：Choose local OCR and translation models。
5. Inspectable output, 1270x760: 顯示文字區塊、區塊譯文與提示詞可檢查；複製、TXT 匯出、task JSON 匯出/匯入只作次要細節。不要暗示任務歷史，並註明 task JSON 不包含原圖。

## maker comment

英文發文 copy：

```text
Hey Product Hunt!

Manga OCR Translator is a local-first tool for translating text from a single manga image with Ollama.

I built it because manga OCR/translation workflows often hide the part that matters most: what the model actually read. When OCR is wrong, the translation can look fluent but be based on bad source text.

This tool keeps the flow inspectable. Upload one image, pick local OCR and translation models, review each text block, edit the OCR text when needed, and re-translate without running OCR again. You can copy translations, export TXT, or export/import a task JSON for later proofreading; the JSON restores text results and settings but not the original image. The backend does not save uploaded images, but the image still passes through the browser, local backend, and local Ollama, so I describe it as lower-risk local processing rather than absolute privacy.

I am looking for feedback from people who run local models or translate scanned pages: where does the proofreading flow still feel too slow?
```

繁中備註：

- 不要求 upvotes。
- 5 分鐘內貼出 maker comment。
- 透明說明作者/maintainer 身分。
- 若有人問隱私，回覆「backend 不保存上傳圖片，但圖片仍會經過 browser、本機 backend 與 Ollama」。

## 時程

- 建議發布日：Tue-Thu 12:01 AM PT。
- 避開大型開發者活動、重大平台發表與假日。
- 發布日以 PT midnight 到隔天 PT midnight 計算。

## Launch day checklist

- [ ] Product Hunt listing 連結、名稱、tagline、topics max 3 完成。
- [ ] Gallery 1270x760 圖片完成，第一張能直接看出產品用途。
- [ ] maker comment 完成並由 maintainer 檢查語氣與承諾邊界。
- [ ] 確認 landing/README 沒有宣稱批次、多頁、CBZ/ZIP、串流進度、嵌字回圖、on-image overlay 或任務歷史；task JSON 匯入/匯出需說明不包含原圖。
- [ ] 12:01 AM PT 發布。
- [ ] 發布後 5 分鐘內貼 maker comment。
- [ ] 當天回覆每個問題，尤其是 Ollama、本機處理、隱私與校對流程。
- [ ] 分享到個人帳號時只說「我今天發布了，歡迎看看與給意見」，不要要求 upvotes。
- [ ] 收集問題，分類成文件改善、產品缺口與 bug。

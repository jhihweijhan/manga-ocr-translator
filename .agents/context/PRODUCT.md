# Product

## Register

product

## Users

跑本機 Ollama 的開發者與自架（self-hosted）愛好者。情境：在自己的機器上把單張漫畫圖片的文字辨識並翻成目標語言（多為日→繁中）。他們重視結果可檢查、流程可控制、模型與提示詞可觀察，且資料不外流（圖片不落地、無持久化）。對 LocalLLaMA / r/selfhosted 文化熟悉，偏好深色、不怕資訊密度，但討厭被簡化到失去控制。

## Product Purpose

Local-first 漫畫 OCR 翻譯器的 WebUI。讓使用者選 OCR 模型與翻譯模型、上傳一張圖片，自動連續跑 OCR → 翻譯，並以「原文 ↔ 區塊譯文」對照呈現，可修正原文後只重跑翻譯。第一版單一任務、無持久保存、無文字區域偵測（`position` 永遠為 null，譯文不能疊回圖上）。成功 = 使用者能快速完成一次翻譯、信任結果、看懂出錯時模型的原始輸出。

## Brand Personality

漫畫墨印（manga ink/print）× 工具精準。三詞：**硬派、清晰、可信賴**。視覺帶有 seinen 漫畫的墨黑線條、網點（halftone/screentone）、分鏡框與墨紅 accent；但個性透過識別與框架層表達，功能核心保持安靜、familiar、可信賴。聲音：直接、技術性、不賣弄。

## Anti-references

- 泛 SaaS 奶油色／紫藍漸層／大圓角卡片的 AI 預設外觀。
- 萌系／可愛動漫風（粉嫩、圓滾滾、表情貼圖）——要漫畫感，但是硬派墨印，不是 kawaii。
- 重型企業儀表板（密側邊欄 + 多卡片 KPI）。
- 玄重 glassmorphism（到處毛玻璃當裝飾）。

## Design Principles

1. **個性在框架，安靜在核心**：漫畫墨印只進識別/框架/空狀態（wordmark、分鏡粗框、網點、墨紅 accent、處理中速度線）；表單、下拉、對照表、按鈕維持 product UI 的 earned familiarity。
2. **可檢查優先**：模型選擇、提示詞、原始輸出、錯誤都看得到、查得到；不為了乾淨而藏掉 power user 要的控制（收進進階，不是刪除）。
3. **本機優先、離線可用**：不引入外部字體/CDN/新 npm 依賴；維持純 CSS + React。識別感靠 CSS 紋理與排版，不靠下載資源。
4. **狀態誠實**：每個處理階段（idle/ready/running/cancelled/failed/completed）都有明確、克制的視覺；失敗時把模型原始輸出攤開給人看。
5. **硬派不等於難讀**：高對比黑白墨色服務可讀性（body ≥4.5:1），不是裝飾性灰字。

## Accessibility & Inclusion

WCAG 2.1 AA。body 文字對比 ≥4.5:1、大字 ≥3:1；focus ring 清楚可見；雙色票（深/淺）跟隨系統並可手動切換；所有動態（速度線、處理中、揭露）提供 `prefers-reduced-motion` 替代（淡入或瞬時）；網點/紋理純裝飾，不承載資訊；表單欄位維持 label 關聯與鍵盤可達。

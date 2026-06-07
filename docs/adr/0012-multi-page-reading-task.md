# Multi-page Reading Task

Status: Proposed（尚未實作）

本 ADR 提議未來將 WebUI 從單張圖片擴展為單一閱讀任務內的多頁輸入。多頁不是多個並行任務、不是背景任務歷史，也不代表後端要保存整本書。提案中的前端會把多檔上傳、資料夾選取、CBZ/ZIP 正規化成一個有穩定順序的頁清單；OCR 與翻譯仍以頁為單位送到後端處理。現行已實作主流程仍是單張圖片。

提案中的第一版多頁處理採單頁佇列，最大 concurrency 為 1。每頁依序執行 OCR 與翻譯；取消單頁會 abort 目前請求並暫停佇列，不會自動開始下一頁。使用者可取消整個佇列，也可在完成、失敗或取消後重跑單頁。某一頁失敗或取消不得清除其他已完成頁的 OCR、譯文、提示詞紀錄或錯誤狀態。

提案中的頁面排序必須穩定且可解釋。多檔輸入使用檔名排序；資料夾與 ZIP/CBZ 使用正規化相對路徑排序。排序規則採 case-insensitive natural sort：逐段比較路徑，數字片段以數值比較，最後用原始路徑作穩定 tie-breaker。輸入時忽略 `__MACOSX`、隱藏檔與隱藏目錄，只接受 PNG、JPEG 與 WebP 頁面。PDF 與 GIF 仍不是第一版目標。

CBZ/ZIP 在實作前仍屬 proposed/non-goal，不是現行行為。若落地，解壓只在目前瀏覽器工作階段中產生頁面 Blob/object URL，不建立後端任務歷史，也不把圖片寫入匯出 JSON。解壓器必須先檢查 archive manifest 與安全限制：頁數上限、單頁大小上限、總解壓影像大小上限、壓縮比上限、decoded pixel count、路徑 traversal、絕對路徑與不支援的壓縮項目。超出限制時拒絕整個 archive，避免部分解壓造成使用者誤解頁序或遺漏頁。頁清單縮圖必須 lazy decode，只保留可視範圍附近的 decoded preview，避免一次解碼整本書造成瀏覽器記憶體壓力。

ADR 0001、0003 與 0004 仍成立：每頁 OCR/翻譯結果必須是完整模型回應經 strict JSON 驗證後才進入 UI。若 ADR 0011 先行或同步落地，串流只提供非權威進度；未驗證 partial JSON 不可建立 OCR block 或譯文。`block_id` 在頁內可維持模型/後端產生的 ID。v2 export/import wire format 保持 page-local translations；跨頁引用只用於前端內部全域查找，例如 `${page_id}#${block_id}`，避免匯出、搜尋或未來全書視圖發生衝突。

提案中的多頁匯出 JSON 不包含圖片 bytes。WebUI 仍可匯入既有單頁 v1 JSON；多頁匯出會使用新版本，保存每頁檔名、相對路徑、排序索引、OCR blocks、translations、提示詞紀錄與頁狀態。匯入多頁 JSON 後若沒有原圖 Blob，只能檢視、校對文字結果與重新翻譯既有 blocks。重新 OCR 或重新處理前，使用者必須走「重新連結圖片來源」流程；該流程必須完整匹配頁數與每頁 `relative_path`，或在缺少 `relative_path` 時匹配 `index + filename`。匹配失敗時不得建立部分連結，也不得覆蓋已匯入文字結果。

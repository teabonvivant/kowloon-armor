# 1.6 作戰工作台驗收

2026-10-13。基準為 1.5 `8c6dd93`，30 項功能見 [升級工作單](operations-upgrade.md)。本輪獨立執行，沒有委派代理。

## 已完成的最終版本檢查

- `pnpm build`：TypeScript 及單檔打包成功，正式 HTML 與 `dist/index.html` 一致。
- `pnpm test`：72 項規則檢查通過，另有六關完整城市輸入式模擬通關。新增 `operations-check.mjs` 已接入預設測試。
- `pnpm test:operations`：七組新增流程檢查通過。正式離線 HTML 驗證收藏、比較、種子、設定重載、地圖航點、開炮事件及清除航點；來源整合頁驗證目標讀數、鏡頭、挑戰結算、真實 JSON 下載及同種子重賽。沒有 JavaScript 錯誤或外部請求。
- 音訊以 OfflineAudioContext 分別渲染炮聲、引擎、裝填提示：各組獨立靜音，全靜音峰值為零；單組峰值分別約 0.481、0.153、0.103，停止後尾段為零。這是數值渲染驗證，不是主觀試聽。
- `node scripts/field-artifact.mjs`：離線正式 HTML 在 1440×900、1280×577、390×844、320×568 沒有橫向溢出；巡遊欄不蓋住車況，射線說明不蓋住裝填文字。沒有 JavaScript 錯誤或外部請求。
- `node scripts/tactical-browser.mjs`：八組原有戰術回歸通過，涵蓋佔點、守區、失守重試、四發快裝、合成 HOTAS、快速重開視窗及失焦暫停。
- 同一戰術測試完成 72,000 個固定步進（20 分鐘模擬時間）：18 回合、207 發、173 次命中。十次重開後幾何資源保持 14、紋理保持 34，煙霧歸零。這不是 20 分鐘實時渲染或 Windows 幀率測試。

驗收成品 SHA-256：`991eca0f9bbee9ef67ea0c822424f86c62fa180d3ff6ae27f7b98363158626b3`。

## 測試限制及中斷紀錄

新增流程第一次重跑在截圖時出現 `Target page, context or browser has been closed`；當時同時有其他 WebGL 測試運行，原因未能確定。該次不列為通過，保留本機失敗日誌；相同程式及 HTML 單獨重跑後七組全部通過，沒有為此改動遊戲。

Playwright／Chromium 使用伺服器軟件 WebGL。來源測試頁可以控制遊戲狀態，用來檢查結算、估算和音訊邊界，不能當作真人實戰證據。Windows 顯示卡、實體 HOTAS、手機觸控駕駛和真人試聽尚未驗證。

## 成品與證據

完整機器結果及精選截圖保存在 [validation/operations](validation/operations/)。本提交附帶的 `九龍裝甲行動.html` 為上述已驗收成品；公開網址應提供相同 SHA-256，遠端更新另以 GitHub Pages 部署及正常訪客網址檢查確認。

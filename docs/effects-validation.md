# v1.8 炮火與衝力：驗收紀錄

基線 `8e059c0`（v1.7）；[100 項審核](effects-upgrade.md)逐項分開已確認缺陷與表現／驗證缺口。由單一執行者實作、測試及自審，沒有代理、模型轉交或外部素材。100 項均有指定證據，公開發布亦已核對；[機器可讀清單](evidence/effects/manifest.json)記錄計數及限制。

## 成品與範圍

`九龍裝甲行動.html` 與 `dist/index.html` 由最終來源重建，SHA256：

```text
25a0c1503e7ce7ac22c7231c0ca6291f0855dc1bf13c468edaafee6aa364f6b9
```

保留 30 款戰車、六關戰役、四種模式、單檔離線、存檔格式、鍵鼠／HOTAS 及 v1.7 多指觸控／精簡 HUD。炮速 190、重力 1.2、裝填、裝甲倍率及碰撞盒沒有改動；外觀炮口與原有物理起點分開。固定池亦保留 v1.7 同幀先處理較新炮彈的次序，C10 用同幀致命接觸驗證。地面接觸只把視覺位置插值回原有 .2 高度門檻。

## 已通過檢查

| 檢查 | 結果及證據 |
|---|---|
| `pnpm check` / `pnpm build` | 通過；HTML 沒有新增外部依賴 |
| `pnpm test` | 125 項：116 項 node:test（含 46 項新特效測試）＋9 項模擬檢查；[完整清單](evidence/effects/rules.json) |
| 六關戰役 | 6/6 勝利；訓練難度、Leopard 2 A8、完整城市碰撞、固定 60 Hz 輸入駕駛員；沒有強改血量、位置、冷卻或勝負；同上報告 |
| 離線音訊 | 17/17 案例；[audio.json](evidence/effects/audio.json) |
| 最終來源渲染 | 11/11 組：實際開炮／接觸／擊毀、暫停、五視角、舒適度、深度遮擋及釋放；[renderer.json](evidence/effects/renderer.json) |
| 最終成品五視窗 | 5/5：1440×900、1280×577、844×390、390×844、1024×768；三個觸控尺寸實際三指駕駛／瞄準／開火、放手煞車、中央瞄準區、暫停／重開、三畫質和舒適度；[artifact.json](evidence/effects/artifact.json) |
| v1.7 多指輸入來源套件 | 9/9：三指、快速點火、取消、放手煞車、鍵鼠覆蓋、四步訓練、旋轉暫停；[touch-input.json](evidence/effects/touch-input.json) |
| HUD／設定來源套件 | 9/9 組，涵蓋七尺寸各八種 HUD 狀態及設定／重開；[touch-layout.json](evidence/effects/touch-layout.json) |
| 舊戰術瀏覽器套件 | 8/8 組：佔領、防守、敗北／重試、補給、模擬 HOTAS、雙視窗及壓力測試；[tactical.json](evidence/effects/tactical.json) |
| 舊成品瀏覽器套件 | 20/20：目錄／設定、鍵盤駕駛／瞄準、相機、指標鎖定、暫停、四模式、實際第一關勝利及跨重載解鎖；[legacy-browser.json](evidence/effects/legacy-browser.json)，繪圖模式見下文 |
| 舊成品觸控套件 | 8/8；正常連續繪圖，三指開炮／放手煞車、七尺寸、四項觸控設定跨重載、左手佈局、旋轉及失焦暫停；[legacy-touch.json](evidence/effects/legacy-touch.json) |
| 公開成品 | 1 個 1440×900 定格驗收場景，加正常連續渲染 5 項檢查；SHA256、v1.8 啟動及鍵盤開炮通過；[public.json](evidence/effects/public.json)／[public-normal.json](evidence/effects/public-normal.json) |

原始命令輸出存於 `.omo/evidence/effects/`，不是以編譯成功代替視覺驗收。特效來源／成品報告均為零 JavaScript／console 錯誤、零外部網絡請求；舊套件記錄零 pageerror 及外部請求。

M、P、C、A01–A03 指 [effects-check.mjs](../scripts/effects-check.mjs) 的具名斷言；「音」指音訊報告的案例名稱；R 指來源渲染報告；F 指成品報告；T 指保留玩法及輸入套件。部分 shader／表面定位項目同時依賴差異覆核和截圖，並非宣稱自動測試能判斷所有美術品質。

## 效果及資源

七個固定池使用共用材質及批次繪製：煙、塵、火焰、火花、碎屑、彈痕、地面反光。低／中／高畫質總槽位上限為 168／328／508；觸控不高於低畫質。另有 32 顆炮彈、兩個實例批次。每次開炮不建立 GPU 幾何或材質；仍有短暫、有限的 JavaScript 向量配置。

R9 的八輪真正射擊／擊毀／返回車庫，暖機後一直維持 **19 個幾何體、28 張紋理、14 個 shader programs**；每輪離開後粒子和炮彈均為零。R10 中遮擋牆後方新增煙火，中心像素前後同為 `[19,42,48,255]`；R11 重複釋放後沒有任何特效或炮彈批次留在場景。

完整 UI 戰術壓力場景另外完成 **72,000 步／20 分鐘模擬時間、18 回合、207 發、173 命中**，並再重開十次。幾何體／紋理由開始的 20／28，變成壓力測試後的 20／33，十次重開後仍為 20／33。GC 後 JS heap 約 19.15 MB，最後重開前後差 3,168 bytes。這是加速模擬及稀疏繪圖，並非二十分鐘連續實機渲染；首輪資源增加也完整保留在報告。

新效果最多七個池繪製，加兩個炮彈繪製；共用接地貼片每車一個繪製。沒有新增即時光源、全屏閃光、後期 bloom 或額外陰影貼圖。遠處減少粒子，140 米外停止細碎屑，260 米外停止發射；低畫質／觸控不發炮彈煙跡。殘骸約 12 秒停止火焰、28 秒停止新增煙，已發粒子之後自然消失。

同場景前後資料：[基線](evidence/effects/scene-budget-baseline.json)、[最終](evidence/effects/scene-budget-final.json)，以及[改前開炮](evidence/effects/before-firing.png)／[改後開炮](evidence/effects/after-firing.png)。1280×800、DPR 1、種子 71439、相同車位及步數，靜止／開炮 17 ms／接觸 217 ms；每格預熱後 12 次凍結狀態渲染，使用同步 `readPixels` 等待 GPU 完成。`renderer.info.render` 是主繪製階段計數，耗時包含整次渲染。

| 畫質／狀態 | 繪製次數：前 → 後 | 三角形：前 → 後 | 中位 ms：前 → 後 | P95 ms：前 → 後 |
|---|---|---|---|---|
| low / idle | 264 → 269 | 426860 → 426870 | 1310.5 → 1156.4 | 1612.0 → 1217.2 |
| low / firing | 267 → 273 | 427036 → 429198 | 1037.3 → 1161.5 | 1357.9 → 1218.0 |
| low / contact | 268 → 274 | 427140 → 429142 | 973.9 → 1157.5 | 1605.6 → 1184.5 |
| medium / idle | 264 → 269 | 426860 → 426870 | 1038.4 → 1288.9 | 1182.2 → 1554.7 |
| medium / firing | 267 → 273 | 427036 → 429710 | 1085.2 → 1266.7 | 1165.9 → 1383.5 |
| medium / contact | 268 → 274 | 427140 → 432022 | 1124.4 → 1202.8 | 1281.2 → 1308.8 |
| high / idle | 264 → 269 | 426860 → 426870 | 1108.5 → 1284.8 | 1173.2 → 1339.0 |
| high / firing | 267 → 273 | 427036 → 430478 | 1246.9 → 1263.7 | 1721.5 → 1330.2 |
| high / contact | 268 → 274 | 427140 → 435926 | 1146.2 → 1189.0 | 1609.8 → 1300.2 |

新增接地貼片令此五車場景空閒時多五次繪製；開炮／接觸樣本多六次。低畫質接觸的幾何體／紋理由 13／27 變成固定池暖機後的 19／26；本輪切換陰影畫質後為 19／27。R9 的 28 張紋理是另一套含視角／照明切換的場景，不能混作同一比較。特效更豐富亦增加繪製成本，**沒有證據聲稱全面變快**。以上是共享主機上 Chromium 141 / SwiftShader 軟件 WebGL 的小樣本，不能換算成手機或顯示卡 FPS 承諾。

另外沿用 `scripts/benchmark.mjs`，兩版成品在相同 1280×800、DPR 1、車庫／自由駕駛場景正常連續繪圖，各取 12 幀，包括陰影提交；[基線成品](evidence/effects/artifact-budget-baseline.json)及[最終成品](evidence/effects/artifact-budget-final.json)均記錄 HTML SHA256。

| 畫質／場景 | 繪製次數：前 → 後 | 三角形：前 → 後 | 中位 ms：前 → 後 | P95 ms：前 → 後 |
|---|---|---|---|---|
| medium / garage | 160 → 161 | 315942 → 315944 | 1016.6 → 749.9 | 1333.3 → 783.4 |
| medium / drive | 220 → 221 | 457180 → 457182 | 1499.9 → 1299.9 | 2133.3 → 1333.3 |
| low / garage | 103 → 104 | 211554 → 211556 | 783.3 → 666.6 | 883.3 → 683.4 |
| low / drive | 163 → 164 | 352792 → 352794 | 1483.2 → 1200.0 | 1800.0 → 1250.0 |

四格都是一輛玩家車、多一個接地貼片。這組耗時下降、上面的特效場景多數上升，兩者都受共享主機負載影響；可比較提交量，不能據此宣稱硬件 FPS 提升。

## 音訊數值

48 kHz、立體聲、每案四秒；使用實際 `GameAudio` 和固定噪音種子。測試 105／152 mm 參數邊界、自車／遠近炮聲、遮擋、四種接觸、夜間、密集火力、全混音、暫停、恢復、選單試音、釋放及靜音。105／152 是參數測試，沒有增加車款或改現有口徑資料。

全部樣本有限、峰值低於 .99。152 案峰值 .486779、RMS .038301；夜間峰值 .218796、RMS .022910。密集火力最多 24 聲部、峰值 .912667；含引擎和配樂的全混音峰值 .904337。暫停／取消後沒有延遲炮聲重播；靜音及釋放案例為零，設定頁試音可正常完成。這些是數值結果，沒有聲稱真人聽過或在實體喇叭驗收。

可下載程序音訊樣本：[普通炮聲](evidence/effects/cannon-152.wav)、[夜間炮聲](evidence/effects/cannon-night.wav)。

## 截圖與方法

來源套件使用真正的 Game、Combat、Effects、View，指定靶車位置／血量以捕捉接觸及毀壞；履帶案例固定目標姿態。材質展示和遮擋探針直接呼叫 Effects。它們不代表正常難度下的戰役表現。

成品套件載入最終獨立 HTML，離線使用真實鍵盤／CDP 觸控。測試用 rAF 時鐘逐步推進遊戲，在批次最後一幀繪製並定格開炮；中途省略繪圖以避免軟件 GPU 排隊。它沒有正式遊戲 debug API，但亦不是連續渲染或實機 FPS 測試。音效在成品畫面套件靜音，音訊由上列獨立數值套件驗證。

舊 `browser-check.mjs` 的這次回歸使用 `EFFECTS_FUNCTIONAL_RENDER=1`：保持正常模擬時鐘及全部輸入／UI 斷言，截圖時才提交 GPU 繪製並同步讀回。未省略繪圖的初次執行過慢而中止，不能算作通過；效能比較不使用此模式。測試亦把零時長 `keyboard.press('Space')` 改為按住直至實際裝填，因原有鍵盤開火讀取按住狀態，零時長合成按鍵可完全落在兩個物理步驟之間。控制設定關閉後先確認任務時間恢復，再測試失焦暫停，避免在非同步 close 事件之前對仍暫停的遊戲送出 blur；這兩項只修正測試前置條件。

戰後畫面已有兩行 `.debrief-line`，舊單一元素 selector 在勝利後報 strict-mode 錯誤；改為明確檢查第一行命中率，沒有更改戰後畫面或遊戲結果。返回車庫 helper 亦先確認回合已運行及暫停對話框真正開啟，再點返回，避免過早點擊上一個已關閉的對話框。這些測試問題不加入 100 項遊戲審核數目。

舊觸控套件首輪在重載後讀到未含觸控值的設定，原因未能重現。獨立設定探針及只在截圖時繪圖的完整流程均成功保存；測試補上關閉對話框後等待控制恢復，以及重載前確認已寫入儲存。相同最終 HTML 再以正常連續繪圖通過完整 8 組及四項設定跨重載，沒有改動設定／輸入程式。首輪失敗保留於 `touch-final.log`，正常重跑為 `touch-final-normal.log`；不把未重現的異常算作已修好的遊戲缺陷。

- [17 ms 炮口](evidence/effects/muzzle-017ms-1440.png)、[67 ms 後座](evidence/effects/recoil-067ms-1440.png)、[200 ms 裝甲接觸](evidence/effects/armor-200ms-1440.png)、[217 ms 擊毀](evidence/effects/destruction-217ms-1440.png)、[三秒殘骸](evidence/effects/wreck-3s-1440.png)。
- 實際飛行命中：[建築](evidence/effects/actual-building-contact.png)、[路面](evidence/effects/actual-road-contact.png)、[履帶](evidence/effects/actual-track-contact.png)。
- 成品：[1440 桌面](evidence/effects/artifact-muzzle-1440x900.png)、[短桌面](evidence/effects/artifact-muzzle-1280x577.png)、[手機橫向](evidence/effects/artifact-muzzle-844x390.png)、[手機直向](evidence/effects/artifact-muzzle-390x844.png)、[平板](evidence/effects/artifact-muzzle-1024x768.png)。
- [低閃光／減少動態](evidence/effects/reduced-motion-low-flash.png)、[炮手](evidence/effects/view-gunner.png)、[瞄準鏡](evidence/effects/view-scope.png)、[黃昏](evidence/effects/lighting-dusk.png)。

## 自審及限制

測試先失敗再修正的例子包括炮口世界變換、資源清理、地面接觸、夜間輸出、重播取消、重複本地命中聲、車頂點火被裝甲遮住，以及新固定池須保留同幀命中次序。自審已逐段核對 production diff，沒有更動車款／任務資料、碰撞計算、存檔及輸入映射；最後再執行 `git diff --check`。

畫面維持原創程序化風格；煙霧不是體積流體，接地陰影是共用柔邊貼片。彈痕依原有簡化碰撞盒及法線定位，個別精細裝甲或凹凸外牆未必完全貼合；沒有改碰撞盒來遷就效果。實體 iPhone／Android／iPad、Safari、實體 HOTAS、揚聲器及長時間真人操作仍未驗收。音訊峰值通過列出的混音場景，並非對所有硬件輸出作聲學保證。

程式提交 `fcf7f5b91d5c06276ffabbffe73e710718f8d715` 已推送 main，[Pages 工作流程 38494235972](https://github.com/teabonvivant/kowloon-armor/actions/runs/38494235972) 成功，Pages API 回報同一 commit 已 built；[發布紀錄](evidence/effects/pages.json)。2026-10-14 01:12:51 UTC 以[正常遊戲網址](https://teabonvivant.github.io/kowloon-armor/九龍裝甲行動.html)讀取的 HTML SHA256 與上述最終檔案一致。

公開定格套件捕捉[仍在生效的炮口及曳光](evidence/effects/public-muzzle-1440x900.png)，並測試重開、畫質及舒適度。另一個全新瀏覽器 context 保留原生 rAF 及 WebGL，實際按住 Space 後進入裝填，取得[正常遊戲截圖](evidence/effects/public-normal-play.png)；該圖在開炮後，不能用作炮口瞬間驗收。兩者零 JavaScript／console 錯誤，只有遊戲 HTML 本身的網絡請求。沒有加 cache-busting 查詢、停用快取或改動使用者瀏覽器設定。

執行紀錄已追加至 `_team_runs/runs.jsonl`。CLI／模型 token 使用量遙測在此執行環境不可取得，記作 unavailable／null，沒有估算用量。

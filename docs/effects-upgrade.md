# v1.8 炮火、衝力與接觸特效

基線：`8e059c0`（v1.7）。本文件先於實作建立。目前 99 項已取得指定證據；第 100 項發布待核對。100 項是具體審核／驗收項目（21 項已確認缺陷、79 項表現／驗證缺口），**不是聲稱有 100 個程式錯誤**。B＝已由程式路徑確認的缺陷；E＝表現或驗證缺口。P＝待實作驗證；V＝有指定驗證證據；L＝仍有限制。所有舊證據指此基線的檔案／函式。

設計：保留 `Combat` 的 190 m/s、重力、射線、裝甲、傷害、裝填和任務規則；視覺炮口與原彈道分離。新增確定性特效數學、固定容量粒子／實例批次、可取消的分層音效。車身反應只改子物件，不推動碰撞根物件。沒有外部素材、全屏炮火閃光、新即時光源或額外陰影貼圖。低畫質及觸控減少發射量；減少動態關閉鏡頭及懸掛震動，低閃光限制局部亮度。

曾比較：只修改舊球形 burst（改動小，但無法表現接觸材質和方向）；大量燈光／獨立粒子物件（較直觀，但提交和分配隨開炮增加）；採用固定池及共用材質（少量自訂 shader，資源可驗證）。依使用者授權直接獨立執行，不另設設計批准或代理步驟。

實作順序：

- [x] 保存基線成品、相同場景效能／資源樣本；完成下列 100 項審核。
- [x] `scripts/effects-check.mjs` 先寫失敗測試；`src/effect-math.ts` 實作時間曲線、法線、表現預算。
- [x] `src/render/effect-pools.ts`、`src/effects.ts` 實作池、方向性炮口、接觸、煙塵及清理；逐項跑測試。
- [x] `src/render/tank.ts`、`actors.ts`、`combat.ts`、`game.ts`、`view.ts` 接駁後座、彈體、碰撞事件、懸掛及偏好。
- [x] `src/effect-audio.ts`、`audio.ts`、`main.ts` 接駁口徑／材質音層及取消；OfflineAudioContext 數值驗證。
- [x] 沿用 Playwright 離線來源／成品模式，建立 `scripts/effects-browser.mjs`、`effects-artifact.mjs`；截取仍在生效的炮口／接觸／毀壞畫面，回歸觸控。
- [ ] 最終重建後 `pnpm check`、`pnpm build`、`pnpm test` 及適用瀏覽器套件；相同場景基準、資源重複測試、差異自審、SHA256、提交及 Pages 核對。

驗證代碼（完成時記錄實際結果，不能以 build 代替）：M＝effects-check 數學；P＝池及生命週期；C＝Combat／Game 整合；R＝來源瀏覽器渲染；A＝離線音訊；F＝正式 HTML；T＝舊遊戲／觸控／戰役回歸。證據保存 `docs/evidence/effects/`，原始日誌 `.omo/evidence/effects/`。測試採用本機 Chromium／軟件 WebGL；不是實機 FPS、Safari 或真人聆聽驗收。

| # | 類 | v1.7 觀察證據 → 驗收改動 | 實作位置 | 驗證 | 狀態 |
|---|---|---|---|---|---|
| 1 | E | effects.burst 球形同向擴大 → 炮口主噴流沿炮管延伸 | effects.muzzle | P09; R1 | V |
| 2 | E | burst 只有一個色球 → 白熱短核心與暖色外焰分層 | effects.muzzle | P09; R1 | V |
| 3 | E | burst 固定 0.25 秒爆光 → 短點火、尾焰兩段時間曲線 | effect-math.flashEnvelope | M03/P17; R1 | V |
| 4 | E | Combat.fire 未傳口徑 → 105–152 mm 噴流尺度不同且封頂 | effect-math.gunProfile | M01/P17; R1 | V |
| 5 | E | burst 煙粒四向散射 → 炮口煙先順炮向再上升 | effects.muzzle | P09; R1/R2 | V |
| 6 | E | 炮口無側向壓力氣體 → 有限側向氣體瓣 | effects.muzzle | P09; R1 | V |
| 7 | E | 開炮沒有地面揚塵 → 炮口下方延遲低矮塵浪 | effects.muzzle | P19; R1/R2 | V |
| 8 | B | 固定 y=2.5、5.5 偏移不等於 barrel 末端 → 可見炮火定位實際炮口 | render/tank.muzzlePosition | M09; R1 | V |
| 9 | B | root.scale.z、turretZ 未計入爆光位置 → 所有外形／俯仰／轉塔同步 | render/tank.muzzlePosition | M09/M13（30 車） | V |
| 10 | E | 炮口只照亮自身球 → 地面局部暖色反光，無即時燈光 | effects.muzzle | P19; R1 | V |
| 11 | B | near-wall burst 在封閉炮口仍像正常射擊 → 牆前接觸、無穿牆噴流 | combat.fire | C03; C02 | V |
| 12 | B | lowFlash 只改 CSS，不影響 3D burst → 降低炮焰及火花亮度 | effects.configure | P05; R7/F | V |
| 13 | E | actor.recoil 固定 .44 → 口徑影響可見衝程 | effect-math.gunProfile | M01/M11 | V |
| 14 | E | moveActor 線性回復 → 快速壓縮與較慢緩衝復位 | effect-math.recoilEnvelope | M02/M12; R1 | V |
| 15 | B | barrel.position.z 只沿車身水平，抬炮時偏離軸 → 沿炮管局部軸後座 | render/tank.updateTankMotion | M10; R1 | V |
| 16 | B | fire 只寫 recoil 值，下一步才改 transform → 開炮當步見到後座 | render/tank.kickTank | M10; R1 | V |
| 17 | E | 炮塔／車身沒有反作用 → 依炮塔相對方向產生俯仰／側傾 | render/tank.updateTankMotion | M10/M14; R6 | V |
| 18 | E | 車重只影響駕駛 → 重車懸掛反應小於輕車 | effect-math.gunProfile | M14 | V |
| 19 | E | 車體只有碰撞根物件 → 新視覺子組保留物理姿態 | render/tank.body | M10; T 戰役 | V |
| 20 | E | 開炮車身不下沉 → 短暫懸掛壓縮後平順穩定 | render/tank.updateTankMotion | M10/M14; R1 | V |
| 21 | E | 加速／煞車沒有視覺慣性 → 小幅平滑俯仰、不改 speed | actors.moveActor | M14; T 機動 | V |
| 22 | E | 輪／履帶若隨車身晃會離地 → 保留輪及履帶在物理根組 | render/tank.body | M10/M14 | V |
| 23 | E | 每炮直接覆寫 .44，沒有連續衝量緩衝 → 疊加衝量封頂且可恢復 | render/tank.kickTank | M11 | V |
| 24 | E | reducedMotion 未控制車體特效 → 關閉懸掛晃動、保留裝填提示 | game.configureEffects | M11; R7/F | V |
| 25 | E | view.recoil 所有視角相同 .28 → 追尾／駕駛／炮手／鏡倍率分別限幅 | effect-math.cameraKick | M04; R8 | V |
| 26 | E | camera 使用 Math.random → 確定性阻尼脈衝、無隨機抖動 | view.render | M04; R3/R8 | V |
| 27 | B | 抖動直接累加到 lerp 的 camera.position → 從穩定相機基準加位移 | view.render | R3/R8; view.render 差異覆核 | V |
| 28 | B | 暫停仍扣 shake 並改相機 → 暫停固定後座時間與畫面 | view.render | R3; F 暫停 | V |
| 29 | E | 視角切換可能帶入上一個炮震 → 切換／車庫清除後座 | view.render | R8/R9; viewKey 重設覆核 | V |
| 30 | E | 開鏡無更嚴格炮口遮擋控制 → 第一身自車煙焰降低並近相機淡出 | effects.prepare | R8/F; near-fade shader 覆核 | V |
| 31 | E | Combat.geometry 是 SphereGeometry(.16) → 細長帶尖端彈體 | combat projectile pool | C07; R1 | V |
| 32 | E | 球不需要旋轉，沒有彈道朝向 → 每步沿當前速度定向 | combat.update | C07 | V |
| 33 | E | 快炮彈跨幀難追蹤 → 有限長掃掠曳光 | combat projectile pool | M05/C07; R1 | V |
| 34 | E | 所有口徑炮彈同尺寸 → 彈體／曳光寬度按口徑 | combat.fire | M01/C07; combat.sync 口徑覆核 | V |
| 35 | E | 無短時飛行殘跡 → 限距、淡出的煙跡採樣 | effects.trail | P18 | V |
| 36 | E | 長步進可能產生過長光棒 → 曳光長度封頂、不超過已飛距離；接觸即回收 | effect-math.tracerLength | M05/C02/C07 | V |
| 37 | E | 炮彈每次 new Mesh → 固定 32 顆槽位重用、不增幾何 | combat pool | C04/C10; R9 | V |
| 38 | B | shell.age>3 與命中同分支產生爆炸 → 壽命到期安靜回收 | combat.update | C01 | V |
| 39 | B | 地面 p.y<.2 後才爆炸，可在地下 → 接觸特效插值到地面 | effect-math.groundContact | M05/C02; R6 | V |
| 40 | E | clear 只移除 Mesh → 重設槽位、曳光及 source 引用 | combat.clear/dispose | C04/C06; R11 | V |
| 41 | E | 球狀 burst 不使用接觸面 → 由命中位置及表面法線反射火花 | effect-math/contact effects | M06/M07/P11; R6 | V |
| 42 | E | 命中裝甲與建築用同色煙 → 裝甲短亮火花及少量灰煙 | effects.impact | P10; R2 | V |
| 43 | E | 履帶命中只有 damage factor → 低位暗碎片與短促火花 | effects.impact | P10; R5/R6 | V |
| 44 | E | 路面落彈如空中爆球 → 低矮瀝青塵、碎屑、接觸圈 | effects.impact | P07/P10; R5/R6 | V |
| 45 | E | 建築命中無材質區分 → 石灰色粉塵及較重碎片 | effects.impact | P10; R5/R6 | V |
| 46 | E | obstacle 無表面類別 → 車輛金屬與街道／樓宇石材視覺標籤 | render/world/geo-vehicles/street-props | R5; surface 標籤差異覆核 | V |
| 47 | E | wallFraction 只回 fraction → 擷取最近命中盒面法線，不改碰撞結果 | effect-math.wallNormal | M06/C02; R6 | V |
| 48 | E | 命中角度不影響特效 → 掠射火花順表面偏轉 | effect-math.impactDirection | M07/P11 | V |
| 49 | E | 火花在原 burst 缺席 → 帶方向拉伸、速度衰減的熱碎屑 | effects.impact | P11/P16; R2 | V |
| 50 | E | 原 smoke 速度無重力 → 碎屑按拋物線下落 | effect-pools.update | P02/P16 | V |
| 51 | E | update 只有 v×dt，沒有碎屑地面處理 → 裝飾碎屑落地一次衰減反彈 | effect-pools.update | P02（存活期逐步查） | V |
| 52 | E | 接觸後沒有殘痕 → 有上限、有淡出的彈痕 | effects.impact | P01/P06; R2 | V |
| 53 | E | 不同法線的彈痕應貼面 → 彈痕按法線旋轉並微偏移防閃爍 | effects.impact | P07/M06; R5/R6 | V |
| 54 | E | 移動裝甲沒有可附着殘痕 → 用局部座標跟隨車體、清理引用 | effect-pools marks | P06 | V |
| 55 | E | 連續命中可覆蓋整幅場景 → 火花／碎屑／彈痕各自硬上限 | effect-math.effectBudget | P01/M08; R9 | V |
| 56 | B | 每次擊中 target 都傳 big=true，包括非擊毀 → 普通受擊與擊毀分開規模 | combat.update | C05; R2/R4 | V |
| 57 | E | 致命一擊無專屬序列 → 點火、碎片、延遲濃煙的分段毀壞 | effects.destroy | C09; R4 | V |
| 58 | E | .35 hp 閾值前完全不冒煙 → 中度損毀少煙、重度更濃 | effects.damage | P04; R4 | V |
| 59 | E | destroyed 只增加煙 lifetime → 限時殘骸火焰、熄滅後餘煙 | effects.damage | P04; R4 | V |
| 60 | B | 殘骸永遠每 .15 秒發煙 → 殘骸冷卻後停止新增粒子 | game damage age/effects | R4（冷卻歸零） | V |
| 61 | B | damage() 固定 y=2.6，無 at.y → 煙從車體引擎區世界位置發出 | game damage/effects | R4; game.exhaust 世界座標覆核 | V |
| 62 | E | 同一 damageCloud size=4.8 → 煙粒各自成長／透明度 | effect-pools particles | P14; R4 | V |
| 63 | B | damageLife 歸零把粒子瞬移，沒有淡出 → 尾段逐粒淡出 | effect-math.particleEnvelope | M03/P14 | V |
| 64 | E | damageCloud 用單一固定色 → 熱煙起始較暗、冷卻變灰 | effect-pools particles | P14; R4 | V |
| 65 | E | smoke 直線固定速 → 受控風向漂移、浮力與阻尼 | effect-pools.update | P02/P09/P14 | V |
| 66 | E | 敵軍遠處仍全量發煙 → 距離降低密度、遠距停止細碎屑 | effects emission budget | P12 | V |
| 67 | E | 煙霧無針對遮擋驗證 → 深度測試與霧色淡出，建築遮住背後煙火 | effect-pools materials | R10（像素遮擋） | V |
| 68 | E | 粒子貼近鏡頭仍滿不透明 → 近面煙霧淡出避免瞄準遮屏 | effect-pools shader | R8/F; near-fade shader 覆核 | V |
| 69 | E | 無陰影低畫質下車體欠接地 → 共用柔邊接地陰影貼片 | render/tank | P19; R1/R8 | V |
| 70 | E | 車輛移動塵大小不隨速度 → 速度控制揚塵密度／尺寸 | effects.dust | P13 | V |
| 71 | E | 履帶停用仍兩邊揚塵 → 受損側不發移動塵 | game/effects.dust | P13; T 履帶機動 | V |
| 72 | E | 每輛車每 .15 秒同一煙節奏 → 保留固定節拍但粒子錯開壽命 | effects.dust/damage | P15/P14; R4 | V |
| 73 | E | 視覺無黃昏適配驗證 → 日間／黃昏保持接觸與炮焰可讀 | view/effect materials | R 日間／黃昏截圖 | V |
| 74 | E | 炮聲 fire 固定 96 Hz → 口徑控制低頻、長度及有限音量 | effect-audio.cannonSound | A01; 音 105/152 | V |
| 75 | E | boom/crack 同一長度基準 → 獨立瞬態、低頻推力、尾響 | audio layered burst | 音 152/full-mix | V |
| 76 | E | 炮身沒有機械閉鎖回響 → 自車短機械層、遠處不放大 | audio.fire | 音 152/nearby | V |
| 77 | B | impact 未用 distance/343 延遲，Interface.hit 另播本地聲 → 遠距接觸只由事件按傳播延時發聲 | audio.impact/interface.hit | A02; C02; 音 distant | V |
| 78 | B | impact 未做牆遮擋，fire 才有 → 共用位置混音／遮擋 | audio spatial event | 音 occluded/nearby | V |
| 79 | E | impact destroyed bool 不能區分材質 → 裝甲金屬／履帶／石材／路面音色 | effect-audio.impactSound | A01; 音 armor/track/building/road | V |
| 80 | B | 未命中敵車的牆／地爆炸無音效事件 → 每次實際接觸發一個聲音事件 | combat/main | C02/C03/C05; R6 | V |
| 81 | B | fire 從 root 而非炮口發聲 → 事件攜實際炮口、自己的聲音零傳播延遲 | combat/main/audio | M09; R1; 音 152/distant | V |
| 82 | E | 音效 oscillator 直接高 gain 起步 → 毫秒攻擊段避免突變 | audio envelopes | 音 105/152/salvo 數值 | V |
| 83 | B | pause stop 只降 field，不取消排程 → 延遲炮聲不會在恢復後重播 | audio.stop | 音 pause/resume-tail | V |
| 84 | B | ready 直駁 master，暫停不停止 → 提示瞬態亦可取消，靜止選單保留明確試音 | audio.stop/idle/tone | A03; 音 pause/preview | V |
| 85 | E | 多層聲效需要原 voice cap 適配 → 每事件先預留槽位、封頂 | audio voice budget | 音 salvo/full-mix（24 聲部） | V |
| 86 | E | 無一套跨口徑／密集火力數值測試 → 有限樣本、峰值<1、夜間能量較低 | scripts/effects-audio.mjs | 音 17 案例 | V |
| 87 | E | 每 burst 新材質／geometry → 固定池、共用材質、零逐發 GPU 分配 | effect-pools | P01/P03; R9 | V |
| 88 | E | burst 上限只計 20 個發射器 → 明確各類粒子及 draw call 上限 | effect-math/effect-pools | P01/P08; R9/比較表 | V |
| 89 | B | effects.update(0) 仍可能標記 buffer dirty → 暫停零步進不改特效 | effect-pools.update | P02; R3 | V |
| 90 | E | quality 只改 shadow／resolution → 三種畫質控制特效密度 | game.configureEffects | M08/P05/P08; F | V |
| 91 | E | 觸控設備仍完整桌面粒子量 → 觸控啟用時上限不高於流暢 | interface/game | C08/P18; F/T 觸控 | V |
| 92 | E | Effects.clear 用 update(10) 間接回收 → 明確清零池、索引、附着引用及延遲 | effects.clear | P03/P15/C06; R9 | V |
| 93 | E | Effects 沒有 dispose，常駐池未釋放 → 可重複安全 dispose | effects.dispose | P03; R11 | V |
| 94 | E | Combat geometry/material 無 dispose → 釋放彈體及曳光資源 | combat.dispose | C04; R11 | V |
| 95 | E | AudioContext／loop nodes 無 dispose → 終止 source、斷開及關閉 context | audio.dispose | 音 dispose | V |
| 96 | E | 既有 benchmark 沒有同一命中場景比較 → 相同種子、視角、步數的前後樣本 | scripts/effects-benchmark | 相同場景基線／最終 JSON | V |
| 97 | E | 既有煙霧上限測試不查重開後 renderer memory → 多輪射擊／重開穩定資源 | scripts/effects-browser | R9（八輪） | V |
| 98 | E | 既有截圖常於效果已消失後 → 固定 17/67/200 ms 等特效時刻截圖 | scripts/effects-browser/artifact | R1/R2/R4/F 截圖 | V |
| 99 | E | 舊成品 smoke 測試沒有五種 VFX 視窗 → 桌面1440、短桌面、手機橫直、平板 | scripts/effects-artifact | F 五視窗；T 9 組 | V |
| 100 | E | 缺 effects 專用發布校驗 → 最終 HTML 離線／公開正常 URL 開炮及 SHA256 一致 | evidence/release verification | F 離線；待公開 SHA/開炮 | P |

驗證欄的完整測試名稱、報告及限制見 [驗收紀錄](effects-validation.md)。`effects`、`combat` 等實作簡寫均指 `src/` 同名 `.ts`；池位於 `src/render/effect-pools.ts`。尚未通過的項目不以「已完成」計數。

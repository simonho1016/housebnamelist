# AGENTS.md — 則仁中心 忠孝宿舍服務（整合網站）

> 呢份文件係俾 AI 編程助手（Kimi Code 等）嘅交接說明。改 code 前請先讀晒。
> 創作者：何文諾社工（香港扶幼會則仁中心）

## 系統概覽

- 網址：https://cycportal.netlify.app/ （Netlify，push `main` 分支即自動部署）
- 純靜態網站＋Netlify Functions，**冇 build step**：`public/` 直接發佈（見 `netlify.toml`）。
- 所有頁面係單一 HTML 檔（Tailwind CDN＋原生 JS），冇框架、冇 bundler。
- UI 全部繁體中文（廣東話口吻嘅提示語）；字體：支錢系統用粉圓體（Huninn），PDF 單據維持原字體。

## 目錄結構

```
public/index.html          前置頁（香港扶幼會則仁中心 忠孝宿舍服務）：密碼登入（15 分鐘有效）→ 舍務抽籤／舍友名單／零用金入口
public/duties/index.html   舍務抽籤（?house=zhong|xiao 揀社）
public/roster/index.html   舍友名單（?house=zhong|xiao）
public/apply/index.html    零用金申請（支錢系統）：填單→簽名→PDF→存記錄；版本記錄喺呢頁
public/admin/index.html    後台管理：數據總覽、篩選、CSV、ZIP/列印 PDF、結算、刪除記錄、改後台密碼
public/vault/index.html    夾萬・舍友現存（獨立頁）：四格夾萬、大→細過錢、舍友現存、自動對數
netlify/functions/         roster.mjs（舍友名單雲端 API，Netlify Blobs）
```

## Supabase（支錢系統後端）

- URL：`https://abtsyfbbtpvozywqaofs.supabase.co`
- Anon key：`sb_publishable_beq8adbuLrISIgnpbAaLEw_Da1Fva-r`（寫死喺 apply/admin/vault 三頁）
- 表 `applications` 欄位：`house, payee_id, payee, amount, cats(jsonb), cat_other, remark, staff, status, doc_no, notion_id, serial, payee_sign(base64), pdf_path, safe_pay(bool), settled_at, settled_by, decided_at, created_at`
- 表 `settings`（key-value，value 係 jsonb），現用 key：
  - `serial_counter`（序號計數，格式 YYYY-NNNN；刪單唔重用序號）
  - `members`：`{'忠社':[{id,name}...],'孝社':[...]}`（未設就用各頁內建 DEFAULT_MEMBERS）
  - `staff`：`[{name,pw}...]`（支款人；如何文諾、何樂軒有簽名檔要密碼）
  - `entry_pw`（前置頁密碼）、`admin_pw`（後台＋/vault/ 密碼，預設 8888）
  - `safe_vault`：`{zhong_big, zhong_small, xiao_big, xiao_small}`（每社大夾萬＋細夾萬；舊三格格式 {big,zhong,xiao} 已作廢，當未設定處理）
  - `member_bal`：`{舍友id: 結存}`（未設定＝未啟用自動扣數）
- Storage bucket `apply-archive`（私密，anon 可 upload/signed-url/delete）：路徑 `zhong|xiao/舍友編號/B14_20260916.pdf`，**唔支援中文路徑**。

## 金錢邏輯（好重要，改之前要明）

- 支錢（apply 列印／電子存檔成功）→ 該舍友 `member_bal` 自動扣；結存唔夠彈 confirm。
- 「🏦 夾萬支付」→ 即時寫 `safe_pay=true, settled_at, settled_by='夾萬'`，即扣**該社細夾萬**；細夾萬唔夠會擋。
- 墊支單喺 admin 結算 → 結算前檢查該社細夾萬夠唔夠（唔夠擋），成功後扣細夾萬。
- admin 刪除記錄 → 自動回補舍友結存；`safe_pay` 或已結算嘅單一併回補細夾萬。
- 對數公式：兩社（大＋細）總和 ＝ 舍友總結存 ＋ 未結算墊支總額（/vault/ 頁自動核對）。
- 舍友現存未歸 0 → 唔可以喺系統設定刪除或改舍號（apply 系統設定有雙重保障）。
- 金額運算用 `Math.round(x*100)/100` 防浮點誤差。

## 登入／密碼模型（全部 15 分鐘有效，sessionStorage）

- `cyc-portal-auth`：`{p, exp}`，前置頁統一登入；apply/admin/vault 每頁都有 IIFE 檢查，冇就跳返 `/`。
- `cyc-admin-auth`：`{exp}`，後台＋/vault/ 共用，密碼係 settings `admin_pw`。
- `staff-ok-<支款人>`：`{exp}`，有簽名檔嘅職員（SIGNATURES map：何文諾、何樂軒）揀做支款人時要輸入個人密碼。
- 舊格式（`'1'` 字串）已廢，係咪有效要用 JSON.parse 檢查 `exp`。

## 簽名板（apply）

- 全螢幕 overlay，開啟時 best-effort `requestFullscreen()`＋`screen.orientation.lock('landscape')`。
- **直機自動轉橫**：viewport 係直向就喺 `#signModal` 加 `sign-rot` class，CSS 將成個 modal 順時針轉 90°（內容頂部指向機身右邊，用戶將手機向左轉就睇正）；resize 時 `updateSignRotation()` 自動切換，確認／取消後移除 class 轉返直。
- 觸控座標：`signPos()` 偵測 `sign-rot` 狀態，將螢幕座標逆轉換返入 canvas 本地座標；`sizeSignCanvas()` 用 `clientWidth/clientHeight`（`getBoundingClientRect` 會被 CSS 旋轉影響）。
- `exportSignature()` 自動裁剪簽名範圍後**直接**放入 PDF：方向由 CSS 旋轉固定，唔使再靠「高過闊」估方向（舊自動轉正 heuristic 已移除）。
- 「🔄 旋轉」掣手動轉 90°（`rotateSignPad()`，轉完縮放 fit）。
- 簽名只係 base64 放 `payee_sign` 欄，重印舊記錄直接用雲端簽名。

## 開發流程

### Commit 身份（必須用）

```bash
git -c user.name=simonho1016 -c user.email=simonho1016@gmail.com commit -m "訊息"
git push origin main    # push 後約 30 秒 Netlify 自動部署
```

### 測試流程（冇 test framework，用無頭瀏覽器 e2e）

1. 寫 `public/_t.html`：開頭 `sessionStorage.setItem('cyc-portal-auth', JSON.stringify({p:'test',exp:Date.now()+900000}))`，再用 JS 動態整 iframe 載入目標頁（`/apply/`、`/admin/`、`/vault/`），用 `w.eval()` 喺 iframe 入面執行檢查，結果寫落 `<pre id="log">`。
2. `node --check` 抽 `<script>` 做語法檢查（python 抽取落 /tmp）。
3. push → 等 30 秒 → 跑：
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --virtual-time-budget=30000 --dump-dom "https://cycportal.netlify.app/_t.html" | grep -A200 'id="log"'
   ```
4. 驗證完**一定要 `git rm public/_t.html` 再 push**（唔好留測試頁上線）。
5. 如測試寫咗假資料落 Supabase，要用 REST curl 清理（anon key 可直接 curl REST API）。

### 改版本時

- `public/apply/index.html` 嘅「版本記錄」區加新版（emerald badge＝現時版本，舊版轉 blue＋改名）。
- README.md／CHANGELOG.md 主要對應最初名單系統；新功能以 apply 頁版本記錄為準。

## 注意事項

- Supabase Storage 路徑只可以用英數（中文會上傳失敗）。
- 加 `applications` 新欄位要教用戶去 Supabase SQL Editor 跑 `alter table`，前端 insert 失敗時提示語已內建 SQL 範本（照現有 pattern 加）。
- `settings` 表 upsert 用 `{key, value}`；value 係 jsonb 可以直接存 object。
- 唔好喺代碼留言度放真實舍友敏感資料；名單資料只存 Supabase/Netlify Blobs。

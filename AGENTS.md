# AGENTS.md — 則仁中心 忠孝宿舍服務（整合網站）

> 呢份文件係俾 AI 編程助手（Kimi Code 等）嘅交接說明。改 code 前請先讀晒。
> 創作者：何文諾社工（香港扶幼會則仁中心）

## 系統概覽

- 網址：https://cycportal.netlify.app/ （Netlify，push `main` 分支即自動部署）
- 純靜態網站＋Netlify Functions，**冇 build step**：`public/` 直接發佈（見 `netlify.toml`）。
- 所有頁面係單一 HTML 檔（Tailwind CDN＋原生 JS），冇框架、冇 bundler。
- UI 全部繁體中文（廣東話口吻嘅提示語）；字體用粉圓體（Huninn）。

## ⚠️ 支錢系統已抽離（2026-09-23）

零用金支錢系統（apply／admin／vault）已搬走去獨立 repo `simonho1016/cyc-apply`（https://cycapply.netlify.app/），有自己嘅前置登入頁同 AGENTS.md。主站淨返舍務抽籤同舍友名單；`netlify.toml` 有 301 轉址將 /apply/、/admin/、/vault/ 舊書籤轉去新站。支錢相關嘅 Supabase（abtsyfbbtpvozywqaofs）、金錢邏輯、簽名板說明，全部睇新 repo 嘅 AGENTS.md。

## 目錄結構

```
public/index.html          前置頁（香港扶幼會則仁中心 忠孝宿舍服務）：密碼登入（15 分鐘有效）→ 舍務抽籤／舍友名單，另有連結卡去獨立支錢系統（新分頁）
public/duties/index.html   舍務抽籤（?house=zhong|xiao 揀社）
public/roster/index.html   舍友名單（?house=zhong|xiao）
netlify/functions/         roster.mjs（舍友名單雲端 API，Netlify Blobs）
```

## 登入／密碼模型（15 分鐘有效，sessionStorage）

- `cyc-portal-auth`：`{p, exp}`，前置頁統一登入；duties/roster 每頁都有 IIFE 檢查，冇就跳返 `/`。
- 前置頁驗證密碼：先試舍友名單 API（`/api/roster`，x-roster-key header），失敗再試舍務抽籤嘅 `duty_records_verify` RPC。
- 舊格式（`'1'` 字串）已廢，係咪有效要用 JSON.parse 檢查 `exp`。

## 開發流程

### Commit 身份（必須用）

```bash
git -c user.name=simonho1016 -c user.email=simonho1016@gmail.com commit -m "訊息"
git push origin main    # push 後約 30 秒 Netlify 自動部署
```

### 測試流程（冇 test framework，用無頭瀏覽器 e2e）

1. 寫 `public/_t.html`：開頭 `sessionStorage.setItem('cyc-portal-auth', JSON.stringify({p:'test',exp:Date.now()+900000}))`，再用 JS 動態整 iframe 載入目標頁（`/duties/`、`/roster/`），用 `w.eval()` 喺 iframe 入面執行檢查，結果寫落 `<pre id="log">`。
2. `node --check` 抽 `<script>` 做語法檢查（python 抽取落 /tmp）。
3. push → 等 30 秒 → 跑：
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --virtual-time-budget=30000 --dump-dom "https://cycportal.netlify.app/_t.html" | grep -A200 'id="log"'
   ```
4. 驗證完**一定要 `git rm public/_t.html` 再 push**（唔好留測試頁上線）。
5. 如測試寫咗假資料落 Supabase，要用 REST curl 清理。

### 改版本時

- README.md／CHANGELOG.md 對應名單系統；舍務抽籤嘅版本記錄喺 `public/duties/index.html` 內。
- 支錢系統版本記錄喺新 repo 嘅 `public/apply/index.html`。

## 注意事項

- 唔好喺代碼留言度放真實舍友敏感資料；名單資料只存 Supabase/Netlify Blobs。
- 支錢系統（Supabase 設定、Storage、金錢邏輯）全部喺新 repo，呢度唔好再加返相關代碼。

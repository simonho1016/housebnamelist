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
public/index.html          前置頁（香港扶幼會則仁中心 忠孝宿舍服務）：Google 網域登入（只限 @sbccyc.org.hk，唔設時限）→ 舍務抽籤／舍友名單，另有連結卡去獨立支錢系統（新分頁）
public/duties/index.html   舍務抽籤（?house=zhong|xiao 揀社）
public/roster/index.html   舍友名單（?house=zhong|xiao）
netlify/functions/         roster.mjs（舍友名單雲端 API，Netlify Blobs）；auth-keys.mjs（Google token 驗證後回傳系統共用密鑰）
```

## 登入模型（Google 網域認證，唔設時限，sessionStorage 關分頁即清）

- 前置頁用 Google Identity Services（GIS）登入掣，Client ID 同支錢系統共用（`141456186458-…apps.googleusercontent.com`）；新網域要喺 Google Cloud Console 嘅 Authorized JavaScript origins 度加返先用到。
- 登入成功後前端攞 Google ID token 去 `POST /api/auth-keys`；function 向 Google tokeninfo 查證（aud＋`hd`/`email` 必須屬於 sbccyc.org.hk），通過先回傳共用密鑰（env `PORTAL_KEY`，未設就沿用 `ROSTER_PASSWORD`）。密鑰唔寫死喺前端。
- `cyc-portal-auth`：`{p, exp, email, name}`，`p` 係共用密鑰（duties/roster 嘅雲端寫入仍然靠佢），`exp` 係 +365 日（實際唔會過期）；duties/roster 每頁都有 IIFE 檢查，冇就跳返 `/`。
- 舊密碼登入保留做後備（前置頁「未能使用 Google 登入？」連結展開）；驗證：先試舍友名單 API（`/api/roster`，x-roster-key header），失敗再試舍務抽籤嘅 `duty_records_verify` RPC。
- 確認 Google 登入穩定後可以刪走後備密碼 form 同 `verifyPassword`。

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

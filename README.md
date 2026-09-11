# 孝社 舍友名單（Netlify 雲端版）

一頁式的舍友名單網站：任何裝置開啟同一網址，輸入存取密碼後，都會看到最新的名單，
改動會自動儲存到雲端（Netlify Blobs），並可一鍵列印成 A4 PDF 張貼。

```
public/index.html                網頁本身（名單、編輯、列印）
netlify/functions/roster.mjs     雲端儲存 API（讀取／儲存名單，須密碼）
netlify.toml                     Netlify 設定（發佈資料夾、函式資料夾、安全標頭）
package.json                     函式所需的套件（@netlify/blobs）
```

## 第一次部署（約 10 分鐘）

### 1. 把程式碼放上 GitHub

專案已是一個 git 倉庫。若尚未推送到 GitHub，在此資料夾執行：

```bash
gh repo create hostel-roster --private --source=. --push
```

（倉庫請設為 **private**。倉庫內只有程式碼，沒有舍友資料；資料只存在 Netlify。）

### 2. 在 Netlify 建立網站

1. 登入 <https://app.netlify.com>，按 **Add new site → Import an existing project → GitHub**。
2. 授權 Netlify 讀取你的 GitHub，選擇 `hostel-roster` 倉庫。
3. 建置設定會自動從 `netlify.toml` 讀取（Publish directory：`public`，Functions：`netlify/functions`），不用改。
4. **部署前**按 **Add environment variables**（或部署後到 *Site configuration → Environment variables*），新增：

   | Key | Value |
   |-----|-------|
   | `ROSTER_PASSWORD` | 你自訂的存取密碼（建議 10 個字元以上，可含中文） |

5. 按 **Deploy**。完成後 Netlify 會給你一個網址，例如 `https://xxxx.netlify.app`。
   可在 *Site configuration → Site details → Change site name* 改成易記的名稱。

### 3. 開始使用

1. 用瀏覽器開啟網址，輸入存取密碼（每部裝置只需輸入一次）。
2. 點擊任何一格編輯姓名、社工短稱及狀態，右上角顯示「✓ 已儲存」即代表已存到雲端。
3. 按「列印／儲存為 PDF」：紙張 A4、邊界「無」、勾選「背景圖形」。

## 日常事項

- **更改存取密碼**：Netlify → *Site configuration → Environment variables* → 修改 `ROSTER_PASSWORD`，
  然後到 *Deploys → Trigger deploy → Deploy site* 重新部署一次才會生效。
  之後每部裝置會被要求重新輸入密碼。
- **多人同時編輯**：每次改動只會更新該舍號，兩人同時改不同舍號不會互相覆蓋；
  同一舍號以最後儲存者為準。頁面每分鐘及每次切回視窗時都會自動更新。
- **備份**：雲端會一直保留資料，但仍建議在「設定與備份」定期匯出 JSON 備份檔。
- **更新程式**：改好 `public/index.html` 後 `git push`，Netlify 會自動重新部署。
- **離線使用**：直接雙擊開啟 `public/index.html`（file:// 方式）會變成純本機模式，
  資料只存在該瀏覽器，不會同步到雲端。

## 個人資料注意事項

- 名單載有舍友姓名，網址請只給有需要的職員；密碼不要寫在公開地方。
- 網站已加入 `noindex` 及禁止嵌入等標頭，搜尋引擎不會收錄。
- 若懷疑密碼外洩，立即更改 `ROSTER_PASSWORD` 並重新部署。

## 用 Netlify CLI 部署（不想用 GitHub 時的替代方法）

```bash
npm install -g netlify-cli
netlify login
netlify init          # 建立新網站並連結此資料夾
netlify env:set ROSTER_PASSWORD "你的密碼"
netlify deploy --prod
```

## 本機測試

```bash
npm install
echo 'ROSTER_PASSWORD=test1234' > .env
netlify dev            # 開啟 http://localhost:8888，資料存在本機沙盒
```

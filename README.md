# 香港扶幼會則仁中心 忠孝舍友名單（Netlify 雲端版）

創作者：何文諾社工（香港扶幼會則仁中心）。目前版本 1.0.1，詳見 [CHANGELOG.md](CHANGELOG.md)。

一頁式的舍友名單網站：開啟網址先選擇「孝社」或「忠社」，輸入存取密碼後，
任何裝置都會看到該社最新的名單。改動會自動儲存到雲端（Netlify Blobs），並可一鍵列印成 A4 PDF 張貼。

- 兩社名單各自獨立儲存，功能完全相同，使用同一個存取密碼。
- 預設舍號：孝社 B01–B24（沒有 B08）及 B26；忠社 A01–A24。
  兩社都可在「設定與備份 → 舍號」自行修改（最多 60 個，每個最長 8 個字元）；
  同一位置改名會保留該格資料，刪除舍號會連同資料一併移除（會先確認）。
- 可直接以網址開啟指定的社（方便加到書籤或主畫面）：
  <https://housenamelist.netlify.app/?house=xiao>（孝社）、<https://housenamelist.netlify.app/?house=zhong>（忠社）。
  網站：<https://housenamelist.netlify.app/>
- 名單內右上角「⇄ 切換社」可返回選擇畫面。
- 要新增其他社：在 `public/index.html` 的 `HOUSES` 及 `netlify/functions/roster.mjs` 的 `HOUSES` 各加一行。

```
public/index.html                網頁本身（名單、編輯、列印）
netlify/functions/roster.mjs     雲端儲存 API（讀取／儲存各社名單，須密碼；?house= 指定社）
netlify.toml                     Netlify 設定（發佈資料夾、函式資料夾、安全標頭）
package.json                     函式所需的套件（@netlify/blobs）
```

## 第一次部署（約 10 分鐘）

### 1. 程式碼已在 GitHub

倉庫：<https://github.com/simonho1016/housebnamelist>（分支 `main`）。
倉庫內只有程式碼，沒有舍友資料；資料只存在 Netlify。
建議到 GitHub 的 *Settings → Danger Zone → Change repository visibility* 改為 **Private**。

### 2. 在 Netlify 建立網站

1. 登入 <https://app.netlify.com>，按 **Add new site → Import an existing project → GitHub**。
2. 授權 Netlify 讀取你的 GitHub，選擇 `housebnamelist` 倉庫。
3. 建置設定會自動從 `netlify.toml` 讀取（Publish directory：`public`，Functions：`netlify/functions`），不用改。
4. **部署前**按 **Add environment variables**（或部署後到 *Site configuration → Environment variables*），新增：

   | Key | Value |
   |-----|-------|
   | `ROSTER_PASSWORD` | 你自訂的存取密碼（建議 10 個字元以上，中英文皆可；開頭和結尾不要有空格） |

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

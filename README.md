# 實驗室採購核銷平台 Lab Reimbursement System

集中管理實驗室採購紀錄與核銷附件（估價單、到貨單、發票）的輕量網頁系統。

- **前端**：單一檔案 `index.html`（純 HTML / CSS / JavaScript，無需安裝任何套件）
- **後端**：Google Apps Script（`Code.gs`），以 Web App 方式提供 API
- **資料庫**：Google Sheets
- **檔案儲存**：Google Drive

不需要自架伺服器，全部使用 Google 帳號內建的服務即可運作。

---

## 功能

- **建立採購項目**：登錄採購人、訂購日期、品項名稱、代理商、貨號、廠牌、總金額、備註。
- **編輯採購項目**：在歷史紀錄點「編輯」，可修正填錯的欄位（已上傳的附件與紀錄編號不受影響）。
- **刪除採購項目**：在編輯頁面按 **Delete**，確認後刪除該筆紀錄，並將其附件資料夾移到 Google Drive 垃圾桶（30 天內可還原）。
- **歷史紀錄列表**：依訂購日期由新到舊排序，每頁 15 筆，支援關鍵字搜尋（品項、採購人、貨號、備註等任何欄位）。
- **附件上傳與更換**：可補上傳估價單、到貨單、發票，也可以重新上傳覆蓋。支援圖片與 PDF，單檔上限 10 MB。
- **狀態統計**：顯示全部採購項目、待補附件、附件完整的數量。

### 附件規則

| 附件 | 何時需要 |
| --- | --- |
| 估價單 | 總金額**超過 NT$10,000** 時才需要（未超過時後端會拒絕上傳） |
| 到貨單 | 一律需要 |
| 發票 | 一律需要 |

缺少任一必要附件的紀錄會被計入「待補附件」。

---

## 專案結構

```
Lab_reimbursement_sys/
├── Code.gs       # Google Apps Script 後端（API、試算表與 Drive 操作）
├── index.html    # 前端介面（單一檔案）
└── README.md
```

---

## 系統架構

```
瀏覽器 (index.html)
      │  POST (JSON, Content-Type: text/plain)
      ▼
Google Apps Script Web App (Code.gs)
      ├──► Google Sheets：儲存採購紀錄
      └──► Google Drive ：儲存估價單 / 到貨單 / 發票
```

前端以 `text/plain` 送出 JSON，是為了避免瀏覽器對 Apps Script 發出 CORS preflight 請求。

---

## 安裝與部署

### 1. 建立 Google 試算表

1. 在 Google Sheets 建立一份新的試算表。
2. 從網址取得試算表 ID：

   ```
   https://docs.google.com/spreadsheets/d/【這一段就是 ID】/edit
   ```

工作表（預設名稱 `Purchases`）與欄位標題會在第一次呼叫 API 時自動建立，不需要手動設定。

### 2. 建立 Google Drive 資料夾

在 Google Drive 建立三個資料夾，分別存放三種附件：

- 估價單資料夾
- 到貨單資料夾
- 發票資料夾

從各資料夾的網址取得資料夾 ID：

```
https://drive.google.com/drive/folders/【這一段就是 ID】
```

### 3. 建立 Apps Script 專案

1. 在 [script.google.com](https://script.google.com) 建立新專案。
2. 將 `Code.gs` 的內容貼進編輯器。
3. 修改檔案最上方的 `CONFIG`：

   ```javascript
   const CONFIG = {
     spreadsheetId: "你的試算表 ID",
     quotationFolderId: "估價單資料夾 ID",
     deliveryFolderId: "到貨單資料夾 ID",
     invoiceFolderId: "發票資料夾 ID",
     sheetName: "Purchases",
     maxFileSize: 10 * 1024 * 1024,   // 附件大小上限（10 MB）
     quotationLimit: 10000            // 超過此金額才需要估價單
   };
   ```

### 4. 部署為 Web App

1. 點右上角 **部署 → 新增部署作業**，類型選 **網頁應用程式**。
2. 設定：
   - **執行身分**：我（你的帳號）
   - **誰可以存取**：所有人
3. 部署並依畫面指示完成授權（需要授權試算表與 Drive 的存取權限）。
4. 複製產生的 **網頁應用程式網址**（結尾為 `/exec`）。

### 5. 設定前端

打開 `index.html`，找到下面這行，換成你剛剛複製的網址：

```javascript
const API_URL = "https://script.google.com/macros/s/xxxxxxxx/exec";
```

### 6. 開啟網站

`index.html` 是純靜態檔案，可以：

- 直接用瀏覽器開啟，或
- 放到任何靜態網站空間，例如 [GitHub Pages](https://pages.github.com/)。

---

## 更新後端程式碼

修改 `Code.gs` 後，**只存檔不會生效**，必須重新部署：

**部署 → 管理部署作業 → 編輯（鉛筆圖示）→ 版本選「新版本」→ 部署**

網址不會改變，`index.html` 裡的 `API_URL` 不需要更動。

如果新版程式碼用到了新的權限（例如 Drive 相關操作），Google 會要求重新授權。

---

## 資料欄位

試算表 `Purchases` 工作表的欄位如下：

| 欄位 | 說明 |
| --- | --- |
| `id` | 採購編號（自動產生，格式 `EX-xxxxxxxx-xxx`） |
| `purchaser` | 採購人 |
| `itemName` | 品項名稱（上限 200 字） |
| `agent` | 代理商 |
| `catNo` | 貨號 |
| `brand` | 廠牌 |
| `notes` | 備註（選填，上限 2000 字） |
| `price` | 總金額（NTD，不可小於 0） |
| `orderDate` | 訂購日期（`YYYY-MM-DD`） |
| `quotation` | 估價單連結 |
| `delivery` | 到貨單連結 |
| `invoice` | 發票連結 |
| `createdAt` | 建立時間（ISO 格式） |

附件在 Drive 中的存放方式：每種附件的資料夾底下，會依採購編號建立子資料夾，檔案放在裡面。

```
估價單資料夾/
└── EX-12345678-123/
    └── quote.pdf
```

---

## API 說明

所有請求皆以 `POST` 送到 Web App 網址，內容為 JSON，以 `action` 指定動作。回應格式為 `{ "ok": true, ... }`，失敗時為 `{ "ok": false, "error": "錯誤訊息" }`。

| action | 說明 | 主要參數 |
| --- | --- | --- |
| `listPurchases` | 取得全部採購紀錄 | 無 |
| `createPurchase` | 新增採購紀錄 | `purchase`（採購資料物件） |
| `updatePurchase` | 修改採購紀錄的可編輯欄位 | `purchase`（需包含 `id`） |
| `deletePurchase` | 刪除紀錄並將附件資料夾移到垃圾桶 | `purchaseId` |
| `uploadAttachment` | 上傳或覆蓋附件 | `purchaseId`、`attachmentType`（`quotation` / `delivery` / `invoice`）、`fileName`、`mimeType`、`base64` |

範例：

```json
{
  "action": "createPurchase",
  "purchase": {
    "purchaser": "Jessie",
    "orderDate": "2026-09-29",
    "itemName": "Cell Culture Dish 100 mm",
    "agent": "Taiwan Merck",
    "catNo": "CLS430167",
    "brand": "Corning",
    "price": 3200,
    "notes": ""
  }
}
```

直接用瀏覽器開啟 Web App 網址（`GET`）會回傳 `Lab reimbursement API is running`，可用來確認部署是否成功。

---

## 常見問題

**畫面顯示「請確認 Apps Script URL 與部署權限」**
檢查 `index.html` 的 `API_URL` 是否正確，以及 Web App 的存取權限是否設為「所有人」。

**上傳附件時出現「請先設定…資料夾 ID」**
`Code.gs` 的 `CONFIG` 裡對應的資料夾 ID 還是預設的「請填入…」，請填入實際的 ID 並重新部署。

**修改了 `Code.gs` 但功能沒有變化，或出現「不支援的 action」**
沒有重新部署新版本，請參考上方「更新後端程式碼」。

**誤刪了紀錄**
試算表中的紀錄刪除後無法復原；附件資料夾可以到 Google Drive 的垃圾桶還原（30 天內），再手動把連結貼回試算表。

---

## 注意事項與已知限制

- **沒有身分驗證**：任何知道 Web App 網址的人都能新增、編輯、刪除紀錄與上傳附件。請勿公開散布網址，若需要限制使用者，建議進一步加入登入或密碼機制。
- **附件為「知道連結的人皆可檢視」**：上傳的檔案會被設為任何擁有連結的人都能檢視，請避免上傳含高度敏感資訊的文件。
- 建議定期備份 Google 試算表。
- 部署後 Web App 會以**你的 Google 帳號**身分存取試算表與 Drive，請確認該帳號對兩者有編輯權限。

---

## 技術重點

- 寫入試算表時使用 `LockService`，避免多人同時操作造成資料錯亂。
- 前後端皆做欄位驗證（必填、金額、日期格式、字數、檔案大小）。
- 前端輸出使用 `escapeHtml` 處理，避免資料內容被當成 HTML 執行。

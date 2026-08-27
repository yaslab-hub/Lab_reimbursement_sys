const CONFIG = {
  spreadsheetId: "1C9QcI8DRm54Iw173e3IsoSv2xePyD8zzbg8pjCmeyqw",
  quotationFolderId: "請填入估價單資料夾 ID",
  deliveryFolderId: "請填入到貨單資料夾 ID",
  invoiceFolderId: "請填入發票資料夾 ID",
  sheetName: "Purchases",
  maxFileSize: 10 * 1024 * 1024,
  quotationLimit: 10000
};

const HEADERS = [
  "id",
  "purchaser",
  "itemName",
  "agent",
  "catNo",
  "brand",
  "notes",
  "price",
  "orderDate",
  "quotation",
  "delivery",
  "invoice",
  "createdAt"
];

const ATTACHMENT_TYPES = {
  quotation: "估價單",
  delivery: "到貨單",
  invoice: "發票"
};


function doGet() {
  return jsonResponse({
    ok: true,
    message: "Lab reimbursement API is running"
  });
}


function doPost(event) {
  try {
    if (!event || !event.postData || !event.postData.contents) {
      return jsonResponse({
        ok: false,
        error: "沒有收到請求資料"
      });
    }

    const request = JSON.parse(event.postData.contents);

    switch (request.action) {
      case "listPurchases":
        return jsonResponse({
          ok: true,
          purchases: listPurchases()
        });

      case "createPurchase":
        return jsonResponse({
          ok: true,
          purchase: createPurchase(request.purchase)
        });

      case "uploadAttachment":
        return jsonResponse({
          ok: true,
          attachment: uploadAttachment(request)
        });

      default:
        throw new Error("不支援的 action：" + request.action);
    }
  } catch (error) {
    console.error(error);

    return jsonResponse({
      ok: false,
      error: error.message || "系統發生錯誤"
    });
  }
}


function listPurchases() {
  const sheet = getPurchasesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values[0];

  return values
    .slice(1)
    .filter(row => row.some(value => value !== ""))
    .map(row => rowToPurchase(headers, row));
}


function createPurchase(input) {
  if (!input || typeof input !== "object") {
    throw new Error("採購資料格式錯誤");
  }

  validatePurchase(input);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const purchase = {
      id: createPurchaseId(),
      purchaser: cleanText(input.purchaser),
      itemName: cleanText(input.itemName),
      agent: cleanText(input.agent),
      catNo: cleanText(input.catNo),
      brand: cleanText(input.brand),
      notes: cleanText(input.notes),
      price: Number(input.price),
      orderDate: normalizeDate(input.orderDate),
      quotation: "",
      delivery: "",
      invoice: "",
      createdAt: new Date().toISOString()
    };

    const sheet = getPurchasesSheet();
    sheet.appendRow(HEADERS.map(header => purchase[header] || ""));

    return purchase;
  } finally {
    lock.releaseLock();
  }
}


function uploadAttachment(request) {
  if (!request) {
    throw new Error("附件請求資料不存在");
  }

  const purchaseId = cleanText(request.purchaseId);
  const attachmentType = cleanText(request.attachmentType);
  const fileName = cleanText(request.fileName);
  const mimeType = cleanText(request.mimeType) || "application/octet-stream";
  const base64 = cleanText(request.base64).replace(/^data:[^;]+;base64,/, "");

  if (!purchaseId) {
    throw new Error("缺少採購編號");
  }

  if (!ATTACHMENT_TYPES[attachmentType]) {
    throw new Error("不支援的附件類型");
  }

  if (!fileName) {
    throw new Error("缺少檔案名稱");
  }

  if (!base64) {
    throw new Error("缺少檔案內容");
  }

  const purchase = findPurchaseById(purchaseId);

  if (!purchase) {
    throw new Error("找不到採購紀錄：" + purchaseId);
  }

  if (attachmentType === "quotation" && Number(purchase.price) <= CONFIG.quotationLimit) {
    throw new Error("總金額未超過 10,000 元，不需要上傳估價單");
  }

  const decodedBytes = Utilities.base64Decode(base64);

  if (decodedBytes.length > CONFIG.maxFileSize) {
    throw new Error("檔案不可超過 10 MB");
  }

  const folderId = getAttachmentFolderId(attachmentType);
  const parentFolder = DriveApp.getFolderById(folderId);
  const purchaseFolder = getOrCreateFolder(parentFolder, purchaseId);
  const safeFileName = createSafeFileName(fileName);
  const blob = Utilities.newBlob(decodedBytes, mimeType, safeFileName);
  const file = purchaseFolder.createFile(blob);
  const fileUrl = file.getUrl();

  const rowNumber = findPurchaseRowNumber(purchaseId);
  const columnNumber = getHeaderColumnNumber(attachmentType);
  getPurchasesSheet().getRange(rowNumber, columnNumber).setValue(fileUrl);

  return {
    purchaseId,
    attachmentType,
    attachmentName: ATTACHMENT_TYPES[attachmentType],
    fileName: safeFileName,
    fileId: file.getId(),
    fileUrl
  };
}


function getAttachmentFolderId(attachmentType) {
  const folderIds = {
    quotation: CONFIG.quotationFolderId,
    delivery: CONFIG.deliveryFolderId,
    invoice: CONFIG.invoiceFolderId
  };

  const folderId = folderIds[attachmentType];

  if (!folderId || folderId.includes("請填入")) {
    throw new Error("請先設定「" + ATTACHMENT_TYPES[attachmentType] + "」資料夾 ID");
  }

  return folderId;
}


function validatePurchase(purchase) {
  const requiredFields = [
    ["purchaser", "採購人"],
    ["itemName", "品項名稱"],
    ["agent", "代理商"],
    ["catNo", "貨號"],
    ["brand", "廠牌"],
    ["orderDate", "訂購日期"]
  ];

  requiredFields.forEach(([field, label]) => {
    if (!cleanText(purchase[field])) {
      throw new Error(label + "為必填欄位");
    }
  });

  if (
    purchase.price === undefined ||
    purchase.price === null ||
    purchase.price === "" ||
    isNaN(Number(purchase.price))
  ) {
    throw new Error("總金額必須是數字");
  }

  if (Number(purchase.price) < 0) {
    throw new Error("總金額不可小於 0");
  }

  if (!isValidDate(purchase.orderDate)) {
    throw new Error("訂購日期格式錯誤");
  }

  if (cleanText(purchase.itemName).length > 200) {
    throw new Error("品項名稱不可超過 200 個字元");
  }

  if (cleanText(purchase.notes).length > 2000) {
    throw new Error("備註不可超過 2000 個字元");
  }
}


function rowToPurchase(headers, row) {
  const purchase = {};

  headers.forEach((header, index) => {
    purchase[header] = row[index] === undefined ? "" : row[index];
  });

  if (purchase.orderDate instanceof Date) {
    purchase.orderDate = Utilities.formatDate(
      purchase.orderDate,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  if (purchase.createdAt instanceof Date) {
    purchase.createdAt = purchase.createdAt.toISOString();
  }

  purchase.price = Number(purchase.price || 0);

  return purchase;
}


function getPurchasesSheet() {
  if (!CONFIG.spreadsheetId || CONFIG.spreadsheetId.includes("請填入")) {
    throw new Error("請先設定 CONFIG.spreadsheetId");
  }

  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.sheetName);
  }

  ensureHeaders(sheet);

  return sheet;
}


function ensureHeaders(sheet) {
  const currentHeaders = sheet
    .getRange(1, 1, 1, HEADERS.length)
    .getValues()[0];

  const isCorrect = HEADERS.every((header, index) => {
    return currentHeaders[index] === header;
  });

  if (!isCorrect) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}


function findPurchaseById(purchaseId) {
  return listPurchases().find(purchase => purchase.id === purchaseId) || null;
}


function findPurchaseRowNumber(purchaseId) {
  const sheet = getPurchasesSheet();
  const values = sheet.getDataRange().getValues();
  const idColumn = HEADERS.indexOf("id");
  const rowIndex = values.slice(1).findIndex(row => {
    return String(row[idColumn]) === String(purchaseId);
  });

  if (rowIndex === -1) {
    throw new Error("找不到採購紀錄：" + purchaseId);
  }

  return rowIndex + 2;
}


function getHeaderColumnNumber(headerName) {
  const columnIndex = HEADERS.indexOf(headerName);

  if (columnIndex === -1) {
    throw new Error("找不到欄位：" + headerName);
  }

  return columnIndex + 1;
}


function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parentFolder.createFolder(folderName);
}


function createPurchaseId() {
  const timestamp = Date.now().toString().slice(-8);
  const randomPart = Math.floor(Math.random() * 900 + 100);

  return "EX-" + timestamp + "-" + randomPart;
}


function cleanText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}


function createSafeFileName(fileName) {
  return fileName
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}


function isValidDate(value) {
  const text = cleanText(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}


function normalizeDate(value) {
  if (!isValidDate(value)) {
    throw new Error("日期格式必須為 YYYY-MM-DD");
  }

  return cleanText(value);
}


function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

const SPREADSHEET_ID = '1Y_wzuj4M8_PmtzSZWJ7Rx43AJnue63lukxwn0A0dMx0';
const SHEET_NAME = 'Waitlist';

function doGet(e) {
  const payload = handleSignup_(e ? e.parameter : {});
  const callback = sanitizeCallback_(e && e.parameter ? e.parameter.callback : '');

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(payload)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleSignup_(params) {
  const email = normalizeEmail_(params.email);
  const source = (params.source || 'prevly-landing').trim();
  const page = (params.page || '').trim();

  if (!isValidEmail_(email)) {
    return { ok: false, error: 'invalid_email' };
  }

  const sheet = getOrCreateSheet_();
  const duplicate = hasEmail_(sheet, email);

  if (!duplicate) {
    sheet.appendRow([
      new Date(),
      email,
      source,
      page
    ]);
  }

  return { ok: true, duplicate: duplicate };
}

function getOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['created_at', 'email', 'source', 'page']);
  }

  return sheet;
}

function hasEmail_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return false;
  }

  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  return values.some(function (row) {
    return normalizeEmail_(row[0]) === email;
  });
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function sanitizeCallback_(value) {
  return String(value || '').replace(/[^\w$.]/g, '');
}

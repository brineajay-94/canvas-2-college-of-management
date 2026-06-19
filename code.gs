/**
 * Canvas+2 College - Result Management Google Apps Script
 *
 * SETUP:
 * 1. Create a Google Sheet with tabs named after your result sheets (e.g., "Class 11 Management")
 * 2. Each tab's Row 1 = headers: Symbol Number, Student Name, Subject1, Subject2, ..., Total, GPA, Result
 * 3. Extensions > Apps Script > paste this code > Deploy > New deployment > Web app
 * 4. Set "Execute as" = Me, "Who has access" = Anyone
 * 5. Copy the web app URL
 * 6. In the admin panel > Sheet > add the URL to the result sheet record
 */

// ──────────────────────────────────────
// GET - Fetch result data
// ──────────────────────────────────────
function doGet(e) {
  var params = e.parameter;
  var sheetName = params.sheet;
  var symbol = params.symbolNumber;
  var action = params.action || '';
  var sheetId = params.sheetId;

  if (!sheetId) return errorResponse('Missing sheetId parameter');
  var ss = SpreadsheetApp.openById(sheetId);

  // Action: list all sheet/tab names
  if (action === 'listSheets') {
    var sheets = ss.getSheets();
    var names = sheets.map(function(s) { return s.getName(); });
    return jsonResponse({ sheets: names });
  }

  if (!sheetName) return errorResponse('Missing sheet parameter');

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return errorResponse('Sheet not found: ' + sheetName);

  var data = sheet.getDataRange().getValues();

  // Remove trailing empty rows (rows where every cell is blank)
  while (data.length > 2 && data[data.length - 1].every(function(c) { return c === '' || c === null || c === undefined; })) {
    data.pop();
  }

  // Check if row 2 has TH/PR sub-headers (merged header layout)
  var rawRow1 = data[0];
  var rawRow2 = data.length > 1 ? data[1] : [];
  var hasSubHeaders = rawRow2.some(function(h, ci) {
    var s = String(h).trim().toUpperCase();
    // Only detect TH/PR if the cell above (Row 1) is non-empty and this cell is exactly TH/PR
    return (s === 'TH' || s === 'PR') && rawRow1[ci] && String(rawRow1[ci]).trim() !== '';
  });

  var minRows = hasSubHeaders ? 3 : 2;
  if (data.length < minRows) return errorResponse('No data in sheet');

  var headers, rows;
  if (hasSubHeaders) {
    // Combine merged headers: "English"+""+"TH"+"PR" = "English TH"+"English PR"
    headers = [];
    var prevMain = '';
    for (var ci = 0; ci < rawRow1.length; ci++) {
      var main = String(rawRow1[ci]).trim();
      var sub = String(rawRow2[ci]).trim().toUpperCase();
      if (main) prevMain = main;
      if (sub === 'TH' || sub === 'PR') {
        headers.push((prevMain || 'Subject') + ' ' + sub);
      } else if (main) {
        headers.push(main);
      } else {
        headers.push(sub || ('Col' + (ci + 1)));
      }
    }
    rows = data.slice(2);
  } else {
    headers = rawRow1;
    rows = data.slice(1);
  }

  // Action: list all rows
  if (action === 'all' || (!symbol)) {
    var allData = rows.map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[String(h).trim()] = row[i]; });
      return obj;
    });
    return jsonResponse({ headers: headers, data: allData, total: allData.length });
  }

  // Auto-detect symbol column from headers (support "Symbol", "Symbol No", "Symbol Number", "Roll", etc.)
  var symbolCol = 0;
  for (var ci = 0; ci < headers.length; ci++) {
    var h = String(headers[ci]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (h === 'symbol' || h === 'symbolnumber' || h === 'symbolno' || h === 'roll' || h === 'rollno' || h === 'rollnumber' || h === 'sn' || h === 'sno') {
      symbolCol = ci;
      break;
    }
  }

  // Search by symbol number — handle number/string mismatches (e.g. leading zeros)
  var found = null;
  var symbolStr = String(symbol).trim();
  var symbolNum = parseFloat(symbolStr);
  var hasLeadingZero = symbolStr.length > 1 && symbolStr.charAt(0) === '0';

  for (var i = 0; i < rows.length; i++) {
    var cell = rows[i][symbolCol];
    var cellStr = String(cell !== undefined && cell !== null ? cell : '').trim();

    // Direct match
    if (cellStr === symbolStr) { found = rows[i]; break; }

    // Number comparison: strip leading zeros and compare numerically
    if (cellStr !== '' && !hasLeadingZero) {
      var cellNum = parseFloat(cellStr);
      if (!isNaN(cellNum) && !isNaN(symbolNum) && cellNum === symbolNum) {
        found = rows[i]; break;
      }
    }
  }

  if (!found) return errorResponse('Symbol number not found');

  var result = {};
  headers.forEach(function(h, i) { result[String(h).trim()] = found[i]; });
  return jsonResponse(result);
}

// ──────────────────────────────────────
// POST - Add or update result data
// ──────────────────────────────────────
function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var sheetName = params.sheet;
    var data = params.data;
    var symbolIdParam = params.symbolColumn || 0;
    var sheetId = params.sheetId;

    if (!sheetName) return errorResponse('Missing sheet parameter');
    if (!data || !data.length) return errorResponse('Missing data array');
    if (!sheetId) return errorResponse('Missing sheetId parameter');

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return errorResponse('Sheet not found: ' + sheetName);

    var existingData = sheet.getDataRange().getValues();
    // Remove trailing empty rows
    while (existingData.length > 2 && existingData[existingData.length - 1].every(function(c) { return c === '' || c === null || c === undefined; })) {
      existingData.pop();
    }
    var rawRow1 = existingData[0];
    var rawRow2 = existingData.length > 1 ? existingData[1] : [];
    var hasSubHeaders = rawRow2.some(function(h, ci) {
      var s = String(h).trim().toUpperCase();
      return (s === 'TH' || s === 'PR') && rawRow1[ci] && String(rawRow1[ci]).trim() !== '';
    });
    var minRows = hasSubHeaders ? 3 : 2;
    if (existingData.length < minRows) return errorResponse('No data in sheet');
    var headerRows = 1;
    var headers;
    if (hasSubHeaders) {
      headerRows = 2;
      headers = [];
      var prevMain = '';
      for (var ci = 0; ci < rawRow1.length; ci++) {
        var main = String(rawRow1[ci]).trim();
        var sub = String(rawRow2[ci]).trim().toUpperCase();
        if (main) prevMain = main;
        if (sub === 'TH' || sub === 'PR') {
          headers.push((prevMain || 'Subject') + ' ' + sub);
        } else if (main) {
          headers.push(main);
        } else {
          headers.push(sub || ('Col' + (ci + 1)));
        }
      }
    } else {
      headers = rawRow1;
    }
    var rows = existingData.slice(headerRows);

    // Auto-detect symbol column from headers
    var symbolCol = symbolIdParam;
    for (var ci = 0; ci < headers.length; ci++) {
      var h = String(headers[ci]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (h === 'symbol' || h === 'symbolnumber' || h === 'symbolno' || h === 'roll' || h === 'rollno' || h === 'rollnumber' || h === 'sn' || h === 'sno') {
        symbolCol = ci;
        break;
      }
    }

    // Try to find existing row by symbol number
    var symbol = String(data[symbolCol]).trim();
    var rowIndex = -1;
    var symbolNum = parseFloat(symbol);
    var hasLeadingZero = symbol.length > 1 && symbol.charAt(0) === '0';
    for (var i = 0; i < rows.length; i++) {
      var cell = rows[i][symbolCol];
      var cellStr = String(cell !== undefined && cell !== null ? cell : '').trim();
      if (cellStr === symbol) { rowIndex = i + headerRows + 1; break; }
      if (cellStr !== '' && !hasLeadingZero) {
        var cellNum = parseFloat(cellStr);
        if (!isNaN(cellNum) && !isNaN(symbolNum) && cellNum === symbolNum) {
          rowIndex = i + headerRows + 1; break;
        }
      }
    }

    // Trim data to match actual sheet column count (prevents AA, BB... columns)
    var maxCol = sheet.getLastColumn();
    var trimmedData = data.slice(0, maxCol);
    while (trimmedData.length < maxCol) trimmedData.push('');

    if (rowIndex > 0) {
      // Update existing row — single batch write
      sheet.getRange(rowIndex, 1, 1, maxCol).setValues([trimmedData]);
      return jsonResponse({ success: true, action: 'updated', row: rowIndex });
    } else {
      // Append new row — only non-empty cols, then backfill
      sheet.appendRow(trimmedData);
      return jsonResponse({ success: true, action: 'added', row: sheet.getLastRow() });
    }
  } catch (err) {
    return errorResponse(err.message || 'POST error');
  }
}

// ──────────────────────────────────────
// Utilities
// ──────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(msg) {
  return jsonResponse({ error: msg });
}

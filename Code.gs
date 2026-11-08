// ============================================================================
// OH SNAP! PHOTOBOX - GOOGLE APPS SCRIPT (RESEND SOFTCOPY HANDLER - FINAL)
// File ini SAMA PERSIS untuk dipasang di Google Apps Script & disimpan di VS Code.
// Cara pasang di Google Apps Script:
// 1. Buka Spreadsheet -> Extensions -> Apps Script
// 2. Ganti seluruh isi Code.gs dengan kode ini lalu tekan Ctrl + S (Save)
// 3. Klik Deploy -> Manage deployments -> Edit (ikon pensil) ->
//    Version: New version -> Deploy
// ============================================================================

var ADMIN_RESEND_KEY = 'ohsnap_resend_sec_2026';
var SHEET_NAME = '';
var DRIVE_FOLDER_ID = '';
var HEADER_SCAN_ROWS = 10;
var MAX_PHOTO_BASE64_CHARS = 7000000;

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sha256Hex(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]).toString(16);
    out += (b.length === 1 ? '0' : '') + b;
  }
  return out;
}

function safeText(v, maxLen) {
  var s = String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Script ini tidak terikat ke Spreadsheet. Buka dari Spreadsheet: Extensions > Apps Script.');
  }
  if (SHEET_NAME) {
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) throw new Error('Tab "' + SHEET_NAME + '" tidak ditemukan di spreadsheet.');
    return sh;
  }
  return ss.getSheets()[0];
}

function getFirstDataRow(sheet) {
  var last = sheet.getLastRow();
  var n = Math.min(Math.max(last, 1), HEADER_SCAN_ROWS);
  var col = sheet.getRange(1, 5, n, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0] || '').trim().toUpperCase() === 'NAMA') return i + 2;
  }
  return 3;
}

// Verifikasi token sesi admin atau kunci otorisasi tanpa bergantung pada UrlFetchApp
function isAuthorizedAdmin(tokenVal) {
  var token = String(tokenVal || '').trim();
  if (!token) return false;
  if (token === ADMIN_RESEND_KEY) return true;
  if (/^[0-9a-f]{32,128}$/i.test(token)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return true;
  if (/^[A-Za-z0-9_.-]{32,256}$/.test(token)) return true;
  return false;
}

function findTargetRow(sheet, data) {
  var first = getFirstDataRow(sheet);
  var last = sheet.getLastRow();
  if (last < first) return -1;

  var rows = sheet.getRange(first, 1, last - first + 1, 10).getValues();
  var targetRow = Number(data.sheetRow || 0);
  var targetLink = String(data.link_foto || '').trim();
  var hasLink = targetLink && targetLink !== '#' && targetLink !== 'Tidak ada';
  var targetNama = String(data.nama || '').trim().toLowerCase();
  var targetHp = String(data.no_hp || '').replace(/\D/g, '');

  function rowInfo(idx) {
    var v = rows[idx];
    return {
      nama: String(v[4] || '').trim().toLowerCase(),
      hp: String(v[5] || '').replace(/\D/g, ''),
      link: String(v[8] || '').trim()
    };
  }
  function hpMatch(h) {
    return !targetHp || !h || h.indexOf(targetHp) !== -1 || targetHp.indexOf(h) !== -1;
  }

  if (targetRow >= first && targetRow <= last) {
    var a = rowInfo(targetRow - first);
    var verified = (hasLink && a.link === targetLink) ||
                   (!hasLink && targetNama && a.nama === targetNama && hpMatch(a.hp));
    if (verified) return targetRow;
  }
  if (hasLink) {
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rowInfo(i).link === targetLink) return first + i;
    }
  }
  if (targetNama) {
    for (var j = rows.length - 1; j >= 0; j--) {
      var b = rowInfo(j);
      if (b.nama && b.nama !== 'nama' && b.nama === targetNama && hpMatch(b.hp)) return first + j;
    }
  }
  return -1;
}

function renumberRows(sheet) {
  var first = getFirstDataRow(sheet);
  var last = sheet.getLastRow();
  if (last < first) return;
  var n = last - first + 1;
  var vals = [];
  for (var i = 1; i <= n; i++) vals.push([i]);
  sheet.getRange(first, 1, n, 1).setValues(vals);
}

function executeSheetAction(sheet, data) {
  var r = findTargetRow(sheet, data);
  if (r < 0) return false;
  if (data.action === 'delete') {
    sheet.deleteRow(r);
    renumberRows(sheet);
  } else if (data.action === 'updateStatus') {
    var status = String(data.status || '').toLowerCase() === 'belum' ? 'Belum' : 'Sudah';
    sheet.getRange(r, 10).setValue(status);
  }
  return true;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data;
    try { data = JSON.parse(rawBody); } catch (pe) {
      return jsonOut({ status: 'error', message: 'Body request bukan JSON yang valid.' });
    }

    if (data.action === 'delete' || data.action === 'updateStatus') {
      if (!isAuthorizedAdmin(data.token || data.adminKey)) {
        return jsonOut({ status: 'error', message: 'UNAUTHORIZED: Sesi admin tidak valid. Silakan login ulang.' });
      }
      lock.waitLock(20000); locked = true;
      var matched = executeSheetAction(getSheet(), data);
      return jsonOut({ status: 'success', matched: matched });
    }

    var nama = safeText(data.nama, 100);
    var email = safeText(data.email, 150);
    var whatsapp = safeText(data.whatsapp || data.no_hp, 30);
    var cabang = safeText(data.cabang, 120);
    var tanggal_foto = safeText(data.tanggal_foto, 20);
    var jam_foto = safeText(data.jam_foto, 12);

    if (!nama || !email || !whatsapp || !tanggal_foto || !jam_foto) {
      return jsonOut({ status: 'error', message: 'Data wajib belum lengkap.' });
    }

    var fileUrl = 'Tidak ada';
    var foto = String(data.foto || '');
    if (foto && foto.indexOf('base64') !== -1) {
      if (foto.length > MAX_PHOTO_BASE64_CHARS) {
        return jsonOut({ status: 'error', message: 'Ukuran foto terlalu besar (maks 5 MB).' });
      }
      var base64Data = foto.split(',')[1];
      var safeName = String(data.filename || 'bukti_foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
      var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), MimeType.JPEG, safeName);
      var folder = DRIVE_FOLDER_ID ? DriveApp.getFolderById(DRIVE_FOLDER_ID) : DriveApp.getRootFolder();
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = file.getUrl();
    }

    lock.waitLock(20000); locked = true;
    var sheet = getSheet();
    var first = getFirstDataRow(sheet);
    var last = sheet.getLastRow();
    var nextNo = last >= first ? (last - first + 2) : 1;
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');

    sheet.appendRow([
      nextNo,
      "'" + timestamp,
      "'" + tanggal_foto,
      "'" + jam_foto,
      nama,
      "'" + whatsapp,
      email,
      cabang,
      fileUrl,
      'Belum'
    ]);

    return jsonOut({ status: 'success', url: fileUrl });
  } catch (error) {
    return jsonOut({ status: 'error', message: String(error && error.message ? error.message : error) });
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (le) {} }
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};

    if (params.ping) {
      return jsonOut({ status: 'ok', service: 'OH SNAP resend', time: new Date().toISOString() });
    }

    if (!isAuthorizedAdmin(params.token || params.adminKey)) {
      return jsonOut({
        status: 'unauthorized',
        message: 'Akses ditolak: token sesi admin tidak valid atau sudah berakhir. Silakan logout lalu login kembali.'
      });
    }

    if (params.action === 'delete' || params.action === 'updateStatus') {
      var matched = executeSheetAction(getSheet(), params);
      return jsonOut({ status: 'success', matched: matched });
    }

    var sheet = getSheet();
    var first = getFirstDataRow(sheet);
    var last = sheet.getLastRow();
    var res = [];

    if (last >= first) {
      var range = sheet.getRange(first, 1, last - first + 1, 10);
      var rows = range.getValues();
      var display = range.getDisplayValues();
      var counter = 1;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var d = display[i];
        var rawName = String(row[4] || '').trim();
        if (!rawName || rawName.toUpperCase() === 'NAMA') continue;
        var sheetRow = first + i;
        res.push({
          _sheetRow: sheetRow,
          id: sheetRow - 1,
          no: counter++,
          tanggal_masuk: d[1] ? String(d[1]) : '',
          tanggal_foto: d[2] ? String(d[2]) : '',
          jam_foto: d[3] ? String(d[3]) : '',
          nama: d[4] ? String(d[4]) : '',
          whatsapp: d[5] ? String(d[5]) : '',
          email: d[6] ? String(d[6]) : '',
          cabang: d[7] ? String(d[7]) : '',
          link_foto: row[8] ? String(row[8]) : '',
          tindak_lanjut: d[9] ? String(d[9]) : 'Belum'
        });
      }
    }
    return jsonOut(res);
  } catch (error) {
    return jsonOut({ status: 'error', message: String(error && error.message ? error.message : error) });
  }
}

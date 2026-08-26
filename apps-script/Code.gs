/* =========================================================================
 * Code.gs — Backend Google Apps Script cho app "Quỹ CLB Cầu lông"
 * -------------------------------------------------------------------------
 * CÁCH CÀI (làm 1 lần, ~5 phút):
 *  1. Tạo 1 Google Sheet mới, đặt tên "Quy CLB Cau long".
 *  2. Menu  Tiện ích mở rộng → Apps Script.
 *  3. Xoá hết code mẫu, dán TOÀN BỘ file này vào.
 *  4. Sửa dòng TOKEN bên dưới thành một chuỗi bí mật của riêng bạn.
 *  5. Bấm Lưu → chọn hàm `setup` → bấm Chạy (cấp quyền khi được hỏi).
 *  6. Bấm Triển khai (Deploy) → Tuỳ chọn triển khai mới → Ứng dụng web
 *       - Thực thi với tư cách: Tôi (chính bạn)
 *       - Ai có quyền truy cập: Bất kỳ ai  ← BẮT BUỘC
 *     → Triển khai → copy "URL ứng dụng web".
 *  7. Mở web app, vào tab Cài đặt, dán URL + TOKEN, bấm Kiểm tra kết nối.
 *
 *  LƯU Ý: mỗi lần sửa code phải Triển khai lại (Deploy → Quản lý triển khai
 *  → biểu tượng bút chì → Phiên bản: Mới → Triển khai) thì URL mới có hiệu lực.
 * ========================================================================= */

/** ĐỔI CHUỖI NÀY thành mật khẩu riêng của bạn (bất kỳ, càng dài càng tốt). */
var TOKEN = 'doi-chuoi-nay-di-nhe';

var SHEETS = {
  Settings:    ['key', 'value'],
  Members:     ['id', 'name', 'phone', 'active', 'note'],
  Months:      ['month', 'courtFee', 'guestFee', 'status', 'note'],
  Fixed:       ['month', 'memberId'],
  Sessions:    ['id', 'month', 'date', 'cost', 'note'],
  Guests:      ['id', 'month', 'date', 'name', 'memberId', 'amount', 'paid', 'note'],
  Shuttles:    ['id', 'month', 'date', 'buyerId', 'tubes', 'unitPrice', 'amount', 'note'],
  Payments:    ['id', 'month', 'memberId', 'amount', 'date', 'note'],
  Adjustments: ['id', 'month', 'memberId', 'amount', 'reason']
};

/* ------------------------------------------------------------------ setup */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var head = SHEETS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#e8f0fe');
    sh.setFrozenRows(1);
  });
  var meta = ss.getSheetByName('_meta') || ss.insertSheet('_meta');
  if (!meta.getRange('A1').getValue()) {
    meta.getRange('A1:B1').setValues([['rev', 0]]);
  }
  meta.hideSheet();
  SpreadsheetApp.getUi && SpreadsheetApp.flush();
  Logger.log('Đã tạo xong các sheet. Nhớ đổi TOKEN rồi Triển khai ứng dụng web.');
}

/* -------------------------------------------------------------- transport */
function doGet(e) {
  // Dùng cho JSONP / kiểm tra nhanh bằng trình duyệt
  var p = (e && e.parameter) || {};
  var res = handle({ action: p.action || 'ping', token: p.token });
  if (p.callback) {
    return ContentService
      .createTextOutput(p.callback + '(' + JSON.stringify(res) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json(res);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  return json(handle(body));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ----------------------------------------------------------------- router */
function handle(req) {
  try {
    var action = req.action || 'ping';
    if (action === 'ping') return { ok: true, action: 'ping', time: new Date().toISOString() };
    if (req.token !== TOKEN) return { ok: false, error: 'Sai mã bảo mật (token).' };

    if (action === 'load') return { ok: true, data: readAll() };
    if (action === 'save') return saveAll(req.data, req.baseRev);
    return { ok: false, error: 'Không hiểu action: ' + action };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

/* ------------------------------------------------------------------- read */
function readAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = { rev: getRev() };

  Object.keys(SHEETS).forEach(function (name) {
    var head = SHEETS[name];
    var sh = ss.getSheetByName(name);
    var rows = [];
    if (sh && sh.getLastRow() > 1) {
      var values = sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues();
      values.forEach(function (r) {
        if (r.every(function (c) { return c === '' || c === null; })) return;
        var o = {};
        head.forEach(function (k, i) { o[k] = cell(r[i]); });
        rows.push(o);
      });
    }
    data[keyOf(name)] = rows;
  });

  // Settings là dạng key/value -> gộp lại thành object
  var s = {};
  (data.settingsRows || []).forEach(function (r) {
    var v = r.value;
    try { v = JSON.parse(r.value); } catch (e) { /* giữ nguyên chuỗi */ }
    s[r.key] = v;
  });
  data.settings = s;
  delete data.settingsRows;
  return data;
}

function cell(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (v === null || v === undefined) return '';
  return v;
}

function keyOf(sheetName) {
  return {
    Settings: 'settingsRows', Members: 'members', Months: 'months', Fixed: 'fixed',
    Sessions: 'sessions', Guests: 'guests', Shuttles: 'shuttles',
    Payments: 'payments', Adjustments: 'adjustments'
  }[sheetName];
}

/* ------------------------------------------------------------------ write */
function saveAll(data, baseRev) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Hệ thống đang bận, thử lại sau vài giây.' };
  try {
    var cur = getRev();
    if (baseRev !== undefined && baseRev !== null && Number(baseRev) !== cur) {
      return {
        ok: false, conflict: true, serverRev: cur,
        error: 'Dữ liệu trên Google Sheet đã thay đổi ở nơi khác (bản ' + cur +
               ', bạn đang giữ bản ' + baseRev + '). Hãy Tải lại rồi nhập lại thay đổi.'
      };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(SHEETS).forEach(function (name) {
      var head = SHEETS[name];
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.getRange(1, 1, 1, head.length).setValues([head])
        .setFontWeight('bold').setBackground('#e8f0fe');
      sh.setFrozenRows(1);

      var rows;
      if (name === 'Settings') {
        var st = data.settings || {};
        rows = Object.keys(st).map(function (k) {
          var v = st[k];
          return [k, (typeof v === 'object') ? JSON.stringify(v) : v];
        });
      } else {
        rows = (data[keyOf(name)] || []).map(function (o) {
          return head.map(function (k) {
            var v = o[k];
            return (v === undefined || v === null) ? '' : v;
          });
        });
      }

      if (sh.getLastRow() > 1) {
        sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      }
      if (rows.length) {
        sh.getRange(2, 1, rows.length, head.length).setValues(rows);
      }
      sh.autoResizeColumns(1, head.length);
    });

    var newRev = cur + 1;
    setRev(newRev);
    return { ok: true, rev: newRev, savedAt: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------- meta */
function getRev() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var meta = ss.getSheetByName('_meta');
  if (!meta) return 0;
  return Number(meta.getRange('B1').getValue()) || 0;
}

function setRev(n) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var meta = ss.getSheetByName('_meta') || ss.insertSheet('_meta');
  meta.getRange('A1:B1').setValues([['rev', n]]);
  meta.hideSheet();
}

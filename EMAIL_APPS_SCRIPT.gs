/**
 * Racing Garage — Email Relay (Google Apps Script)
 * ================================================
 * ส่ง email 2 ฉบับเมื่อมีคำสั่งซื้อใหม่:
 *   1. แจ้งเตือนร้าน  → SHOP_EMAIL
 *   2. ยืนยันลูกค้า   → customerEmail (ถ้ากรอก)
 *
 * วิธีติดตั้ง (ทำครั้งเดียว ~3 นาที)
 * ---------------------------------
 * 1. เปิด https://script.google.com  → คลิก "New project"
 * 2. ลบโค้ดเดิมทั้งหมด → วางโค้ดนี้ลงไป → ตั้งชื่อโปรเจกต์ "RG Email Relay"
 * 3. กด Deploy ▾ → New deployment
 *      - Select type (ไอคอนเฟือง) → Web app
 *      - Description   : v1
 *      - Execute as    : Me (info.rg.th.ai@gmail.com)
 *      - Who has access: Anyone            ← สำคัญมาก ต้องเลือก Anyone
 *      - กด Deploy → Authorize access → เลือกบัญชี → Advanced → Go to RG Email Relay (unsafe) → Allow
 * 4. Copy "Web app URL" ที่ได้ (ขึ้นต้นด้วย https://script.google.com/macros/s/.../exec)
 * 5. เอา URL นั้นไปใส่ในตัวแปร MAIL_API ใน shop.html
 *
 * โควตา: Gmail ฟรี = 100 ผู้รับ/วัน (Workspace = 1,500/วัน)
 */

// ===== ตั้งค่า =====
var SHOP_EMAIL = 'info.rg.th@gmail.com';   // email รับแจ้งเตือนออเดอร์
var SHOP_NAME  = 'Racing Garage';
var SHOP_TEL   = '089-140-0606';
var SHOP_LINE  = 'racinggarage';            // Line ID
var SHOP_ADDR  = '29 ซอย รามอินทรา 39 แยก 3 แขวงอนุสาวรีย์ เขต บางเขน กรุงเทพมหานคร 10220';
var SHOP_TAXID = '';                        // เลขผู้เสียภาษีร้าน (เว้นว่างได้)
var SHOP_SITE  = 'shop.racinggarage.net';
var VAT_RATE   = 7;
var SECRET     = 'RG2026';                  // ต้องตรงกับ MAIL_SECRET ใน shop.html
var ATTACH_PDF = true;                      // แนบใบเสร็จ PDF A4 ไปกับ email

// ===== Entry point =====
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return _json({ ok: false, error: 'bad secret' });

    // ── แจ้งจัดส่งสินค้า (มีเลขพัสดุ) ──
    if (d.action === 'shipped') {
      if (d.customerEmail && d.customerEmail.indexOf('@') > 0) {
        MailApp.sendEmail({
          to: d.customerEmail,
          subject: '🚚 จัดส่งสินค้าแล้ว ' + (d.orderNo || '') + ' — ' + SHOP_NAME,
          htmlBody: _shippedHtml(d),
          name: SHOP_NAME
        });
      }
      return _json({ ok: true, mode: 'shipped' });
    }

    // สร้างใบเสร็จ PDF A4 (ถ้าล้มเหลวก็ยังส่ง email ได้ตามปกติ)
    var attachments = [];
    if (ATTACH_PDF) {
      try {
        attachments.push(_receiptPdf(d));
      } catch (pdfErr) {
        Logger.log('สร้าง PDF ไม่สำเร็จ: ' + pdfErr);
      }
    }

    // 1) แจ้งร้าน
    MailApp.sendEmail({
      to: SHOP_EMAIL,
      subject: '🛍️ ออเดอร์ใหม่ ' + (d.orderNo || '') + ' — ' + (d.customerName || ''),
      htmlBody: _shopHtml(d),
      name: SHOP_NAME,
      attachments: attachments
    });

    // 2) ยืนยันลูกค้า (ถ้ามี email)
    if (d.customerEmail && d.customerEmail.indexOf('@') > 0) {
      MailApp.sendEmail({
        to: d.customerEmail,
        subject: '✅ ยืนยันคำสั่งซื้อ ' + (d.orderNo || '') + ' — ' + SHOP_NAME,
        htmlBody: _customerHtml(d),
        name: SHOP_NAME,
        attachments: attachments
      });
    }

    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return _json({ ok: true, msg: 'RG Email Relay is running' });
}

// ===== Helpers =====
function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function _money(n) {
  n = Number(n) || 0;
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _payLabel(p) {
  var m = { qr: 'QR พร้อมเพย์', transfer: 'โอนเงิน', credit: 'บัตรเครดิต', cod: 'เก็บเงินปลายทาง (COD)' };
  return m[p] || p || '-';
}

function _rows(items) {
  return (items || []).map(function (i) {
    var sub = i.subtotal || (i.price * i.qty);
    return '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #eee">' + (i.name || '') + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + (i.qty || 1) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:right">' + _money(i.price) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">' + _money(sub) + '</td>' +
      '</tr>';
  }).join('');
}

function _totals(d) {
  return '<tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#666">ยอดสินค้า</td>' +
    '<td style="padding:6px 8px;text-align:right">' + _money(d.subtotal) + '</td></tr>' +
    '<tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#666">VAT</td>' +
    '<td style="padding:6px 8px;text-align:right">' + _money(d.vat) + '</td></tr>' +
    '<tr><td colspan="3" style="padding:10px 8px;text-align:right;font-size:16px;font-weight:bold;border-top:2px solid #333">ยอดสุทธิ</td>' +
    '<td style="padding:10px 8px;text-align:right;font-size:18px;font-weight:bold;color:#e8172c;border-top:2px solid #333">฿' + _money(d.total) + '</td></tr>';
}

function _wrap(title, badgeColor, inner) {
  return '<div style="font-family:Arial,\'Sarabun\',sans-serif;max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">' +
    '<div style="background:' + badgeColor + ';color:#fff;padding:18px 24px">' +
      '<div style="font-size:20px;font-weight:bold;letter-spacing:1px">' + SHOP_NAME.toUpperCase() + '</div>' +
      '<div style="font-size:14px;opacity:.9;margin-top:2px">' + title + '</div>' +
    '</div>' +
    '<div style="padding:24px">' + inner + '</div>' +
    '<div style="background:#fafafa;padding:14px 24px;font-size:12px;color:#888;border-top:1px solid #eee">' +
      SHOP_NAME + (SHOP_TEL ? ' • โทร ' + SHOP_TEL : '') + ' • ' + SHOP_EMAIL +
    '</div>' +
  '</div>';
}

function _infoBlock(d) {
  return '<table style="width:100%;font-size:14px;line-height:1.9;margin-bottom:16px">' +
    '<tr><td style="color:#888;width:130px">เลขที่คำสั่งซื้อ</td><td style="font-weight:bold">' + (d.orderNo || '-') + '</td></tr>' +
    '<tr><td style="color:#888">วันที่</td><td>' + (d.date || '-') + '</td></tr>' +
    '<tr><td style="color:#888">ชื่อผู้สั่ง</td><td>' + (d.customerName || '-') + '</td></tr>' +
    '<tr><td style="color:#888">เบอร์โทร</td><td>' + (d.customerPhone || '-') + '</td></tr>' +
    '<tr><td style="color:#888">ที่อยู่จัดส่ง</td><td>' + (d.customerAddress || '-') + '</td></tr>' +
    '<tr><td style="color:#888">วิธีชำระเงิน</td><td>' + _payLabel(d.payMethod) + '</td></tr>' +
    (d.note ? '<tr><td style="color:#888">หมายเหตุ</td><td>' + d.note + '</td></tr>' : '') +
  '</table>';
}

function _table(d) {
  return '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
    '<thead><tr style="background:#f5f5f5">' +
      '<th style="padding:8px;text-align:left">สินค้า</th>' +
      '<th style="padding:8px;text-align:center">จำนวน</th>' +
      '<th style="padding:8px;text-align:right">ราคา</th>' +
      '<th style="padding:8px;text-align:right">รวม</th>' +
    '</tr></thead>' +
    '<tbody>' + _rows(d.items) + _totals(d) + '</tbody>' +
  '</table>';
}

function _shopHtml(d) {
  return _wrap('🛍️ มีคำสั่งซื้อใหม่เข้ามา', '#1a3a5c',
    _infoBlock(d) + _table(d) +
    '<div style="margin-top:20px;padding:12px;background:#fff8e6;border-left:4px solid #f59e0b;font-size:13px">' +
      'เข้าระบบหลังบ้านเพื่อยืนยันและจัดส่ง: <br>' +
      '<a href="https://inforgthai-droid.github.io/thai-accounting-system/admin.html" style="color:#1a3a5c">เปิดหน้า Admin →</a>' +
    '</div>'
  );
}

function _customerHtml(d) {
  return _wrap('✅ ยืนยันคำสั่งซื้อของคุณ', '#e8172c',
    '<p style="font-size:15px;margin:0 0 16px">สวัสดีคุณ <strong>' + (d.customerName || '') + '</strong><br>' +
    'ขอบคุณที่สั่งซื้อสินค้ากับ ' + SHOP_NAME + ' เราได้รับคำสั่งซื้อของคุณเรียบร้อยแล้ว</p>' +
    _infoBlock(d) + _table(d) +
    '<div style="margin-top:20px;padding:12px;background:#f0fdf4;border-left:4px solid #10b981;font-size:13px;line-height:1.7">' +
      'ทางร้านจะตรวจสอบยอดการชำระเงิน หากการชำระเงินเสร็จสมบูรณ์แล้ว จะทำการจัดส่งสินค้าในวันถัดไป<br>' +
      'หากมีข้อสงสัย ติดต่อได้ที่ โทร ' + SHOP_TEL + ' หรือ Line ID: ' + SHOP_LINE +
    '</div>' +
    (ATTACH_PDF ? '<div style="margin-top:10px;font-size:12px;color:#666">📎 แนบใบเสร็จรับเงิน (PDF) มาพร้อมอีเมลฉบับนี้</div>' : '')
  );
}

/** ลิงก์ติดตามพัสดุตามขนส่ง */
function _trackUrl(carrier, no) {
  if (!no) return '';
  var m = {
    'Flash Express': 'https://www.flashexpress.com/fle/tracking?se=' + encodeURIComponent(no),
    'Kerry Express': 'https://th.kerryexpress.com/th/track/?track=' + encodeURIComponent(no),
    'EMS':           'https://track.thailandpost.co.th/?trackNumber=' + encodeURIComponent(no)
  };
  return m[carrier] || '';
}

/** อีเมลแจ้งจัดส่งสินค้า */
function _shippedHtml(d) {
  var url = _trackUrl(d.carrier, d.trackingNo);
  return _wrap('🚚 จัดส่งสินค้าแล้ว', '#0ea5e9',
    '<p style="font-size:15px;margin:0 0 16px">สวัสดีคุณ <strong>' + (d.customerName || '') + '</strong><br>' +
    'สินค้าตามคำสั่งซื้อ <strong>' + (d.orderNo || '') + '</strong> ได้จัดส่งเรียบร้อยแล้ว</p>' +

    '<div style="border:2px solid #0ea5e9;border-radius:8px;padding:16px;margin-bottom:16px;background:#f0f9ff">' +
      '<table style="width:100%;font-size:14px;line-height:2">' +
        '<tr><td style="color:#666;width:140px">ช่องทางการจัดส่ง</td><td style="font-weight:bold">' + (d.carrier || '-') + '</td></tr>' +
        '<tr><td style="color:#666">เลขพัสดุ</td><td style="font-weight:bold;font-size:17px;color:#0369a1;letter-spacing:1px">' + (d.trackingNo || '-') + '</td></tr>' +
        '<tr><td style="color:#666">วันที่จัดส่ง</td><td>' + (d.shippedDate || '-') + '</td></tr>' +
      '</table>' +
      (url ? '<div style="margin-top:12px"><a href="' + url + '" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:bold;font-size:14px">ติดตามพัสดุ →</a></div>' : '') +
    '</div>' +

    (d.shipNote ? '<div style="padding:10px 12px;background:#fff8e6;border-left:4px solid #f59e0b;font-size:13px;margin-bottom:16px">' + d.shipNote + '</div>' : '') +

    '<div style="font-size:13px;color:#666;margin-bottom:8px">ที่อยู่จัดส่ง: ' + (d.customerAddress || '-') + '</div>' +

    _table(d) +

    '<div style="margin-top:20px;padding:12px;background:#f0fdf4;border-left:4px solid #10b981;font-size:13px;line-height:1.7">' +
      'หากสินค้ามีปัญหาหรือไม่ได้รับพัสดุ ติดต่อได้ที่ โทร ' + SHOP_TEL + ' หรือ Line ID: ' + SHOP_LINE +
    '</div>'
  );
}

// ==========================================================
//  ใบเสร็จรับเงิน A4 (PDF) — รูปแบบเดียวกับที่พิมพ์จาก POS
// ==========================================================

var RG_LOGO = 'data:image/jpeg;base64,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';

/** แปลงจำนวนเงินเป็นตัวหนังสือไทย */
function _bahtText(amount) {
  var n = Math.round((Number(amount) || 0) * 100);
  var digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  var pos    = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
  if (n === 0) return 'ศูนย์บาทถ้วน';
  var baht = Math.floor(n / 100), satang = n % 100;
  function conv(num) {
    if (num === 0) return '';
    var s = '', str = String(num);
    for (var i = 0; i < str.length; i++) {
      var dg = parseInt(str.charAt(i), 10), p = str.length - i - 1;
      if (dg === 0) continue;
      if (p === 1 && dg === 2) { s += 'ยี่สิบ'; continue; }
      if (p === 1 && dg === 1) { s += 'สิบ'; continue; }
      if (p === 0 && dg === 1 && str.length > 1) { s += 'เอ็ด'; continue; }
      s += digits[dg] + pos[p];
    }
    return s;
  }
  return (baht > 0 ? conv(baht) + 'บาท' : '') + (satang > 0 ? conv(satang) + 'สตางค์' : 'ถ้วน');
}

/** ดึงรูปจาก URL แล้วแปลงเป็น data URI (JS ไม่ทำงานตอนแปลง PDF จึงต้องฝังเป็นรูป) */
function _imgDataUri(url) {
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return '';
    var blob = res.getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    Logger.log('_imgDataUri error: ' + e);
    return '';
  }
}

/** บาร์โค้ด CODE128 ของเลขที่เอกสาร */
function _barcodeUri(text) {
  if (!text) return '';
  return _imgDataUri('https://bwipjs-api.metafloor.com/?bcid=code128&text=' +
    encodeURIComponent(text) + '&scale=3&height=12&includetext=false&backgroundcolor=FFFFFF');
}

/** QR code ลิงก์ร้าน */
function _qrUri(text) {
  return _imgDataUri('https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=' +
    encodeURIComponent(text));
}

/** แถวรายการสินค้าในใบเสร็จ A4 */
function _pdfRows(items) {
  return (items || []).map(function (i, idx) {
    var sub = i.subtotal || (i.price * i.qty);
    var td = 'padding:5px 8px;border-bottom:1px solid #f0f0f0';
    return '<tr>' +
      '<td style="' + td + '">' + (i.code || (idx + 1)) + '</td>' +
      '<td style="' + td + '">' + (i.name || '') + '</td>' +
      '<td style="' + td + ';text-align:center">' + (i.unit || 'ชิ้น') + '</td>' +
      '<td style="' + td + ';text-align:right">' + (i.qty || 1) + '</td>' +
      '<td style="' + td + ';text-align:right">' + _money(i.price) + '</td>' +
      '<td style="' + td + ';text-align:right;font-weight:bold">' + _money(sub) + '</td>' +
    '</tr>';
  }).join('');
}

/** สร้างใบเสร็จ A4 เป็น PDF blob */
function _receiptPdf(d) {
  var vat      = Number(d.vat) || 0;
  var total    = Number(d.total) || 0;
  var subtotal = Number(d.subtotal) || 0;
  var baseAmt  = total - vat;

  var bcUri = _barcodeUri(d.orderNo || '');
  var qrUri = _qrUri('https://' + SHOP_SITE + '/');

  var logoHtml = (RG_LOGO && RG_LOGO.indexOf('data:') === 0)
    ? '<img src="' + RG_LOGO + '" style="max-width:180px;height:40px;object-fit:contain">'
    : '<div style="font-size:22px;font-weight:bold;color:#e8172c;font-style:italic">' + SHOP_NAME + '</div>';

  var html =
'<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ใบเสร็จ ' + (d.orderNo || '') + '</title>' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'@page{size:A4;margin:15mm}' +
'body{font-family:"Sarabun","Noto Sans Thai",Arial,sans-serif;font-size:13px;font-weight:normal;color:#000;background:#fff}\ntd,th,div,span{font-family:inherit}' +
'table{width:100%;border-collapse:collapse}' +
'th{background:#1a3a5c;color:#fff;padding:7px 8px;font-size:12px;font-weight:bold;text-align:left}' +
'th.r{text-align:right}th.c{text-align:center}' +
'</style></head><body>' +

// HEADER
'<div style="width:100%;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #000">' +
  '<table style="width:100%;border:none"><tr>' +
    '<td style="vertical-align:top;border:none;padding:0">' +
      logoHtml +
      '<div style="font-size:11px;color:#444;line-height:1.7;margin-top:6px">' +
        '<div>' + SHOP_ADDR + '</div>' +
        '<div>โทร: ' + SHOP_TEL + (SHOP_TAXID ? ' | เลขผู้เสียภาษี: ' + SHOP_TAXID : '') + '</div>' +
      '</div>' +
    '</td>' +
    '<td style="vertical-align:top;text-align:right;border:none;padding:0">' +
      '<div style="font-size:17px;font-weight:bold;color:#1a3a5c;border:2px solid #1a3a5c;padding:5px 14px;display:inline-block">ใบเสร็จรับเงิน</div>' +
      '<div style="font-size:13px;margin-top:6px">เลขที่: <b>' + (d.orderNo || '-') + '</b></div>' +
      '<div style="font-size:13px">วันที่: <b>' + (d.date || '-') + '</b></div>' +
    '</td>' +
  '</tr></table>' +
'</div>' +

// INFO
'<table style="width:100%;border:none;margin-bottom:16px"><tr>' +
  '<td style="width:50%;vertical-align:top;border:1px solid #e0e0e0;padding:10px 12px">' +
    '<div style="font-size:10px;color:#888;font-weight:bold;margin-bottom:4px;border-bottom:1px solid #f0f0f0;padding-bottom:4px">ข้อมูลลูกค้า</div>' +
    '<div style="font-size:12px;line-height:1.8">' +
      '<div><b>' + (d.customerName || 'ลูกค้าทั่วไป') + '</b></div>' +
      (d.customerAddress ? '<div style="color:#444">' + d.customerAddress + '</div>' : '') +
      (d.customerPhone   ? '<div style="color:#444">โทร: ' + d.customerPhone + '</div>' : '') +
      (d.customerEmail   ? '<div style="color:#444">อีเมล: ' + d.customerEmail + '</div>' : '') +
    '</div>' +
  '</td>' +
  '<td style="width:12px;border:none"></td>' +
  '<td style="width:50%;vertical-align:top;border:1px solid #e0e0e0;padding:10px 12px">' +
    '<div style="font-size:10px;color:#888;font-weight:bold;margin-bottom:4px;border-bottom:1px solid #f0f0f0;padding-bottom:4px">รายละเอียด</div>' +
    '<div style="font-size:12px;line-height:1.8">' +
      '<div>เลขที่: <b>' + (d.orderNo || '-') + '</b></div>' +
      '<div>วันที่: <b>' + (d.date || '-') + '</b></div>' +
      '<div>ชำระด้วย: <b>' + _payLabel(d.payMethod) + '</b></div>' +
    '</div>' +
  '</td>' +
'</tr></table>' +

// TABLE
'<table style="margin-bottom:12px">' +
  '<thead><tr>' +
    '<th style="width:70px">รหัส</th><th>ชื่อสินค้า</th>' +
    '<th class="c" style="width:50px">หน่วย</th>' +
    '<th class="r" style="width:50px">จำนวน</th>' +
    '<th class="r" style="width:80px">ราคา/หน่วย</th>' +
    '<th class="r" style="width:90px">จำนวนเงิน</th>' +
  '</tr></thead>' +
  '<tbody>' + _pdfRows(d.items) + '</tbody>' +
  '<tfoot>' +
    '<tr><td colspan="4" style="border:none"></td>' +
      '<td style="text-align:right;color:#555;border-top:1px solid #e0e0e0;padding:5px 8px">ยอดรวม</td>' +
      '<td style="text-align:right;border-top:1px solid #e0e0e0;padding:5px 8px">' + _money(subtotal) + '</td></tr>' +
    (vat > 0
      ? '<tr><td colspan="4" style="border:none"></td><td style="text-align:right;color:#555;padding:5px 8px">ราคาก่อน VAT</td><td style="text-align:right;padding:5px 8px">' + _money(baseAmt) + '</td></tr>' +
        '<tr><td colspan="4" style="border:none"></td><td style="text-align:right;color:#555;padding:5px 8px">VAT ' + VAT_RATE + '%</td><td style="text-align:right;padding:5px 8px">' + _money(vat) + '</td></tr>'
      : '') +
    '<tr>' +
      '<td colspan="4" style="font-size:11px;color:#555;padding:8px;border-top:2px solid #000"><i>' + _bahtText(total) + '</i></td>' +
      '<td style="text-align:right;font-size:15px;font-weight:bold;padding:8px;border-top:2px solid #000">ยอดสุทธิ</td>' +
      '<td style="text-align:right;font-size:17px;font-weight:bold;color:#1a3a5c;padding:8px;border-top:2px solid #000">' + _money(total) + '</td>' +
    '</tr>' +
  '</tfoot>' +
'</table>' +

(d.note ? '<div style="font-size:12px;color:#555;margin-bottom:10px">หมายเหตุ: ' + d.note + '</div>' : '') +

// ลายเซ็น (ไม่มีตราประทับ)
'<table style="width:100%;border:none;margin-top:44px"><tr>' +
  '<td style="width:38%;text-align:center;border:none"><div style="border-top:1px solid #000;padding-top:4px;font-size:11px;color:#888">ผู้รับเงิน</div></td>' +
  '<td style="width:24%;border:none"></td>' +
  '<td style="width:38%;text-align:center;border:none"><div style="border-top:1px solid #000;padding-top:4px;font-size:11px;color:#888">ผู้รับสินค้า</div></td>' +
'</tr></table>' +

// FOOTER
'<div style="text-align:center;margin-top:20px;border-top:2px dashed #000;padding-top:12px;font-size:13px">' +
  '<span style="font-weight:bold">ขอบคุณที่ใช้บริการ / Thank you for your purchase</span>' +
  '<div style="color:#888;font-size:11px;margin-top:4px">โทร ' + SHOP_TEL + ' | Line ID: ' + SHOP_LINE + ' | ' + SHOP_EMAIL + '</div>' +
'</div>' +

// BARCODE + QR
'<table style="width:100%;border:none;margin-top:18px;border-top:1px dashed #ccc;padding-top:14px"><tr>' +
  '<td style="width:50%;text-align:center;border:none;padding-top:14px">' +
    '<div style="font-size:10px;color:#6b7280;margin-bottom:4px">เลขที่ใบเสร็จ / Receipt No.</div>' +
    (bcUri ? '<img src="' + bcUri + '" style="height:48px">' : '') +
    '<div style="font-size:10px;font-family:monospace;letter-spacing:2px;margin-top:2px">' + (d.orderNo || '') + '</div>' +
  '</td>' +
  '<td style="width:50%;text-align:center;border:none;padding-top:14px">' +
    '<div style="font-size:10px;color:#6b7280;margin-bottom:4px">สั่งซื้อออนไลน์ / Order Online</div>' +
    (qrUri ? '<img src="' + qrUri + '" style="width:80px;height:80px">' : '') +
    '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + SHOP_SITE + '</div>' +
  '</td>' +
'</tr></table>' +

'</body></html>';

  var blob = Utilities.newBlob(html, MimeType.HTML, 'receipt.html')
                      .getAs(MimeType.PDF)
                      .setName('ใบเสร็จ-' + (d.orderNo || 'order') + '.pdf');
  return blob;
}

/** ทดสอบอีเมลแจ้งจัดส่ง — เปลี่ยน customerEmail เป็นอีเมลตัวเองก่อน Run */
function testShipped() {
  doPost({
    postData: {
      contents: JSON.stringify({
        secret: SECRET,
        action: 'shipped',
        orderNo: 'ORD-TEST01',
        date: '2026-07-29',
        shippedDate: '2026-07-29',
        carrier: 'Flash Express',
        trackingNo: 'TH01234567890',
        shipNote: 'จัดส่งวันนี้ ถึงภายใน 2-3 วัน',
        customerName: 'ทดสอบ ระบบ',
        customerPhone: '0812345678',
        customerEmail: SHOP_EMAIL,
        customerAddress: '123 ถนนทดสอบ กรุงเทพฯ 10000',
        payMethod: 'qr',
        items: [{ name: 'สินค้าทดสอบ A', qty: 2, price: 1500, subtotal: 3000 }],
        subtotal: 3000, vat: 210, total: 3210
      })
    }
  });
  Logger.log('ส่งอีเมลแจ้งจัดส่งทดสอบไปที่ ' + SHOP_EMAIL + ' แล้ว');
}

/**
 * ทดสอบระบบ — กด Run ฟังก์ชันนี้ใน Apps Script Editor
 * จะส่ง email ทดสอบไปที่ SHOP_EMAIL
 */
function testEmail() {
  doPost({
    postData: {
      contents: JSON.stringify({
        secret: SECRET,
        orderNo: 'ORD-TEST01',
        date: '2026-07-28',
        customerName: 'ทดสอบ ระบบ',
        customerPhone: '0812345678',
        customerEmail: '',
        customerAddress: '123 ถนนทดสอบ กรุงเทพฯ 10000',
        payMethod: 'qr',
        note: 'นี่คือ email ทดสอบ',
        items: [
          { name: 'สินค้าทดสอบ A', qty: 2, price: 1500, subtotal: 3000 },
          { name: 'สินค้าทดสอบ B', qty: 1, price: 495, subtotal: 495 }
        ],
        subtotal: 3495, vat: 244.65, total: 3739.65
      })
    }
  });
  Logger.log('ส่ง email ทดสอบไปที่ ' + SHOP_EMAIL + ' แล้ว');
}

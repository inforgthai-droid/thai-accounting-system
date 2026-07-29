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
var SHOP_TEL   = '';                        // เบอร์ร้าน (ใส่หรือเว้นว่างก็ได้)
var SECRET     = 'RG2026';                  // ต้องตรงกับ MAIL_SECRET ใน shop.html

// ===== Entry point =====
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return _json({ ok: false, error: 'bad secret' });

    // 1) แจ้งร้าน
    MailApp.sendEmail({
      to: SHOP_EMAIL,
      subject: '🛍️ ออเดอร์ใหม่ ' + (d.orderNo || '') + ' — ' + (d.customerName || ''),
      htmlBody: _shopHtml(d),
      name: SHOP_NAME
    });

    // 2) ยืนยันลูกค้า (ถ้ามี email)
    if (d.customerEmail && d.customerEmail.indexOf('@') > 0) {
      MailApp.sendEmail({
        to: d.customerEmail,
        subject: '✅ ยืนยันคำสั่งซื้อ ' + (d.orderNo || '') + ' — ' + SHOP_NAME,
        htmlBody: _customerHtml(d),
        name: SHOP_NAME
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
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">' + _money(sub) + '</td>' +
      '</tr>';
  }).join('');
}

function _totals(d) {
  return '<tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#666">ยอดสินค้า</td>' +
    '<td style="padding:6px 8px;text-align:right">' + _money(d.subtotal) + '</td></tr>' +
    '<tr><td colspan="3" style="padding:6px 8px;text-align:right;color:#666">VAT</td>' +
    '<td style="padding:6px 8px;text-align:right">' + _money(d.vat) + '</td></tr>' +
    '<tr><td colspan="3" style="padding:10px 8px;text-align:right;font-size:16px;font-weight:700;border-top:2px solid #333">ยอดสุทธิ</td>' +
    '<td style="padding:10px 8px;text-align:right;font-size:18px;font-weight:800;color:#e8172c;border-top:2px solid #333">฿' + _money(d.total) + '</td></tr>';
}

function _wrap(title, badgeColor, inner) {
  return '<div style="font-family:Arial,\'Sarabun\',sans-serif;max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden">' +
    '<div style="background:' + badgeColor + ';color:#fff;padding:18px 24px">' +
      '<div style="font-size:20px;font-weight:800;letter-spacing:1px">' + SHOP_NAME.toUpperCase() + '</div>' +
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
    '<tr><td style="color:#888;width:130px">เลขที่คำสั่งซื้อ</td><td style="font-weight:700">' + (d.orderNo || '-') + '</td></tr>' +
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
      'ทางร้านจะตรวจสอบและติดต่อกลับเพื่อยืนยันการจัดส่งโดยเร็วที่สุด<br>' +
      'หากมีข้อสงสัย ติดต่อได้ที่ ' + SHOP_EMAIL + (SHOP_TEL ? ' หรือโทร ' + SHOP_TEL : '') +
    '</div>'
  );
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

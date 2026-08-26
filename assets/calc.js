/* =========================================================================
 * calc.js — Engine tính tiền CLB cầu lông
 * Không phụ thuộc DOM -> chạy được cả trên trình duyệt lẫn Node (để test).
 * =========================================================================
 *
 * QUY TẮC TÍNH (theo thoả thuận của CLB):
 *  1. Tiền sân mỗi buổi (mặc định 400.000đ) được NGƯỜI CỐ ĐỊNH của tháng gánh,
 *     chia đều cho cả tháng:  courtShare = tổng tiền sân tháng / số người cố định.
 *  2. Người VÃNG LAI trả một mức cố định cho mỗi buổi họ tham gia (vd 50.000đ).
 *     Toàn bộ tiền vãng lai thu được trong tháng trở thành TIỀN DƯ,
 *     chia đều lại cho người cố định:  guestCredit = tổng thu vãng lai / số người cố định.
 *  3. Tiền cầu trong tháng chia đều cho người cố định:
 *     shuttleShare = tổng tiền cầu / số người cố định.
 *     Ai đứng ra mua cầu thì được trừ đúng số tiền đã ứng (shuttleAdvance).
 *  4. Số dư/nợ của tháng trước được cộng dồn sang tháng sau (opening balance).
 *
 *  Net tháng M của 1 người = courtShare + shuttleShare + phíVãngLaiCủaChínhHọ
 *                          - guestCredit - shuttleAdvance + điềuChỉnh
 *  Cần đóng  = openingBalance + Net
 *  Còn lại   = Cần đóng - đã thanh toán   (dương = còn nợ, âm = dư)
 * ========================================================================= */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  /**
   * Đọc số an toàn: chấp nhận cả "1.000.000", "1,000,000", "400.000đ",
   * "(50.000)" (số âm kiểu kế toán) và số thuần.
   */
  const num = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const raw = String(v).trim();
    const neg = /^-/.test(raw) || /^\(.*\)$/.test(raw);
    let s = raw.replace(/[^\d.,]/g, '');
    if (!s) return 0;

    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let dec = -1;
    if (lastDot >= 0 && lastComma >= 0) {
      dec = Math.max(lastDot, lastComma);            // dấu cuối cùng là thập phân
    } else if (lastDot >= 0 || lastComma >= 0) {
      const only = Math.max(lastDot, lastComma);
      const sep = lastDot >= 0 ? '.' : ',';
      const count = s.split(sep).length - 1;
      const tail = s.length - only - 1;
      if (count === 1 && tail !== 3) dec = only;     // "1.5" là thập phân, "1.000" là nghìn
    }

    const intPart = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, '');
    const fracPart = (dec >= 0 ? s.slice(dec + 1) : '').replace(/[.,]/g, '');
    const n = Number((intPart || '0') + (fracPart ? '.' + fracPart : ''));
    return isNaN(n) ? 0 : (neg ? -n : n);
  };

  /** Làm tròn tới bội số gần nhất (mặc định 1.000đ), đối xứng với số âm. */
  function roundTo(n, step) {
    step = step || 1;
    if (step <= 1) return Math.round(n);
    const sign = n < 0 ? -1 : 1;
    return sign * Math.round(Math.abs(n) / step) * step;
  }

  const monthKeyOf = (d) => String(d || '').slice(0, 7);

  function shiftMonth(key, delta) {
    const [y, m] = String(key).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  const prevMonth = (k) => shiftMonth(k, -1);
  const nextMonth = (k) => shiftMonth(k, 1);

  function fmtVND(n) {
    const v = Math.round(num(n));
    const s = Math.abs(v).toLocaleString('vi-VN');
    return (v < 0 ? '-' : '') + s + 'đ';
  }

  function fmtMonthVi(key) {
    const [y, m] = String(key).split('-');
    return 'Tháng ' + Number(m) + '/' + y;
  }

  // ------------------------------------------------------------- normalise
  function emptyDb() {
    return {
      rev: 0,
      settings: {
        clubName: 'CLB Cầu lông',
        courtFeePerSession: 400000,
        guestFeePerSession: 50000,
        roundStep: 1000,
        defaultWeekdays: [2, 5], // Thứ 3 & Thứ 6 (0=CN)
      },
      members: [],
      months: [],
      fixed: [],
      sessions: [],
      guests: [],
      shuttles: [],
      payments: [],
      adjustments: [],
    };
  }

  function normalize(db) {
    const base = emptyDb();
    db = db || {};
    const out = {
      rev: num(db.rev),
      settings: Object.assign({}, base.settings, db.settings || {}),
      members: (db.members || []).map((m) => ({
        id: String(m.id),
        name: String(m.name || '').trim(),
        phone: String(m.phone || ''),
        active: m.active === false || m.active === 'FALSE' || m.active === 'false' ? false : true,
        note: String(m.note || ''),
      })),
      months: (db.months || []).map((m) => ({
        month: String(m.month),
        courtFee: m.courtFee === '' || m.courtFee == null ? null : num(m.courtFee),
        guestFee: m.guestFee === '' || m.guestFee == null ? null : num(m.guestFee),
        status: m.status === 'closed' ? 'closed' : 'open',
        note: String(m.note || ''),
      })),
      fixed: (db.fixed || []).map((f) => ({ month: String(f.month), memberId: String(f.memberId) })),
      sessions: (db.sessions || []).map((s) => ({
        id: String(s.id),
        month: s.month ? String(s.month) : monthKeyOf(s.date),
        date: String(s.date || ''),
        cost: s.cost === '' || s.cost == null ? null : num(s.cost),
        note: String(s.note || ''),
      })),
      guests: (db.guests || []).map((g) => ({
        id: String(g.id),
        month: g.month ? String(g.month) : monthKeyOf(g.date),
        date: String(g.date || ''),
        name: String(g.name || '').trim(),
        memberId: g.memberId ? String(g.memberId) : '',
        amount: num(g.amount),
        paid: g.paid === true || g.paid === 'TRUE' || g.paid === 'true' || g.paid === 1 || g.paid === '1',
        note: String(g.note || ''),
      })),
      shuttles: (db.shuttles || []).map((s) => ({
        id: String(s.id),
        month: s.month ? String(s.month) : monthKeyOf(s.date),
        date: String(s.date || ''),
        buyerId: s.buyerId ? String(s.buyerId) : '',
        tubes: num(s.tubes),
        unitPrice: num(s.unitPrice),
        amount: s.amount === '' || s.amount == null ? num(s.tubes) * num(s.unitPrice) : num(s.amount),
        note: String(s.note || ''),
      })),
      payments: (db.payments || []).map((p) => ({
        id: String(p.id),
        month: String(p.month),
        memberId: String(p.memberId),
        amount: num(p.amount),
        date: String(p.date || ''),
        note: String(p.note || ''),
      })),
      adjustments: (db.adjustments || []).map((a) => ({
        id: String(a.id),
        month: String(a.month),
        memberId: String(a.memberId),
        amount: num(a.amount),
        reason: String(a.reason || ''),
      })),
    };
    return out;
  }

  // ------------------------------------------------------- month discovery
  function allMonths(db) {
    const set = new Set();
    db.months.forEach((m) => set.add(m.month));
    db.fixed.forEach((f) => set.add(f.month));
    db.sessions.forEach((s) => set.add(s.month));
    db.guests.forEach((g) => set.add(g.month));
    db.shuttles.forEach((s) => set.add(s.month));
    db.payments.forEach((p) => set.add(p.month));
    db.adjustments.forEach((a) => set.add(a.month));
    set.delete('');
    set.delete('undefined');
    return Array.from(set).filter(Boolean).sort();
  }

  function monthConfig(db, month) {
    const row = db.months.find((m) => m.month === month) || {};
    return {
      month,
      courtFee: row.courtFee != null ? row.courtFee : num(db.settings.courtFeePerSession),
      guestFee: row.guestFee != null ? row.guestFee : num(db.settings.guestFeePerSession),
      status: row.status || 'open',
      note: row.note || '',
    };
  }

  // ------------------------------------------------------------ core maths
  /**
   * Tính toàn bộ lịch sử theo thứ tự thời gian, trả về map { month: report }.
   * Số dư cuối tháng trước được mang sang làm số dư đầu tháng sau.
   */
  function computeSeries(db) {
    db = normalize(db);
    const months = allMonths(db);
    const memberById = new Map(db.members.map((m) => [m.id, m]));
    const balances = new Map(); // memberId -> số dư luỹ kế (dương = nợ)
    const reports = {};
    const snapshots = {};       // số dư NGAY SAU khi chốt mỗi tháng

    months.forEach((month) => {
      reports[month] = computeMonth(db, month, balances, memberById);
      snapshots[month] = new Map(balances);
    });

    return { db, months, reports, balances, snapshots };
  }

  function computeMonth(db, month, balances, memberById) {
    const cfg = monthConfig(db, month);
    const step = num(db.settings.roundStep) || 1;

    const sessions = db.sessions.filter((s) => s.month === month)
      .sort((a, b) => a.date.localeCompare(b.date));
    const courtTotal = sessions.reduce((t, s) => t + (s.cost != null ? s.cost : cfg.courtFee), 0);

    const fixedIds = Array.from(new Set(db.fixed.filter((f) => f.month === month).map((f) => f.memberId)))
      .filter((id) => memberById.has(id));
    const fixedCount = fixedIds.length;

    const guests = db.guests.filter((g) => g.month === month);
    const guestTotal = guests.reduce((t, g) => t + g.amount, 0);

    const shuttles = db.shuttles.filter((s) => s.month === month);
    const shuttleTotal = shuttles.reduce((t, s) => t + s.amount, 0);

    const payments = db.payments.filter((p) => p.month === month);
    const adjustments = db.adjustments.filter((a) => a.month === month);

    // Đơn giá đầu người (chỉ áp cho người cố định)
    const courtShare   = fixedCount ? roundTo(courtTotal / fixedCount, step) : 0;
    const shuttleShare = fixedCount ? roundTo(shuttleTotal / fixedCount, step) : 0;
    const guestCredit  = fixedCount ? roundTo(guestTotal / fixedCount, step) : 0;

    // Tập hợp mọi người xuất hiện trong tháng này
    const ids = new Set(fixedIds);
    guests.forEach((g) => { if (g.memberId) ids.add(g.memberId); });
    shuttles.forEach((s) => { if (s.buyerId) ids.add(s.buyerId); });
    payments.forEach((p) => ids.add(p.memberId));
    adjustments.forEach((a) => ids.add(a.memberId));
    balances.forEach((v, id) => { if (Math.abs(v) >= 1) ids.add(id); });

    const rows = [];
    ids.forEach((id) => {
      const member = memberById.get(id);
      if (!member) return;
      const isFixed = fixedIds.indexOf(id) !== -1;

      const myGuestFee = guests.filter((g) => g.memberId === id)
        .reduce((t, g) => t + g.amount, 0);
      const myGuestSessions = guests.filter((g) => g.memberId === id).length;
      const myShuttleAdvance = shuttles.filter((s) => s.buyerId === id)
        .reduce((t, s) => t + s.amount, 0);
      const myAdjust = adjustments.filter((a) => a.memberId === id)
        .reduce((t, a) => t + a.amount, 0);
      const myPaid = payments.filter((p) => p.memberId === id)
        .reduce((t, p) => t + p.amount, 0);

      const opening = balances.get(id) || 0;

      const charge = (isFixed ? courtShare + shuttleShare : 0) + myGuestFee;
      const credit = (isFixed ? guestCredit : 0) + myShuttleAdvance;
      const net = charge - credit + myAdjust;
      const due = opening + net;          // tổng phải đóng trong tháng này
      const closing = due - myPaid;       // dương = còn nợ, âm = dư

      balances.set(id, closing);

      rows.push({
        memberId: id,
        name: member.name,
        phone: member.phone,
        isFixed,
        courtShare: isFixed ? courtShare : 0,
        shuttleShare: isFixed ? shuttleShare : 0,
        guestCredit: isFixed ? guestCredit : 0,
        guestFee: myGuestFee,
        guestSessions: myGuestSessions,
        shuttleAdvance: myShuttleAdvance,
        adjust: myAdjust,
        net,
        opening,
        due,
        paid: myPaid,
        closing,
        status: Math.abs(closing) < 1 ? 'done' : (closing > 0 ? 'owing' : 'credit'),
      });
    });

    rows.sort((a, b) => {
      if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
      return a.name.localeCompare(b.name, 'vi');
    });

    const collected = rows.reduce((t, r) => t + r.paid, 0);
    const expected = rows.reduce((t, r) => t + r.due, 0);

    return {
      month, cfg,
      sessions, sessionCount: sessions.length, courtTotal,
      fixedIds, fixedCount,
      guests, guestTotal, guestCount: guests.length,
      shuttles, shuttleTotal,
      courtShare, shuttleShare, guestCredit,
      rows, collected, expected,
      outstanding: expected - collected,
      // chênh lệch do làm tròn
      roundingDiff: (courtShare * fixedCount - courtTotal)
                  + (shuttleShare * fixedCount - shuttleTotal)
                  - (guestCredit * fixedCount - guestTotal),
    };
  }

  /**
   * Báo cáo của 1 tháng. Nếu tháng chưa có dữ liệu gì, vẫn kế thừa công nợ
   * luỹ kế tính đến tháng gần nhất TRƯỚC nó (kể cả khi tháng trống nằm xen
   * giữa hai tháng có dữ liệu, ví dụ CLB nghỉ vài tháng).
   */
  function report(db, month) {
    const s = computeSeries(db);
    if (s.reports[month]) return s.reports[month];
    const memberById = new Map(s.db.members.map((m) => [m.id, m]));
    const before = s.months.filter((m) => m < month).pop();
    const inherit = before ? s.snapshots[before] : new Map();
    return computeMonth(s.db, month, new Map(inherit), memberById);
  }

  // -------------------------------------------------- tiện ích tạo buổi
  /** Sinh danh sách ngày trong tháng theo các thứ trong tuần (0=CN..6=T7). */
  function generateDates(month, weekdays) {
    const [y, m] = String(month).split('-').map(Number);
    const out = [];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= last; d++) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (weekdays.indexOf(dt.getUTCDay()) !== -1) {
        out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
    return out;
  }

  /** Soạn tin nhắn tổng kết để gửi nhóm (Zalo/Messenger). */
  function buildMessage(rep, opts) {
    opts = opts || {};
    const L = [];
    L.push(`💰 TIỀN CẦU LÔNG ${fmtMonthVi(rep.month).toUpperCase()}`);
    L.push('────────────────────');
    L.push(`Số buổi: ${rep.sessionCount} · Tiền sân: ${fmtVND(rep.courtTotal)}`);
    L.push(`Người cố định: ${rep.fixedCount} · Mỗi người: ${fmtVND(rep.courtShare)}`);
    if (rep.shuttleTotal) L.push(`Tiền cầu: ${fmtVND(rep.shuttleTotal)} → ${fmtVND(rep.shuttleShare)}/người`);
    if (rep.guestTotal) L.push(`Thu vãng lai: ${fmtVND(rep.guestTotal)} → hoàn ${fmtVND(rep.guestCredit)}/người`);
    L.push('────────────────────');
    rep.rows.forEach((r) => {
      if (Math.abs(r.due) < 1 && Math.abs(r.paid) < 1) return;
      const tag = r.status === 'done' ? '✅ đã đóng đủ'
        : r.status === 'credit' ? `💚 dư ${fmtVND(-r.closing)}`
        : (r.paid > 0 ? `⏳ còn thiếu ${fmtVND(r.closing)}` : '⏳ chưa đóng');
      const bits = [];
      if (r.opening) bits.push(`${r.opening > 0 ? 'nợ cũ' : 'dư cũ'} ${fmtVND(Math.abs(r.opening))}`);
      if (r.shuttleAdvance) bits.push(`trừ cầu đã mua ${fmtVND(r.shuttleAdvance)}`);
      if (r.guestFee) bits.push(`vãng lai ${r.guestSessions} buổi`);
      if (r.adjust) bits.push(`điều chỉnh ${fmtVND(r.adjust)}`);
      L.push(`• ${r.name}: ${fmtVND(r.due)}${bits.length ? ' (' + bits.join(', ') + ')' : ''} — ${tag}`);
    });
    L.push('────────────────────');
    L.push(`Tổng cần thu (gồm nợ/dư cũ): ${fmtVND(rep.expected)}`);
    L.push(`Đã thu: ${fmtVND(rep.collected)} · Còn lại: ${fmtVND(rep.outstanding)}`);
    if (Math.abs(rep.roundingDiff) >= 1) {
      L.push(rep.roundingDiff > 0
        ? `(Quỹ dôi ${fmtVND(rep.roundingDiff)} do làm tròn)`
        : `(Quỹ hụt ${fmtVND(-rep.roundingDiff)} do làm tròn)`);
    }
    if (opts.footer) L.push(opts.footer);
    return L.join('\n');
  }

  return {
    emptyDb, normalize, allMonths, monthConfig,
    computeSeries, computeMonth, report,
    generateDates, buildMessage,
    fmtVND, fmtMonthVi, monthKeyOf, prevMonth, nextMonth, shiftMonth, roundTo, num,
  };
});

/* =========================================================================
 * calc.js — Engine tính tiền CLB cầu lông
 * Không phụ thuộc DOM -> chạy được cả trên trình duyệt lẫn Node (để test).
 * =========================================================================
 *
 * KHÁI NIỆM "NHÓM BUỔI" (group)
 *   Mỗi buổi đánh thuộc về một nhóm, mặc định là thứ trong tuần: "T3", "T5"…
 *   Thành viên đăng ký cố định THEO TỪNG NHÓM: có người chỉ đăng ký T3,
 *   có người chỉ T5, có người cả hai.
 *
 * QUY TẮC TÍNH
 *  1. Tiền sân tính RIÊNG cho từng nhóm:
 *       courtShare(nhóm) = tổng tiền sân của nhóm ÷ số người cố định của nhóm
 *     Ai đăng ký cả 2 nhóm thì cộng cả hai phần lại.
 *  2. Người VÃNG LAI trả một mức cố định cho mỗi buổi tham gia.
 *     Tiền vãng lai của một buổi hoàn lại cho người cố định CỦA NHÓM buổi đó:
 *       guestCredit(nhóm) = tổng thu vãng lai của nhóm ÷ số người cố định nhóm đó
 *  3. Tiền cầu chia theo SỐ BUỔI ĐĂNG KÝ trong tháng (đánh nhiều thì gánh nhiều):
 *       shuttleShare(người) = tổng tiền cầu × số buổi người đó đăng ký
 *                             ÷ tổng số buổi đăng ký của cả CLB
 *     Ai đứng ra mua cầu thì được trừ đúng số tiền đã ứng.
 *  4. Số dư/nợ của tháng trước cộng dồn sang tháng sau (opening balance).
 *
 *  Net tháng M của 1 người = Σ courtShare(nhóm) + shuttleShare + phíVãngLaiCủaHọ
 *                          − Σ guestCredit(nhóm) − tiềnCầuĐãỨng + điềuChỉnh
 *  Cần đóng  = openingBalance + Net
 *  Còn lại   = Cần đóng − đã thanh toán   (dương = còn nợ, âm = dư)
 * ========================================================================= */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Nhãn thứ trong tuần, 0 = Chủ nhật */
  const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  /** Giá trị group đặc biệt: đăng ký TẤT CẢ các nhóm của tháng. */
  const ALL = '*';

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

  /** Thứ trong tuần của một ngày ISO (0 = CN), null nếu ngày không hợp lệ. */
  function weekdayOf(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  }

  /** Nhóm mặc định của một buổi = nhãn thứ trong tuần ("T3", "T5", "CN"…). */
  function defaultGroup(iso) {
    const d = weekdayOf(iso);
    return d == null ? 'Khác' : DOW[d];
  }

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

  /** Sắp xếp nhóm theo thứ tự thứ trong tuần, nhóm lạ xếp cuối. */
  function sortGroups(names) {
    const order = { T2: 1, T3: 2, T4: 3, T5: 4, T6: 5, T7: 6, CN: 7 };
    return names.slice().sort((a, b) => {
      const oa = order[a] || 99, ob = order[b] || 99;
      if (oa !== ob) return oa - ob;
      return String(a).localeCompare(String(b), 'vi');
    });
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
        defaultWeekdays: [2, 4], // Thứ 3 & Thứ 5 (0 = CN)
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
    return {
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
      // group rỗng = đăng ký tất cả các nhóm của tháng (tương thích dữ liệu cũ)
      fixed: (db.fixed || []).map((f) => ({
        month: String(f.month),
        memberId: String(f.memberId),
        group: String(f.group || ALL),
      })),
      sessions: (db.sessions || []).map((s) => ({
        id: String(s.id),
        month: s.month ? String(s.month) : monthKeyOf(s.date),
        date: String(s.date || ''),
        group: String(s.group || defaultGroup(s.date)),
        cost: s.cost === '' || s.cost == null ? null : num(s.cost),
        note: String(s.note || ''),
      })),
      guests: (db.guests || []).map((g) => ({
        id: String(g.id),
        month: g.month ? String(g.month) : monthKeyOf(g.date),
        sessionId: String(g.sessionId || ''),   // buổi cụ thể, để quy đúng nhóm
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
  }

  // ------------------------------------------------------- month discovery
  function allMonths(db) {
    const set = new Set();
    ['months', 'fixed', 'sessions', 'guests', 'shuttles', 'payments', 'adjustments']
      .forEach((k) => (db[k] || []).forEach((r) => set.add(r.month)));
    return Array.from(set).filter((m) => m && m !== 'undefined').sort();
  }

  function monthConfig(db, month) {
    const row = (db.months || []).find((m) => m.month === month) || {};
    return {
      month,
      courtFee: row.courtFee != null ? row.courtFee : num(db.settings.courtFeePerSession),
      guestFee: row.guestFee != null ? row.guestFee : num(db.settings.guestFeePerSession),
      status: row.status || 'open',
      note: row.note || '',
    };
  }

  /**
   * Danh sách nhóm buổi của một tháng — CHỈ lấy từ các buổi đánh thực có.
   * Đăng ký vào nhóm không còn buổi nào sẽ bị bỏ qua (xem `registrations`),
   * nhờ vậy xoá hết buổi T5 thì đăng ký T5 cũ không còn treo lại.
   */
  function monthGroups(db, month) {
    const set = new Set();
    db.sessions.filter((s) => s.month === month).forEach((s) => set.add(s.group));
    return sortGroups(Array.from(set).filter(Boolean));
  }

  /**
   * Bản đồ đăng ký của tháng: memberId -> Set(tên nhóm).
   * Bản ghi có group = '*' được hiểu là đăng ký mọi nhóm của tháng.
   */
  function registrations(db, month, groupNames, memberById) {
    const regs = new Map();
    db.fixed.filter((f) => f.month === month).forEach((f) => {
      if (memberById && !memberById.has(f.memberId)) return;
      const targets = (!f.group || f.group === ALL) ? groupNames : [f.group];
      targets.forEach((g) => {
        if (groupNames.indexOf(g) === -1) return;   // nhóm không còn buổi nào
        if (!regs.has(f.memberId)) regs.set(f.memberId, new Set());
        regs.get(f.memberId).add(g);
      });
    });
    Array.from(regs.keys()).forEach((id) => { if (!regs.get(id).size) regs.delete(id); });
    return regs;
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
    const guests = db.guests.filter((g) => g.month === month);
    const shuttles = db.shuttles.filter((s) => s.month === month);
    const payments = db.payments.filter((p) => p.month === month);
    const adjustments = db.adjustments.filter((a) => a.month === month);

    const costOf = (s) => (s.cost != null ? s.cost : cfg.courtFee);
    const courtTotal = sessions.reduce((t, s) => t + costOf(s), 0);
    const guestTotal = guests.reduce((t, g) => t + g.amount, 0);
    const shuttleTotal = shuttles.reduce((t, s) => t + s.amount, 0);

    // ---------------------------------------------------- nhóm & đăng ký
    const groupNames = monthGroups(db, month);
    const regs = registrations(db, month, groupNames, memberById);

    // Quy mỗi lượt vãng lai về đúng nhóm: ưu tiên buổi đã chọn (sessionId),
    // không có thì suy ra từ ngày. Ngày có nhiều nhóm mà không ghi sessionId
    // thì không đoán bừa — đưa vào danh sách cần kiểm tra lại.
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const groupsOfDate = new Map();
    sessions.forEach((s) => {
      if (!groupsOfDate.has(s.date)) groupsOfDate.set(s.date, new Set());
      groupsOfDate.get(s.date).add(s.group);
    });
    const ambiguousGuests = [];
    const guestGroup = (g) => {
      const s = g.sessionId ? sessionById.get(g.sessionId) : null;
      if (s) return s.group;
      const set = groupsOfDate.get(g.date);
      if (!set || !set.size) return null;
      if (set.size > 1) { ambiguousGuests.push(g); return null; }
      return set.values().next().value;
    };
    const groupOfGuest = new Map(guests.map((g) => [g.id, guestGroup(g)]));

    const groups = groupNames.map((name) => {
      const gSessions = sessions.filter((s) => s.group === name);
      const gGuests = guests.filter((g) => groupOfGuest.get(g.id) === name);
      const gCourt = gSessions.reduce((t, s) => t + costOf(s), 0);
      const gGuestTotal = gGuests.reduce((t, g) => t + g.amount, 0);
      const memberIds = [];
      regs.forEach((set, id) => { if (set.has(name)) memberIds.push(id); });
      const n = memberIds.length;
      return {
        name,
        sessions: gSessions,
        sessionCount: gSessions.length,
        courtTotal: gCourt,
        guests: gGuests,
        guestTotal: gGuestTotal,
        memberIds,
        memberCount: n,
        courtShare: n ? roundTo(gCourt / n, step) : 0,
        guestCredit: n ? roundTo(gGuestTotal / n, step) : 0,
      };
    });
    const groupByName = new Map(groups.map((g) => [g.name, g]));

    // Lượt vãng lai không quy được về nhóm nào (ngày không có buổi đánh)
    const orphanGuests = guests.filter((g) => groupOfGuest.get(g.id) == null
      && ambiguousGuests.indexOf(g) === -1);

    // ------------------------------------------- tiền cầu theo số buổi đăng ký
    const weightOf = (id) => {
      const set = regs.get(id);
      if (!set) return 0;
      let w = 0;
      set.forEach((name) => { w += (groupByName.get(name) || { sessionCount: 0 }).sessionCount; });
      return w;
    };
    let totalWeight = 0;
    regs.forEach((set, id) => { totalWeight += weightOf(id); });

    // ------------------------------------------------------------- các dòng
    const ids = new Set(regs.keys());
    guests.forEach((g) => { if (g.memberId) ids.add(g.memberId); });
    shuttles.forEach((s) => { if (s.buyerId) ids.add(s.buyerId); });
    payments.forEach((p) => ids.add(p.memberId));
    adjustments.forEach((a) => ids.add(a.memberId));
    balances.forEach((v, id) => { if (Math.abs(v) >= 1) ids.add(id); });

    const rows = [];
    ids.forEach((id) => {
      const member = memberById.get(id);
      if (!member) return;

      const set = regs.get(id);
      const myGroups = set ? sortGroups(Array.from(set)) : [];
      const isFixed = myGroups.length > 0;

      let courtShare = 0, guestCredit = 0, mySessions = 0;
      myGroups.forEach((name) => {
        const g = groupByName.get(name);
        courtShare += g.courtShare;
        guestCredit += g.guestCredit;
        mySessions += g.sessionCount;
      });

      const shuttleShare = (isFixed && totalWeight)
        ? roundTo(shuttleTotal * weightOf(id) / totalWeight, step) : 0;

      const myGuests = guests.filter((g) => g.memberId === id);
      const myGuestFee = myGuests.reduce((t, g) => t + g.amount, 0);
      const myShuttleAdvance = shuttles.filter((s) => s.buyerId === id)
        .reduce((t, s) => t + s.amount, 0);
      const myAdjust = adjustments.filter((a) => a.memberId === id)
        .reduce((t, a) => t + a.amount, 0);
      const myPaid = payments.filter((p) => p.memberId === id)
        .reduce((t, p) => t + p.amount, 0);

      const opening = balances.get(id) || 0;
      const net = courtShare + shuttleShare + myGuestFee
                - guestCredit - myShuttleAdvance + myAdjust;
      const due = opening + net;      // tổng phải đóng trong tháng này
      const closing = due - myPaid;   // dương = còn nợ, âm = dư

      balances.set(id, closing);

      rows.push({
        memberId: id,
        name: member.name,
        phone: member.phone,
        isFixed,
        groups: myGroups,
        registeredSessions: mySessions,
        courtShare, shuttleShare, guestCredit,
        guestFee: myGuestFee,
        guestSessions: myGuests.length,
        shuttleAdvance: myShuttleAdvance,
        adjust: myAdjust,
        net, opening, due,
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
    const sum = (k) => rows.reduce((t, r) => t + r[k], 0);

    return {
      month, cfg,
      sessions, sessionCount: sessions.length, courtTotal,
      groups, groupNames,
      fixedIds: Array.from(regs.keys()),
      fixedCount: regs.size,
      totalRegisteredSessions: totalWeight,
      guests, guestTotal, guestCount: guests.length, orphanGuests, ambiguousGuests,
      shuttles, shuttleTotal,
      rows, collected, expected,
      outstanding: expected - collected,
      // chênh lệch do làm tròn: thu của thành viên so với chi phí thực tế
      roundingDiff: (sum('courtShare') - courtTotal)
                  + (sum('shuttleShare') - shuttleTotal)
                  - (sum('guestCredit') - guestTotal),
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
    rep.groups.forEach((g) => {
      L.push(`${g.name}: ${g.sessionCount} buổi × ${fmtVND(g.sessionCount ? g.courtTotal / g.sessionCount : 0)}` +
             ` = ${fmtVND(g.courtTotal)}`);
      L.push(`   ${g.memberCount} người cố định → ${fmtVND(g.courtShare)}/người` +
             (g.guestTotal ? ` (đã trừ ${fmtVND(g.guestCredit)} tiền vãng lai)` : ''));
    });
    if (rep.shuttleTotal) {
      L.push(`Tiền cầu: ${fmtVND(rep.shuttleTotal)} — chia theo số buổi đăng ký`);
    }
    L.push('────────────────────');
    rep.rows.forEach((r) => {
      if (Math.abs(r.due) < 1 && Math.abs(r.paid) < 1) return;
      const tag = r.status === 'done' ? '✅ đã đóng đủ'
        : r.status === 'credit' ? `💚 dư ${fmtVND(-r.closing)}`
        : (r.paid > 0 ? `⏳ còn thiếu ${fmtVND(r.closing)}` : '⏳ chưa đóng');
      const bits = [];
      if (r.groups.length) bits.push(r.groups.join('+'));
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
    ALL, DOW,
    emptyDb, normalize, allMonths, monthConfig, monthGroups, registrations,
    computeSeries, computeMonth, report,
    generateDates, buildMessage, sortGroups, defaultGroup, weekdayOf,
    fmtVND, fmtMonthVi, monthKeyOf, prevMonth, nextMonth, shiftMonth, roundTo, num,
  };
});

/* =========================================================================
 * app.js — Giao diện & điều khiển
 * ========================================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const vnd = Calc.fmtVND;
  const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function dayLabel(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y) return iso;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return `${DOW[dt.getUTCDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------- state */
  const S = {
    db: Calc.emptyDb(),
    month: todayKey(),
    page: 'overview',
    dirty: false,
    saving: false,
    version: 0,     // tăng mỗi lần dữ liệu đổi
    synced: false,  // đã thực sự đọc/ghi được với Google Sheet chưa
    failures: 0,    // số lần lưu hỏng liên tiếp (để giãn nhịp thử lại)
  };

  const memberName = (id) => {
    const m = S.db.members.find((x) => x.id === id);
    return m ? m.name : '(đã xoá)';
  };
  const rep = () => Calc.report(S.db, S.month);
  const monthCfg = () => Calc.monthConfig(S.db, S.month);

  /* ------------------------------------------------------------- toast */
  let toastTimer;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 2600);
  }

  /* -------------------------------------------------------------- modal */
  function modal(title, bodyHtml, onOk, okLabel) {
    const dlg = $('#modal');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalOk').textContent = okLabel || 'Lưu';
    $$('.check', $('#modalBody')).forEach(wireCheck);
    dlg.returnValue = '';
    dlg.showModal();
    const first = $('#modalBody input:not([type=checkbox]), #modalBody select');
    if (first) setTimeout(() => first.focus(), 30);
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      const data = {};
      $$('#modalBody [name]').forEach((el) => {
        data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      try { onOk(data); } catch (e) { toast(e.message, true); }
    };
  }
  function wireCheck(el) {
    const cb = $('input[type=checkbox]', el);
    if (!cb) return;
    const sync = () => el.classList.toggle('on', cb.checked);
    cb.addEventListener('change', sync); sync();
  }

  function fld(name, label, type, value, extra) {
    return `<label class="field"><span>${esc(label)}</span>
      <input name="${name}" type="${type || 'text'}" value="${esc(value == null ? '' : value)}" ${extra || ''}></label>`;
  }
  function sel(name, label, options, value) {
    return `<label class="field"><span>${esc(label)}</span><select name="${name}">` +
      options.map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(value) ? ' selected' : ''}>${esc(o.t)}</option>`).join('') +
      `</select></label>`;
  }
  const memberOptions = (blankLabel) =>
    (blankLabel ? [{ v: '', t: blankLabel }] : []).concat(
      S.db.members.filter((m) => m.active).map((m) => ({ v: m.id, t: m.name })));

  /* --------------------------------------------------------- mutations */
  function mutate(fn) {
    fn(S.db);
    S.dirty = true;
    S.version++;          // đánh dấu có thay đổi mới (để không "nuốt" khi đang lưu)
    render();
    if (Api.config.autoSave) scheduleSave();
    else updateSyncBadge();
  }

  let saveTimer;
  function scheduleSave() {
    updateSyncBadge();
    clearTimeout(saveTimer);
    // Lưu hỏng liên tiếp (mất mạng) thì giãn dần nhịp thử lại, tối đa ~30 giây.
    const delay = Math.min(1200 * Math.pow(2, Math.max(0, S.failures - 1)), 30000);
    saveTimer = setTimeout(doSave, delay);
  }

  async function doSave() {
    // Đang lưu dở: hẹn lưu lại ngay sau đó, tuyệt đối không bỏ qua thay đổi mới.
    if (S.saving) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 500);
      return;
    }
    clearTimeout(saveTimer);
    S.saving = true;
    updateSyncBadge();

    const attempt = S.version; // ảnh chụp phiên bản đang gửi đi
    try {
      const r = await Api.save(S.db);
      S.dirty = S.version !== attempt;   // có sửa thêm trong lúc lưu -> vẫn còn bẩn
      S.failures = 0;
      if (r.remote) {
        S.synced = true;
        if (!S.dirty) toast('Đã lưu lên Google Sheet');
      }
    } catch (e) {
      S.failures++;
      // Chỉ báo lỗi 2 lần đầu để không spam thông báo khi mất mạng lâu.
      if (S.failures <= 2) toast('Lưu thất bại: ' + e.message, true);
      else if (S.failures === 3) toast('Vẫn chưa lưu được — sẽ tự thử lại. Dữ liệu đang giữ trên máy.', true);
    } finally {
      S.saving = false;
      updateSyncBadge();
      if (S.dirty && Api.config.autoSave) scheduleSave();
    }
  }

  function updateSyncBadge() {
    const b = $('#syncBadge');
    const remote = Api.config.mode === 'sheets';
    if (S.saving) { b.className = 'badge badge-accent'; b.textContent = 'Đang lưu…'; return; }
    if (S.dirty) { b.className = 'badge badge-warn'; b.textContent = 'Chưa lưu'; return; }
    if (remote && !S.synced) {
      b.className = 'badge badge-warn';
      b.textContent = 'Chưa đồng bộ';
      b.title = 'Dữ liệu mới chỉ có trên máy này. Vào Cài đặt → Đẩy dữ liệu lên Sheet.';
      return;
    }
    b.className = 'badge badge-ok';
    b.title = 'Trạng thái lưu';
    b.textContent = remote ? 'Đã đồng bộ' : 'Lưu trên máy';
  }

  /* =====================================================================
   *  PAGE: TỔNG QUAN
   * ===================================================================*/
  function pageOverview() {
    const r = rep();
    const cfg = r.cfg;
    const prev = Calc.prevMonth(S.month);
    const pr = Calc.report(S.db, prev);

    const unpaid = r.rows.filter((x) => x.status === 'owing');
    const cash = r.guests.filter((g) => !g.memberId);
    const cashTotal = cash.reduce((t, g) => t + g.amount, 0);

    return `
    <section class="card">
      <div class="card-head">
        <div><h2>${Calc.fmtMonthVi(S.month)}</h2>
        <p class="sub">Giá sân ${vnd(cfg.courtFee)}/buổi · Vãng lai ${vnd(cfg.guestFee)}/buổi</p></div>
        <button class="btn btn-sm" data-act="month-cfg">Sửa giá tháng</button>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Số buổi</div><div class="v">${r.sessionCount}</div></div>
        <div class="stat"><div class="k">Tổng tiền sân</div><div class="v small">${vnd(r.courtTotal)}</div></div>
        <div class="stat"><div class="k">Người cố định</div><div class="v">${r.fixedCount}</div></div>
        <div class="stat hl"><div class="k">Tiền sân / người</div><div class="v small">${vnd(r.courtShare)}</div></div>
        <div class="stat"><div class="k">Tiền cầu</div><div class="v small">${vnd(r.shuttleTotal)}${r.shuttleTotal ? ` <span class="muted small">(${vnd(r.shuttleShare)}/ng)</span>` : ''}</div></div>
        <div class="stat"><div class="k">Thu vãng lai</div><div class="v small">${vnd(r.guestTotal)}${r.guestTotal ? ` <span class="muted small">(hoàn ${vnd(r.guestCredit)}/ng)</span>` : ''}</div></div>
      </div>
    </section>

    <section class="card">
      <h2>Tình hình thu tiền</h2>
      <p class="sub">Đã gồm số dư / công nợ mang sang từ ${Calc.fmtMonthVi(prev)}.</p>
      <div class="stats">
        <div class="stat"><div class="k">Cần thu</div><div class="v small">${vnd(r.expected)}</div></div>
        <div class="stat"><div class="k">Đã thu</div><div class="v small neg">${vnd(r.collected)}</div></div>
        <div class="stat"><div class="k">Còn phải thu</div><div class="v small ${r.outstanding > 0 ? 'pos' : ''}">${vnd(r.outstanding)}</div></div>
        <div class="stat"><div class="k">Người chưa đóng đủ</div><div class="v">${unpaid.length}</div></div>
      </div>
      ${Math.abs(r.roundingDiff) >= 1 ? `<div class="note" style="margin-top:14px">${r.roundingDiff > 0
        ? `Quỹ dôi ra ${vnd(r.roundingDiff)} do làm tròn.`
        : `Quỹ hụt ${vnd(-r.roundingDiff)} do làm tròn — cân nhắc bù vào tháng sau.`}</div>` : ''}
      ${cashTotal ? `<div class="note info" style="margin-top:14px">Trong đó ${vnd(cashTotal)} là tiền mặt thu từ ${cash.length} lượt khách ngoài CLB (không có công nợ riêng).</div>` : ''}
    </section>

    ${pr.sessionCount || pr.shuttleTotal || pr.guestTotal ? `
    <section class="card">
      <h2>Kết chuyển từ ${Calc.fmtMonthVi(prev)}</h2>
      <p class="sub">Những khoản này đã được cộng/trừ tự động vào bảng thu tiền tháng này.</p>
      <div class="stats">
        <div class="stat"><div class="k">Tiền cầu tháng trước</div><div class="v small">${vnd(pr.shuttleTotal)}</div></div>
        <div class="stat"><div class="k">Thu vãng lai tháng trước</div><div class="v small">${vnd(pr.guestTotal)}</div></div>
        <div class="stat"><div class="k">Công nợ còn treo</div><div class="v small ${pr.outstanding > 0 ? 'pos' : 'neg'}">${vnd(pr.outstanding)}</div></div>
      </div>
    </section>` : ''}

    ${r.fixedCount === 0 ? `<div class="note">Chưa có ai đăng ký cố định cho ${Calc.fmtMonthVi(S.month)}.
      Vào tab <b>Đăng ký tháng</b> để tick danh sách.</div>` : ''}
    ${r.sessionCount === 0 ? `<div class="note">Chưa có buổi đánh nào. Vào tab <b>Buổi đánh</b> → <b>Tạo nhanh cả tháng</b>.</div>` : ''}
    `;
  }

  /* =====================================================================
   *  PAGE: BẢNG THU TIỀN
   * ===================================================================*/
  function pageCollect() {
    const r = rep();
    if (!r.rows.length) {
      return `<section class="card"><h2>Bảng thu tiền</h2>
        <div class="empty">Chưa có dữ liệu. Hãy thêm thành viên và đăng ký cố định cho tháng này.</div></section>`;
    }

    const row = (x) => {
      const badge = x.status === 'done' ? '<span class="badge badge-ok">Đã đóng đủ</span>'
        : x.status === 'credit' ? `<span class="badge badge-accent">Dư ${vnd(-x.closing)}</span>`
        : (x.paid > 0 ? `<span class="badge badge-warn">Thiếu ${vnd(x.closing)}</span>`
          : '<span class="badge badge-danger">Chưa đóng</span>');
      return `<tr>
        <td><b>${esc(x.name)}</b>${x.isFixed ? '' : ' <span class="badge badge-muted">vãng lai</span>'}</td>
        <td class="num ${x.opening > 0 ? 'pos' : x.opening < 0 ? 'neg' : 'muted'}">${x.opening ? vnd(x.opening) : '–'}</td>
        <td class="num">${x.courtShare ? vnd(x.courtShare) : '–'}</td>
        <td class="num">${x.shuttleShare ? vnd(x.shuttleShare) : '–'}</td>
        <td class="num neg">${x.guestCredit ? '-' + vnd(x.guestCredit) : '–'}</td>
        <td class="num neg">${x.shuttleAdvance ? '-' + vnd(x.shuttleAdvance) : '–'}</td>
        <td class="num">${x.guestFee ? vnd(x.guestFee) + ` <span class="muted small">(${x.guestSessions}b)</span>` : '–'}</td>
        <td class="num"><b>${vnd(x.due)}</b></td>
        <td class="num">${x.paid ? vnd(x.paid) : '–'}</td>
        <td>${badge}</td>
        <td class="row-actions">
          <button class="btn btn-sm" data-act="pay" data-id="${esc(x.memberId)}" data-amt="${x.closing}">Thu</button>
          <button class="btn btn-sm btn-ghost" data-act="adjust" data-id="${esc(x.memberId)}" title="Điều chỉnh tay">±</button>
        </td></tr>`;
    };

    const sum = (k) => r.rows.reduce((t, x) => t + x[k], 0);

    return `
    <section class="card">
      <div class="card-head">
        <div><h2>Bảng thu tiền ${Calc.fmtMonthVi(S.month)}</h2>
          <p class="sub">Cần đóng = nợ/dư cũ + tiền sân + tiền cầu − hoàn vãng lai − cầu đã ứng mua.</p></div>
        <div class="toolbar">
          <button class="btn btn-sm" data-act="copy-msg">Sao chép tin nhắn</button>
          <button class="btn btn-sm" data-act="export-csv">Xuất CSV</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Thành viên</th><th class="num">Nợ/dư cũ</th><th class="num">Tiền sân</th>
          <th class="num">Tiền cầu</th><th class="num">Hoàn vãng lai</th><th class="num">Cầu đã mua</th>
          <th class="num">Phí vãng lai</th><th class="num">Cần đóng</th><th class="num">Đã đóng</th>
          <th>Trạng thái</th><th></th>
        </tr></thead>
        <tbody>${r.rows.map(row).join('')}</tbody>
        <tfoot><tr>
          <td>Tổng</td>
          <td class="num">${vnd(sum('opening'))}</td>
          <td class="num">${vnd(sum('courtShare'))}</td>
          <td class="num">${vnd(sum('shuttleShare'))}</td>
          <td class="num">-${vnd(sum('guestCredit'))}</td>
          <td class="num">-${vnd(sum('shuttleAdvance'))}</td>
          <td class="num">${vnd(sum('guestFee'))}</td>
          <td class="num">${vnd(r.expected)}</td>
          <td class="num">${vnd(r.collected)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table></div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Lịch sử thu tiền</h2>
        <p class="sub">Các lần đóng tiền đã ghi nhận trong tháng.</p></div>
        <button class="btn btn-sm" data-act="pay">+ Ghi nhận đóng tiền</button></div>
      ${paymentTable()}
    </section>

    ${adjustTable()}
    `;
  }

  function paymentTable() {
    const rows = S.db.payments.filter((p) => p.month === S.month)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!rows.length) return '<div class="empty">Chưa ghi nhận khoản thu nào.</div>';
    return `<div class="table-wrap"><table>
      <thead><tr><th>Ngày</th><th>Người đóng</th><th class="num">Số tiền</th><th>Ghi chú</th><th></th></tr></thead>
      <tbody>${rows.map((p) => `<tr>
        <td>${esc(p.date || '–')}</td><td>${esc(memberName(p.memberId))}</td>
        <td class="num">${vnd(p.amount)}</td><td class="muted">${esc(p.note)}</td>
        <td class="row-actions"><button class="btn btn-sm btn-danger" data-act="del-payment" data-id="${esc(p.id)}">Xoá</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function adjustTable() {
    const rows = S.db.adjustments.filter((a) => a.month === S.month);
    if (!rows.length) return '';
    return `<section class="card"><h2>Điều chỉnh thủ công</h2>
      <p class="sub">Số dương = cộng thêm vào tiền phải đóng, số âm = giảm trừ.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Thành viên</th><th class="num">Số tiền</th><th>Lý do</th><th></th></tr></thead>
        <tbody>${rows.map((a) => `<tr>
          <td>${esc(memberName(a.memberId))}</td>
          <td class="num ${a.amount > 0 ? 'pos' : 'neg'}">${vnd(a.amount)}</td>
          <td class="muted">${esc(a.reason)}</td>
          <td class="row-actions"><button class="btn btn-sm btn-danger" data-act="del-adjust" data-id="${esc(a.id)}">Xoá</button></td>
        </tr>`).join('')}</tbody></table></div></section>`;
  }

  /* =====================================================================
   *  PAGE: BUỔI ĐÁNH + VÃNG LAI
   * ===================================================================*/
  function pageSessions() {
    const cfg = monthCfg();
    const sessions = S.db.sessions.filter((s) => s.month === S.month)
      .sort((a, b) => a.date.localeCompare(b.date));
    const guests = S.db.guests.filter((g) => g.month === S.month);

    const list = sessions.length ? sessions.map((s) => {
      const gs = guests.filter((g) => g.date === s.date);
      return `<tr>
        <td><b>${dayLabel(s.date)}</b></td>
        <td class="num">${vnd(s.cost != null ? s.cost : cfg.courtFee)}</td>
        <td>${gs.length
          ? gs.map((g) => `<span class="badge badge-muted" style="margin:1px 3px 1px 0">${esc(g.memberId ? memberName(g.memberId) : g.name)} ${vnd(g.amount)}</span>`).join('')
          : '<span class="muted">–</span>'}</td>
        <td class="num">${gs.length ? vnd(gs.reduce((t, g) => t + g.amount, 0)) : '–'}</td>
        <td class="muted">${esc(s.note)}</td>
        <td class="row-actions">
          <button class="btn btn-sm" data-act="add-guest" data-date="${esc(s.date)}">+ Vãng lai</button>
          <button class="btn btn-sm btn-ghost" data-act="edit-session" data-id="${esc(s.id)}">Sửa</button>
          <button class="btn btn-sm btn-danger" data-act="del-session" data-id="${esc(s.id)}">Xoá</button>
        </td></tr>`;
    }).join('') : '';

    const orphan = guests.filter((g) => !sessions.some((s) => s.date === g.date));

    return `
    <section class="card">
      <div class="card-head">
        <div><h2>Buổi đánh ${Calc.fmtMonthVi(S.month)}</h2>
          <p class="sub">${sessions.length} buổi · tổng ${vnd(sessions.reduce((t, s) => t + (s.cost != null ? s.cost : cfg.courtFee), 0))}</p></div>
        <div class="toolbar">
          <button class="btn btn-sm btn-primary" data-act="gen-sessions">Tạo nhanh cả tháng</button>
          <button class="btn btn-sm" data-act="add-session">+ Thêm buổi</button>
        </div>
      </div>
      ${list ? `<div class="table-wrap"><table>
        <thead><tr><th>Ngày</th><th class="num">Tiền sân</th><th>Vãng lai</th><th class="num">Thu</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${list}</tbody></table></div>`
        : '<div class="empty">Chưa có buổi nào. Bấm <b>Tạo nhanh cả tháng</b> để sinh lịch theo thứ cố định.</div>'}
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Người đánh vãng lai</h2>
        <p class="sub">Mặc định ${vnd(cfg.guestFee)}/buổi. Tiền thu được sẽ hoàn lại cho người cố định vào cuối tháng.</p></div>
        <button class="btn btn-sm" data-act="add-guest">+ Thêm lượt</button></div>
      ${guests.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Ngày</th><th>Người đánh</th><th class="num">Số tiền</th><th>Đã trả</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${guests.sort((a, b) => a.date.localeCompare(b.date)).map((g) => `<tr>
          <td>${dayLabel(g.date)}</td>
          <td>${esc(g.memberId ? memberName(g.memberId) : g.name)}${g.memberId ? '' : ' <span class="badge badge-muted">khách</span>'}</td>
          <td class="num">${vnd(g.amount)}</td>
          <td>${g.memberId ? '<span class="muted small">tính vào công nợ</span>'
              : (g.paid ? '<span class="badge badge-ok">Rồi</span>' : '<span class="badge badge-danger">Chưa</span>')}</td>
          <td class="muted">${esc(g.note)}</td>
          <td class="row-actions">
            ${g.memberId ? '' : `<button class="btn btn-sm btn-ghost" data-act="toggle-guest-paid" data-id="${esc(g.id)}">↔</button>`}
            <button class="btn btn-sm btn-danger" data-act="del-guest" data-id="${esc(g.id)}">Xoá</button></td>
        </tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Chưa có ai đánh vãng lai tháng này.</div>'}
      ${orphan.length ? `<div class="note" style="margin-top:14px">Có ${orphan.length} lượt vãng lai ghi vào ngày không có buổi đánh nào. Kiểm tra lại ngày tháng nhé.</div>` : ''}
    </section>`;
  }

  /* =====================================================================
   *  PAGE: TIỀN CẦU
   * ===================================================================*/
  function pageShuttles() {
    const rows = S.db.shuttles.filter((s) => s.month === S.month)
      .sort((a, b) => a.date.localeCompare(b.date));
    const total = rows.reduce((t, s) => t + s.amount, 0);
    const r = rep();

    return `<section class="card">
      <div class="card-head">
        <div><h2>Tiền cầu ${Calc.fmtMonthVi(S.month)}</h2>
          <p class="sub">Tổng ${vnd(total)}${r.fixedCount ? ` · chia đều ${r.fixedCount} người cố định → ${vnd(r.shuttleShare)}/người` : ''}</p></div>
        <button class="btn btn-sm btn-primary" data-act="add-shuttle">+ Ghi lần mua cầu</button>
      </div>
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Ngày</th><th>Người mua</th><th class="num">Số ống</th><th class="num">Đơn giá</th>
        <th class="num">Thành tiền</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${rows.map((s) => `<tr>
          <td>${dayLabel(s.date)}</td>
          <td>${s.buyerId ? esc(memberName(s.buyerId)) : '<span class="muted">quỹ CLB</span>'}</td>
          <td class="num">${s.tubes || '–'}</td>
          <td class="num">${s.unitPrice ? vnd(s.unitPrice) : '–'}</td>
          <td class="num"><b>${vnd(s.amount)}</b></td>
          <td class="muted">${esc(s.note)}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-ghost" data-act="edit-shuttle" data-id="${esc(s.id)}">Sửa</button>
            <button class="btn btn-sm btn-danger" data-act="del-shuttle" data-id="${esc(s.id)}">Xoá</button></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Tổng</td><td class="num">${vnd(total)}</td><td colspan="2"></td></tr></tfoot>
      </table></div>
      <div class="note info" style="margin-top:14px">Người đứng ra mua cầu được <b>trừ thẳng</b> số tiền đã ứng
      vào khoản phải đóng, nên không cần hoàn tiền mặt riêng.</div>`
      : '<div class="empty">Tháng này chưa mua cầu.</div>'}
    </section>`;
  }

  /* =====================================================================
   *  PAGE: ĐĂNG KÝ THÁNG
   * ===================================================================*/
  function pageRegister() {
    const cfg = monthCfg();
    const fixedIds = S.db.fixed.filter((f) => f.month === S.month).map((f) => f.memberId);
    const prevIds = S.db.fixed.filter((f) => f.month === Calc.prevMonth(S.month)).map((f) => f.memberId);
    const actives = S.db.members.filter((m) => m.active);
    const r = rep();

    return `<section class="card">
      <div class="card-head">
        <div><h2>Đăng ký cố định ${Calc.fmtMonthVi(S.month)}</h2>
          <p class="sub">Tick tên những người đăng ký cả tháng. ${fixedIds.length} người đã đăng ký.</p></div>
        <div class="toolbar">
          ${prevIds.length ? '<button class="btn btn-sm" data-act="copy-prev-fixed">Chép từ tháng trước</button>' : ''}
          <button class="btn btn-sm btn-ghost" data-act="clear-fixed">Bỏ chọn hết</button>
        </div>
      </div>
      ${actives.length ? `<div class="checks">${actives.map((m) => `
        <label class="check${fixedIds.includes(m.id) ? ' on' : ''}">
          <input type="checkbox" data-act="toggle-fixed" data-id="${esc(m.id)}" ${fixedIds.includes(m.id) ? 'checked' : ''}>
          <span>${esc(m.name)}</span>
        </label>`).join('')}</div>`
        : '<div class="empty">Chưa có thành viên nào. Sang tab <b>Thành viên</b> để thêm.</div>'}
      ${r.fixedCount ? `<div class="note info" style="margin-top:16px">
        Với ${r.sessionCount} buổi × ${vnd(cfg.courtFee)}, mỗi người cố định gánh
        <b>${vnd(r.courtShare)}</b> tiền sân trong tháng.</div>` : ''}
    </section>

    <section class="card">
      <h2>Giá áp dụng cho tháng này</h2>
      <p class="sub">Để trống sẽ dùng giá mặc định trong Cài đặt.</p>
      <div class="grid2">
        ${fld('courtFee', 'Tiền sân mỗi buổi (đ)', 'number', cfg.courtFee, 'data-act="set-court-fee" step="any"')}
        ${fld('guestFee', 'Phí vãng lai mỗi buổi (đ)', 'number', cfg.guestFee, 'data-act="set-guest-fee" step="any"')}
      </div>
      <label class="field"><span>Ghi chú tháng</span>
        <input type="text" value="${esc(cfg.note)}" data-act="set-month-note" placeholder="vd: nghỉ Tết 2 buổi"></label>
    </section>`;
  }

  /* =====================================================================
   *  PAGE: THÀNH VIÊN
   * ===================================================================*/
  function pageMembers() {
    const series = Calc.computeSeries(S.db);
    const bal = series.balances;
    const rows = S.db.members.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    return `<section class="card">
      <div class="card-head"><div><h2>Thành viên</h2>
        <p class="sub">${rows.filter((m) => m.active).length} đang hoạt động · số dư là công nợ luỹ kế đến hiện tại.</p></div>
        <button class="btn btn-sm btn-primary" data-act="add-member">+ Thêm thành viên</button></div>
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Tên</th><th>Điện thoại</th><th class="num">Số dư luỹ kế</th><th>Trạng thái</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${rows.map((m) => {
          const b = bal.get(m.id) || 0;
          return `<tr>
            <td><b>${esc(m.name)}</b></td>
            <td class="muted">${esc(m.phone || '–')}</td>
            <td class="num ${b > 0 ? 'pos' : b < 0 ? 'neg' : 'muted'}">${b ? (b > 0 ? 'Nợ ' : 'Dư ') + vnd(Math.abs(b)) : '–'}</td>
            <td>${m.active ? '<span class="badge badge-ok">Hoạt động</span>' : '<span class="badge badge-muted">Nghỉ</span>'}</td>
            <td class="muted">${esc(m.note)}</td>
            <td class="row-actions">
              <button class="btn btn-sm btn-ghost" data-act="edit-member" data-id="${esc(m.id)}">Sửa</button>
              <button class="btn btn-sm btn-danger" data-act="del-member" data-id="${esc(m.id)}">Xoá</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : '<div class="empty">Chưa có thành viên nào.</div>'}
    </section>`;
  }

  /* =====================================================================
   *  PAGE: CÀI ĐẶT
   * ===================================================================*/
  function pageSettings() {
    const c = Api.config;
    const st = S.db.settings;
    const wd = st.defaultWeekdays || [];

    return `<section class="card">
      <h2>Nơi lưu dữ liệu</h2>
      <p class="sub">Chọn Google Sheet để cả đội cùng xem được và không mất dữ liệu khi đổi máy.</p>
      ${sel('mode', 'Chế độ', [
        { v: 'local', t: 'Chỉ lưu trên trình duyệt này' },
        { v: 'sheets', t: 'Google Sheet (khuyến nghị)' }], c.mode).replace('name="mode"', 'data-act="set-mode"')}
      ${c.mode === 'sheets' ? `
        <label class="field"><span>URL ứng dụng web Apps Script</span>
          <input type="url" value="${esc(c.url)}" data-act="set-url" placeholder="https://script.google.com/macros/s/..../exec"></label>
        <label class="field"><span>Mã bảo mật (TOKEN)</span>
          <input type="password" value="${esc(c.token)}" data-act="set-token" placeholder="đúng chuỗi TOKEN trong Code.gs"></label>
        <div class="toolbar">
          <button class="btn btn-primary" data-act="test-conn">Kiểm tra kết nối</button>
          <button class="btn" data-act="pull">Tải lại từ Sheet</button>
          <button class="btn" data-act="push">Đẩy dữ liệu lên Sheet</button>
        </div>` : ''}
      <label class="check on" style="margin-top:14px; max-width:280px">
        <input type="checkbox" data-act="set-autosave" ${c.autoSave ? 'checked' : ''}>
        <span>Tự động lưu sau mỗi thay đổi</span></label>
    </section>

    <section class="card">
      <h2>Giá mặc định</h2>
      <p class="sub">Áp dụng cho mọi tháng chưa đặt giá riêng.</p>
      <div class="grid2">
        ${fld('x1', 'Tên câu lạc bộ', 'text', st.clubName, 'data-act="set-clubname"')}
        ${fld('x2', 'Tiền sân mỗi buổi (đ)', 'number', st.courtFeePerSession, 'data-act="set-default-court" step="any"')}
        ${fld('x3', 'Phí vãng lai mỗi buổi (đ)', 'number', st.guestFeePerSession, 'data-act="set-default-guest" step="any"')}
        ${sel('x4', 'Làm tròn tiền tới', [
          { v: 1, t: 'Không làm tròn' }, { v: 1000, t: '1.000đ' },
          { v: 5000, t: '5.000đ' }, { v: 10000, t: '10.000đ' }], st.roundStep)
          .replace('name="x4"', 'data-act="set-round"')}
      </div>
      <label class="field"><span>Các thứ đánh cố định trong tuần</span></label>
      <div class="checks">${DOW.map((d, i) => `
        <label class="check${wd.includes(i) ? ' on' : ''}">
          <input type="checkbox" data-act="toggle-weekday" data-i="${i}" ${wd.includes(i) ? 'checked' : ''}>
          <span>${d === 'CN' ? 'Chủ nhật' : 'Thứ ' + (i + 1)}</span></label>`).join('')}</div>
    </section>

    <section class="card">
      <h2>Sao lưu</h2>
      <p class="sub">Tải toàn bộ dữ liệu về máy dưới dạng file JSON, hoặc phục hồi từ file đã lưu.</p>
      <div class="toolbar">
        <button class="btn" data-act="export-json">Tải file sao lưu</button>
        <button class="btn" data-act="import-json">Phục hồi từ file</button>
        <button class="btn btn-danger" data-act="wipe">Xoá sạch dữ liệu</button>
      </div>
    </section>

    <section class="card">
      <h2>Hướng dẫn kết nối Google Sheet</h2>
      <ol class="steps">
        <li>Tạo một Google Sheet mới.</li>
        <li>Vào <code>Tiện ích mở rộng → Apps Script</code>, dán toàn bộ nội dung file <code>apps-script/Code.gs</code>.</li>
        <li>Sửa dòng <code>var TOKEN = '...'</code> thành mật khẩu riêng của bạn.</li>
        <li>Chạy hàm <code>setup</code> một lần để tạo các sheet.</li>
        <li><code>Triển khai → Ứng dụng web</code>, chọn <b>Thực thi với tư cách: Tôi</b> và
            <b>Ai có quyền truy cập: Bất kỳ ai</b>, rồi copy URL.</li>
        <li>Dán URL + TOKEN vào ô bên trên, bấm <b>Kiểm tra kết nối</b>.</li>
      </ol>
    </section>`;
  }

  /* =====================================================================
   *  RENDER
   * ===================================================================*/
  const PAGES = {
    overview: pageOverview, collect: pageCollect, sessions: pageSessions,
    shuttles: pageShuttles, register: pageRegister, members: pageMembers,
    settings: pageSettings,
  };

  /**
   * Ghi nhớ ô đang gõ để khôi phục sau khi vẽ lại (tránh mất focus khi bấm
   * mũi tên tăng/giảm của <input type=number>).
   * Chỉ áp dụng cho ô nhập liệu — KHÔNG khôi phục focus cho nút bấm, tránh
   * trường hợp focus nhảy sang nút "Xoá" của dòng khác rồi bấm Enter nhầm.
   */
  const FOCUSABLE = { INPUT: 1, SELECT: 1, TEXTAREA: 1 };

  function focusKey() {
    const el = document.activeElement;
    if (!el || !FOCUSABLE[el.tagName]) return null;
    if (!el.dataset || !el.dataset.act || !$('#main').contains(el)) return null;
    const id = el.dataset.id || el.dataset.i || '';
    // id lạ (chứa dấu nháy) sẽ làm vỡ selector -> bỏ qua cho an toàn
    if (/["'\\]/.test(id) || /["'\\]/.test(el.dataset.act)) return null;
    let start = null, end = null;
    try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { /* input number */ }
    return { act: el.dataset.act, id, start, end, scroll: window.scrollY };
  }

  function restoreFocus(k) {
    if (!k) return;
    let el = null;
    try {
      const base = `#main [data-act="${k.act}"]`;
      el = k.id
        ? ($(`${base}[data-id="${k.id}"]`) || $(`${base}[data-i="${k.id}"]`))
        : $(base);
    } catch (e) { return; }
    if (!el || !FOCUSABLE[el.tagName]) return;
    try {
      el.focus({ preventScroll: true });
      if (k.start != null && el.setSelectionRange && el.type !== 'number') {
        el.setSelectionRange(k.start, k.end);
      }
    } catch (e) { /* bỏ qua */ }
    window.scrollTo({ top: k.scroll });
  }

  function render() {
    const fk = focusKey();
    $('#clubName').textContent = S.db.settings.clubName || 'Quỹ CLB Cầu lông';
    document.title = (S.db.settings.clubName || 'Quỹ CLB Cầu lông');
    $('#monthPicker').value = S.month;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === S.page));
    const r = rep();
    $('#monthMeta').textContent =
      `${r.sessionCount} buổi · ${r.fixedCount} người cố định · còn thu ${vnd(r.outstanding)}`;
    $('#main').innerHTML = PAGES[S.page]();
    $$('#main .check').forEach(wireCheck);
    updateSyncBadge();
    restoreFocus(fk);
  }

  /* =====================================================================
   *  ACTIONS
   * ===================================================================*/
  const ACT = {
    /* ---- thành viên ---- */
    'add-member'() {
      modal('Thêm thành viên',
        fld('name', 'Họ tên', 'text', '', 'required') +
        fld('phone', 'Điện thoại', 'tel', '') +
        fld('note', 'Ghi chú', 'text', ''),
        (d) => {
          if (!d.name.trim()) throw new Error('Chưa nhập tên.');
          mutate((db) => db.members.push({
            id: uid(), name: d.name.trim(), phone: d.phone, active: true, note: d.note,
          }));
        });
    },
    'edit-member'(el) {
      const m = S.db.members.find((x) => x.id === el.dataset.id);
      modal('Sửa thành viên',
        fld('name', 'Họ tên', 'text', m.name) +
        fld('phone', 'Điện thoại', 'tel', m.phone) +
        fld('note', 'Ghi chú', 'text', m.note) +
        `<label class="check${m.active ? ' on' : ''}"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}><span>Đang sinh hoạt</span></label>`,
        (d) => mutate(() => {
          m.name = d.name.trim(); m.phone = d.phone; m.note = d.note; m.active = !!d.active;
        }));
    },
    'del-member'(el) {
      const id = el.dataset.id;
      const name = memberName(id);
      const m = S.db.members.find((x) => x.id === id);
      const n = {
        fixed: S.db.fixed.filter((f) => f.memberId === id).length,
        payments: S.db.payments.filter((p) => p.memberId === id).length,
        guests: S.db.guests.filter((g) => g.memberId === id).length,
        shuttles: S.db.shuttles.filter((s) => s.buyerId === id).length,
        adjustments: S.db.adjustments.filter((a) => a.memberId === id).length,
      };
      const total = n.fixed + n.payments + n.guests + n.shuttles + n.adjustments;

      if (total) {
        // Xoá hẳn sẽ làm lệch sổ các tháng đã chốt -> mặc định chỉ cho "cho nghỉ".
        const ok = confirm(
          `"${name}" đã có ${n.payments} khoản thu, ${n.fixed} tháng đăng ký, ` +
          `${n.guests} lượt vãng lai, ${n.shuttles} lần mua cầu.\n\n` +
          `Xoá hẳn sẽ làm sai lệch sổ sách của các tháng cũ.\n` +
          `Bấm OK để chuyển sang trạng thái "Nghỉ" (giữ nguyên lịch sử) — nên chọn cách này.\n` +
          `Bấm Huỷ nếu bạn thực sự muốn xoá vĩnh viễn.`);
        if (ok) {
          mutate(() => { m.active = false; });
          toast(`Đã chuyển "${name}" sang trạng thái Nghỉ`);
          return;
        }
        if (!confirm(`Xoá VĨNH VIỄN "${name}" cùng toàn bộ ${total} bản ghi liên quan?\n` +
                     `Thao tác này không hoàn tác được.`)) return;
      } else if (!confirm(`Xoá "${name}"?`)) {
        return;
      }

      mutate((db) => {
        db.members = db.members.filter((x) => x.id !== id);
        db.fixed = db.fixed.filter((f) => f.memberId !== id);
        db.payments = db.payments.filter((p) => p.memberId !== id);
        db.guests = db.guests.filter((g) => g.memberId !== id);
        db.shuttles = db.shuttles.filter((s) => s.buyerId !== id);
        db.adjustments = db.adjustments.filter((a) => a.memberId !== id);
      });
    },

    /* ---- đăng ký cố định ---- */
    'toggle-fixed'(el) {
      const id = el.dataset.id, on = el.checked;
      mutate((db) => {
        db.fixed = db.fixed.filter((f) => !(f.month === S.month && f.memberId === id));
        if (on) db.fixed.push({ month: S.month, memberId: id });
      });
    },
    'copy-prev-fixed'() {
      const prev = Calc.prevMonth(S.month);
      mutate((db) => {
        const ids = db.fixed.filter((f) => f.month === prev).map((f) => f.memberId);
        db.fixed = db.fixed.filter((f) => f.month !== S.month)
          .concat(ids.map((memberId) => ({ month: S.month, memberId })));
      });
      toast('Đã chép danh sách từ ' + Calc.fmtMonthVi(prev));
    },
    'clear-fixed'() {
      if (!confirm('Bỏ chọn toàn bộ người cố định tháng này?')) return;
      mutate((db) => { db.fixed = db.fixed.filter((f) => f.month !== S.month); });
    },

    /* ---- cấu hình tháng ---- */
    'month-cfg'() {
      const c = monthCfg();
      modal('Giá áp dụng cho ' + Calc.fmtMonthVi(S.month),
        fld('courtFee', 'Tiền sân mỗi buổi (đ)', 'number', c.courtFee, 'step="any"') +
        fld('guestFee', 'Phí vãng lai mỗi buổi (đ)', 'number', c.guestFee, 'step="any"') +
        fld('note', 'Ghi chú', 'text', c.note),
        (d) => setMonth({ courtFee: orNull(d.courtFee), guestFee: orNull(d.guestFee), note: d.note }));
    },
    'set-court-fee'(el) { setMonth({ courtFee: orNull(el.value) }); },
    'set-guest-fee'(el) { setMonth({ guestFee: orNull(el.value) }); },
    'set-month-note'(el) { setMonth({ note: el.value }); },

    /* ---- buổi đánh ---- */
    'gen-sessions'() {
      const wd = S.db.settings.defaultWeekdays || [];
      const boxes = DOW.map((d, i) =>
        `<label class="check${wd.includes(i) ? ' on' : ''}"><input type="checkbox" name="d${i}" ${wd.includes(i) ? 'checked' : ''}><span>${d === 'CN' ? 'Chủ nhật' : 'Thứ ' + (i + 1)}</span></label>`).join('');
      modal('Tạo nhanh buổi đánh cho ' + Calc.fmtMonthVi(S.month),
        `<p class="hint">Chọn các thứ trong tuần, app sẽ sinh toàn bộ buổi của tháng. Buổi đã có sẽ được giữ nguyên.</p>
         <div class="checks">${boxes}</div>`,
        (d) => {
          const days = DOW.map((_, i) => i).filter((i) => d['d' + i]);
          if (!days.length) throw new Error('Chưa chọn thứ nào.');
          const dates = Calc.generateDates(S.month, days);
          mutate((db) => {
            db.settings.defaultWeekdays = days;
            dates.forEach((date) => {
              if (db.sessions.some((s) => s.date === date)) return;
              db.sessions.push({ id: uid(), month: S.month, date, cost: null, note: '' });
            });
          });
          toast(`Đã tạo lịch ${dates.length} buổi`);
        }, 'Tạo');
    },
    'add-session'() {
      modal('Thêm buổi đánh',
        fld('date', 'Ngày', 'date', S.month + '-01', 'required') +
        fld('cost', 'Tiền sân (để trống = giá mặc định)', 'number', '', 'step="any"') +
        fld('note', 'Ghi chú', 'text', ''),
        (d) => {
          if (!d.date) throw new Error('Chưa chọn ngày.');
          mutate((db) => db.sessions.push({
            id: uid(), month: Calc.monthKeyOf(d.date), date: d.date,
            cost: d.cost === '' ? null : Calc.num(d.cost), note: d.note,
          }));
        });
    },
    'edit-session'(el) {
      const s = S.db.sessions.find((x) => x.id === el.dataset.id);
      modal('Sửa buổi đánh',
        fld('date', 'Ngày', 'date', s.date) +
        fld('cost', 'Tiền sân (để trống = giá mặc định)', 'number', s.cost == null ? '' : s.cost, 'step="any"') +
        fld('note', 'Ghi chú', 'text', s.note),
        (d) => mutate(() => {
          s.date = d.date; s.month = Calc.monthKeyOf(d.date);
          s.cost = d.cost === '' ? null : Calc.num(d.cost); s.note = d.note;
        }));
    },
    'del-session'(el) {
      const id = el.dataset.id;
      if (!confirm('Xoá buổi đánh này?')) return;
      mutate((db) => { db.sessions = db.sessions.filter((s) => s.id !== id); });
    },

    /* ---- vãng lai ---- */
    'add-guest'(el) {
      const cfg = monthCfg();
      const dates = S.db.sessions.filter((s) => s.month === S.month)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => ({ v: s.date, t: dayLabel(s.date) }));
      if (!dates.length) { toast('Hãy tạo buổi đánh trước đã.', true); return; }
      modal('Thêm lượt đánh vãng lai',
        sel('date', 'Buổi', dates, el.dataset.date || dates[0].v) +
        sel('memberId', 'Là thành viên CLB?', memberOptions('— Khách ngoài, thu tiền mặt —'), '') +
        fld('name', 'Tên (nếu là khách ngoài)', 'text', '') +
        fld('amount', 'Số tiền (đ)', 'number', cfg.guestFee, 'step="any"') +
        `<label class="check"><input type="checkbox" name="paid"><span>Khách ngoài đã trả tiền</span></label>`,
        (d) => {
          if (!d.memberId && !d.name.trim()) throw new Error('Nhập tên khách hoặc chọn thành viên.');
          mutate((db) => db.guests.push({
            id: uid(), month: Calc.monthKeyOf(d.date), date: d.date,
            name: d.memberId ? '' : d.name.trim(), memberId: d.memberId,
            amount: Calc.num(d.amount), paid: !!d.paid, note: '',
          }));
        });
    },
    'toggle-guest-paid'(el) {
      const g = S.db.guests.find((x) => x.id === el.dataset.id);
      mutate(() => { g.paid = !g.paid; });
    },
    'del-guest'(el) {
      const id = el.dataset.id;
      if (!confirm('Xoá lượt đánh vãng lai này?')) return;
      mutate((db) => { db.guests = db.guests.filter((g) => g.id !== id); });
    },

    /* ---- tiền cầu ---- */
    'add-shuttle'() {
      modal('Ghi nhận mua cầu',
        fld('date', 'Ngày mua', 'date', new Date().toISOString().slice(0, 10)) +
        sel('buyerId', 'Người ứng tiền mua', memberOptions('— Trả bằng quỹ CLB —'), '') +
        `<div class="grid2">${fld('tubes', 'Số ống', 'number', 1, 'step="any"')}${fld('unitPrice', 'Đơn giá / ống (đ)', 'number', '', 'step="any"')}</div>` +
        fld('amount', 'Thành tiền (để trống = số ống × đơn giá)', 'number', '', 'step="any"') +
        fld('note', 'Ghi chú', 'text', ''),
        (d) => {
          const amount = d.amount !== '' ? Calc.num(d.amount) : Calc.num(d.tubes) * Calc.num(d.unitPrice);
          if (!amount) throw new Error('Chưa có số tiền.');
          mutate((db) => db.shuttles.push({
            id: uid(), month: Calc.monthKeyOf(d.date), date: d.date, buyerId: d.buyerId,
            tubes: Calc.num(d.tubes), unitPrice: Calc.num(d.unitPrice), amount, note: d.note,
          }));
        });
    },
    'edit-shuttle'(el) {
      const s = S.db.shuttles.find((x) => x.id === el.dataset.id);
      modal('Sửa lần mua cầu',
        fld('date', 'Ngày mua', 'date', s.date) +
        sel('buyerId', 'Người ứng tiền mua', memberOptions('— Trả bằng quỹ CLB —'), s.buyerId) +
        `<div class="grid2">${fld('tubes', 'Số ống', 'number', s.tubes, 'step="any"')}${fld('unitPrice', 'Đơn giá / ống (đ)', 'number', s.unitPrice, 'step="any"')}</div>` +
        fld('amount', 'Thành tiền', 'number', s.amount, 'step="any"') +
        fld('note', 'Ghi chú', 'text', s.note),
        (d) => mutate(() => {
          s.date = d.date; s.month = Calc.monthKeyOf(d.date); s.buyerId = d.buyerId;
          s.tubes = Calc.num(d.tubes); s.unitPrice = Calc.num(d.unitPrice);
          s.amount = d.amount !== '' ? Calc.num(d.amount) : Calc.num(d.tubes) * Calc.num(d.unitPrice);
          s.note = d.note;
        }));
    },
    'del-shuttle'(el) {
      const id = el.dataset.id;
      if (!confirm('Xoá lần mua cầu này?')) return;
      mutate((db) => { db.shuttles = db.shuttles.filter((s) => s.id !== id); });
    },

    /* ---- thanh toán ---- */
    'pay'(el) {
      const preset = el.dataset.id || '';
      const amt = el.dataset.amt ? Math.max(0, Math.round(Number(el.dataset.amt))) : '';
      modal('Ghi nhận đóng tiền',
        sel('memberId', 'Người đóng', memberOptions('— Chọn —'), preset) +
        fld('amount', 'Số tiền (đ)', 'number', amt, 'step="any" required') +
        fld('date', 'Ngày', 'date', new Date().toISOString().slice(0, 10)) +
        fld('note', 'Ghi chú', 'text', ''),
        (d) => {
          if (!d.memberId) throw new Error('Chưa chọn người đóng.');
          if (!Calc.num(d.amount)) throw new Error('Chưa nhập số tiền.');
          mutate((db) => db.payments.push({
            id: uid(), month: S.month, memberId: d.memberId,
            amount: Calc.num(d.amount), date: d.date, note: d.note,
          }));
        }, 'Ghi nhận');
    },
    'del-payment'(el) {
      const id = el.dataset.id;
      if (!confirm('Xoá khoản thu này?')) return;
      mutate((db) => { db.payments = db.payments.filter((p) => p.id !== id); });
    },
    'adjust'(el) {
      modal('Điều chỉnh thủ công',
        `<p class="hint">Số dương = phải đóng thêm. Số âm = được giảm trừ.</p>` +
        sel('memberId', 'Thành viên', memberOptions('— Chọn —'), el.dataset.id || '') +
        fld('amount', 'Số tiền (đ)', 'number', '', 'step="any"') +
        fld('reason', 'Lý do', 'text', ''),
        (d) => {
          if (!d.memberId || !Calc.num(d.amount)) throw new Error('Thiếu thông tin.');
          mutate((db) => db.adjustments.push({
            id: uid(), month: S.month, memberId: d.memberId,
            amount: Calc.num(d.amount), reason: d.reason,
          }));
        });
    },
    'del-adjust'(el) {
      const id = el.dataset.id;
      if (!confirm('Xoá khoản điều chỉnh này?')) return;
      mutate((db) => { db.adjustments = db.adjustments.filter((a) => a.id !== id); });
    },

    /* ---- xuất dữ liệu ---- */
    async 'copy-msg'() {
      const text = Calc.buildMessage(rep());
      try {
        await navigator.clipboard.writeText(text);
        toast('Đã sao chép tin nhắn — dán vào Zalo là xong');
      } catch (e) {
        modal('Tin nhắn tổng kết', `<pre class="msg">${esc(text)}</pre>
          <p class="hint">Không tự sao chép được. Bạn bôi đen đoạn trên rồi copy thủ công nhé.</p>`,
          () => {}, 'Đóng');
      }
    },
    'export-csv'() {
      const r = rep();
      const head = ['Thành viên', 'Cố định', 'Nợ/dư cũ', 'Tiền sân', 'Tiền cầu', 'Hoàn vãng lai',
        'Cầu đã mua', 'Phí vãng lai', 'Cần đóng', 'Đã đóng', 'Còn lại'];
      const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = [head.join(',')].concat(r.rows.map((x) => [
        q(x.name), x.isFixed ? 'x' : '', x.opening, x.courtShare, x.shuttleShare,
        -x.guestCredit, -x.shuttleAdvance, x.guestFee, x.due, x.paid, x.closing,
      ].join(',')));
      download(`cau-long-${S.month}.csv`, '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
    },
    'export-json'() {
      download(`clb-caulong-backup-${new Date().toISOString().slice(0, 10)}.json`,
        Api.exportJson(S.db), 'application/json');
    },
    'import-json'() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const db = Api.importJson(rd.result);
            if (!confirm('Ghi đè toàn bộ dữ liệu hiện tại bằng file này?')) return;
            S.db = db; S.dirty = true; S.version++; render(); scheduleSave();
            toast('Đã phục hồi dữ liệu');
          } catch (e) { toast('File không hợp lệ: ' + e.message, true); }
        };
        rd.readAsText(f);
      };
      inp.click();
    },
    'wipe'() {
      if (!confirm('Xoá sạch toàn bộ dữ liệu? Nên tải file sao lưu trước.')) return;
      if (!confirm('Chắc chắn chứ? Thao tác này không hoàn tác được.')) return;
      const rev = S.db.rev;
      S.db = Calc.emptyDb(); S.db.rev = rev; S.dirty = true; S.version++; render(); scheduleSave();
    },

    /* ---- cài đặt ---- */
    'set-mode'(el) { Api.setConfig({ mode: el.value }); S.synced = false; S.failures = 0; render(); },
    'set-url'(el) { Api.setConfig({ url: el.value.trim() }); },
    'set-token'(el) { Api.setConfig({ token: el.value }); },
    'set-autosave'(el) { Api.setConfig({ autoSave: el.checked }); updateSyncBadge(); },
    'set-clubname'(el) { mutate((db) => { db.settings.clubName = el.value; }); },
    'set-default-court'(el) { mutate((db) => { db.settings.courtFeePerSession = Calc.num(el.value); }); },
    'set-default-guest'(el) { mutate((db) => { db.settings.guestFeePerSession = Calc.num(el.value); }); },
    'set-round'(el) { mutate((db) => { db.settings.roundStep = Calc.num(el.value); }); },
    'toggle-weekday'(el) {
      const i = Number(el.dataset.i);
      mutate((db) => {
        const cur = new Set(db.settings.defaultWeekdays || []);
        el.checked ? cur.add(i) : cur.delete(i);
        db.settings.defaultWeekdays = Array.from(cur).sort();
      });
    },
    async 'test-conn'() {
      toast('Đang kiểm tra…');
      try { await Api.ping(); toast('Kết nối thành công 🎉'); }
      catch (e) { toast('Không kết nối được: ' + e.message, true); }
    },
    async 'pull'() {
      if (S.dirty && !confirm('Có thay đổi chưa lưu sẽ bị mất. Vẫn tải lại?')) return;
      try {
        const { db, source } = await Api.load();
        if (source !== 'sheets') throw new Error('Không đọc được Google Sheet.');
        S.db = db; S.dirty = false; S.synced = true; S.failures = 0;
        render(); toast('Đã tải dữ liệu từ Google Sheet');
      } catch (e) { toast('Tải thất bại: ' + e.message, true); }
    },
    async 'push'() {
      try {
        await Api.save(S.db); S.dirty = false; S.synced = true; S.failures = 0; updateSyncBadge();
        toast('Đã đẩy dữ liệu lên Google Sheet');
      } catch (e) {
        if (e.conflict && confirm(e.message + '\n\nGhi đè bản trên Sheet bằng dữ liệu ở máy này?')) {
          S.db.rev = e.serverRev;
          try { await Api.save(S.db); S.dirty = false; S.synced = true; updateSyncBadge(); toast('Đã ghi đè.'); }
          catch (e2) { toast('Vẫn thất bại: ' + e2.message, true); }
        } else toast('Đẩy thất bại: ' + e.message, true);
      }
    },
  };

  /** Ô để trống -> null (dùng giá mặc định), khác thì lấy số. */
  function orNull(v) {
    return String(v == null ? '' : v).trim() === '' ? null : Calc.num(v);
  }

  function setMonth(patch) {
    mutate((db) => {
      let row = db.months.find((m) => m.month === S.month);
      if (!row) { row = { month: S.month, courtFee: null, guestFee: null, status: 'open', note: '' }; db.months.push(row); }
      Object.assign(row, patch);
    });
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  /* =====================================================================
   *  EVENT WIRING
   * ===================================================================*/
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT')) return;
    const fn = ACT[el.dataset.act];
    if (fn) fn(el);
  });

  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    S.page = t.dataset.page;
    render();
    window.scrollTo({ top: 0 });
  });

  $('#monthPicker').addEventListener('change', (e) => {
    if (e.target.value) { S.month = e.target.value; render(); }
  });
  $('#prevMonth').addEventListener('click', () => { S.month = Calc.prevMonth(S.month); render(); });
  $('#nextMonth').addEventListener('click', () => { S.month = Calc.nextMonth(S.month); render(); });
  $('#btnSave').addEventListener('click', doSave);

  window.addEventListener('beforeunload', (e) => {
    if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* =====================================================================
   *  BOOT
   * ===================================================================*/
  (async function boot() {
    try {
      const { db, source, error } = await Api.load();
      S.db = db;
      if (error) toast('Đang dùng bản lưu tạm trên máy: ' + error, true);
      else if (source === 'sheets') { S.synced = true; toast('Đã tải dữ liệu từ Google Sheet'); }
    } catch (e) {
      toast('Không tải được dữ liệu: ' + e.message, true);
    }
    const months = Calc.allMonths(S.db);
    if (months.length && !months.includes(S.month)) S.month = months[months.length - 1];
    render();
  })();
})();

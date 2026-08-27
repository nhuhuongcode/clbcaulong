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

  /**
   * Ngân hàng hỗ trợ chuyển khoản qua VietQR (mã BIN theo chuẩn Napas).
   * Lấy từ https://api.vietqr.io/v2/banks, chỉ giữ ngân hàng có isTransfer=1.
   */
  const BANKS = [
    { bin: '970425', code: 'ABB', name: 'ABBANK' },
    { bin: '970416', code: 'ACB', name: 'ACB' },
    { bin: '970405', code: 'VBA', name: 'Agribank' },
    { bin: '970409', code: 'BAB', name: 'BacABank' },
    { bin: '970438', code: 'BVB', name: 'BaoVietBank' },
    { bin: '970418', code: 'BIDV', name: 'BIDV' },
    { bin: '546034', code: 'CAKE', name: 'CAKE' },
    { bin: '422589', code: 'CIMB', name: 'CIMB' },
    { bin: '970446', code: 'COOPBANK', name: 'COOPBANK' },
    { bin: '970431', code: 'EIB', name: 'Eximbank' },
    { bin: '970437', code: 'HDB', name: 'HDBank' },
    { bin: '970452', code: 'KLB', name: 'KienLongBank' },
    { bin: '668888', code: 'KBank', name: 'KBank' },
    { bin: '970449', code: 'LPB', name: 'LPBank (LienVietPostBank)' },
    { bin: '970422', code: 'MB', name: 'MBBank' },
    { bin: '970414', code: 'MBV', name: 'MBV' },
    { bin: '971025', code: 'momo', name: 'MoMo' },
    { bin: '970426', code: 'MSB', name: 'MSB' },
    { bin: '970428', code: 'NAB', name: 'NamABank' },
    { bin: '970419', code: 'NCB', name: 'NCB' },
    { bin: '970448', code: 'OCB', name: 'OCB' },
    { bin: '970430', code: 'PGB', name: 'PGBank' },
    { bin: '970412', code: 'PVCB', name: 'PVcomBank' },
    { bin: '971133', code: 'PVDB', name: 'PVcomBank Pay' },
    { bin: '970403', code: 'STB', name: 'Sacombank' },
    { bin: '970400', code: 'SGICB', name: 'SaigonBank' },
    { bin: '970429', code: 'SCB', name: 'SCB' },
    { bin: '970440', code: 'SEAB', name: 'SeABank' },
    { bin: '970443', code: 'SHB', name: 'SHB' },
    { bin: '970424', code: 'SHBVN', name: 'ShinhanBank' },
    { bin: '970407', code: 'TCB', name: 'Techcombank' },
    { bin: '963388', code: 'TIMO', name: 'Timo' },
    { bin: '970423', code: 'TPB', name: 'TPBank' },
    { bin: '546035', code: 'Ubank', name: 'Ubank' },
    { bin: '970427', code: 'VAB', name: 'VietABank' },
    { bin: '970436', code: 'VCB', name: 'Vietcombank' },
    { bin: '970454', code: 'VCCB', name: 'VietCapitalBank (BVBank)' },
    { bin: '970433', code: 'VIETBANK', name: 'VietBank' },
    { bin: '970415', code: 'ICB', name: 'VietinBank' },
    { bin: '970441', code: 'VIB', name: 'VIB' },
    { bin: '970432', code: 'VPB', name: 'VPBank' },
    { bin: '970457', code: 'WVN', name: 'Woori' },
  ];

  /** Bỏ dấu tiếng Việt — nội dung chuyển khoản không dấu để tương thích mọi ngân hàng. */
  function stripDiacritics(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // các dấu thanh/nguyên âm ghép rời ra sau NFD
      .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }
  /** Thay {ten}, {thang}, {nam}, {club} trong mẫu nội dung chuyển khoản. */
  function renderQrTemplate(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : ''));
  }
  function slugify(s) {
    return (stripDiacritics(String(s || '')).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'qr';
  }
  /** Tải ảnh cho phép đọc pixel qua canvas — nếu server không cho CORS thì sẽ reject. */
  function loadImageCors(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('load-failed'));
      img.src = url;
    });
  }
  /** Ghép ảnh QR + vài dòng thông tin thành một ảnh PNG duy nhất. */
  function buildQrCard(img, lines) {
    const pad = 28, lineH = 26, gap = 16;
    const w = Math.max(img.width + pad * 2, 420);
    const h = pad + img.height + gap + lines.length * lineH + pad;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, (w - img.width) / 2, pad);
    ctx.fillStyle = '#16181d';
    ctx.textAlign = 'center';
    let y = pad + img.height + gap + 18;
    lines.forEach((line, i) => {
      ctx.font = i === 0 ? '700 19px -apple-system, sans-serif' : '400 15px -apple-system, sans-serif';
      ctx.fillText(line, w / 2, y);
      y += lineH;
    });
    return canvas;
  }
  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      try { canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('empty-blob'))), 'image/png'); }
      catch (e) { reject(e); }
    });
  }
  function triggerBlobDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

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

  /**
   * Lượt vãng lai có thuộc buổi này không.
   * Bản ghi mới luôn có sessionId. Bản ghi cũ chỉ có ngày -> chỉ suy ra được
   * khi ngày đó có duy nhất một nhóm; ngày nhiều nhóm thì để engine cảnh báo
   * chứ không gán bừa (nếu không sẽ đếm trùng và xoá lây sang buổi khác).
   */
  function guestBelongs(g, s) {
    // sessionId trỏ tới buổi đã bị xoá thì coi như không có, suy lại theo ngày
    // (giống hệt cách engine trong calc.js xử lý, để UI và số liệu không lệch).
    if (g.sessionId && S.db.sessions.some((x) => x.id === g.sessionId && x.month === g.month)) {
      return g.sessionId === s.id;
    }
    if (g.date !== s.date) return false;
    const groups = new Set(S.db.sessions.filter((x) => x.date === s.date).map((x) => x.group));
    return groups.size <= 1;
  }

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
  /**
   * Ô chọn nhóm buổi: gợi ý các nhóm đang có trong tháng, vẫn cho gõ tên mới.
   * Để trống = tự lấy theo thứ trong tuần của ngày đã chọn.
   */
  function groupField(value) {
    const opts = Calc.sortGroups(Array.from(new Set(
      Calc.monthGroups(S.db, S.month).concat(Calc.DOW))));
    return `<label class="field"><span>Nhóm buổi (để trống = theo thứ trong tuần)</span>
      <input name="group" list="groupList" value="${esc(value || '')}" placeholder="vd: T3">
      <datalist id="groupList">${opts.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
    </label>`;
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
        <div class="stat"><div class="k">Tiền cầu</div><div class="v small">${vnd(r.shuttleTotal)}</div></div>
        <div class="stat"><div class="k">Thu vãng lai</div><div class="v small">${vnd(r.guestTotal)}</div></div>
      </div>
    </section>

    <section class="card">
      <h2>Tiền sân từng buổi trong tuần</h2>
      <p class="sub">Mỗi nhóm chia riêng cho người đăng ký nhóm đó. Ai đăng ký cả hai thì cộng lại.</p>
      ${r.groups.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Buổi</th><th class="num">Số buổi</th><th class="num">Tiền sân</th>
          <th class="num">Người cố định</th><th class="num">Thu vãng lai</th>
          <th class="num">Hoàn/người</th><th class="num">Phải đóng/người</th></tr></thead>
        <tbody>${r.groups.map((g) => `<tr>
          <td><b>${esc(g.name)}</b></td>
          <td class="num">${g.sessionCount}</td>
          <td class="num">${vnd(g.courtTotal)}</td>
          <td class="num">${g.memberCount || '<span class="pos">0</span>'}</td>
          <td class="num">${g.guestTotal ? vnd(g.guestTotal) : '–'}</td>
          <td class="num neg">${g.guestCredit ? '-' + vnd(g.guestCredit) : '–'}</td>
          <td class="num"><b>${vnd(g.courtShare - g.guestCredit)}</b></td>
        </tr>`).join('')}</tbody></table></div>
        ${r.groups.some((g) => g.sessionCount && !g.memberCount)
          ? `<div class="note" style="margin-top:14px">Có nhóm buổi chưa ai đăng ký cố định —
             tiền sân của nhóm đó hiện chưa được chia cho ai. Vào tab <b>Đăng ký tháng</b> để tick.</div>` : ''}`
        : '<div class="empty">Chưa có buổi đánh nào trong tháng.</div>'}
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
        <td>${x.groups.length ? x.groups.map((g) => `<span class="badge badge-accent" style="margin-right:3px">${esc(g)}</span>`).join('') : '<span class="muted">–</span>'}</td>
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
          ${x.closing > 0 ? `<button class="btn btn-sm" data-act="qr" data-id="${esc(x.memberId)}" title="Tạo mã QR chuyển khoản">QR</button>` : ''}
          <button class="btn btn-sm" data-act="pay" data-id="${esc(x.memberId)}" data-amt="${x.closing}">Thu</button>
          <button class="btn btn-sm btn-ghost" data-act="adjust" data-id="${esc(x.memberId)}" title="Điều chỉnh tay">±</button>
        </td></tr>`;
    };

    const sum = (k) => r.rows.reduce((t, x) => t + x[k], 0);

    return `
    <section class="card">
      <div class="card-head">
        <div><h2>Bảng thu tiền ${Calc.fmtMonthVi(S.month)}</h2>
          <p class="sub">Cần đóng = nợ/dư cũ + tiền sân (cộng các nhóm đã đăng ký) + tiền cầu
            − hoàn vãng lai − cầu đã ứng mua.</p></div>
        <div class="toolbar">
          <button class="btn btn-sm" data-act="copy-msg">Sao chép tin nhắn</button>
          <button class="btn btn-sm" data-act="export-csv">Xuất CSV</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Thành viên</th><th>Buổi</th><th class="num">Nợ/dư cũ</th><th class="num">Tiền sân</th>
          <th class="num">Tiền cầu</th><th class="num">Hoàn vãng lai</th><th class="num">Cầu đã mua</th>
          <th class="num">Phí vãng lai</th><th class="num">Cần đóng</th><th class="num">Đã đóng</th>
          <th>Trạng thái</th><th></th>
        </tr></thead>
        <tbody>${r.rows.map(row).join('')}</tbody>
        <tfoot><tr>
          <td>Tổng</td>
          <td></td>
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
      const gs = guests.filter((g) => guestBelongs(g, s));
      return `<tr>
        <td><b>${dayLabel(s.date)}</b></td>
        <td><span class="badge badge-accent">${esc(s.group)}</span></td>
        <td class="num">${vnd(s.cost != null ? s.cost : cfg.courtFee)}</td>
        <td>${gs.length
          ? gs.map((g) => `<span class="badge badge-muted" style="margin:1px 3px 1px 0">${esc(g.memberId ? memberName(g.memberId) : g.name)} ${vnd(g.amount)}</span>`).join('')
          : '<span class="muted">–</span>'}</td>
        <td class="num">${gs.length ? vnd(gs.reduce((t, g) => t + g.amount, 0)) : '–'}</td>
        <td class="muted">${esc(s.note)}</td>
        <td class="row-actions">
          <button class="btn btn-sm" data-act="add-guest" data-session="${esc(s.id)}">+ Vãng lai</button>
          <button class="btn btn-sm btn-ghost" data-act="edit-session" data-id="${esc(s.id)}">Sửa</button>
          <button class="btn btn-sm btn-danger" data-act="del-session" data-id="${esc(s.id)}">Xoá</button>
        </td></tr>`;
    }).join('') : '';

    const r = rep();
    const dupDays = Array.from(new Set(sessions
      .filter((s, i, arr) => arr.some((o) => o.date === s.date && o.group !== s.group))
      .map((s) => s.date)));

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
        <thead><tr><th>Ngày</th><th>Nhóm</th><th class="num">Tiền sân</th><th>Vãng lai</th><th class="num">Thu</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${list}</tbody></table></div>
        <p class="hint" style="margin-top:10px">Nhóm quyết định tiền sân buổi đó chia cho ai.
        Buổi đá bù vào ngày khác vẫn để đúng nhóm cũ (vd buổi T3 dời sang T4 thì giữ nhóm <b>T3</b>).</p>`
        : '<div class="empty">Chưa có buổi nào. Bấm <b>Tạo nhanh cả tháng</b> để sinh lịch theo thứ cố định.</div>'}
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Người đánh vãng lai</h2>
        <p class="sub">Mặc định ${vnd(cfg.guestFee)}/buổi. Tiền thu được sẽ hoàn lại cho người cố định vào cuối tháng.</p></div>
        <button class="btn btn-sm" data-act="add-guest">+ Thêm lượt</button></div>
      ${guests.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Ngày</th><th>Nhóm</th><th>Người đánh</th><th class="num">Số tiền</th><th>Đã trả</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${guests.slice().sort((a, b) => a.date.localeCompare(b.date)).map((g) => {
          const s = sessions.find((x) => guestBelongs(g, x));
          return `<tr>
          <td>${dayLabel(g.date)}</td>
          <td>${s ? `<span class="badge badge-accent">${esc(s.group)}</span>`
                  : '<span class="badge badge-danger">?</span>'}</td>
          <td>${esc(g.memberId ? memberName(g.memberId) : g.name)}${g.memberId ? '' : ' <span class="badge badge-muted">khách</span>'}</td>
          <td class="num">${vnd(g.amount)}</td>
          <td>${g.memberId ? '<span class="muted small">tính vào công nợ</span>'
              : (g.paid ? '<span class="badge badge-ok">Rồi</span>' : '<span class="badge badge-danger">Chưa</span>')}</td>
          <td class="muted">${esc(g.note)}</td>
          <td class="row-actions">
            ${g.memberId ? '' : `<button class="btn btn-sm btn-ghost" data-act="toggle-guest-paid" data-id="${esc(g.id)}">↔</button>`}
            <button class="btn btn-sm btn-danger" data-act="del-guest" data-id="${esc(g.id)}">Xoá</button></td>
        </tr>`; }).join('')}</tbody></table></div>`
        : '<div class="empty">Chưa có ai đánh vãng lai tháng này.</div>'}
      ${r.orphanGuests.length ? `<div class="note" style="margin-top:14px">Có ${r.orphanGuests.length} lượt
        vãng lai ghi vào ngày không có buổi đánh nào, nên tiền chưa hoàn cho nhóm nào. Kiểm tra lại ngày tháng nhé.</div>` : ''}
      ${r.ambiguousGuests.length ? `<div class="note" style="margin-top:14px">Có ${r.ambiguousGuests.length}
        lượt vãng lai vào ngày có nhiều nhóm cùng đánh, chưa rõ thuộc nhóm nào nên tiền chưa được hoàn.
        Hãy xoá rồi thêm lại bằng nút <b>+ Vãng lai</b> ở đúng dòng buổi.</div>` : ''}
      ${dupDays.length ? `<div class="note" style="margin-top:14px">Ngày ${dupDays.map(dayLabel).join(', ')}
        có nhiều nhóm cùng đánh. Khi thêm vãng lai, nhớ bấm nút <b>+ Vãng lai</b> ngay trên dòng buổi
        để tiền vào đúng nhóm.</div>` : ''}
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
          <p class="sub">Tổng ${vnd(total)}${r.totalRegisteredSessions
            ? ` · chia theo số buổi đăng ký (${r.totalRegisteredSessions} lượt) → ${vnd(total / r.totalRegisteredSessions)}/buổi/người`
            : ''}</p></div>
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
      vào khoản phải đóng, nên không cần hoàn tiền mặt riêng.<br>
      Tiền cầu chia theo số buổi đăng ký trong tháng: ai đánh 2 buổi/tuần gánh gấp đôi ai đánh 1 buổi/tuần.</div>`
      : '<div class="empty">Tháng này chưa mua cầu.</div>'}
    </section>`;
  }

  /* =====================================================================
   *  PAGE: ĐĂNG KÝ THÁNG
   * ===================================================================*/
  function pageRegister() {
    const cfg = monthCfg();
    const r = rep();
    const groups = r.groupNames;
    const actives = S.db.members.filter((m) => m.active);
    const prevHas = S.db.fixed.some((f) => f.month === Calc.prevMonth(S.month));

    const regs = new Map(r.rows.filter((x) => x.isFixed).map((x) => [x.memberId, new Set(x.groups)]));
    const has = (id, g) => regs.has(id) && regs.get(id).has(g);

    const body = !groups.length
      ? `<div class="empty">Chưa có buổi đánh nào trong tháng, nên chưa biết có những nhóm nào.<br>
         Sang tab <b>Buổi đánh</b> → <b>Tạo nhanh cả tháng</b> trước đã.</div>`
      : !actives.length
      ? '<div class="empty">Chưa có thành viên nào. Sang tab <b>Thành viên</b> để thêm.</div>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Thành viên</th>
            ${groups.map((g) => `<th style="text-align:center">${esc(g)}<br>
              <span class="muted small" style="font-weight:400">${(r.groups.find((x) => x.name === g) || {}).sessionCount || 0} buổi</span></th>`).join('')}
            <th class="num">Buổi/tháng</th><th class="num">Tiền sân</th></tr></thead>
          <tbody>${actives.map((m) => {
            const row = r.rows.find((x) => x.memberId === m.id);
            return `<tr>
              <td><b>${esc(m.name)}</b></td>
              ${groups.map((g) => `<td style="text-align:center">
                <input type="checkbox" style="width:auto;accent-color:var(--accent);transform:scale(1.25)"
                  data-act="toggle-fixed" data-id="${esc(m.id)}" data-group="${esc(g)}"
                  ${has(m.id, g) ? 'checked' : ''} aria-label="${esc(m.name)} – ${esc(g)}"></td>`).join('')}
              <td class="num muted">${row && row.registeredSessions ? row.registeredSessions : '–'}</td>
              <td class="num">${row && row.courtShare ? vnd(row.courtShare - row.guestCredit) : '–'}</td>
            </tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td>Số người</td>
            ${groups.map((g) => {
              const gg = r.groups.find((x) => x.name === g) || { memberCount: 0 };
              return `<td class="num" style="text-align:center">${gg.memberCount}</td>`;
            }).join('')}
            <td class="num">${r.totalRegisteredSessions}</td><td></td></tr></tfoot>
        </table></div>`;

    return `<section class="card">
      <div class="card-head">
        <div><h2>Đăng ký cố định ${Calc.fmtMonthVi(S.month)}</h2>
          <p class="sub">Tick từng buổi trong tuần. Ai đánh cả hai thì tick cả hai — tiền sân sẽ cộng lại.</p></div>
        <div class="toolbar">
          ${prevHas ? '<button class="btn btn-sm" data-act="copy-prev-fixed">Chép từ tháng trước</button>' : ''}
          <button class="btn btn-sm btn-ghost" data-act="clear-fixed">Bỏ chọn hết</button>
        </div>
      </div>
      ${body}
      ${groups.length ? `<div class="note info" style="margin-top:16px">
        Tiền sân mỗi nhóm chia riêng: ${r.groups.map((g) =>
          `<b>${esc(g.name)}</b> ${vnd(g.courtTotal)} ÷ ${g.memberCount || 0} người`).join(' · ')}.
        Tiền cầu chia theo số buổi đăng ký, nên người đánh 2 buổi/tuần gánh gấp đôi người đánh 1 buổi.</div>` : ''}
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
      <h2>Nhận tiền qua QR (VietQR)</h2>
      <p class="sub">Điền số tài khoản để mỗi dòng trong <b>Bảng thu tiền</b> có nút "QR" tạo mã chuyển khoản
        đúng sẵn số tiền người đó còn thiếu.</p>
      ${sel('bankBin', 'Ngân hàng', [{ v: '', t: '— Chọn ngân hàng —' }].concat(
          BANKS.map((b) => ({ v: b.bin, t: `${b.name} (${b.code})` }))), st.bankBin)
        .replace('name="bankBin"', 'data-act="set-bank-bin"')}
      <div class="grid2">
        ${fld('bkAcc', 'Số tài khoản', 'text', st.bankAccountNo, 'data-act="set-bank-stk" inputmode="numeric"')}
        ${fld('bkName', 'Tên chủ tài khoản', 'text', st.bankAccountName, 'data-act="set-bank-holder" placeholder="NGUYEN VAN A"')}
      </div>
      <label class="field"><span>Mẫu nội dung chuyển khoản</span>
        <input type="text" value="${esc(st.transferTemplate)}" data-act="set-transfer-template"></label>
      <p class="hint">Dùng <code>{ten}</code>, <code>{thang}</code>, <code>{nam}</code>, <code>{club}</code> —
        app tự thay bằng tên người đóng/tháng/năm/tên CLB, rồi bỏ dấu + viết hoa cho hợp với mọi ngân hàng.</p>
      ${st.bankBin && st.bankAccountNo
        ? `<div class="note info">Đã sẵn sàng: ${esc(st.bankShortName)} · STK ${esc(st.bankAccountNo)}${st.bankAccountName ? ' · ' + esc(st.bankAccountName) : ''}</div>`
        : `<div class="note">Chưa đủ thông tin — chọn ngân hàng và nhập số tài khoản để dùng được nút QR.</div>`}
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
    const group = el.dataset.group || '';
    // id lạ (chứa dấu nháy) sẽ làm vỡ selector -> bỏ qua cho an toàn
    if (/["'\\]/.test(id) || /["'\\]/.test(group) || /["'\\]/.test(el.dataset.act)) return null;
    let start = null, end = null;
    try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { /* input number */ }
    return { act: el.dataset.act, id, group, start, end, scroll: window.scrollY };
  }

  function restoreFocus(k) {
    if (!k) return;
    let el = null;
    try {
      let base = `#main [data-act="${k.act}"]`;
      if (k.group) base += `[data-group="${k.group}"]`;
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
      const id = el.dataset.id, group = el.dataset.group, on = el.checked;
      const groups = Calc.monthGroups(S.db, S.month);
      mutate((db) => {
        // Bung bản ghi "cả tháng" (*) thành từng nhóm cụ thể trước khi sửa
        const mine = db.fixed.filter((f) => f.month === S.month && f.memberId === id);
        let set = new Set();
        mine.forEach((f) => {
          if (!f.group || f.group === Calc.ALL) groups.forEach((g) => set.add(g));
          else set.add(f.group);
        });
        if (on) set.add(group); else set.delete(group);
        db.fixed = db.fixed.filter((f) => !(f.month === S.month && f.memberId === id))
          .concat(Array.from(set).map((g) => ({ month: S.month, memberId: id, group: g })));
      });
    },
    'copy-prev-fixed'() {
      const prev = Calc.prevMonth(S.month);
      const prevGroups = Calc.monthGroups(S.db, prev);
      const curGroups = Calc.monthGroups(S.db, S.month);
      mutate((db) => {
        const rows = [];
        db.fixed.filter((f) => f.month === prev).forEach((f) => {
          const targets = (!f.group || f.group === Calc.ALL) ? prevGroups : [f.group];
          targets.forEach((g) => {
            if (curGroups.indexOf(g) === -1) return;   // tháng này không có nhóm đó
            rows.push({ month: S.month, memberId: f.memberId, group: g });
          });
        });
        db.fixed = db.fixed.filter((f) => f.month !== S.month).concat(rows);
      });
      const missing = prevGroups.filter((g) => curGroups.indexOf(g) === -1);
      toast(missing.length
        ? `Đã chép từ ${Calc.fmtMonthVi(prev)} (bỏ qua nhóm ${missing.join(', ')} vì tháng này không có)`
        : 'Đã chép danh sách từ ' + Calc.fmtMonthVi(prev));
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
          let added = 0;
          mutate((db) => {
            db.settings.defaultWeekdays = days;
            dates.forEach((date) => {
              if (db.sessions.some((s) => s.date === date)) return;
              db.sessions.push({
                id: uid(), month: S.month, date,
                group: Calc.defaultGroup(date), cost: null, note: '',
              });
              added++;
            });
          });
          toast(`Đã tạo ${added} buổi (${days.map((i) => DOW[i]).join(', ')})`);
        }, 'Tạo');
    },
    'add-session'() {
      modal('Thêm buổi đánh',
        fld('date', 'Ngày', 'date', S.month + '-01', 'required') +
        groupField('') +
        fld('cost', 'Tiền sân (để trống = giá mặc định)', 'number', '', 'step="any"') +
        fld('note', 'Ghi chú', 'text', ''),
        (d) => {
          if (!d.date) throw new Error('Chưa chọn ngày.');
          mutate((db) => db.sessions.push({
            id: uid(), month: Calc.monthKeyOf(d.date), date: d.date,
            group: (d.group || '').trim() || Calc.defaultGroup(d.date),
            cost: d.cost === '' ? null : Calc.num(d.cost), note: d.note,
          }));
        });
    },
    'edit-session'(el) {
      const s = S.db.sessions.find((x) => x.id === el.dataset.id);
      modal('Sửa buổi đánh',
        fld('date', 'Ngày', 'date', s.date, 'required') +
        groupField(s.group) +
        fld('cost', 'Tiền sân (để trống = giá mặc định)', 'number', s.cost == null ? '' : s.cost, 'step="any"') +
        fld('note', 'Ghi chú', 'text', s.note),
        (d) => {
          if (!d.date) throw new Error('Chưa chọn ngày.');
          const moving = S.db.guests.filter((g) => guestBelongs(g, s));
          mutate(() => {
            s.date = d.date; s.month = Calc.monthKeyOf(d.date);
            s.group = (d.group || '').trim() || Calc.defaultGroup(d.date);
            s.cost = d.cost === '' ? null : Calc.num(d.cost); s.note = d.note;
            // Kéo các lượt vãng lai của buổi đi theo, kẻo chúng thành mồ côi
            moving.forEach((g) => { g.sessionId = s.id; g.date = s.date; g.month = s.month; });
          });
        });
    },
    'del-session'(el) {
      const id = el.dataset.id;
      const s = S.db.sessions.find((x) => x.id === id);
      if (!s) return;
      // Chỉ xoá lượt vãng lai nào không còn thuộc buổi nào khác
      // (hai sân cùng ngày cùng nhóm thì khách vẫn còn chỗ để bám vào).
      const gs = S.db.guests.filter((g) => guestBelongs(g, s)
        && !S.db.sessions.some((x) => x.id !== id && guestBelongs(g, x)));
      if (!confirm(gs.length
        ? `Xoá buổi ${dayLabel(s.date)} (nhóm ${s.group})?\n` +
          `${gs.length} lượt vãng lai của buổi này sẽ bị xoá theo.`
        : `Xoá buổi ${dayLabel(s.date)} (nhóm ${s.group})?`)) return;
      const doomed = new Set(gs.map((g) => g.id));
      mutate((db) => {
        db.sessions = db.sessions.filter((x) => x.id !== id);
        db.guests = db.guests.filter((g) => !doomed.has(g.id));
      });
    },

    /* ---- vãng lai ---- */
    'add-guest'(el) {
      const cfg = monthCfg();
      const list = S.db.sessions.filter((s) => s.month === S.month)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!list.length) { toast('Hãy tạo buổi đánh trước đã.', true); return; }
      const opts = list.map((s) => ({ v: s.id, t: `${dayLabel(s.date)} · nhóm ${s.group}` }));
      const preset = el.dataset.session
        || (el.dataset.date && (list.find((s) => s.date === el.dataset.date) || {}).id)
        || opts[0].v;
      modal('Thêm lượt đánh vãng lai',
        sel('sessionId', 'Buổi', opts, preset) +
        sel('memberId', 'Là thành viên CLB?', memberOptions('— Khách ngoài, thu tiền mặt —'), '') +
        fld('name', 'Tên (nếu là khách ngoài)', 'text', '') +
        fld('amount', 'Số tiền (đ)', 'number', cfg.guestFee, 'step="any"') +
        `<label class="check"><input type="checkbox" name="paid"><span>Khách ngoài đã trả tiền</span></label>`,
        (d) => {
          if (!d.memberId && !d.name.trim()) throw new Error('Nhập tên khách hoặc chọn thành viên.');
          const s = list.find((x) => x.id === d.sessionId);
          if (!s) throw new Error('Chưa chọn buổi.');
          mutate((db) => db.guests.push({
            id: uid(), month: s.month, sessionId: s.id, date: s.date,
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
        fld('date', 'Ngày mua', 'date', new Date().toISOString().slice(0, 10), 'required') +
        sel('buyerId', 'Người ứng tiền mua', memberOptions('— Trả bằng quỹ CLB —'), '') +
        `<div class="grid2">${fld('tubes', 'Số ống', 'number', 1, 'step="any"')}${fld('unitPrice', 'Đơn giá / ống (đ)', 'number', '', 'step="any"')}</div>` +
        fld('amount', 'Thành tiền (để trống = số ống × đơn giá)', 'number', '', 'step="any"') +
        fld('note', 'Ghi chú', 'text', ''),
        (d) => {
          if (!d.date) throw new Error('Chưa chọn ngày mua.');
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
        fld('date', 'Ngày mua', 'date', s.date, 'required') +
        sel('buyerId', 'Người ứng tiền mua', memberOptions('— Trả bằng quỹ CLB —'), s.buyerId) +
        `<div class="grid2">${fld('tubes', 'Số ống', 'number', s.tubes, 'step="any"')}${fld('unitPrice', 'Đơn giá / ống (đ)', 'number', s.unitPrice, 'step="any"')}</div>` +
        fld('amount', 'Thành tiền', 'number', s.amount, 'step="any"') +
        fld('note', 'Ghi chú', 'text', s.note),
        (d) => mutate(() => {
          if (!d.date) throw new Error('Chưa chọn ngày mua.');
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

    /* ---- QR chuyển khoản ---- */
    'qr'(el) {
      const st = S.db.settings;
      if (!st.bankBin || !st.bankAccountNo) {
        toast('Chưa cấu hình ngân hàng nhận tiền — vào tab Cài đặt để thêm số tài khoản.', true);
        return;
      }
      const r = rep();
      const x = r.rows.find((row) => row.memberId === el.dataset.id);
      if (!x) return;
      const amount = Math.round(x.closing);
      if (amount <= 0) { toast(`${x.name} không còn phải đóng khoản nào.`); return; }

      const [y, m] = S.month.split('-');
      const rawInfo = renderQrTemplate(st.transferTemplate, {
        ten: x.name, thang: String(Number(m)), nam: y, club: st.clubName || '',
      });
      const info = stripDiacritics(rawInfo).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim() || 'CHUYEN TIEN SAN CAU';
      const holder = stripDiacritics(st.bankAccountName || '').toUpperCase().trim();
      const qrUrl = 'https://img.vietqr.io/image/' + encodeURIComponent(st.bankBin) +
        '-' + encodeURIComponent(st.bankAccountNo) + '-compact2.png' +
        '?amount=' + amount + '&addInfo=' + encodeURIComponent(info) +
        (holder ? '&accountName=' + encodeURIComponent(holder) : '');

      const body = `
        <div style="text-align:center">
          <img src="${esc(qrUrl)}" alt="QR chuyển khoản" style="max-width:100%;border-radius:12px;border:1px solid var(--line)">
          <div style="margin-top:14px;font-size:17px;font-weight:700">${esc(x.name)} — ${vnd(amount)}</div>
          <div class="muted small" style="margin-top:4px">${esc(st.bankShortName || '')} · STK ${esc(st.bankAccountNo)}${holder ? ' · ' + esc(holder) : ''}</div>
          <div class="muted small" style="margin-top:2px">Nội dung: ${esc(info)}</div>
        </div>
        <div class="toolbar" style="justify-content:center;margin-top:16px">
          <button type="button" class="btn btn-primary" data-act="download-qr"
            data-qrurl="${esc(qrUrl)}" data-name="${esc(x.name)}" data-amount="${amount}"
            data-note="${esc(info)}" data-bank="${esc(st.bankShortName || '')}"
            data-stk="${esc(st.bankAccountNo)}" data-holder="${esc(holder)}">Tải ảnh</button>
          <button type="button" class="btn" data-act="copy-qr-note" data-note="${esc(info)}">Sao chép nội dung CK</button>
        </div>`;
      modal(`QR chuyển khoản — ${x.name}`, body, () => {}, 'Đóng');
    },
    async 'download-qr'(el) {
      const qrUrl = el.dataset.qrurl;
      try {
        const img = await loadImageCors(qrUrl);
        const canvas = buildQrCard(img, [
          el.dataset.name, vnd(Number(el.dataset.amount)),
          (el.dataset.bank ? el.dataset.bank + ' · ' : '') + 'STK ' + el.dataset.stk +
            (el.dataset.holder ? ' · ' + el.dataset.holder : ''),
          'ND: ' + el.dataset.note,
        ]);
        const blob = await canvasToBlob(canvas);
        triggerBlobDownload(blob, `QR-${slugify(el.dataset.name)}.png`);
        toast('Đã tải ảnh QR');
      } catch (e) {
        // Trình duyệt chặn đọc ảnh cross-origin để ghép — mở ảnh gốc cho người dùng tự lưu.
        window.open(qrUrl, '_blank');
        toast('Không ghép được ảnh tự động — đã mở ảnh QR ở tab mới, bạn chạm giữ hoặc chuột phải để lưu.', true);
      }
    },
    async 'copy-qr-note'(el) {
      try { await navigator.clipboard.writeText(el.dataset.note); toast('Đã sao chép nội dung chuyển khoản'); }
      catch (e) { toast('Không sao chép được, bạn tự bôi đen nội dung nhé.', true); }
    },
    'set-bank-bin'(el) {
      const b = BANKS.find((x) => x.bin === el.value);
      mutate((db) => { db.settings.bankBin = el.value; db.settings.bankShortName = b ? b.name : ''; });
    },
    'set-bank-stk'(el) { mutate((db) => { db.settings.bankAccountNo = el.value.trim(); }); },
    'set-bank-holder'(el) { mutate((db) => { db.settings.bankAccountName = el.value.trim(); }); },
    'set-transfer-template'(el) { mutate((db) => { db.settings.transferTemplate = el.value; }); },

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
      const head = ['Thành viên', 'Buổi đăng ký', 'Số buổi/tháng', 'Nợ/dư cũ', 'Tiền sân', 'Tiền cầu',
        'Hoàn vãng lai', 'Cầu đã mua', 'Phí vãng lai', 'Cần đóng', 'Đã đóng', 'Còn lại'];
      const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = [head.join(',')].concat(r.rows.map((x) => [
        q(x.name), q(x.groups.join('+')), x.registeredSessions,
        x.opening, x.courtShare, x.shuttleShare,
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

/* =========================================================================
 * api.js — Lớp lưu trữ.
 *   • Chế độ "sheets": đọc/ghi qua Google Apps Script Web App.
 *   • Chế độ "local" : lưu trong localStorage của trình duyệt (dùng để thử,
 *                      hoặc khi chưa cấu hình Google Sheet).
 * Luôn giữ một bản cache trong localStorage để mở app là thấy dữ liệu ngay,
 * kể cả khi mạng chậm.
 * ========================================================================= */
(function (global) {
  'use strict';

  const CFG_KEY = 'clb.config';
  const CACHE_KEY = 'clb.cache';

  function loadConfig() {
    try {
      return Object.assign(
        { mode: 'local', url: '', token: '', autoSave: true },
        JSON.parse(localStorage.getItem(CFG_KEY) || '{}')
      );
    } catch (e) {
      return { mode: 'local', url: '', token: '', autoSave: true };
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function writeCache(db) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(db)); } catch (e) {}
  }

  /**
   * Gọi Apps Script. Dùng POST + Content-Type text/plain để tránh preflight
   * CORS (Apps Script không trả lời OPTIONS).
   */
  async function call(cfg, payload) {
    if (!cfg.url) throw new Error('Chưa cấu hình URL Google Apps Script.');
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify(Object.assign({ token: cfg.token }, payload)),
    });
    if (!res.ok) throw new Error('Máy chủ trả về lỗi HTTP ' + res.status);
    const text = await res.text();
    let out;
    try { out = JSON.parse(text); }
    catch (e) {
      throw new Error('Phản hồi không hợp lệ. Kiểm tra lại quyền truy cập của Web App ' +
                      '(phải là "Bất kỳ ai").');
    }
    return out;
  }

  const Api = {
    config: loadConfig(),

    setConfig(patch) {
      Object.assign(this.config, patch);
      saveConfig(this.config);
      return this.config;
    },

    async ping() {
      const r = await call(this.config, { action: 'load' });
      if (!r.ok) throw new Error(r.error || 'Không kết nối được.');
      return r;
    },

    /** Trả về { db, source } — source: 'sheets' | 'cache' | 'local' | 'new' */
    async load() {
      if (this.config.mode === 'sheets') {
        try {
          const r = await call(this.config, { action: 'load' });
          if (!r.ok) throw new Error(r.error || 'Không tải được dữ liệu.');
          const db = Calc.normalize(r.data);
          writeCache(db);
          return { db, source: 'sheets' };
        } catch (err) {
          const cached = readCache();
          if (cached) return { db: Calc.normalize(cached), source: 'cache', error: err.message };
          throw err;
        }
      }
      const cached = readCache();
      if (cached) return { db: Calc.normalize(cached), source: 'local' };
      return { db: Calc.emptyDb(), source: 'new' };
    },

    /** Lưu. Trả về { ok, rev, remote } */
    async save(db) {
      writeCache(db);
      if (this.config.mode !== 'sheets') return { ok: true, remote: false, rev: db.rev };
      const r = await call(this.config, { action: 'save', data: db, baseRev: db.rev });
      if (!r.ok) {
        const e = new Error(r.error || 'Lưu thất bại.');
        e.conflict = !!r.conflict;
        e.serverRev = r.serverRev;
        throw e;
      }
      db.rev = r.rev;
      writeCache(db);
      return { ok: true, remote: true, rev: r.rev };
    },

    exportJson(db) {
      return JSON.stringify(db, null, 2);
    },

    importJson(text) {
      return Calc.normalize(JSON.parse(text));
    },
  };

  global.Api = Api;
})(window);

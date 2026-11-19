/* OH SNAP! - Klien Cloud Bersama (Supabase Realtime + 3-Way Multi-Device Instant Sync + Hardened Security) */
(function () {
  const SUPABASE_URL = 'https://kbkayevpbeijuuufnrgt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_AG1wxrYq1moobWYJjC6htQ_TB-Siffl';
  const TABLE = 'cms_settings';
  const BUCKET = 'ohsnap-media';
  // ==========================================================================
  // GOOGLE SPREADSHEET (Apps Script Web App) - SATU-SATUNYA TEMPAT MENGISI URL
  // Isi dengan URL "Web app" hasil Deploy, formatnya:
  //   https://script.google.com/macros/s/AKfycb.........../exec
  // BUKAN URL "library" (/macros/library/d/...) dan BUKAN Script ID.
  // ==========================================================================
  const SHEET_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyum2HVg2InZDhEyeata3I2hTbPUQzzqyKHsEtgA9Z3vRCF2CeTjwzGTCHd4tszlOMm/exec';

  // Cek format URL Web App. Mengembalikan { ok, reason }
  function checkSheetUrl(url) {
    const u = String(url || '').trim();
    if (!u) {
      return { ok: false, reason: 'URL Web App Apps Script belum diisi di cms-cloud.js (SHEET_SCRIPT_URL).' };
    }
    if (/\/macros\/library\//i.test(u)) {
      return { ok: false, reason: 'URL yang dipakai adalah URL "library" Apps Script, bukan URL Web App. Gunakan URL hasil Deploy > Web app yang berakhiran /exec.' };
    }
    if (/\/macros\/s\/[^/]+\/dev\/?$/i.test(u)) {
      return { ok: false, reason: 'URL berakhiran /dev (mode test, hanya bisa dibuka pemilik script). Gunakan URL Web App yang berakhiran /exec.' };
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/i.test(u)) {
      return { ok: false, reason: 'Format URL Web App tidak valid. Seharusnya: https://script.google.com/macros/s/AKfycb.../exec' };
    }
    return { ok: true, reason: '' };
  }

  // Parse respons Apps Script secara aman (bisa berupa JSON, atau HTML jika deployment/izin salah)
  function parseSheetResponse(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('Server Apps Script mengembalikan respons kosong.');
    if (raw.charAt(0) === '<') {
      throw new Error('Server sedang melakukan pemeliharaan atau izin akses Web App belum sesuai.');
    }
    try { return JSON.parse(raw); }
    catch (e) { throw new Error('Respons server tidak valid.'); }
  }

  // GET (ping) / POST aksi ke Apps Script, dengan timeout dan credentials: 'omit'
  async function sheetFetch(method, payloadOrParams, timeoutMs) {
    const chk = checkSheetUrl(SHEET_SCRIPT_URL);
    if (!chk.ok) { const e = new Error(chk.reason); e.code = 'BAD_URL'; throw e; }
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 25000) : null;
    try {
      let res;
      if (method === 'GET') {
        const qs = new URLSearchParams(Object.assign({ t: String(Date.now()) }, payloadOrParams || {})).toString();
        res = await fetch(SHEET_SCRIPT_URL + '?' + qs, {
          cache: 'no-store',
          credentials: 'omit',
          signal: ctrl ? ctrl.signal : undefined
        });
      } else {
        // text/plain = "simple request" -> tidak memicu preflight CORS yang tidak didukung Apps Script
        res = await fetch(SHEET_SCRIPT_URL, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payloadOrParams || {}),
          signal: ctrl ? ctrl.signal : undefined
        });
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' dari server.');
      return parseSheetResponse(await res.text());
    } catch (e) {
      if (e && e.name === 'AbortError') {
        const te = new Error('Permintaan ke server timeout (>' + Math.round((timeoutMs || 25000) / 1000) + ' detik).');
        te.code = 'TIMEOUT';
        throw te;
      }
      if (e instanceof TypeError) {
        const ne = new Error('Gagal terhubung ke server (jaringan/CORS).');
        ne.code = 'NETWORK';
        throw ne;
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const BASE_HEADERS = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY
  };

  let cache = null, cacheAt = 0;
  let baseCloudData = null;
  let lastKnownCloudTime = 0;
  let lastKnownUpdatedAtIso = '';
  let lastPullCheckAt = 0;
  let saveQueue = Promise.resolve();
  let isSavingInFlight = false;
  let pendingRemoteDuringSave = null;

  function deepClone(obj) {
    if (obj === null || obj === undefined) return obj;
    return JSON.parse(JSON.stringify(obj));
  }

  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Sanitasi judul: hanya izinkan tag <span>...</span> dan <br>, blokir semua script/event handler XSS
  function safeTitleHtml(str) {
    if (str === null || str === undefined) return '';
    return escHtml(str)
      .replace(/&lt;span&gt;/gi, '<span>')
      .replace(/&lt;\/span&gt;/gi, '</span>')
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  }

  // Percent-encode tanda kutip & tanda kurung agar aman di konteks atribut HTML maupun CSS url("...")
  function encodeCssUnsafeChars(u) {
    return u
      .replace(/"/g, '%22')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\\/g, '%5C');
  }

  // Sanitasi URL: hanya izinkan http://, https://, atau path lokal yang aman (blokir javascript:, vbscript:, data:text/html, //host)
  function safeUrl(url, fallback) {
    const fb = fallback !== undefined ? fallback : '#';
    if (!url || typeof url !== 'string') return fb;
    const clean = url.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
    if (!clean || clean === '#' || clean.startsWith('//')) return fb;
    const probe = clean.replace(/\s+/g, '');
    if (/^[a-z][a-z0-9+.\-]*:/i.test(probe)) {
      if (/^https?:\/\//i.test(probe)) return encodeCssUnsafeChars(clean);
      if (/^blob:/i.test(probe)) return encodeCssUnsafeChars(clean);
      if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(probe)) return clean;
      if (/^data:video\/(mp4|webm|quicktime);base64,/i.test(probe)) return clean;
      return fb;
    }
    if (/^images\/[a-zA-Z0-9._\-/]+$/.test(clean) && !clean.includes('..')) return clean;
    return fb;
  }

  function stripSensitiveForPublic(dataObj) {
    if (!dataObj || typeof dataObj !== 'object') return dataObj;
    const copy = deepClone(dataObj);
    delete copy.admins;
    delete copy.resendOverrides;
    return copy;
  }

  function getAdminToken() {
    try { return sessionStorage.getItem('ohsnap_admin_token') || ''; } catch (e) { return ''; }
  }

  function setKnownCloudTime(t) {
    const n = Number(t || 0);
    if (n > lastKnownCloudTime) lastKnownCloudTime = n;
  }

  function setBaseCloudData(dataObj) {
    if (dataObj && typeof dataObj === 'object') {
      baseCloudData = stripSensitiveForPublic(dataObj);
    }
  }

  function getBaseCloudData() {
    return baseCloudData ? deepClone(baseCloudData) : null;
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  // Perbandingan struktural mendalam (tidak terpengaruh urutan properti objek & membedakan null vs undefined)
  function isEqualJson(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!isEqualJson(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === 'object') {
      const ka = Object.keys(a).filter(k => a[k] !== undefined);
      const kb = Object.keys(b).filter(k => b[k] !== undefined);
      if (ka.length !== kb.length) return false;
      for (let i = 0; i < ka.length; i++) {
        const k = ka[i];
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!isEqualJson(a[k], b[k])) return false;
      }
      return true;
    }
    return false;
  }

  // True untuk array kosong [] maupun array objek yang seluruh item-nya memiliki _uid valid
  function isUidOrEmptyArray(arr) {
    if (!Array.isArray(arr)) return false;
    return arr.every(item => isPlainObject(item) && typeof item._uid === 'string' && item._uid.trim() !== '');
  }

  // Hash deterministik sederhana (FNV-1a 32-bit) untuk migrasi _uid data legacy agar identik di semua perangkat
  function stableHash32(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function ensureStableItemUids(dataObj) {
    if (!isPlainObject(dataObj)) return dataObj;
    ['videos', 'studios', 'promos', 'frames', 'services', 'locations'].forEach(arrKey => {
      if (Array.isArray(dataObj[arrKey])) {
        dataObj[arrKey].forEach((item, idx) => {
          if (isPlainObject(item) && (typeof item._uid !== 'string' || item._uid.trim() === '')) {
            const fingerprint = arrKey + ':' + idx + ':' + (item.title || item.titleId || item.name || item.url || item.img || '');
            item._uid = 'mig-' + arrKey + '-' + (idx + 1) + '-' + stableHash32(fingerprint);
          }
        });
      }
    });
    return dataObj;
  }

  function isPrimitiveArray(arr) {
    if (!Array.isArray(arr)) return false;
    return arr.every(v => v === null || (typeof v !== 'object' && typeof v !== 'function'));
  }

  // 3-Way Merge untuk array primitif (misalnya array teks tanpa _uid): jaga tambahan kedua sisi & hormati penghapusan
  function mergePrimitiveArray(baseArr, remoteArr, localArr, preferLocalOnBothChanged) {
    const baseSet = new Set(baseArr);
    const remoteSet = new Set(remoteArr);
    const localSet = new Set(localArr);

    const primary = preferLocalOnBothChanged ? localArr : remoteArr;
    const secondary = preferLocalOnBothChanged ? remoteArr : localArr;
    const primaryDeleted = new Set([...baseSet].filter(x => !(preferLocalOnBothChanged ? localSet : remoteSet).has(x)));
    const secondaryDeleted = new Set([...baseSet].filter(x => !(preferLocalOnBothChanged ? remoteSet : localSet).has(x)));

    const result = [];
    const seen = new Set();

    primary.forEach(item => {
      if (secondaryDeleted.has(item)) return;
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    });

    secondary.forEach((item, idx) => {
      if (seen.has(item) || primaryDeleted.has(item)) return;
      seen.add(item);
      // Pertahankan posisi relatif di tengah bila item baru disisip di tengah
      let inserted = false;
      for (let p = idx - 1; p >= 0; p--) {
        const pos = result.indexOf(secondary[p]);
        if (pos !== -1) {
          result.splice(pos + 1, 0, item);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        for (let n = idx + 1; n < secondary.length; n++) {
          const pos = result.indexOf(secondary[n]);
          if (pos !== -1) {
            result.splice(pos, 0, item);
            inserted = true;
            break;
          }
        }
      }
      if (!inserted) result.push(item);
    });

    return result;
  }

  // 3-Way Merge array berbasis _uid: aman untuk array kosong [], hapus+edit, sisip di tengah, & ubah urutan
  function mergeUidArray(baseArr, remoteArr, localArr, preferLocalOnBothChanged) {
    const baseMap = new Map();
    const remoteMap = new Map();
    const localMap = new Map();

    baseArr.forEach(item => { if (isPlainObject(item) && item._uid) baseMap.set(item._uid, item); });
    remoteArr.forEach(item => { if (isPlainObject(item) && item._uid) remoteMap.set(item._uid, item); });
    localArr.forEach(item => { if (isPlainObject(item) && item._uid) localMap.set(item._uid, item); });

    const mergedMap = new Map();
    const allUids = new Set([...baseMap.keys(), ...remoteMap.keys(), ...localMap.keys()]);

    allUids.forEach(uid => {
      const inB = baseMap.has(uid);
      const inR = remoteMap.has(uid);
      const inL = localMap.has(uid);
      const bItem = baseMap.get(uid);
      const rItem = remoteMap.get(uid);
      const lItem = localMap.get(uid);

      if (inB) {
        if (inR && inL) {
          mergedMap.set(uid, deepMergeCMS(bItem, rItem, lItem, preferLocalOnBothChanged));
        } else if (inR && !inL) {
          // Dihapus secara lokal: tetap dihapus jika remote tidak mengubahnya; pertahankan jika remote mengeditnya
          if (!isEqualJson(rItem, bItem)) {
            mergedMap.set(uid, deepClone(rItem));
          }
        } else if (!inR && inL) {
          // Dihapus secara remote: tetap dihapus jika lokal tidak mengubahnya; pertahankan jika lokal mengeditnya
          if (!isEqualJson(lItem, bItem)) {
            mergedMap.set(uid, deepClone(lItem));
          }
        }
      } else {
        if (inR && inL) {
          mergedMap.set(uid, deepMergeCMS(undefined, rItem, lItem, preferLocalOnBothChanged));
        } else if (inR) {
          mergedMap.set(uid, deepClone(rItem));
        } else if (inL) {
          mergedMap.set(uid, deepClone(lItem));
        }
      }
    });

    // Deteksi perubahan urutan HANYA pada irisan item yang hadir di base, sisi tersebut, DAN hasil sekaligus
    // (sehingga item yang dihapus di satu sisi tapi dipertahankan karena diedit di sisi lain TIDAK memicu false reorder)
    const baseInRemote = baseArr.filter(x => x && x._uid && remoteMap.has(x._uid) && mergedMap.has(x._uid)).map(x => x._uid);
    const remoteInBase = remoteArr.filter(x => x && x._uid && baseMap.has(x._uid) && mergedMap.has(x._uid)).map(x => x._uid);

    const baseInLocal = baseArr.filter(x => x && x._uid && localMap.has(x._uid) && mergedMap.has(x._uid)).map(x => x._uid);
    const localInBase = localArr.filter(x => x && x._uid && baseMap.has(x._uid) && mergedMap.has(x._uid)).map(x => x._uid);

    const remoteReordered = !isEqualJson(remoteInBase, baseInRemote);
    const localReordered = !isEqualJson(localInBase, baseInLocal);

    let primaryArr, secondaryArr;
    if (localReordered && !remoteReordered) {
      primaryArr = localArr;
      secondaryArr = remoteArr;
    } else if (remoteReordered && !localReordered) {
      primaryArr = remoteArr;
      secondaryArr = localArr;
    } else {
      primaryArr = preferLocalOnBothChanged ? localArr : remoteArr;
      secondaryArr = preferLocalOnBothChanged ? remoteArr : localArr;
    }

    const result = [];
    const seen = new Set();

    primaryArr.forEach(item => {
      if (item && item._uid && mergedMap.has(item._uid) && !seen.has(item._uid)) {
        seen.add(item._uid);
        result.push(mergedMap.get(item._uid));
      }
    });

    // Sisipkan item dari secondaryArr (item baru di tengah atau item editan yang terhapus di primary) pada posisi relatif aslinya
    secondaryArr.forEach((item, idx) => {
      if (!item || !item._uid || !mergedMap.has(item._uid) || seen.has(item._uid)) return;
      const uid = item._uid;
      seen.add(uid);
      const val = mergedMap.get(uid);

      let inserted = false;
      // Cari item terdekat sebelumnya di secondaryArr yang sudah ada di result
      for (let p = idx - 1; p >= 0; p--) {
        const prevUid = secondaryArr[p] && secondaryArr[p]._uid;
        if (!prevUid) continue;
        const pos = result.findIndex(x => x && x._uid === prevUid);
        if (pos !== -1) {
          result.splice(pos + 1, 0, val);
          inserted = true;
          break;
        }
      }
      // Jika tidak ada pendahulu (misal disisip di awal array), cari penerus terdekat di secondaryArr
      if (!inserted) {
        for (let n = idx + 1; n < secondaryArr.length; n++) {
          const nextUid = secondaryArr[n] && secondaryArr[n]._uid;
          if (!nextUid) continue;
          const pos = result.findIndex(x => x && x._uid === nextUid);
          if (pos !== -1) {
            result.splice(pos, 0, val);
            inserted = true;
            break;
          }
        }
      }
      if (!inserted) {
        result.push(val);
      }
    });

    mergedMap.forEach((val, uid) => {
      if (!seen.has(uid)) {
        seen.add(uid);
        result.push(val);
      }
    });

    return result;
  }

  // 3-Way Field-Level Merge: menggabungkan editan bersamaan (termasuk array kosong [], null base, & key terhapus)
  function deepMergeCMS(base, remote, local, preferLocalOnBothChanged) {
    if (isEqualJson(remote, local)) return deepClone(remote);

    // Key/nilai benar-benar baru (tidak ada di base)
    if (base === undefined) {
      if (remote === undefined) return deepClone(local);
      if (local === undefined) return deepClone(remote);
      if (Array.isArray(remote) && Array.isArray(local)) {
        const hasAny = remote.length > 0 || local.length > 0;
        if (hasAny && isUidOrEmptyArray(remote) && isUidOrEmptyArray(local)) {
          return mergeUidArray([], remote, local, preferLocalOnBothChanged);
        }
        if (hasAny && isPrimitiveArray(remote) && isPrimitiveArray(local)) {
          return mergePrimitiveArray([], remote, local, preferLocalOnBothChanged);
        }
        return deepClone(preferLocalOnBothChanged ? local : remote);
      }
      if (isPlainObject(remote) && isPlainObject(local)) {
        const outNew = {};
        const keysNew = new Set([...Object.keys(remote), ...Object.keys(local)]);
        keysNew.forEach(k => {
          if (k === 'admins' || k === 'resendOverrides') return;
          if (k === 'lastUpdated') {
            outNew[k] = Math.max(Number(remote.lastUpdated || 0), Number(local.lastUpdated || 0));
            return;
          }
          const mv = deepMergeCMS(undefined, remote[k], local[k], preferLocalOnBothChanged);
          if (mv !== undefined) outNew[k] = mv;
        });
        return outNew;
      }
      return deepClone(preferLocalOnBothChanged ? local : remote);
    }

    const localChanged = !isEqualJson(local, base);
    const remoteChanged = !isEqualJson(remote, base);

    if (!localChanged) return deepClone(remote);
    if (!remoteChanged) return deepClone(local);

    if (remote === undefined || local === undefined) {
      return deepClone(preferLocalOnBothChanged ? local : remote);
    }

    if (Array.isArray(remote) && Array.isArray(local)) {
      const baseArr = Array.isArray(base) ? base : [];
      const hasAnyElem = baseArr.length > 0 || remote.length > 0 || local.length > 0;
      const allValidUidOrEmpty = isUidOrEmptyArray(baseArr) && isUidOrEmptyArray(remote) && isUidOrEmptyArray(local);
      if (hasAnyElem && allValidUidOrEmpty) {
        return mergeUidArray(baseArr, remote, local, preferLocalOnBothChanged);
      }
      if (hasAnyElem && isPrimitiveArray(baseArr) && isPrimitiveArray(remote) && isPrimitiveArray(local)) {
        return mergePrimitiveArray(baseArr, remote, local, preferLocalOnBothChanged);
      }
      return deepClone(preferLocalOnBothChanged ? local : remote);
    }

    if (isPlainObject(remote) && isPlainObject(local)) {
      const baseObj = isPlainObject(base) ? base : {};
      const out = {};
      const allKeys = new Set([
        ...Object.keys(baseObj),
        ...Object.keys(remote),
        ...Object.keys(local)
      ]);
      allKeys.forEach(k => {
        if (k === 'admins' || k === 'resendOverrides') return;
        if (k === 'lastUpdated') {
          out[k] = Math.max(Number(remote.lastUpdated || 0), Number(local.lastUpdated || 0));
          return;
        }
        const mergedVal = deepMergeCMS(baseObj[k], remote[k], local[k], preferLocalOnBothChanged);
        if (mergedVal !== undefined) {
          out[k] = mergedVal;
        }
      });
      return out;
    }

    return deepClone(preferLocalOnBothChanged ? local : remote);
  }

  function applyLiveColorsToDocument(dataObj) {
    try {
      if (!dataObj || !dataObj.colors || typeof document === 'undefined') return;
      const r = document.documentElement.style;
      if (dataObj.colors.primary) r.setProperty('--primary', dataObj.colors.primary);
      if (dataObj.colors.secondary) r.setProperty('--secondary', dataObj.colors.secondary);
      if (dataObj.colors.bg) r.setProperty('--bg-main', dataObj.colors.bg);
      if (dataObj.colors.footer) r.setProperty('--footer-bg', dataObj.colors.footer);
    } catch (e) {}
  }

  function broadcastLocalStorageSync(publicClean) {
    try {
      const serialized = JSON.stringify(publicClean);
      const prev = localStorage.getItem('ohsnap_cms_data');
      localStorage.setItem('ohsnap_cms_data', serialized);
      if (publicClean.lastUpdated) {
        localStorage.setItem('ohsnap_cloud_synced_at', String(publicClean.lastUpdated));
      }
      if (prev !== serialized && typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'ohsnap_cms_data',
            newValue: serialized,
            oldValue: prev
          }));
        } catch (se) {
          window.dispatchEvent(new Event('storage'));
        }
        window.dispatchEvent(new CustomEvent('ohsnap:cloud-updated', { detail: publicClean }));
      }
    } catch (e) {}
  }

  // Ambil data CMS dari cloud dengan timeout 8 detik. opts.skipSyncTime = true untuk cek read-only tanpa mengubah state global.
  async function load(force, opts) {
    const skipSyncTime = Boolean(opts && opts.skipSyncTime);
    if (!force && cache && Date.now() - cacheAt < 1200) return cache;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=data,updated_at`, {
        headers: BASE_HEADERS,
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
        err.status = res.status;
        throw err;
      }
      const rows = await res.json();
      if (Array.isArray(rows) && rows[0] && rows[0].data && Object.keys(rows[0].data).length > 0) {
        const cleanData = ensureStableItemUids(stripSensitiveForPublic(rows[0].data));
        if (rows[0].updated_at) {
          const dbTs = new Date(rows[0].updated_at).getTime();
          if (!cleanData.lastUpdated || dbTs > Number(cleanData.lastUpdated)) {
            cleanData.lastUpdated = Math.max(Number(cleanData.lastUpdated || 0), dbTs);
          }
          if (!skipSyncTime) lastKnownUpdatedAtIso = String(rows[0].updated_at);
        }
        if (!skipSyncTime) {
          cache = cleanData;
          cacheAt = Date.now();
          if (cleanData.lastUpdated) setKnownCloudTime(cleanData.lastUpdated);
          if (!baseCloudData) setBaseCloudData(cleanData);
        }
        return cleanData;
      } else {
        if (!skipSyncTime) {
          cache = null;
          cacheAt = Date.now();
        }
        return null;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Cek ringan updated_at terlebih dahulu sebelum mengunduh penuh data CMS (hemat kuota egress Supabase)
  async function pullIfNewer(forceFull) {
    try {
      const now = Date.now();
      let cachedLocal = null;
      let localSyncedAt = 0;
      try {
        const raw = localStorage.getItem('ohsnap_cms_data');
        if (raw) cachedLocal = JSON.parse(raw);
        localSyncedAt = Number(localStorage.getItem('ohsnap_cloud_synced_at') || 0);
      } catch (e) {}

      // Cooldown 15 detik untuk pengunjung publik agar fokus tab berulang tidak menguras kuota Supabase
      const cooldownMs = getAdminToken() ? 1500 : 15000;
      if (!forceFull && cachedLocal && now - lastPullCheckAt < cooldownMs) {
        return cachedLocal;
      }
      lastPullCheckAt = now;

      if (!forceFull && cachedLocal && localSyncedAt > 0) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
        try {
          const headRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=updated_at`, {
            headers: BASE_HEADERS,
            cache: 'no-store',
            signal: ctrl ? ctrl.signal : undefined
          });
          if (headRes.ok) {
            const headRows = await headRes.json();
            if (Array.isArray(headRows) && headRows[0] && headRows[0].updated_at) {
              const remoteIso = String(headRows[0].updated_at);
              const remoteMs = new Date(remoteIso).getTime();
              lastKnownUpdatedAtIso = remoteIso;
              if (remoteMs <= localSyncedAt + 50) {
                return cachedLocal;
              }
            }
          }
        } catch (he) {
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      const remote = await load(true);
      if (!remote || Object.keys(remote).length === 0) return cachedLocal;
      const publicClean = stripSensitiveForPublic(remote);
      const remoteTime = Number(remote.lastUpdated || 0);
      try {
        localStorage.setItem('ohsnap_cms_data', JSON.stringify(publicClean));
        if (remoteTime) {
          localStorage.setItem('ohsnap_cloud_synced_at', String(remoteTime));
        }
      } catch (e) {}
      return publicClean;
    } catch (e) {
      console.warn('[OhSnapCloud] gagal ambil data cloud:', e.message || e);
      // Fallback opsional ke snapshot statis jika localStorage kosong dan Supabase sedang pause/offline
      try {
        if (!localStorage.getItem('ohsnap_cms_data')) {
          const snapRes = await fetch('content-snapshot.json', { cache: 'no-cache' });
          if (snapRes.ok) {
            const snap = stripSensitiveForPublic(await snapRes.json());
            if (snap && Object.keys(snap).length > 0) return snap;
          }
        }
      } catch (se) {}
      return null;
    }
  }

  // Login Admin Server-Side via RPC verify_admin_login
  async function loginAdmin(username, password) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_admin_login`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_username: username, p_password: password })
    });
    if (!res.ok) {
      const errText = await res.text();
      const err = new Error('HTTP ' + res.status + ': ' + errText.slice(0, 160));
      err.status = res.status;
      throw err;
    }
    return await res.json();
  }

  // Logout Admin Server-Side: hapus sesi & izin storage di Supabase + bersihkan cache token di Apps Script
  async function logoutAdminSession(explicitToken) {
    const token = explicitToken || getAdminToken();
    if (!token) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/logout_admin_session`, {
        method: 'POST',
        keepalive: true,
        headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ p_token: token })
      });
    } catch (e) {}
    try {
      const chk = checkSheetUrl(SHEET_SCRIPT_URL);
      if (chk.ok) {
        await fetch(SHEET_SCRIPT_URL, {
          method: 'POST',
          keepalive: true,
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'invalidateToken', token: token })
        });
      }
    } catch (e) {}
  }

  // Simpan data CMS ke cloud secara berurutan (antrean mutex) dengan 3-Way Auto-Merge jika diedit bersamaan
  function save(data, expectedMinTime, forceOverwrite, createSnapshot) {
    const localSnapshot = ensureStableItemUids(stripSensitiveForPublic(data));
    delete localSnapshot.lastUpdated; // Server yang menentukan timestamp resmi

    const task = saveQueue.catch(() => {}).then(async () => {
      const token = getAdminToken();
      if (!token) {
        const authErr = new Error('Sesi login telah berakhir. Silakan login kembali.');
        authErr.status = 401;
        throw authErr;
      }

      isSavingInFlight = true;
      try {
        let payloadToSend = localSnapshot;
        let minTimeToUse = lastKnownCloudTime > 0 ? lastKnownCloudTime : Number(expectedMinTime || 0);
        let mergedFromRemote = false;

        if (forceOverwrite) {
          try {
            const latest = await load(true, { skipSyncTime: true });
            if (latest && latest.lastUpdated) {
              minTimeToUse = Math.max(minTimeToUse, Number(latest.lastUpdated));
            }
          } catch (e) {}
        }

        async function attemptRpcSave(bodyObj, minTs) {
          const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timer = ctrl ? setTimeout(() => ctrl.abort(), 14000) : null;
          try {
            return await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_cms_secure`, {
              method: 'POST',
              headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                p_token: token,
                p_data: bodyObj,
                p_expected_min_time: minTs,
                p_create_snapshot: Boolean(createSnapshot)
              }),
              signal: ctrl ? ctrl.signal : undefined
            });
          } finally {
            if (timer) clearTimeout(timer);
          }
        }

        // Hingga 3 percobaan otomatis jika ada device lain yang menyimpan di milidetik yang sama
        for (let attempt = 0; attempt < 3; attempt++) {
          let rpcRes;
          try {
            rpcRes = await attemptRpcSave(payloadToSend, minTimeToUse);
          } catch (netErr) {
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 500));
              continue;
            }
            throw netErr;
          }

          if (rpcRes.ok) {
            const savedData = await rpcRes.json();
            const cleanSaved = stripSensitiveForPublic(savedData);
            if (cleanSaved && cleanSaved.lastUpdated) {
              lastKnownCloudTime = Number(cleanSaved.lastUpdated);
            }
            cache = cleanSaved;
            cacheAt = Date.now();
            setBaseCloudData(cleanSaved);
            if (mergedFromRemote && cleanSaved && typeof cleanSaved === 'object') {
              try {
                Object.defineProperty(cleanSaved, '_mergedFromRemote', { value: true, enumerable: false });
              } catch (pe) {
                cleanSaved._mergedFromRemote = true;
              }
            }
            return cleanSaved;
          }

          const errBody = await rpcRes.text();
          if (errBody.includes('CONFLICT:')) {
            const latestRemote = await load(true, { skipSyncTime: true });
            if (latestRemote && Object.keys(latestRemote).length > 0) {
              const baseline = baseCloudData || latestRemote;
              payloadToSend = deepMergeCMS(baseline, latestRemote, payloadToSend, true);
              delete payloadToSend.lastUpdated;
              minTimeToUse = Number(latestRemote.lastUpdated || 0);
              setKnownCloudTime(minTimeToUse);
              mergedFromRemote = true;
              continue;
            }
          }

          if (errBody.includes('PAYLOAD_TOO_LARGE:')) {
            const sizeErr = new Error('Ukuran data CMS melebihi batas maksimal 1 MB. Kurangi teks/data base64 lalu simpan ulang.');
            sizeErr.code = 'PAYLOAD_TOO_LARGE';
            sizeErr.status = 413;
            throw sizeErr;
          }

          if (errBody.includes('PASSWORD_CHANGE_REQUIRED:')) {
            const pwErr = new Error('Akun Anda wajib mengganti password bawaan terlebih dahulu.');
            pwErr.code = 'PASSWORD_CHANGE_REQUIRED';
            pwErr.status = 403;
            throw pwErr;
          }

          if (errBody.includes('UNAUTHORIZED:')) {
            const authErr = new Error('Sesi login telah berakhir. Silakan login kembali.');
            authErr.status = 401;
            throw authErr;
          }

          const err = new Error('HTTP ' + rpcRes.status + ': ' + errBody.slice(0, 160));
          err.status = rpcRes.status;
          throw err;
        }

        const conflictErr = new Error('Sinkronisasi padat dari beberapa perangkat sekaligus. Coba simpan ulang.');
        conflictErr.code = 'CONFLICT';
        throw conflictErr;
      } finally {
        isSavingInFlight = false;
        // Jika ada event Realtime dari perangkat lain yang masuk saat simpan berlangsung, proses segera!
        if (pendingRemoteDuringSave) {
          const deferred = pendingRemoteDuringSave;
          pendingRemoteDuringSave = null;
          const deferredTs = Number(deferred.lastUpdated || 0);
          if (deferredTs > lastKnownCloudTime) {
            setTimeout(() => {
              notifyLiveListeners(deferred, 'realtime-deferred');
            }, 0);
          }
        }
      }
    });
    saveQueue = task.catch(() => {});
    return task;
  }

  // ==========================================================================
  // LIVE REALTIME SYNC ENGINE
  // - Dashboard Admin: Supabase Realtime WebSocket (dengan verifikasi phx_reply ok) + fallback polling
  // - Frontend Pengunjung: Cek ringan updated_at (45 detik saat tab aktif, 0 koneksi WebSocket)
  // ==========================================================================
  let liveListeners = [];
  let liveStarted = false;
  let publicSyncStarted = false;
  let realtimeWs = null;
  let realtimeJoined = false;
  let currentJoinRef = '';
  let joinWatchdogTimer = null;
  let realtimeHeartbeat = null;
  let realtimeReconnectTimer = null;
  let fastPollTimer = null;
  let publicPollTimer = null;
  let pollInFlight = false;
  let lastDeltaCheckAt = 0;

  function notifyLiveListeners(cleanRemote, source) {
    if (!cleanRemote || Object.keys(cleanRemote).length === 0) return;
    const remoteTs = Number(cleanRemote.lastUpdated || 0);
    if (remoteTs > 0) setKnownCloudTime(remoteTs);
    cache = cleanRemote;
    cacheAt = Date.now();
    if (!getAdminToken()) {
      applyLiveColorsToDocument(cleanRemote);
      broadcastLocalStorageSync(cleanRemote);
    }
    liveListeners.forEach(fn => {
      try { fn(cleanRemote, source); } catch (e) {}
    });
  }

  async function checkCloudDelta(sourceTag) {
    if (pollInFlight || isSavingInFlight) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const now = Date.now();
    // Cooldown ringan agar event bertumpuk tidak memicu request ganda
    const minGap = getAdminToken() ? 1500 : 12000;
    if (sourceTag !== 'realtime-connected' && sourceTag !== 'realtime-trigger' && (now - lastDeltaCheckAt < minGap)) {
      return;
    }
    lastDeltaCheckAt = now;
    pollInFlight = true;
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
      let res;
      try {
        res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=updated_at`, {
          headers: BASE_HEADERS,
          cache: 'no-store',
          signal: ctrl ? ctrl.signal : undefined
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!res || !res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows[0] || !rows[0].updated_at) return;

      const remoteUpdatedAt = String(rows[0].updated_at);
      const remoteUpdatedMs = new Date(remoteUpdatedAt).getTime();
      const localSyncedAt = Number((typeof localStorage !== 'undefined' && localStorage.getItem('ohsnap_cloud_synced_at')) || 0);
      const knownMax = Math.max(lastKnownCloudTime, getAdminToken() ? 0 : localSyncedAt);

      if (remoteUpdatedAt !== lastKnownUpdatedAtIso && (remoteUpdatedMs > knownMax + 50 || !lastKnownUpdatedAtIso)) {
        lastKnownUpdatedAtIso = remoteUpdatedAt;
        if (remoteUpdatedMs > knownMax + 50) {
          const freshData = await load(true);
          if (freshData && Object.keys(freshData).length > 0) {
            notifyLiveListeners(freshData, sourceTag || 'fast-poll');
          }
        }
      }
    } catch (e) {
    } finally {
      pollInFlight = false;
    }
  }

  function connectSupabaseRealtime() {
    // WebSocket Realtime HANYA diaktifkan untuk Dashboard Admin (hemat batas 200 koneksi Supabase Free)
    if (!getAdminToken()) return;
    if (typeof WebSocket === 'undefined') return;
    if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) return;

    try {
      realtimeJoined = false;
      currentJoinRef = '';
      if (joinWatchdogTimer) { clearTimeout(joinWatchdogTimer); joinWatchdogTimer = null; }

      const wsBase = SUPABASE_URL.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
      const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`;
      const ws = new WebSocket(wsUrl);
      realtimeWs = ws;
      let refCounter = 1;

      ws.onopen = function () {
        try {
          currentJoinRef = String(refCounter++);
          ws.send(JSON.stringify({
            topic: `realtime:public:${TABLE}:id=eq.1`,
            event: 'phx_join',
            payload: {
              config: {
                broadcast: { self: false },
                presence: { key: '' },
                postgres_changes: [
                  { event: 'UPDATE', schema: 'public', table: TABLE, filter: 'id=eq.1' }
                ]
              }
            },
            ref: currentJoinRef
          }));

          // Watchdog 8 detik: jika server tidak membalas phx_reply ok, tandai gagal join agar fallback polling aktif
          if (joinWatchdogTimer) clearTimeout(joinWatchdogTimer);
          joinWatchdogTimer = setTimeout(() => {
            if (!realtimeJoined && realtimeWs === ws) {
              realtimeJoined = false;
              checkCloudDelta('join-timeout-fallback');
            }
          }, 8000);
        } catch (e) {
          realtimeJoined = false;
        }

        if (realtimeHeartbeat) clearInterval(realtimeHeartbeat);
        realtimeHeartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({
                topic: 'phoenix',
                event: 'heartbeat',
                payload: {},
                ref: String(refCounter++)
              }));
            } catch (e) {}
          }
        }, 25000);
      };

      ws.onmessage = function (evt) {
        try {
          const msg = JSON.parse(evt.data);
          if (!msg) return;

          // Verifikasi status phx_join secara eksplisit
          if (msg.event === 'phx_reply' && String(msg.ref || '') === currentJoinRef) {
            if (joinWatchdogTimer) { clearTimeout(joinWatchdogTimer); joinWatchdogTimer = null; }
            if (msg.payload && msg.payload.status === 'ok') {
              realtimeJoined = true;
              checkCloudDelta('realtime-connected');
            } else {
              realtimeJoined = false;
              checkCloudDelta('join-rejected-fallback');
            }
            return;
          }

          if (msg.event === 'phx_error' || msg.event === 'phx_close') {
            realtimeJoined = false;
            return;
          }

          if (msg.event === 'postgres_changes' && msg.payload && msg.payload.data) {
            const changeData = msg.payload.data;
            const rec = changeData.record || changeData.new;
            if (rec && rec.updated_at) {
              lastKnownUpdatedAtIso = String(rec.updated_at);
            }
            if (rec && rec.data && typeof rec.data === 'object' && Object.keys(rec.data).length > 0) {
              const cleanRemote = stripSensitiveForPublic(rec.data);
              if (rec.updated_at) {
                const dbTs = new Date(rec.updated_at).getTime();
                cleanRemote.lastUpdated = Math.max(Number(cleanRemote.lastUpdated || 0), dbTs);
              }
              const normalizedRemote = ensureStableItemUids(cleanRemote);
              if (!isSavingInFlight) {
                notifyLiveListeners(normalizedRemote, 'realtime-ws');
              } else {
                const prevPendTs = Number((pendingRemoteDuringSave && pendingRemoteDuringSave.lastUpdated) || 0);
                if (Number(normalizedRemote.lastUpdated || 0) >= prevPendTs) {
                  pendingRemoteDuringSave = normalizedRemote;
                }
              }
            } else {
              checkCloudDelta('realtime-trigger');
            }
          }
        } catch (e) {}
      };

      ws.onclose = function () {
        realtimeJoined = false;
        if (joinWatchdogTimer) { clearTimeout(joinWatchdogTimer); joinWatchdogTimer = null; }
        if (realtimeHeartbeat) { clearInterval(realtimeHeartbeat); realtimeHeartbeat = null; }
        if (realtimeWs === ws) realtimeWs = null;
        if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
        realtimeReconnectTimer = setTimeout(() => {
          if (getAdminToken() && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
            connectSupabaseRealtime();
          }
        }, 5000);
      };

      ws.onerror = function () {
        realtimeJoined = false;
        try { ws.close(); } catch (e) {}
      };
    } catch (e) {
      realtimeJoined = false;
    }
  }

  function startLiveSync(onRemoteData) {
    if (typeof onRemoteData === 'function' && !liveListeners.includes(onRemoteData)) {
      liveListeners.push(onRemoteData);
    }
    if (liveStarted) return;
    liveStarted = true;

    // Hanya jalankan WebSocket Realtime bila berada di sesi Admin
    if (getAdminToken()) {
      connectSupabaseRealtime();

      // Fallback polling 5 detik jalan kapan pun channel belum benar-benar joined (bukan sekadar WS open)
      if (fastPollTimer) clearInterval(fastPollTimer);
      fastPollTimer = setInterval(() => {
        const wsReadyAndJoined = realtimeJoined && realtimeWs && realtimeWs.readyState === WebSocket.OPEN;
        if (!wsReadyAndJoined) {
          checkCloudDelta('fast-poll-fallback');
        }
      }, 5000);

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            connectSupabaseRealtime();
            checkCloudDelta('visibility');
          }
        });
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          connectSupabaseRealtime();
          checkCloudDelta('online');
        });
      }
    } else {
      startPublicDeltaSync();
    }
  }

  // Untuk halaman pengunjung publik: 0 koneksi WebSocket, cukup cek delta updated_at ringan tiap 45 detik saat tab aktif
  function startPublicDeltaSync() {
    if (publicSyncStarted || getAdminToken()) return;
    publicSyncStarted = true;

    if (publicPollTimer) clearInterval(publicPollTimer);
    publicPollTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        checkCloudDelta('public-delta');
      }
    }, 45000);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkCloudDelta('public-visibility');
        }
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        checkCloudDelta('public-online');
      });
    }
  }

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      if (!getAdminToken()) {
        startPublicDeltaSync();
      }
    }, 1000);
  }

  // Riwayat Versi CMS (ambil hingga 50 versi terakhir & pulihkan versi tertentu via RPC admin)
  async function listCmsHistory() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_cms_history_secure`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_token: getAdminToken() })
    });
    if (!res.ok) {
      const msg = await res.text();
      const err = new Error('Gagal memuat riwayat versi (' + res.status + '): ' + msg.slice(0, 140));
      if (msg.includes('PASSWORD_CHANGE_REQUIRED')) {
        err.code = 'PASSWORD_CHANGE_REQUIRED';
        err.status = 403;
      } else {
        err.status = msg.includes('UNAUTHORIZED') ? 401 : res.status;
      }
      throw err;
    }
    return await res.json();
  }

  async function restoreCmsVersion(historyId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/restore_cms_version_secure`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_token: getAdminToken(),
        p_history_id: Number(historyId)
      })
    });
    if (!res.ok) {
      const msg = await res.text();
      const err = new Error('Gagal memulihkan versi (' + res.status + '): ' + msg.slice(0, 140));
      err.status = msg.includes('UNAUTHORIZED') ? 401 : res.status;
      throw err;
    }
    const restored = stripSensitiveForPublic(await res.json());
    if (restored && restored.lastUpdated) {
      lastKnownCloudTime = Number(restored.lastUpdated);
    }
    cache = restored;
    cacheAt = Date.now();
    setBaseCloudData(restored);
    return restored;
  }

  async function debugLoginIp() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/debug_login_ip_secure`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_token: getAdminToken() })
    });
    if (!res.ok) throw new Error('Gagal cek diagnostik IP (' + res.status + ')');
    return await res.json();
  }

  // Kelola Akun Admin via Server-Side RPC (password tidak pernah dikirim balik ke klien)
  async function listAdmins() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_admins_secure`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_token: getAdminToken() })
    });
    if (!res.ok) {
      const err = new Error('Gagal memuat daftar admin (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return await res.json();
  }

  async function addAdmin(name, username, password) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_admin_secure`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_token: getAdminToken(),
        p_name: name,
        p_username: username,
        p_password: password
      })
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg.slice(0, 180));
    }
    return await res.json();
  }

  async function changeAdminPassword(oldPassword, newPassword) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/change_admin_password_secure`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_token: getAdminToken(),
        p_old_password: oldPassword,
        p_new_password: newPassword
      })
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg.slice(0, 180));
    }
    return await res.json();
  }

  async function deleteAdmin(adminId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_admin_secure`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_token: getAdminToken(),
        p_admin_id: Number(adminId)
      })
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg.slice(0, 180));
    }
    return await res.json();
  }

  // Minta izin sementara per-file (berlaku 2 menit & langsung dicabut setelah operasi selesai)
  async function requestStoragePermit(op, objectPath) {
    const token = getAdminToken();
    if (!token) {
      const e = new Error('Sesi login telah berakhir. Silakan login kembali.');
      e.status = 401;
      throw e;
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/issue_storage_permit`, {
      method: 'POST',
      headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_token: token,
        p_op: op,
        p_object_name: objectPath
      })
    });
    if (!res.ok) {
      const msg = await res.text();
      const err = new Error('Izin Storage ditolak (' + res.status + '): ' + msg.slice(0, 120));
      err.status = msg.includes('UNAUTHORIZED') ? 401 : res.status;
      throw err;
    }
  }

  async function revokeStoragePermit(objectPath) {
    const token = getAdminToken();
    if (!token || !objectPath) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/revoke_storage_permit`, {
        method: 'POST',
        headers: Object.assign({}, BASE_HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          p_token: token,
          p_object_name: objectPath
        })
      });
    } catch (e) {}
  }

  // Upload gambar/video ke Supabase Storage dengan izin sementara per-file & Cache-Control 1 tahun
  async function upload(fileOrBlob, folder, ext) {
    const cleanExt = (ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'];
    if (!allowedExts.includes(cleanExt)) {
      throw new Error('Format file tidak didukung: ' + cleanExt);
    }
    const safeFolder = (folder === 'video') ? 'video' : 'img';
    const path = `${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${cleanExt}`;

    await requestStoragePermit('insert', path);
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: Object.assign({}, BASE_HEADERS, {
          'Content-Type': fileOrBlob.type || 'application/octet-stream',
          'cache-control': 'max-age=31536000'
        }),
        body: fileOrBlob
      });
      if (!res.ok) throw new Error('Upload HTTP ' + res.status + ': ' + (await res.text()).slice(0, 160));
      return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    } finally {
      await revokeStoragePermit(path);
    }
  }

  // Hapus file lama di Supabase Storage setelah simpan database sukses (mengembalikan { ok, error })
  async function removeFile(publicUrl) {
    let filePath = '';
    let permitIssued = false;
    try {
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      if (!publicUrl || typeof publicUrl !== 'string' || !publicUrl.includes(marker)) {
        return { ok: true, skipped: true };
      }
      let rawPart = publicUrl.split(marker)[1] || '';
      // Buang query string (?t=...) dan hash (#...) sebelum diproses
      rawPart = rawPart.split('?')[0].split('#')[0].trim();
      try { rawPart = decodeURIComponent(rawPart); } catch (de) {}
      // Jika path tidak sesuai pola aman server, lewati agar tidak masuk daftar yatim permanen
      if (!rawPart || !/^(img|video)\/[A-Za-z0-9._-]+$/.test(rawPart) || rawPart.includes('..')) {
        return { ok: true, skipped: true };
      }
      filePath = rawPart;
      await requestStoragePermit('delete', filePath);
      permitIssued = true;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`, {
        method: 'DELETE',
        headers: BASE_HEADERS
      });
      if (!res.ok && res.status !== 404) {
        return { ok: false, error: 'HTTP ' + res.status };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    } finally {
      if (permitIssued && filePath) await revokeStoragePermit(filePath);
    }
  }

  window.OhSnapCloud = {
    load,
    pullIfNewer,
    loginAdmin,
    logoutAdminSession,
    save,
    listCmsHistory,
    restoreCmsVersion,
    listAdmins,
    addAdmin,
    changeAdminPassword,
    deleteAdmin,
    upload,
    removeFile,
    escHtml,
    safeTitleHtml,
    safeUrl,
    stripSensitiveForPublic,
    getAdminToken,
    setKnownCloudTime,
    setBaseCloudData,
    getBaseCloudData,
    deepMergeCMS,
    ensureStableItemUids,
    debugLoginIp,
    startLiveSync,
    checkSheetUrl,
    sheetFetch,
    SHEET_URL: SHEET_SCRIPT_URL,
    URL: SUPABASE_URL
  };
})();

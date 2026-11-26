/* OH SNAP! Photobox - Modul Bersama Frontend (Navigasi, Peta/GPS, Footer Fallback, Aksesibilitas) */
(function () {
  const GMAPS_ROOT = 'https://www.google' + '.com/maps';
  const GMAPS_EMBED_ROOT = 'https://maps.google' + '.com/maps';

  const OHSNAP_DEFAULT_FOOTER = {
    brand: 'OH SNAP! Photobox Group',
    branches: 'Kediri Mall Lt.5, Plaza Cilacap Lt.3, Laksana Baru Lt.3, Plaza Pekalongan Lt.2, Yogya Pemalang Lt.3',
    igName: '@ohsnap_photobox',
    igUrl: 'https://www.instagram.com/ohsnap_photobox',
    ttName: '@ohsnap_photobox',
    ttUrl: 'https://www.tiktok.com/@ohsnap_photobox',
    cardTitleId: 'Temukan Studio OH SNAP! Terdekat:',
    cardTitleEn: 'Find nearby OH SNAP! Studio:',
    cardDescId: 'Temukan booth dan studio terdekat di kotamu untuk abadikan momen serumu hari ini!',
    cardDescEn: 'Find the nearest booth and studio in your city to capture your special moments today!',
    copyright: '© 2026 OH SNAP! Photobox. All rights reserved.'
  };

  const OHSNAP_BRANCH_COORDS = [
    {
      match: 'kediri',
      name: 'Oh Snap Photobox Kediri (Kediri Mall Lt.5)',
      lat: -7.8166,
      lng: 112.0163,
      placeId: 'ChIJJTp8gHxXeC4R0eMGkmnssvQ',
      destQuery: 'Oh Snap Photobox Kediri, Kediri Mall Lt.5, Jl. Hayam Wuruk No.46, Kediri'
    },
    {
      match: 'cilacap',
      name: 'Oh Snap Photobox Plaza Cilacap (Lt.3)',
      lat: -7.7279,
      lng: 109.0076,
      placeId: 'ChIJ71iRM3wTZS4Rrr7EqRI3A84',
      destQuery: 'Oh Snap Photobox Plaza Cilacap, Jl. Jend. Ahmad Yani No.73, Cilacap'
    },
    {
      match: 'laksana',
      name: 'Oh Snap Photobox Majenang (Laksana Baru Lt.3)',
      lat: -7.2977,
      lng: 108.7634,
      placeId: 'ChIJ_3pPM_1_by4RT_FVbDVw8p4',
      destQuery: 'Oh Snap Photobox Majenang, Laksana Baru Majenang Lt.3, Jl. Diponegoro No.312, Majenang'
    },
    {
      match: 'pekalongan',
      name: 'Oh Snap Photobox Pekalongan (Plaza Pekalongan Lt.2)',
      lat: -6.8898,
      lng: 109.6753,
      placeId: 'ChIJ46o-mGMlcC4REovLqtjx-_4',
      destQuery: 'Oh Snap Photobox Pekalongan, Plaza Pekalongan Lt.2, Jl. Nusantara No.5, Pekalongan'
    },
    {
      match: 'pemalang',
      name: 'Oh Snap Photobox Pemalang (Yogya Pemalang Lt.3)',
      lat: -6.8906,
      lng: 109.3808,
      placeId: 'ChIJkY0Gm7nbby4RmIpX5D5mdhw',
      destQuery: 'Oh Snap Photobox Pemalang, Yogya Pemalang Lt.3, Jl. Jend. Sudirman Timur, Pemalang'
    }
  ];

  function escHtml(str) {
    if (window.OhSnapCloud && typeof window.OhSnapCloud.escHtml === 'function') {
      return window.OhSnapCloud.escHtml(str);
    }
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let lastAppliedCms = null;
  let lastAppliedLang = '';

  function getActiveCms() {
    try {
      if (lastAppliedCms) return lastAppliedCms;
      if (typeof window.cms !== 'undefined' && window.cms) return window.cms;
      const raw = localStorage.getItem('ohsnap_cms_data');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getActiveLang() {
    try {
      if (lastAppliedLang) return lastAppliedLang;
      if (typeof window.currentLang === 'string' && window.currentLang) return window.currentLang;
      return (document.documentElement && document.documentElement.lang === 'en') ? 'en' : (localStorage.getItem('siteLang') || 'id');
    } catch (e) {
      return 'id';
    }
  }

  function getOhSnapBranchesWithCoords(cmsObj) {
    const data = cmsObj || getActiveCms();
    const rawList = (data && Array.isArray(data.locations) && data.locations.length > 0) ? data.locations : [
      { name: 'Kediri Mall', floor: 'Lantai 5' },
      { name: 'Plaza Cilacap', floor: 'Lantai 3' },
      { name: 'Laksana Baru', floor: 'Lantai 3' },
      { name: 'Plaza Pekalongan', floor: 'Lantai 2' },
      { name: 'Yogya Pemalang', floor: 'Lantai 3' }
    ];
    return rawList.map(b => {
      const nm = String(b.name || 'Cabang').trim();
      const fl = b.floor ? ' ' + String(b.floor).replace(/^Lantai\s+/i, 'Lt.') : '';
      const lower = nm.toLowerCase();
      const known = OHSNAP_BRANCH_COORDS.find(k => lower.includes(k.match));
      let lat = known ? known.lat : null;
      let lng = known ? known.lng : null;
      let placeId = known ? known.placeId : '';
      let destQuery = known ? known.destQuery : ('Oh Snap Photobox ' + nm);

      const mUrl = String(b.mapUrl || '').trim();
      const adminLat = parseFloat(b.lat);
      const adminLng = parseFloat(b.lng);
      if (!isNaN(adminLat) && !isNaN(adminLng)) {
        lat = adminLat;
        lng = adminLng;
      }
      const coordMatch = mUrl.match(/(?:@|q=|ll=|!3d)(-?\d+\.\d+)(?:,|!4d)\s*(-?\d+\.\d+)/);
      if (coordMatch && (isNaN(adminLat) || isNaN(adminLng))) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
      }
      const pidMatch = mUrl.match(/query_place_id=([A-Za-z0-9_-]+)/);
      if (pidMatch) placeId = pidMatch[1];

      const safeCustomMapUrl = (mUrl && mUrl !== '#' && window.OhSnapCloud) ? window.OhSnapCloud.safeUrl(mUrl, '') : '';
      const cleanMapUrl = safeCustomMapUrl || (known
        ? (GMAPS_ROOT + '/search/?api=1&query=' + encodeURIComponent(known.destQuery) + (known.placeId ? '&query_place_id=' + encodeURIComponent(known.placeId) : ''))
        : (GMAPS_ROOT + '/search/?api=1&query=' + encodeURIComponent(destQuery)));

      return {
        title: known ? known.name : ('OH SNAP! ' + nm + fl),
        destQuery: destQuery,
        placeId: placeId,
        mapUrl: cleanMapUrl,
        lat: lat,
        lng: lng
      };
    });
  }

  function calcHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function findNearestBranchFromCoords(uLat, uLng) {
    const branches = getOhSnapBranchesWithCoords();
    let best = branches[0];
    let bestDist = Infinity;
    branches.forEach(b => {
      if (typeof b.lat === 'number' && typeof b.lng === 'number') {
        const d = calcHaversineKm(uLat, uLng, b.lat, b.lng);
        if (d < bestDist) {
          bestDist = d;
          best = b;
        }
      }
    });
    return { branch: best, distanceKm: bestDist };
  }

  function updateFooterMapPreview(nearest, distanceKm) {
    if (!nearest) return;
    const isEn = getActiveLang() === 'en';
    const distStr = isFinite(distanceKm) ? (' • ' + distanceKm.toFixed(1) + ' km') : '';
    const titleEl = document.getElementById('footerNearestTitle');
    const subEl = document.getElementById('footerNearestSub');
    const iframeEl = document.getElementById('footerMapIframe');
    if (titleEl) titleEl.textContent = nearest.title;
    if (subEl && isFinite(distanceKm)) {
      subEl.textContent = (isEn ? 'Nearest branch' : 'Cabang terdekat') + distStr;
    }
    if (iframeEl) {
      const embedUrl = GMAPS_EMBED_ROOT + '?q=' + encodeURIComponent(nearest.destQuery) + '&t=&z=16&ie=UTF8&iwloc=&output=embed';
      if (iframeEl.getAttribute('src') !== embedUrl) iframeEl.src = embedUrl;
    }
  }

  let cachedUserCoords = null;
  try {
    const savedCoords = sessionStorage.getItem('ohsnap_gps_coords');
    if (savedCoords) cachedUserCoords = JSON.parse(savedCoords);
  } catch (e) {}

  function saveUserCoordsCache(lat, lng) {
    if (typeof lat === 'number' && typeof lng === 'number') {
      cachedUserCoords = { lat: lat, lng: lng };
      try { sessionStorage.setItem('ohsnap_gps_coords', JSON.stringify(cachedUserCoords)); } catch (e) {}
    }
  }

  function openNearestOhSnapGps(event) {
    if (event) event.preventDefault();
    const branches = getOhSnapBranchesWithCoords();
    const defaultBranch = branches[0] || OHSNAP_BRANCH_COORDS[0];
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!isMobile) {
      const res = cachedUserCoords
        ? findNearestBranchFromCoords(cachedUserCoords.lat, cachedUserCoords.lng)
        : { branch: defaultBranch, distanceKm: Infinity };
      const nearest = res.branch || defaultBranch;
      const desktopDirUrl = GMAPS_ROOT + '/dir/?api=1&destination=' + encodeURIComponent(nearest.destQuery) + (nearest.placeId ? '&destination_place_id=' + encodeURIComponent(nearest.placeId) : '') + '&travelmode=driving';
      window.open(desktopDirUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const isEn = getActiveLang() === 'en';
    const subEl = document.getElementById('footerNearestSub');
    if (subEl) subEl.textContent = isEn ? '⏳ Opening Maps app...' : '⏳ Membuka aplikasi Maps...';

    function navigateMobile(uLat, uLng) {
      if (typeof uLat === 'number' && typeof uLng === 'number') saveUserCoordsCache(uLat, uLng);
      const res = (typeof uLat === 'number' && typeof uLng === 'number')
        ? findNearestBranchFromCoords(uLat, uLng)
        : (cachedUserCoords ? findNearestBranchFromCoords(cachedUserCoords.lat, cachedUserCoords.lng) : { branch: defaultBranch, distanceKm: Infinity });
      const nearest = res.branch || defaultBranch;
      updateFooterMapPreview(nearest, res.distanceKm);

      let mapTargetUrl = '';
      if (/Android/i.test(navigator.userAgent)) {
        const hasCoords = typeof nearest.lat === 'number' && typeof nearest.lng === 'number';
        mapTargetUrl = 'geo:' + (hasCoords ? (nearest.lat + ',' + nearest.lng) : '0,0') + '?q=' + encodeURIComponent(nearest.destQuery);
      } else {
        mapTargetUrl = 'maps://?q=' + encodeURIComponent(nearest.destQuery);
      }
      window.location.href = mapTargetUrl;
    }

    if (cachedUserCoords) {
      navigateMobile(cachedUserCoords.lat, cachedUserCoords.lng);
      return;
    }

    if (!navigator.geolocation) {
      navigateMobile(null, null);
      return;
    }

    let responded = false;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        if (responded) return;
        responded = true;
        navigateMobile(pos.coords.latitude, pos.coords.longitude);
      },
      function () {
        if (responded) return;
        responded = true;
        navigateMobile(null, null);
      },
      { enableHighAccuracy: false, timeout: 1800, maximumAge: 300000 }
    );

    setTimeout(function () {
      if (!responded) {
        responded = true;
        navigateMobile(null, null);
      }
    }, 2000);
  }

  function autoDetectNearestOnLoad() {
    try {
      if (cachedUserCoords) {
        const cachedRes = findNearestBranchFromCoords(cachedUserCoords.lat, cachedUserCoords.lng);
        if (cachedRes && cachedRes.branch) updateFooterMapPreview(cachedRes.branch, cachedRes.distanceKm);
      }
      // Hanya baca GPS otomatis jika izin lokasi sudah diberikan sebelumnya (granted)
      if (navigator.geolocation && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (perm) {
          if (perm && perm.state === 'granted') {
            navigator.geolocation.getCurrentPosition(function (pos) {
              saveUserCoordsCache(pos.coords.latitude, pos.coords.longitude);
              const res = findNearestBranchFromCoords(pos.coords.latitude, pos.coords.longitude);
              if (res && res.branch) updateFooterMapPreview(res.branch, res.distanceKm);
            }, function () {}, { enableHighAccuracy: false, timeout: 3500, maximumAge: 300000 });
          }
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function applyOhSnapFooter(cmsObj, lang) {
    if (cmsObj && typeof cmsObj === 'object') lastAppliedCms = cmsObj;
    if (lang) lastAppliedLang = lang;
    const f = (cmsObj && cmsObj.footer && typeof cmsObj.footer === 'object') ? cmsObj.footer : {};
    const d = OHSNAP_DEFAULT_FOOTER;
    const isEn = (lang || getActiveLang()) === 'en';
    const val = (v, fb) => (v !== null && v !== undefined && String(v).trim() !== '') ? String(v) : fb;

    const brandEl = document.getElementById('fBrand');
    if (brandEl) brandEl.textContent = val(f.brand, d.brand);

    const branchesEl = document.getElementById('fBranches');
    if (branchesEl) branchesEl.textContent = val(f.branches, d.branches);

    const safeIgUrl = window.OhSnapCloud ? window.OhSnapCloud.safeUrl(f.igUrl, d.igUrl) : d.igUrl;
    const safeTtUrl = window.OhSnapCloud ? window.OhSnapCloud.safeUrl(f.ttUrl, d.ttUrl) : d.ttUrl;
    const igName = val(f.igName, d.igName);
    const ttName = val(f.ttName, d.ttName);

    const ig = document.getElementById('fIg');
    if (ig) { ig.textContent = igName; ig.href = safeIgUrl; }
    const tt = document.getElementById('fTt');
    if (tt) { tt.textContent = ttName; tt.href = safeTtUrl; }
    const igBot = document.getElementById('fIgBottom');
    if (igBot) igBot.href = safeIgUrl;
    const ttBot = document.getElementById('fTtBottom');
    if (ttBot) ttBot.href = safeTtUrl;

    // Sinkronkan tombol media sosial di halaman Kontak jika belum diatur terpisah di menu Kontak
    const hasCustomContact = Boolean(cmsObj && cmsObj.contact && typeof cmsObj.contact === 'object');
    if (!hasCustomContact) {
      const cIg = document.getElementById('contactIgBtn');
      if (cIg) {
        cIg.href = safeIgUrl;
        const lbl = cIg.querySelector('.social-label');
        if (lbl) lbl.textContent = 'Instagram - ' + igName;
        else cIg.textContent = 'Instagram - ' + igName;
      }
      const cTt = document.getElementById('contactTtBtn');
      if (cTt) {
        cTt.href = safeTtUrl;
        const lbl = cTt.querySelector('.social-label');
        if (lbl) lbl.textContent = 'TikTok - ' + ttName;
        else cTt.textContent = 'TikTok - ' + ttName;
      }
    }

    const rawTitleId = val(f.cardTitleId, '');
    const rawTitleEn = val(f.cardTitleEn, '');
    const isDefaultEngTitle = !rawTitleId || rawTitleId.toLowerCase() === 'find nearby oh snap! studio';
    const finalCardTitle = isEn
      ? (rawTitleEn || d.cardTitleEn)
      : (isDefaultEngTitle ? d.cardTitleId : rawTitleId);
    const cardTitleEl = document.getElementById('fCardTitle');
    if (cardTitleEl) cardTitleEl.textContent = finalCardTitle;

    const cardDescEl = document.getElementById('fCardDesc');
    if (cardDescEl) {
      cardDescEl.textContent = isEn ? val(f.cardDescEn, d.cardDescEn) : val(f.cardDescId, d.cardDescId);
    }

    const copyEl = document.getElementById('fCopy');
    if (copyEl) copyEl.textContent = val(f.copyright, d.copyright);

    const firstBranches = getOhSnapBranchesWithCoords(cmsObj);
    if (firstBranches && firstBranches[0]) {
      const nTitle = document.getElementById('footerNearestTitle');
      if (nTitle && nTitle.textContent === 'OH SNAP! Photobox') {
        nTitle.textContent = firstBranches[0].title;
      }
    }
  }

  function initOhSnapNav() {
    const btn = document.getElementById('menuToggle');
    const nav = document.getElementById('navContainer');
    if (btn && nav && !btn.dataset.ohsnapBound) {
      btn.dataset.ohsnapBound = '1';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = nav.classList.toggle('active');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
      document.addEventListener('click', (e) => {
        if (nav.classList.contains('active') && !nav.contains(e.target) && !btn.contains(e.target)) {
          nav.classList.remove('active');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Aksesibilitas keyboard (Enter / Space) untuk kartu peta footer
    const mapBox = document.querySelector('.footer-map-box');
    if (mapBox && !mapBox.dataset.ohsnapKeyBound) {
      mapBox.dataset.ohsnapKeyBound = '1';
      mapBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openNearestOhSnapGps(e);
        }
      });
    }
  }

  window.escHtml = escHtml;
  window.GMAPS_ROOT = GMAPS_ROOT;
  window.GMAPS_EMBED_ROOT = GMAPS_EMBED_ROOT;
  window.OHSNAP_DEFAULT_FOOTER = OHSNAP_DEFAULT_FOOTER;
  window.OHSNAP_BRANCH_COORDS = OHSNAP_BRANCH_COORDS;
  window.getOhSnapBranchesWithCoords = getOhSnapBranchesWithCoords;
  window.calcHaversineKm = calcHaversineKm;
  window.findNearestBranchFromCoords = findNearestBranchFromCoords;
  window.updateFooterMapPreview = updateFooterMapPreview;
  window.saveUserCoordsCache = saveUserCoordsCache;
  window.openNearestOhSnapGps = openNearestOhSnapGps;
  window.autoDetectNearestOnLoad = autoDetectNearestOnLoad;
  window.applyOhSnapFooter = applyOhSnapFooter;
  window.initOhSnapNav = initOhSnapNav;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initOhSnapNav();
      autoDetectNearestOnLoad();
    });
  } else {
    initOhSnapNav();
    autoDetectNearestOnLoad();
  }
})();

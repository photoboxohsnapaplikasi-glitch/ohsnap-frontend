# 📸 OH SNAP! Photobox — Website Utama

Website resmi **OH SNAP! Photobox** ([ohsnap.web.id](https://ohsnap.web.id)): menampilkan layanan, koleksi frame, lokasi cabang, cerita brand, kontak, dan formulir permintaan *Resend Softcopy* (kirim ulang file foto digital).

- **Alamat:** `https://ohsnap.web.id`
- **Repo pasangan:** dashboard pengelola konten ada di repo terpisah, **ohsnap-admin** (`admin.ohsnap.web.id`).
- **Teknologi:** HTML + CSS + JavaScript murni (tanpa framework/build), di-hosting di Vercel. Konten dari Supabase; permintaan Resend Softcopy dikirim ke Google Apps Script (Google Spreadsheet + Google Drive); anti-bot dengan Cloudflare Turnstile.

---

## 🧭 Cara Kerja Singkat

```
Pengunjung ──► halaman website (HTML statis di Vercel)
                  │
                  ├─ konten (teks, foto, video, promo, warna) ◄── Supabase  ◄── diubah lewat Dashboard Admin
                  │      └─ cadangan: content-snapshot.json (bila Supabase tidak terjangkau)
                  │
                  └─ form Resend Softcopy ──► Google Apps Script ──► Spreadsheet + Drive ──► dibaca Dashboard Admin
```

1. **Tampilan awal cepat.** Setiap halaman sudah memuat konten bawaan di dalam kodenya, lalu menggantinya dengan data terbaru dari Supabase begitu tersedia.
2. **Data dari Cloud.** `cms-cloud.js` mengambil satu data konten dari Supabase (hanya bagian publik; data akun admin tidak pernah dikirim ke pengunjung) dan menyimpannya di `localStorage` browser sebagai cache.
3. **Pembaruan otomatis.** Saat tab sedang terbuka, website mengecek secara berkala hanya penanda waktu perubahan (data sangat kecil). Data penuh baru diunduh bila ada perubahan dari admin. Website publik **tidak** membuka koneksi WebSocket.
4. **Cadangan offline.** Bila pengunjung belum punya cache dan Supabase tidak dapat dijangkau, website memakai `content-snapshot.json`.

---

## ✨ Halaman & Fitur

| Halaman | Isi |
|---|---|
| `index.html` — Beranda | Hero, *About Our Story* (tombol ke halaman Story), Suasana Studio, Promo, dan Video Feed. Studio, Promo, dan Video tampil sebagai kartu yang dapat digeser. Video memakai poster dan tidak diunduh sebelum diputar (hemat kuota); memutar satu video otomatis menjeda video lain, dan item berupa link TikTok/Instagram tampil sebagai tombol "Tonton di …". |
| `layanan.html` | Daftar layanan beserta harga dan deskripsi. |
| `frame.html` | Koleksi frame beserta kategori dan deskripsi. |
| `lokasi.html` | Daftar cabang (nama, lantai, jam buka) dengan tombol buka Google Maps. |
| `story.html` | Cerita lengkap brand. |
| `kontak.html` | Tautan Instagram, TikTok, WhatsApp, dan Email yang diatur dari menu Kontak di dashboard. |
| `resend.html` | Formulir permintaan Resend Softcopy. |

**Fitur di semua halaman (`shared.js`)**
- **Dua bahasa (ID/EN):** tombol bahasa mengganti teks halaman, pilihan diingat di browser.
- **Navigasi** desktop dan mobile (menu hamburger, dapat dioperasikan dengan keyboard).
- **Footer dinamis:** nama brand, alamat pusat, media sosial, kartu lokasi, dan hak cipta dari dashboard.
- **Cabang terdekat:** peta footer menampilkan cabang terdekat berdasarkan lokasi pengunjung (rumus jarak Haversine). Lokasi dibaca otomatis **hanya** bila izin lokasi sudah pernah diberikan; selain itu, izin baru diminta saat pengunjung menekan peta/tombol petunjuk arah. Koordinat disimpan sementara di tab (bukan dikirim ke server).
- **Warna tema** (utama, teks, background, footer) mengikuti pengaturan dashboard.

**Formulir Resend Softcopy**
- Kolom: nama lengkap, email aktif, nomor WhatsApp, cabang studio, tanggal foto, perkiraan jam foto, dan foto bukti sesi.
- Foto bukti harus **JPG, PNG, atau WebP** (HEIC ditolak dengan pesan jelas). Foto diperkecil dan dikompres di browser sebelum dikirim.
- Perlindungan spam: kolom jebakan (*honeypot*), batas waktu minimal sejak halaman dibuka, jeda antar pengiriman, ID permintaan unik agar tidak terkirim ganda, dan Cloudflare Turnstile.
- Data dikirim ke Google Apps Script, yang memeriksa ulang isi dan jenis file, membatasi jumlah kiriman per nomor/email, lalu menyimpan foto ke Google Drive dan satu baris ke Spreadsheet. Pesan sukses menyebutkan pengiriman softcopy dalam 7x24 jam.

**SEO & performa**
- `canonical`, Open Graph, Twitter Card, data terstruktur JSON-LD `LocalBusiness`, `sitemap.xml`, `robots.txt`, dan favicon (32/180/512 px).
- Gambar dan peta memakai `loading="lazy"`; `cms-cloud.js`, `shared.js`, dan gambar diberi aturan cache di `vercel.json`.
- Mendukung navigasi keyboard, indikator fokus, dan `prefers-reduced-motion`.

---

## 🔐 Keamanan (gambaran umum)

- Website publik hanya **membaca** konten; tidak ada fungsi tulis atau data akun yang dapat diakses pengunjung.
- Konten dari dashboard ditampilkan dengan penyaringan (*escape*) dan validasi alamat URL untuk mencegah penyisipan skrip.
- Header keamanan (CSP, anti-iframe pihak lain, `nosniff`, kebijakan referrer) diatur di `vercel.json`.
- Kunci yang ada di kode hanyalah kunci publik; kunci rahasia tidak disimpan di repo ini.

---

## 🗂️ Struktur Folder

```
.
├── index.html, layanan.html, frame.html, lokasi.html, story.html, kontak.html, resend.html
├── shared.js                    # Navigasi, bahasa, footer, GPS & peta
├── cms-cloud.js                 # Klien Supabase & Apps Script (harus IDENTIK dengan repo admin)
├── content-snapshot.json        # Cadangan konten publik (diperbarui otomatis tiap minggu)
├── sitemap.xml, robots.txt
├── vercel.json                  # cleanUrls, header keamanan & CSP, aturan cache
├── favicon.ico, images/         # Ikon & logo
├── CNAME                        # Referensi domain utama
└── .github/workflows/
    ├── backup-cms-snapshot.yml    # Cadangan mingguan content-snapshot.json
    └── check-cms-cloud-sync.yml   # Memastikan cms-cloud.js sama dengan repo admin
```

---

## 🤖 GitHub Actions

- **`backup-cms-snapshot.yml`** — setiap hari Minggu 03:00 UTC (10:00 WIB), atau manual lewat *Run workflow*, mengambil konten publik dari Supabase dan memperbarui `content-snapshot.json` bila ada perubahan. Data akun admin dan data Resend tidak ikut. Bila respons kosong, cadangan dilewati agar snapshot lama tidak tertimpa.
- **`check-cms-cloud-sync.yml`** — membandingkan `cms-cloud.js` dengan repo admin dan memberi tanda gagal bila berbeda.

---

## ⚙️ Konfigurasi

| Lokasi | Isi | Catatan |
|---|---|---|
| `cms-cloud.js` | Alamat proyek Supabase, kunci publik Supabase, alamat Web App Apps Script | Aman dipublikasikan; harus sama di kedua repo |
| `resend.html` | *Site key* Cloudflare Turnstile | Widget harus mencantumkan hostname `ohsnap.web.id` |
| Google Apps Script | Pengaturan rahasia di *Script Properties* proyek Apps Script | Tidak ada di repo ini |

Cara mencoba di komputer: cukup buka folder dengan server statis (mis. ekstensi *Live Server* di VS Code). Formulir Resend dan Turnstile baru berfungsi penuh di domain yang terdaftar.

---

## 🚀 Deploy

Setiap `git push` ke branch `main` otomatis di-deploy oleh **Vercel** dalam sekitar 1 menit:

```bash
git add .
git commit -m "Deskripsi perubahan"
git pull --rebase origin main
git push origin main
```

> **Penting:** bila `cms-cloud.js` diubah, salin ke repo **ohsnap-admin** dan push keduanya agar tetap identik.

---

© OH SNAP! Photobox. Seluruh konten dan aset dalam repo ini adalah milik OH SNAP! Photobox.

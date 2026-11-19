# 📸 OH SNAP! Photobox — Website Utama

Website resmi **OH SNAP! Photobox** ([ohsnap.web.id](https://ohsnap.web.id)) yang menampilkan layanan, koleksi frame, lokasi cabang terdekat via GPS, cerita brand, kontak, dan formulir permintaan *Resend Softcopy*.

> Repo ini berisi website publik untuk pengunjung. Dashboard pengelola konten berada di repo terpisah: **ohsnap-admin**.

---

## ✨ Fitur Utama

- **Sinkronisasi Live dari Cloud:** Konten teks, gambar, video, promo, dan warna tema ditarik dari Supabase dan diperbarui secara otomatis via pengecekan delta ringan `updated_at` (~40 byte) saat tab aktif tanpa membuka koneksi WebSocket (menghemat batas 200 koneksi Supabase Free).
- **Cadangan Offline (`content-snapshot.json`):** Jika browser pengunjung baru pertama kali membuka website saat Supabase sedang tidak dapat dijangkau, snapshot statis otomatis digunakan sebagai fallback.
- **Arsitektur Bersih (`shared.js`):** Navigasi mobile, peta footer, perhitungan cabang terdekat via GPS, fallback footer, dan aksesibilitas keyboard dipusatkan di `shared.js`.
- **Formulir Resend Softcopy Aman:** Dilengkapi *honeypot*, batas waktu kirim minimal 3 detik, `request_id` UUID anti-duplikat, validasi format foto (menolak HEIC), serta pesan status ramah langsung di halaman.
- **Performa, SEO & Aksesibilitas:** Peta footer & gambar galeri memakai `loading="lazy"`, GPS tidak memunculkan pop-up izin otomatis sebelum interaksi, lengkap dengan meta Open Graph, `canonical`, JSON-LD `LocalBusiness`, favicon 32/180/512 px, dukungan keyboard (`Enter`/`Space`), `:focus-visible`, dan `prefers-reduced-motion`.

## 🗂️ Struktur Folder

```
.
├── index.html                           # Beranda (Hero, About, Promo, Studio, Video Feed)
├── layanan.html                         # Daftar layanan & harga
├── frame.html                           # Koleksi frame layout
├── lokasi.html                          # Daftar lokasi cabang & Google Maps
├── story.html                           # Cerita lengkap brand
├── kontak.html                          # Kontak & media sosial (sinkron dengan Footer)
├── resend.html                          # Formulir permintaan Resend Softcopy
├── shared.js                            # Modul bersama (navigasi, GPS/peta, footer, a11y)
├── cms-cloud.js                         # Klien Supabase & Apps Script (harus identik dengan admin)
├── content-snapshot.json                # Fallback konten statis saat offline
├── vercel.json                          # Konfigurasi cleanUrls & header keamanan
├── images/                              # Logo & favicon (32px, 180px, 512px)
├── .github/workflows/check-cms-cloud-sync.yml  # Cek kesamaan cms-cloud.js antar repo
└── CNAME                                # Referensi domain utama
```

## 🚀 Deploy (Vercel)

Setiap `git push origin main` otomatis men-deploy versi terbaru di **Vercel** (`https://ohsnap.web.id`) dalam 30–60 detik:

```bash
cd ohsnapfrontend
git add .
git commit -m "Deskripsi perubahan"
git push origin main
```

---

© OH SNAP! Photobox. Seluruh konten dan aset dalam repo ini adalah milik OH SNAP! Photobox.

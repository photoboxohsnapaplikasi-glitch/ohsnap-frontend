# 📸 OH SNAP! Photobox — Website

Website resmi **OH SNAP! Photobox**, Photobox & Self-Photo Studio kekinian: langsung cetak dan bawa pulang.

🌐 **Website:** [ohsnap.web.id](https://ohsnap.web.id)

---

## ✨ Fitur

- **Dua bahasa** — Indonesia dan Inggris, bisa diganti langsung lewat tombol **EN / ID** di menu.
- **Responsif** — tampilan menyesuaikan HP, tablet, dan laptop.
- **Konten bisa diubah tanpa menyentuh kode** — teks, foto, video, promo, lokasi, dan warna dikelola lewat dashboard admin terpisah. Perubahan langsung tampil di semua perangkat.
- **Resend Softcopy** — pelanggan bisa meminta kirim ulang hasil foto lewat formulir.
- **Tetap bisa dibuka saat koneksi lemah** — halaman memakai salinan konten terakhir bila server konten tidak terjangkau.
- **Alamat URL bersih** — tanpa `.html` di belakangnya (contoh: `ohsnap.web.id/layanan`).

## 📄 Halaman

| Halaman | Alamat | File |
|---|---|---|
| Beranda | `/` | `index.html` |
| Our Story | `/story` | `story.html` |
| Layanan & Paket | `/layanan` | `layanan.html` |
| Frame | `/frame` | `frame.html` |
| Lokasi | `/lokasi` | `lokasi.html` |
| Resend Softcopy | `/resend` | `resend.html` |
| Kontak | `/kontak` | `kontak.html` |

## 🧱 Teknologi

- **HTML, CSS, dan JavaScript** biasa, tanpa framework dan tanpa proses build
- **Supabase** — penyimpanan konten dan media (CMS berbasis cloud)
- **Google Apps Script** — pemrosesan formulir Resend Softcopy
- **GitHub Pages** + domain khusus (custom domain) — hosting

## 🗂️ Struktur Folder

```
.
├── index.html        # Beranda
├── story.html        # Our Story
├── layanan.html      # Layanan & paket
├── frame.html        # Koleksi frame
├── lokasi.html       # Lokasi cabang
├── resend.html       # Formulir Resend Softcopy
├── kontak.html       # Kontak
├── cms-cloud.js      # Penghubung ke cloud (membaca konten & media)
├── images/           # Aset gambar bawaan (logo, dll.)
└── CNAME             # Pengaturan domain khusus untuk GitHub Pages
```

## 🔄 Cara Kerja Konten

```
Dashboard Admin  ──simpan──▶  Cloud (Supabase)  ──baca──▶  Website ini
```

Website ini hanya **membaca** konten dari cloud. Isinya dikelola lewat repo dan dashboard admin yang terpisah. Setiap halaman mengambil konten terbaru saat dibuka dan saat tab kembali aktif. Jika cloud tidak terjangkau, halaman memakai salinan konten terakhir yang tersimpan di browser.

## 💻 Menjalankan di Komputer Sendiri

Karena website ini statis, tidak ada yang perlu di-install.

1. Unduh atau clone repo ini.
2. Jalankan lewat server lokal, misalnya ekstensi **Live Server** di VS Code, atau:
   ```bash
   npx serve
   ```
3. Buka alamat yang ditampilkan (biasanya `http://localhost:3000`).

> Sebagian server lokal tidak mengenali alamat tanpa `.html`. Di GitHub Pages hal ini berjalan normal.

## 🚀 Deploy

Setiap perubahan yang di-push ke branch `main` otomatis tayang lewat GitHub Pages dalam 1–2 menit.

```bash
git add .
git commit -m "Deskripsi perubahan"
git push origin main
```

> ⚠️ Jangan hapus file **`CNAME`**. File ini menjaga domain `ohsnap.web.id` tetap tersambung ke website.

---

© OH SNAP! Photobox. Seluruh konten dan aset dalam repo ini adalah milik OH SNAP! Photobox.

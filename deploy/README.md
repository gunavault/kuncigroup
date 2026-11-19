# Google Cloud runbook — Kunci Group ERP v4

Project `kunci-group-erp-20261116`; VM `kunci-erp-pilot`; zone `us-central1-a`.

## Topologi dan akses

- e2-micro, Debian 12, RAM 1 GiB + swap 3 GiB, disk standar 30 GB. Konfigurasi pilot dengan pengguna terbatas; belum diuji beban ribuan personel.
- IP statis `34.9.120.7`, resource `kunci-erp-public`.
- HTTPS utama: https://kunci-erp-45422633542.us-central1.run.app menggunakan TLS terkelola Cloud Run dan gateway nginx menuju backend privat VM. Caddy lama bukan jalur utama alamat ini.
- Cloud Run `kunci-erp`: request-based billing, minimum0/maksimum1, 1CPU/512MiB, subnet `kunci-proxy` 10.20.0.0/26. Identitas `kunci-proxy` tidak memiliki hak API tambahan.
- Backend Nginx `10.128.0.2:8081` hanya menerima subnet proxy: allow priority800, deny lainnya priority900. Pemeriksaan startup menguji gateway privat, terpisah dari status aplikasi.
- Next.js hanya bind `127.0.0.1:3000`; nginx loopback8080 tetap tersedia untuk pemeriksaan lokal. PostgreSQL hanya loopback5432. SSH hanya via IAP.
- Domain utama `kuncigroup.cloud` tidak diubah. Untuk alamat resmi kemudian, lakukan domain mapping/HTTPS ke Cloud Run dan pasang record DNS yang dihasilkan melalui pemilik DNS. Jangan mengganti record root website.
- Administrator `admin@kuncigroup.cloud`. Kata sandi lokal di `D:\ERPKunciGroup\data\kunci-cloud-access.txt`. Jangan tampilkan file ini dalam log/paket kode.

## Service dan log

```bash
sudo systemctl status kunci-erp caddy
sudo journalctl -u kunci-erp -n 100
sudo journalctl -u caddy -n 100
```

Aplikasi `/srv/kunci/app`, user `kunci`, Node `/opt/node/bin/node`. `.env` memuat kredensial runtime, mode600. Akun database `kunci_app` hanya DML; UPDATE/DELETE audit dan mutasi stok dicabut. Pemilik migrasi `kunci_migrate`; kredensial root-only `/srv/kunci/migrate.env`. Lindungi kedua file.

## Pembaruan

Rilis v4 memakai `deploy/upgrade-v4.sh`. Paket hanya source dari commit yang telah diuji; jangan sertakan `.env`, `data`, `uploads`, `outputs`, `artifacts` atau source workbook. Script mencadangkan database/lampiran/aplikasi, menerapkan migrasi katalog bersama, menguji pada schema sementara, membangun ulang dan menguji API. **Tidak menjalankan impor ulang** atau mereset data. Dependensi dipasang ulang hanya bila lockfile berubah atau belum tersedia.

```bash
sudo bash /home/dharma_regar/upgrade-v4.sh /home/dharma_regar/kunci-erp-v4.tar.gz
```

Sesudah layanan aktif, jalankan `scripts/smoke-v4.ts` dan `scripts/qa-ui-v4.mjs` pada HTTPS publik. `UI_URL` memilih tujuan QA, `SMOKE_URL` untuk smoke. QA v4 pada produksi hanya membaca data dan membuat/mencabut sesi; jangan menjalankan QA v3 yang membuat akun percobaan pada produksi. Backup dan `deploy/verify-restore-v3.sh` menguji pemulihan ke database sementara. Kegagalan upgrade memulihkan aplikasi sebelumnya tanpa mereset database bisnis.

Perintah v2 berikut adalah riwayat rilis lama, bukan prosedur peningkatan v4.

Paket kode harus berisi hanya source, lockfile, migrasi, konfigurasi dan script terpelihara. Paket impor terpisah hanya memuat `drive-normalized.json` dan `drive-inventory.ndjson`, bukan workbook mentah, foto identitas atau kredensial.

```bash
sudo bash /home/dharma_regar/upgrade-v2.sh /home/dharma_regar/kunci-erp-v2.tar.gz /home/dharma_regar/kunci-drive-import.tar.gz
```

Upgrade menyalin dump sebelum migrasi dan source lama, menghentikan layanan selama instalasi/build, menjalankan migrasi, impor idempoten serta pengujian dalam schema terpisah. Build menggunakan satu worker dan memory limit640MB. Ini menimbulkan jeda layanan. Bila gagal, periksa log sebelum menjalankan ulang. Script tidak menghapus data bisnis.

Rilis **khusus kode** (tanpa impor data) memakai `deploy/upgrade-code.sh`. Paket dibuat dari git sehingga `.env`, data dan unggahan tidak ikut, dan skrip menolak arsip yang memuatnya. Tahapnya: backup dan dump awal, salinan rilis lama, migrasi, tes dalam schema sementara, build, lalu restart. Bila satu langkah gagal, file aplikasi lama dipulihkan otomatis.

```powershell
git archive --format=tar.gz -o kunci-release.tar.gz <branch-atau-tag>
gcloud.cmd compute scp kunci-release.tar.gz deploy/upgrade-code.sh kunci-erp-pilot:~ --project=kunci-group-erp-20261116 --zone=us-central1-a --tunnel-through-iap
gcloud.cmd compute ssh kunci-erp-pilot --project=kunci-group-erp-20261116 --zone=us-central1-a --tunnel-through-iap --command "sudo bash ~/upgrade-code.sh ~/kunci-release.tar.gz <label>"
```

Smoke test setelah deploy dari direktori aplikasi:

```bash
sudo -u kunci env PATH=/opt/node/bin:/usr/bin:/bin SMOKE_URL=https://kunci-erp-45422633542.us-central1.run.app /opt/node/bin/node node_modules/tsx/dist/cli.mjs scripts/smoke-operations.ts
```

Smoke operations ditujukan pada kondisi awal impor yang belum diposting; sesuaikan ekspektasi sebelum menjalankannya pada data produksi yang sudah bertransaksi. Jangan mereset database agar sesuai smoke test.

## Cadangan privat dan pemulihan

`/usr/local/sbin/kunci-backup` dijalankan cron pukul18.17UTC/01.17WIB. Paket mencakup `database.dump`, `uploads.tar`, SHA256SUMS dan timestamp. Tidak mencakup `.env`. Cadangan lokal `/var/backups/kunci` mode700 disimpan7hari. Bucket `gs://kunci-group-erp-backups-20261116/daily/` memiliki uniform access, public access prevention dan lifecycle penghapusan setelah14hari.

Akun layanan VM `kunci-backup@kunci-group-erp-20261116.iam.gserviceaccount.com` hanya memiliki `roles/storage.objectCreator` pada bucket, tanpa kunci JSON. Aplikasi tidak diberi hak membaca/menghapus backup. Unggahan menggunakan token metadata sementara dan mencocokkan checksum server. Kegagalan tercatat pada `journalctl -t kunci-backup`; alarm otomatis belum disambungkan.

Jalankan cadangan dan uji pemulihan tanpa menimpa database utama:

```bash
sudo /usr/local/sbin/kunci-backup
sudo bash /srv/kunci/app/deploy/verify-restore-v2.sh
```

Untuk pemulihan bencana, gunakan akun Google Cloud berwenang membaca bucket, unduh paket, verifikasi SHA256SUMS, pulihkan database ke database kosong dan unggahan ke direktori yang dilindungi. Buat kredensial database/runtime baru; password akun aplikasi tetap dari hash dalam database. Jalankan migrasi yang sesuai versi, periksa jumlah master/dokumen/sumber dan keseimbangan jurnal sebelum membuka layanan. Jangan menjalankan `pg_restore --clean` terhadap database utama tanpa rencana pemulihan yang disetujui.

Uji restore rilis ini membuktikan paket lokal identik dengan objek tersimpan melalui checksum unggahan dan dapat memulihkan database/lampiran. Ini belum merupakan simulasi pemulihan VM/region penuh atau bukti RTO/RPO tertentu.

## Biaya

Tidak ada VM tambahan, Cloud SQL, load balancer, Cloud NAT atau GPU. Free Tier tergantung total penggunaan billing account; bukan jaminan gratis. IPv4 publik statis, storage backup, kelebihan disk/egress dan pajak dapat ditagihkan. Periksa Billing project. Referensi resmi: https://docs.cloud.google.com/free/docs/free-cloud-features dan https://cloud.google.com/vpc/network-pricing.

## Penerimaan rilis

Lihat `artifacts/verification-v2.md` untuk hasil aktual. UAT Finance, pemeriksaan sumber historis, uji beban, kamera/GPS perangkat nyata dan konektor eksternal tetap diperlukan sebelum penggunaan penuh.

## Konfigurasi pintu masuk terkelola

`deploy/cloudrun-proxy.yaml` memuat konfigurasi gateway Nginx tanpa kata sandi, source ERP atau data sumber. Image resmi Docker Hub diresolusikan menjadi digest immutable pada revision Cloud Run. `deploy/private-backend.sh` memasang listener privat di VM. Layanan ini memakai Direct VPC egress tanpa konektor berbayar/VM tambahan. Rujukan: https://docs.cloud.google.com/run/docs/deploying dan https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc.

```powershell
gcloud.cmd run services replace deploy/cloudrun-proxy.yaml --project=kunci-group-erp-20261116 --region=us-central1
```

Minimum nol memungkinkan skala ke nol; akses pertama setelah idle dapat lebih lambat. Batas satu instans terkelola membatasi kapasitas dan bukan jaminan biaya nol. Cloud Run, IPv4 VM dan bucket dikenakan biaya sesuai penggunaan/kuota. Periksa Billing. Tidak ada Compute Engine VM baru untuk gateway ini.

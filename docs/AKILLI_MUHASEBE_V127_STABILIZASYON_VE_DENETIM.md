# Akıllı Muhasebe PRO — v1.2.7 Stabilizasyon ve Denetim Kaydı

**Tarih:** 21 Kasım 2026  
**Kaynak sürüm:** v1.2.6 / Android versionCode 21  
**Korunan paket kimliği:** `com.tugunal.akillimuhasebe.stable`  
**Temel kaynak commit:** `ab675a2524078fe2431f56b1e5249f75c926c7b4`  
**Geliştirme dalı:** `akilli-muhasebe-v1.2.7-stabilization`  
**Orijinal v1.2.6 APK:** Kullanıcı tarafından sağlandı; yerinde değiştirilmedi.  
**Dağıtım durumu:** Bu dal bir geliştirme çalışmasıdır. Kullanıcıya yeni v1.2.7 APK yayımlandığı anlamına gelmez.

## Amaç ve değişmez kurallar

1. v1.2.6 sürümündeki firma, cari, banka, fatura, belge OCR, stok, kasa, fiş, rapor, şifreli yedekleme ve giriş ekranlarını korumak.
2. Mevcut verileri silmemek; Android paket kimliğini veya kalıcı imza sertifikasını değiştirmemek.
3. Giriş, dosya içe aktarma veya kayıt başarısız olduğunda hatayı başarı olarak göstermemek.
4. Mevcut `akilli-muhasebe` üretim dalına doğrudan dokunmamak; değişiklikleri ayrı daldan test etmek.
5. Resmî GİB/SGK entegrasyonlarını varmış gibi göstermemek; yasal kayıt ve beyanname gönderimlerini yetkili servisler kurulmadan açmamak.

## v1.2.7 stabilizasyon dalında ele alınan kaynak kodu sorunları

- **Parola uzunluğu:** Yeni hesap 8–64 karakter kabul ederken ilk cihaz PIN'i 32 karakterle sınırlıydı. Android başlangıç doğrulayıcısı 64 karakterle uyumlu hâle getirildi.
- **Eski 6–7 karakterli PIN:** Eski cihaz PIN'i yalnızca geçmiş kayıtları doğrular. Yeni yerel hesabın parolası ayrıca 8–64 karakter olarak seçilir ve tekrarlanır.
- **Veri saklama doğrulaması:** Yerel şifreli kayıtların `SharedPreferences` yazımı `apply()` yerine sonucu doğrulanabilir `commit()` kullanır; başarısız kayıt başarı sayılmaz.
- **Kayıt sonrası yetkilendirme:** Uygulama ancak şifreli profil kaydı başarıyla gerçekleştiğinde kilit ekranından çıkabilir.
- **Yarım kalan kullanıcı kaydı:** Profil yazılamazsa yalnızca henüz tamamlanmamış yeni yerel hesabın kimlik bilgileri geri alınır.
- **Profil bilgisi güncelleme:** Android giriş sicili ile profil kaydı birlikte güncellenmeye çalışılır; profil yazılamazsa daha önceki e-posta ve telefon geri yüklenir.
- **Şifreli veritabanı bozulması:** Doğrulanmış kullanıcı için kurtarma ekranı açılır; kayıtların üzerine otomatik boş veritabanı yazılmaz.
- **Regresyon testi:** Yeni ve eski hesap, farklı e-posta/telefon biçimleri, yanlış şifre, başarısız profil yazımı, başarısız kullanıcı kaydı, eski PIN geçişi ve şifreli veri kurtarma senaryoları eklenmiştir.

## Kontrol edilen mevcut modüller ve sınırlar

| Alan | Mevcut temel işlev | Resmî entegrasyon |
| --- | --- | --- |
| Firma / mükellef | Birden çok işletme ve şirket verisi | Canlı GİB mükellef senkronizasyonu yok |
| Fatura | Alış/satış taslakları, vergi tutarı, vade, OCR, UBL-TR XML | GİB e-Fatura/e-Arşiv gönderimi yok |
| Muhasebe | Kasa, cari, taslak çift taraflı fiş, borç/alacak dengesi | Resmî yevmiye/kebir/e-Defter gönderimi yok |
| Banka | CSV/TXT/XLSX ekstre, mutabakat önerisi, kullanıcının onayı | Banka API erişimi yok |
| Belge | Kamera, fotoğraf, PDF OCR; fiş, irsaliye, POS ayrıştırma | Belgelerin hukuki doğruluğu otomatik onaylanmaz |
| Stok | Stok kartı, giriş/çıkış, irsaliye ile ilişkilendirme | Otomatik vergisel kayıt üretilmez |
| Personel | Personel ve ücret ön hesaplamaları | Resmî bordro/SGK gönderimi yok |
| Güvenlik | Android Keystore, AES-GCM, yerel kimlik doğrulama, parola korumalı yedek | Bulut senkronizasyonu yok |

## Yayımlama ve imzalama engeli

GitHub Actions üretim sertifikasının bulunmasını zorunlu kılar. Aşağıdaki GitHub Actions sırları yapılandırılmadığında iş akışı yalnızca imzasız APK imzalama girdisini saklar; **kurulabilir APK yayımlamaz**:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Anahtarları, parolaları, tam anahtar dosyalarını, mükellef bilgilerini ve kişisel verileri GitHub'a veya bu belgeye yüklemeyin. Dağıtım öncesinde orijinal APK ile sertifika eşleşmesi kontrol edilmelidir.

## Kalan işler — önceliklendirilmiş

### P0 — Veri kaybı ve kimlik doğrulama
- Son GitHub Actions işinin **başarılı** olmasını doğrulamak; Java derleme, Node muhasebe/testleri, XML kontrolleri ve APK paket testlerini geçirmek.
- Gerçek Android cihazda yeni kayıt, eski PIN geçişi, 64 karakterli parola, şifre değişimi, uygulamayı kapat/aç, yanlış şifre ve veritabanı kurtarma denemeleri.
- Kaydetme başarısız olduğunda tüm finansal modüllerde görsel ve kalıcı veri tutarlılığını test etmek.
- Şifreli yedek alıp ayrı test cihazında geri yükleyerek yeni sürüm geçişini doğrulamak.

### P1 — Muhasebe doğruluğu
- Kuruş hassasiyeti, farklı KDV oranları, mükerrer faturalar, banka mutabakatları, otomatik fişler, tahsilat/ödeme ve silme ilişkileri için geniş regresyon testleri.
- İrsaliye/fatura/stok eşleştirmesinde ikinci kez mali kayıt veya stok hareketi oluşmasını önleyen senaryoları büyütmek.
- Resmî muhasebe fişleri, mizan, gelir tablosu, bilanço ve hesap planı kontrollerini ayrı uzman denetimine hazırlamak.

### P1 — Çok kullanıcılı çalışma
- Mevcut cihaz içi profillerin aynı işletme veri havuzunu paylaşması nedeniyle, hesap ve şirket bazlı veri erişim/yetki matrisini tasarlamak.
- Rol denetimini yalnızca WebView/JavaScript katmanına bırakmamak; yerel saklama ve sunucu açıldığında servis katmanında da uygulamak.
- Yeni senkronizasyon tasarlanmadan önce eski kullanıcı kayıtlarıyla uyumlu veri taşıma planı oluşturmak.

### P2 — Entegrasyonlar ve yayımlama
- GİB e-Fatura/e-Arşiv/e-Defter ve SGK için yetkili servis, test ortamı, hukuki yükümlülükler ve kimlik doğrulama gerekliliklerini karşılamak.
- Banka bağlantıları için onaylı API ve yetki süreçleri; çevrimdışı içe aktarmanın çalışır durumda kalması.
- Kalıcı sertifika GitHub Actions secrets içine **güvenli olarak** tanımlandıktan sonra imzalı tek APK ve sürüm doğrulamasını etkinleştirmek.
- Google Play için uygun release AAB, gizlilik/veri politikaları ve cihaz testlerini tamamlamak.

## Test ve kanıt kayıtları

- Ana dal: https://github.com/tugunal/tugunal/tree/akilli-muhasebe
- Stabilizasyon dalı: https://github.com/tugunal/tugunal/tree/akilli-muhasebe-v1.2.7-stabilization
- Son temel başarılı iş: https://github.com/tugunal/tugunal/actions/runs/44923978668
- Stabilizasyon CI: https://github.com/tugunal/tugunal/actions/workflows/android.yml
- Testler: `.github/scripts/accounting_smoke_tests.js`, `.github/scripts/auth_flow_tests.js`, `.github/scripts/document_parser_tests.js`, `.github/scripts/release_policy_tests.py`

**Not:** CI'nin yeşil olması uygulamanın gerçek telefonda kusursuz çalıştığını kanıtlamaz. Özellikle kamera/OCR, Android uygulama kilidi, izinler, banka dosyaları ve otomatik güncelleme fiziksel cihazda test edilmelidir.

## Gelecekte istenecek PDF raporuna kaynak

Bu belge, daha sonra hazırlanacak PDF için temel denetim metnidir. PDF'nin hazırlanacağı tarihte GitHub'daki en son commit, test/derleme sonuçları, yapılan/yapılmayan işler, eksik yetkiler ve APK imzalama durumu yeniden doğrulanmalıdır.

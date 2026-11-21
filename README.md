# Akilli Muhasebe

Turkce, Android tabanli, cevrimdisi oncelikli muhasebe takip uygulamasi.

## Surum 0.5.0 modulleri

- Birden fazla mukellef / firma profili ve firma bazli veri ayrimi
- Firma kartlari: isletme turu, vergi dairesi, vergi numarasi/TCKN, iletisim, mali yil
- Musteri ve tedarikci cari kartlari; acilis alacagi ve borcu
- Gelir ve gider kayitlari; kasa ve banka bakiyeleri
- Alis / satis fatura taslaklari, KDV, vade ve odeme tutari takibi
- Fatura fotografi icin cihaz uzerinde OCR metin tanima (Latin alfabesi)
- OCR ile onerilen fatura numarasi, vergi no, tarih, matrah ve KDV alanlari
- Otomatik cift tarafli muhasebe fis taslaklari; borc/alacak esitligi kontrolu
- Cari hesap hareketleri, musteri tahsilati ve tedarikci odemesi
- Cek ve senet kaydi; vade ve durum takibi
- Gunluk kasa defteri; acilis, tahsilat, odeme ve kapanis bakiyesi
- Aylik gelir-gider karsilastirmasi ve degisim orani
- Vadesi gecen faturalar icin uygulama ici uyari
- Personel kayitlari ve basit bordro on hesaplari
- Demirbas ve dogrusal amortisman tahmini
- Vergi / odeme hatirlatmalari
- CSV disari aktarma
- PIN girisi ve arka planda kalinca otomatik kilitleme
- Android Keystore ile yerel veritabani sifreleme
- Parola tabanli AES-GCM sifreli yedekleme ve geri yukleme

## Muhasebe otomasyonu sinirlari

Otomatik fisler on taslaktir; hesap kodlari ve kayitlar yetkili muhasebe meslek mensubu tarafindan kontrol edilmelidir. Uygulama resmi yevmiye defteri veya kebir defteri kaydi yapmaz. Cek/senet durumu degistirmek banka tahsilati veya odemesi gerceklestirmez; fiili hareket ayri kaydedilmelidir.

## OCR sinirlari

Fatura fotograflarindaki metin cihazda ML Kit ile okunur. Ilk surum yalnizca Latin alfabesi OCR modelini icerir; basili ve net faturalar icin uygundur. El yazisi, dusuk cozunurluk, egik veya cok karmasik faturalar yanlis okunabilir. OCR sonucu otomatik olarak resmi kayit veya beyanname sayilmaz; muhasebeci her alani kontrol edip onaylamalidir. PDF fatura dosyalarinin dogrudan OCR ile okunmasi bu surumde yoktur.

## APK derlemesi

GitHub Actions, `akilli-muhasebe` dalina yapilan push sonrasi JavaScript ve Android XML kontrollerini calistirir, ardindan debug APK uretir. APK, GitHub deposunda Actions > ilgili calisma > Artifacts alanindan indirilebilir.

## Onemli sinirlar

Bu surum resmi GIB e-Fatura/e-Arsiv gonderimi, beyanname gonderimi, SGK bildirgesi veya banka API entegrasyonu yapmaz. Fatura/KDV ve bordro ekranlari veri hazirlama ve on hesaplama amaclidir. Resmi islem icin GIB/SGK yetkileri, ilgili servis sozlesmeleri, guncel mevzuat ve yetkili meslek mensubu kontrolu gerekir.

Bordro neti, girilen brut + ek odeme - kullanicinin girdigi kesintiler olarak hesaplanir; vergi ve SGK mevzuati hesaplamasi degildir. Demirbas amortisman gostergesi dogrusal yontemli yaklasik bir bilgilendirmedir.

## Veri guvenligi

Kayitlar aktif firma bazinda ayrilir ve cihazda Android Keystore tabanli AES-GCM ile sifrelenir. Yedek dosyalari kullanicinin belirledigi parola ile PBKDF2-HMAC-SHA256 ve AES-GCM kullanilarak sifrelenir. Yedek parolasi unutulursa yedek acilamaz. Uygulama otomatik bulut senkronizasyonu yapmaz.


## Surum 0.6.0 - uygulama ici guncelleme

- Uygulama acildiginda GitHub Releases uzerinden guncelleme kontrolu
- Ana ekranda ve ayarlarda "Guncellemeleri kontrol et" / "Guncelle" butonlari
- APK indirme, SHA-256 dogrulamasi ve Android paket kurucusunu acma
- GitHub Releases alanina surumlu APK yayinlama
- Release APK'lari sabit Android imza anahtariyla imzalanir

### GitHub Actions imzalama sirri

Repo Settings > Secrets and variables > Actions altinda su repository secrets degerlerini tanimla:
- ANDROID_KEYSTORE_BASE64
- ANDROID_KEYSTORE_PASSWORD
- ANDROID_KEY_ALIAS
- ANDROID_KEY_PASSWORD

Bunlar olmadan workflow yalnizca debug APK uretir ve GitHub Release yayinlamaz. Ilk imzali surumden sonraki APK guncellemeleri ayni anahtarla imzalanmalidir. Imza anahtarini kaybetme veya degistirme.

Eski 0.5.x debug APK'lari farkli gecici debug sertifikalariyla derlenmistir; Android bu uygulamayi yeni kalici imzali anahtarla dogrudan uzerine kurmaya izin vermez. Ilk geciste uygulama icinden sifreli yedek al, eski APK'yi kaldir, ilk imzali APK'yi kur ve yedegi geri yukle. Sonraki surumlerde uygulama ici guncelleme calisir.

## Surum 0.7.0 - banka ekstreleri, PDF ve denetim

- Banka ekstrelerinin CSV, TXT ve XLSX olarak cihaz uzerinde okunmasi
- Tarih/aciklama/tutar/borc/alacak/referans sutun eslemesi; kullanici on izleme ve onayi
- Tekrar eden dosya ve satirin ikinci kez aktarilmamasi
- Mevcut gelir-gider hareketiyle ayni banka hesabi, tutar ve yakin tarihe gore esleme ONERISI
- Eslemelerin manuel onaylanmasi; istenirse bankadan taslak hareket ve dengeli muhasebe fisi olusturma
- PDF faturalarin ilk 3 sayfasinin cihazda OCR ile okunup kontrol edilebilir taslak haline getirilmesi
- Tekrar eden fatura, dengesiz muhasebe fisi, bozuk toplam, eksik vergi no, vadesi gecen fatura ve eslesmeyen ekstreye yonelik kuralli hata denetimi
- Github Actions uzerinde JavaScript finansal kural testleri

Ekstre dosyasi yuklemek kendi basina kasa/banka bakiyesini DEGISTIRMEZ.
Yeni hareket olusturulmasi sadece kullanicinin acik onayi ile olur.
Bu surum herhangi bir bankaya, GIB'e veya SGK'ya canli baglanmaz; resmi mutabakat/defter degildir.
XLS uzantili eski Excel bicimi ve banka PDF ekstresi bu surumde desteklenmez.
PDF okuma baski kalitesine ve belgenin yerlesimine bagli olarak hata yapabilir.


## Sürüm 0.8.0 - uygulama içi belge kamerası

- Ana ekrandaki "Fotoğraf çek" ve Faturalar ekranındaki "Uygulama İçi Kamerayla Fotoğraf Çek" düğmeleri
- Android CameraX ile uygulama içinde canlı kamera ön izlemesi
- Belgeler için arka kamera; varsa flaş ışığını aç/kapat
- Fotoğrafı çek, ön izlemede kontrol et, yeniden çek veya onayla
- Onaylanmış fotoğrafın yerel ML Kit OCR'ye gönderilmesi
- OCR sonucunu fatura taslağına aktarmadan önce kontrol ve manuel düzeltme
- Kamera görüntüsü cihazdan sunucuya yüklenmez; geçici fotoğraf okuma tamamlandığında silinir
- Uygulamanın kendi kamera ekranından dönüş, ekranı yeniden PIN girişine yönlendirmez
- Diğer uygulamaya geçince mevcut güvenlik kilidi davranışı korunur

### Telefon testi

1. Uygulamayı aç ve PIN ile giriş yap.
2. Ana sayfa > Fotoğraf çek'e dokun. İlk kullanımda kamera izni ver.
3. Belgeyi çerçevele, ışığı değiştir ve Fotoğraf Çek'e dokun.
4. Yeniden Çek / Fotoğrafı Kullan düğmelerini kontrol et.
5. Onayla; Faturalar ekranına dönüp okunan metni incele ve alanları düzelt.
6. Kamera ekranında Geri'ye basıp uygulamanın şifre ekranına atmadığını kontrol et.
7. Galeriden JPEG/PNG/WEBP ve PDF ile eski belge seçimi akışının çalıştığını da doğrula.

Not: v0.8.0 geçici fotoğraf dosyalarını arşive kaydetmez, yalnızca OCR taslağı hazırlar. Fotoğrafın aslı gerekiyorsa cihazda ayrıca güvenli biçimde saklayın. Test APK'ları farklı imzalarla derlenebildiğinden, mevcut test sürümünün üzerine kurulum garanti değildir; önce şifreli yedek alın.

## Surum 0.9.0 - urun kalemleri ve irsaliye aktarimi

- Uygulama ici kamera, galeri veya PDF'den cevrimdisi OCR ile belge okuma
- Belge turleri: market/perakende fisi, e-Fatura/e-Arsiv, irsaliye, POS slipi, diger
- OCR satir koordinatlarindan tablo satirlarini yeniden siralama; fotograf donuk olsa bile Android ML Kit'in duzelttigi okuma koordinatlarini kullanma
- Urun kodu, urun adi, miktar, birim, birim fiyati, satir tutari ve satirdaki KDV orani
- Fis/fatura numarasi, tarih/saat, firma, vergi numarasi, odeme turu, matrah/KDV/toplam
- Ayni urun fis uzerinde birden fazla kez yaziliysa miktarlari birlestirme (orn. uc ekmek)
- Fotografun icindeki POS slipini ikinci gider/odeme haline getirmeme
- Son kullanicinin belirttigi 10 kalem yapim malzemeli belgeyi IRSALIYE olarak siniflandirma
- Irsaliye fatura degildir: belge ve urunler kaydedilir; KDV/gider/defter kaydi otomatik olusturulmaz
- Irsaliyeyi daha sonra secilen faturaya baglama (muhasebe fisini tekrar olusturmaz)
- Kullanici oncesinde belgelerin ve tum satirlarin manuel kontrolu/duzeltmesi, sonrasinda arşivde kayit
- Belge ayni OCR metniyle tekrar okutulursa mukerrer arsiv kaydina izin verilmez
- Fatura belgelerinin kontrol edildikten sonra fatura taslagina aktarilmasi; urun kalemlerinin faturada da saklanmasi
- Belgeler tum firmalar arasinda ayridir ve sifreli yerel veri tabaninda saklanir
- Kamera goruntuleri ve OCR ham metni internete gonderilmez; sadece yerel sifreli kayda aktarilir
- Uygulama tarafinda banka/POS/GIB/SGK servislerine dogrudan gonderim yoktur

Sinirlar:
OCR yanilabilir. Cok sutunlu/egik/elle yazili belgeler, iptal/iskonto/kampanya satirlari ve farkli KDV oranlari elle kontrol edilmelidir. Irsaliye islemindeki el yazisi notlar vergisel veya odeme belgesi sayilmaz. Resmi e-Fatura onayi ve KDV indirim hakki icin meslek mensubu ve ilgili GIB sistemleri gerekir. Bu surumde taranan belge fotografinin kendisi arşivlenmez; onaylanan bilgi ve OCR metni saklanir. Normal gelire/gidere veya resmi beyannamelere otomatik gonderim yoktur. Fis gideri ve e-fatura taslagi kullanici acik onayiyla olusturulur.


## v0.9.1 - Install conflict repair / parallel migration

Previous v0.6-v0.9 test APKs were signed with a different ephemeral GitHub Actions debug keystore for every run. Android correctly rejects an in-place update whose signing certificate is different. The old installed app cannot be updated in-place without that lost key.

This release uses a permanent new application ID for release-only builds:
`com.tugunal.akillimuhasebe.stable`. It can be installed side-by-side with the old test app without deleting existing data. The new name is "Akıllı Muhasebe Yeni". Before uninstalling anything, use the old app's encrypted backup feature and restore it into the new one. Check records before removing the old app.

The source contains no private release keys. GitHub Actions produces an unsigned stable release APK for separate signing only when ANDROID_KEYSTORE_* repository secrets are absent. Sign the unsigned release using the separately backed-up permanent keystore with the official Android apksigner. NEVER distribute the unsigned build as an installable APK.

Future versions must retain both the `.stable` application ID and the same release signing key. To automate publishing GitHub Releases and in-app update checks, securely configure the repository's four ANDROID_KEYSTORE_* Actions secrets. The key and passwords must not be committed to source control.


## Akilli Muhasebe v1.0.0 — yeniden yapilandirilan calisma alani

Hedef: tek giris, tutarli kayit ve mobil/masaustu ekran duzeni.
Uygulamanin bir onceki v0.9.1 stabil paket kimligi (`com.tugunal.akillimuhasebe.stable`) ve yerel sifreli veri bicimi korunur; imza anahtari da onceki stabil surumle ayni olmali.

### Kaynak yapisi

- `app/src/main/assets/index.html`: sadece HTML ekranlar ve formlar
- `app/src/main/assets/css/workspace.css`: masaustu sol menu, mobil alt menu, form ve rapor stilleri
- `app/src/main/assets/js/accounting_rules.js`: salt-okunur, test edilebilir hesaplama ve kayit kurallari
- `js/app_model.js`: eski verilerin uyumlu yuklenmesi, firma ayirimi ve muhasebe veri modeli
- `js/app_main.js`: sifre/guncelleme/anasayfa ve veri giris ekranlari
- `js/app_records.js`: fatura/gelir-gider/cari/veri kayitlari
- `js/app_reports.js`: mali raporlar, yedekleme, CSV disari aktarma
- `js/app_bank.js`: banka ekstresi, sutun esleme, mutabakat
- `js/app_documents.js`: kamera/PDF/galeri OCR sonucu ve belge arşivi
- `js/app_stock.js`: urun kartlari, stok giris-cikis ve irsaliye baglantisi
- `js/workspace.js`: module navigation, bekleyen isler, audit ekleri
- `js/app_init.js`: tum moduller yuklendikten sonra uygulamayi baslat
- `document_parser.js`: fiş, e-fatura, irsaliye, POS slipi satir ayristiricisi

### Calisan is akislari

1. Firmayi sec: gelir-gider, banka, cari, belge ve stok kayitlari firmaya gore ayrilir.
2. Belge tarama: kamera/galeri/PDF metni cihaz uzerinde okunur; kullanici belge turunu ve satirlarini dogrular.
3. Fatura ve fiş: fatura taslagi ilgili cariye; fiş gideri yalnizca onayla olusturulur. POS slipi ikinci gider olusturmaz.
4. Irsaliye: belge arşivinde ayri kalir. Istenirse ilgili faturayla baglanir; onayla depo giris-cikis hareketine aktarilir.
5. Kasa, banka, cari ve taslak muhasebe fişleri: onayli hareketler ve borc-alacak dengesi korunur.
6. Stok: malzeme kartlari, acilis, giris-cikis, kontrolsuz negatif stok engeli, tek irsaliyeden ikinci stok hareketi engeli.
7. Kontrol: dengesiz fişler, mükerrer fatura, eslesmeyen banka, bekleyen irsaliye ve negatif stok uyarilari.
8. Sifreli yedekleme/geri yukleme ve güvenli yerel veri kurtarma.

### Dogrulama

`node .github/scripts/accounting_smoke_tests.js` ve
`node .github/scripts/document_parser_tests.js`.
GitHub Actions ayrica tum JavaScript dosyalarinin soz dizimini, kaynak XML'leri ve Android APK derlemesini kontrol eder.

### Resmi entegrasyonlar

Bu sürüm **GIB e-Fatura/e-Arsiv/e-Defter gondermez**, SGK bildirgesi hazirlayip sunucuya yollamaz, banka hesaplarina uzaktan baglanmaz, mevcut kullanicilari bulutta senkronize etmez. Bordro tahminleri mevzuata uygun bordro yerine gecmez. Bunlar icin yetkili servis saglayicilari, guncel oranlar, sozlesmeler ve yetki gereklidir.

### Mobil kurulum

Onceki `.stable` paketini kullaniyorsan ayni sertifika ile imzalanan v1.0.0 release APK'sini ustune kur; yedek alma tavsiye edilir. Onceki `.akillimuhasebe` debug paketi farkli uygulamadir; eski kayitlari sifreli yedekle tasiyip yeni `.stable` uygulamaya geri yukle. Imza sertifikasinin degismesi halinde Android kurulumu engeller; APK'yi zorla yuklemek icin eski verileri silme.

## v1.0.1 - Android kurulum sorunu onarimi

0.9.1 ve 1.0.0 icin dogrulanan release sertifikasi ayni olsa da Android uzerinde
INSTALL_FAILED_UPDATE_INCOMPATIBLE, yukleme izinleri, depolama yetersizligi,
cihaz surumu veya dosya aktarimi gibi sebeplerle kurulum reddedilebilir.
Bu surumde iki ayri Android release paketi bulunur:

- `release`: `com.tugunal.akillimuhasebe.stable`. Eski 0.9.1/1.0.0
  kalici imzali uygulamaya ayni sertifika ile yukseltme.
- `installfix`: `com.tugunal.akillimuhasebe.kurulum`. Tamamen ayri paket
  kimligi, ekranda `Akilli Muhasebe Kurulum` adi. Eski uygulamanin yanina
  kurulur. Eski uygulamanin verilerini silmez.
- Her iki paketin ayni *kalici* release sertifikasiyla imzalanmasi gerekir.
- Dosyalar user tarafindan APK olarak acilmalidir; ZIP veya unsigned APK
  dogrudan kurulamaz.

Kullaniciya mevcut uygulamayi silmesi soylenmez. Eski uygulamadan
Ayarlar -> Sifreli Yedek -> Yeni Uygulamaya Yedekten Geri Yukle
akisiyla tasinabilir. Eski uygulama kurulu olarak kalabilir.
Yeni kurulum basarisizsa telefondaki tam hata mesaji / Android surumu
incelenmelidir. Fiziksel cihazda test yapilmadan uyumluluk garanti edilemez.


## v1.2.0 – Kararlı yerel çalışma sürümü

UBL-TR XML okuma, belge satırı ayrıştırma ve kontrol, beş ayrı CSV aktarımı,
PIN değişikliği ve Android üzerinde şifreli kayda PIN doğrulaması, fiş dengesi,
kuruş duyarlılığında faturalar ve mükerrer banka eşleştirme önlemleri eklendi.

Aynı kalıcı imza anahtarıyla imzalanacak iki APK vardır:
`.stable` mevcut kalıcı sürümü, `.kurulum` ise v1.0.1 Yeni Kurulum sürümünü
günceller. GitHub Releases kaydı oluşturulduğunda in-app updater kendisiyle
aynı paket kimliğine sahip APK'yı seçer.

Bu yerel muhasebe uygulaması GİB veya SGK resmî gönderimi, canlı banka hesap
API bağlantısı, yasal bordro veya e-Defter tasdik işlevi içermez. Bu
bağlantıların tamamlanması için kullanıcı hesabı, resmî servis izinleri,
güncel mevzuat kontrolleri ve fiziksel cihaz denemeleri gereklidir.


## v1.2.1 — Kullanıcı kayıt ekranı
- İlk kullanımda ad, soyad, e-posta, telefon, kullanıcı türü ve işletme/büro bilgileri alınır.
- Kullanıcı bu cihaz için 6–32 karakterlik PIN belirler ve tekrar ederek doğrular.
- Kullanıcı profili mevcut Android Keystore şifreli yerel veri tabanında saklanır.
- Mevcut kullanıcıların PIN giriş akışı korunur; ilk kayıt ekranı yalnızca cihazda PIN yoksa açılır.
- Ayarlar içinden profil görüntülenebilir ve güncellenebilir.
- Bu ekran çevrimdışı yerel profil oluşturur; Firebase hesabı, e-posta doğrulaması veya cihazlar arası senkronizasyon sağlamaz.

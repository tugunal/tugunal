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

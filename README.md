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

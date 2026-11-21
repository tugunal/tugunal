# Akilli Muhasebe

Turkce, Android tabanli, cevrimdisi oncelikli muhasebe takip uygulamasi.

## Surum 0.2.0 modulleri

- Firma / muhasebe burosu ayarlari
- Musteri ve tedarikci cari kartlari
- Gelir ve gider kayitlari
- Kasa, banka ve diger hesap bakiyeleri
- Alis / satis fatura taslaklari, KDV ve vade takibi
- Personel kayitlari
- Brute dayali basit bordro on hesaplari
- Demirbas ve dogrusal amortisman tahmini
- Vergi / odeme hatirlatmalari
- Gelir-gider, KDV, varlik ve personel ozet raporlari
- CSV disari aktarma
- PIN girisi ve arka planda kalinca otomatik kilitleme
- Android Keystore ile yerel veritabani sifreleme
- Parola tabanli AES-GCM sifreli yedekleme ve geri yukleme

## APK derlemesi

GitHub Actions, `akilli-muhasebe` dalina yapilan push sonrasi JavaScript ve Android XML kontrollerini calistirir, ardindan debug APK uretir. APK, GitHub deposunda Actions > ilgili calisma > Artifacts alanindan indirilebilir.

## Onemli sinirlar

Bu surum resmi GIB e-Fatura/e-Arsiv gonderimi, beyanname gonderimi, SGK bildirgesi veya banka API entegrasyonu yapmaz. Fatura/KDV ve bordro ekranlari veri hazirlama ve on hesaplama amaclidir. Resmi islem icin GIB/SGK yetkileri, ilgili servis sozlesmeleri, guncel mevzuat ve yetkili meslek mensubu kontrolu gerekir.

Bordro neti, girilen brut + ek odeme - kullanicinin girdigi kesintiler olarak hesaplanir; vergi ve SGK mevzuati hesaplamasi degildir. Demirbas amortisman gostergesi dogrusal yontemli yaklasik bir bilgilendirmedir.

## Veri guvenligi

Uygulama kayitlari cihazda Android Keystore tabanli AES-GCM ile sifrelenir. Yedek dosyalari kullanicinin belirledigi parola ile PBKDF2-HMAC-SHA256 ve AES-GCM kullanilarak sifrelenir. Yedek parolasi unutulursa yedek acilamaz. Uygulama otomatik bulut senkronizasyonu yapmaz.

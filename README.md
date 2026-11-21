# Akilli Muhasebe

Android tabanli, Turkce, cevrimdisi oncelikli muhasebe takip uygulamasi.

## Ilk surum

- Firma ve musteri kayitlari
- Alis/satis fatura taslaklari ve KDV hesaplama
- Gelir-gider kayitlari
- Cari hesap ozeti
- Kasa ve banka hesaplari
- Personel kayitlari
- Vergi ve odeme hatirlaticilari
- Raporlar ve CSV aktarimi
- Belge arsivi kayitlari
- Sifre/PIN girisi
- Android Keystore ile yerel veritabani sifreleme
- JSON yedekleme ve geri yukleme

## Derleme

GitHub Actions, akilli-muhasebe dalina yapilan her push sonrasinda debug APK uretir. APK, Actions calismasinin artifact bolumunden alinabilir.

## Onemli sinir

Bu ilk surum resmi GIB e-Fatura/e-Arsiv gonderimi, SGK bildirgesi veya beyanname gonderimi yapmaz. Bu entegrasyonlar icin ilgili resmi servis/ozel entegrator sozlesmeleri, yetkiler ve kullanici onaylari gerekir. Ilk surum veri hazirlama, takip, hesaplama ve raporlama aracidir.

## Veri guvenligi

Kayitlar cihazda tutulur ve Android Keystore tabanli AES-GCM ile sifrelenir. Uygulama otomatik bulut senkronizasyonu yapmaz. Gercek musteri verisi kullanilmadan once yedekleme ve cihaz guvenligi test edilmelidir.

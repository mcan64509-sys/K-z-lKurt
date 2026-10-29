# Kızıl Kurt Kurucu Bot

Bu sürüm `/kur` komutuyla Kızıl Kurt sunucusunun sade rol/izin düzenini, destek sistemini, yönetim loglarını ve General/F9/Boss odalarını sıfırdan oluşturur.

- Yeni giren üyeye yalnızca `🔒・KAYITSIZ` rolü verilir.
- Kayıtsız üye yalnızca Hoş Geldiniz yazı/ses alanını ve destek kanalını görür.
- Yetkili `/kayit üye` komutuyla `🐺・KIZIL KURT` rolünü verir.
- Kızıl Kurt rolü verilince takma ada otomatik `【𝐊𝐙𝐋】` eklenir; rol kaldırılınca etiket silinir.
- `🟠・DOST` genel/bilgilendirme alanlarını, `🐺・KIZIL KURT` ise boss-log ve tüm üye alanlarını görür.

## Railway Variables

```env
TOKEN=Discord bot tokeni
CLIENT_ID=1565487624129486848
GUILD_ID=1229703353378799749
SETUP_ENABLED=true
INVITE_FILTER=true
SPAM_FILTER=true
ANTI_NUKE=true
DATABASE_URL=Railway PostgreSQL bağlantısı (isteğe bağlı ama önerilir)
```

Bot rolünü sunucudaki diğer rollerin üzerine taşıdıktan sonra `/kur` komutunu kullanın. Komut mevcut kanal ve yönetilebilir rolleri kalıcı olarak siler.

Kurulumdan sonra General/F9 ses ve metin kanalları ile boss bildirim kanalının ID'leri alınarak log-boss motoruna bağlanacaktır.

## Final sistemler

- General ses: `1565495800677666866`
- General log: `1565495798735835197`
- F9 ses: `1565495802904977478`
- F9 log: `1565495801755467937`
- Boss bildirim: `1565495798064746546`
- Log yetkilisi: `1565495763470000140`
- General/F9 bildirimleri boss saatinden 10 dakika önce gelir.
- Jotun bildirimi Türkiye saatiyle `00:15`, `18:15`, `21:15` saatlerinde gelir.
- General/F9 set, bağımsız General kıvrık, manuel ekleme/silme, sonuç ve log geri alma vardır.
- `/çal`, `/geç`, `/durdur`, `/kuyruk`, `/şimdiçalıyor` müzik komutları vardır.

Final Railway Variables:

```env
TOKEN=Discord bot tokeni
CLIENT_ID=1565487624129486848
GUILD_ID=1229703353378799749
DATABASE_URL=${{Postgres.DATABASE_URL}}
YOUTUBE_COOKIES=Netscape cookies.txt içeriği
SETUP_ENABLED=false
INVITE_FILTER=true
SPAM_FILTER=true
ANTI_NUKE=true
```

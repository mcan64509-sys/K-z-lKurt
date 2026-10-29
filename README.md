# Kızıl Kurt Kurucu Bot

## v2.1 sade kanal düzeni

Boss Bildirimleri, General ve F9 üstte ayrı ve sade alanlardır. General/F9 set logları, ticket kayıtları ve birleştirilmiş sistem kayıtları yalnızca yetkililerin gördüğü en alttaki `📋・LOGLAR` kategorisinde tutulur.

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

- General ses: `1565503101698441226`
- General log: `1565503099303628870`
- F9 ses: `1565503103715901440`
- F9 log: `1565503102759739663`
- Boss bildirim: `1565503098347200722`
- Log yetkilisi: `1565503060900446430`
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

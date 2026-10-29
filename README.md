# Kızıl Kurt Kurucu Bot

Bu sürüm `/kur` komutuyla Kızıl Kurt sunucusunun rollerini, kategorilerini, destek sistemini ve General/F9/Boss odalarını sıfırdan oluşturur.

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

require('dotenv').config();

const {
  ActionRowBuilder,
  AttachmentBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const storage = require('./storage');
const systems = require('./systems');

function envValue(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  return value.replace(/^(["'])(.*)\1$/, '$2').trim();
}

// Railway Raw Editor bazen değerleri tırnaklı kaydedebiliyor. Tırnakları temizle;
// sabit Discord kimlikleri eksikse yalnızca bu kurulum için güvenli varsayılanları kullan.
const TOKEN = envValue('TOKEN');
const CLIENT_ID = envValue('CLIENT_ID', '1565487624129486848');
const GUILD_ID = envValue('GUILD_ID', '1229703353378799749');
const SETUP_ENABLED = process.env.SETUP_ENABLED !== 'false';
const INVITE_FILTER = process.env.INVITE_FILTER !== 'false';
const SPAM_FILTER = process.env.SPAM_FILTER !== 'false';
const ANTI_NUKE = process.env.ANTI_NUKE !== 'false';
const spamTracker = new Map();
const tempVoiceOwners = new Map();
const destructiveTracker = new Map();
const inviteCache = new Map();

if (!TOKEN) {
  console.error('Eksik Railway değişkeni: TOKEN. Variables bölümüne yeni Discord bot tokenını ekle.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildInvites],
});

const commands = [new SlashCommandBuilder()
  .setName('kur')
  .setDescription('KIZIL KURT sunucu düzenini sıfırdan kurar')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('uyar').setDescription('Üyeye uyarı verir').addUserOption(o => o.setName('üye').setDescription('Uyarılacak üye').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('uyarılar').setDescription('Üyenin uyarılarını gösterir').addUserOption(o => o.setName('üye').setDescription('Üye').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('uyarı-sil').setDescription('Uyarı kaydını siler').addStringOption(o => o.setName('id').setDescription('Uyarı ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('sustur').setDescription('Üyeyi geçici susturur').addUserOption(o => o.setName('üye').setDescription('Üye').setRequired(true)).addIntegerOption(o => o.setName('dakika').setDescription('Süre').setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('at').setDescription('Üyeyi sunucudan atar').addUserOption(o => o.setName('üye').setDescription('Üye').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('yasakla').setDescription('Üyeyi yasaklar').addUserOption(o => o.setName('üye').setDescription('Üye').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('temizle').setDescription('Mesajları toplu siler').addIntegerOption(o => o.setName('sayı').setDescription('1-100').setMinValue(1).setMaxValue(100).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('kilit').setDescription('Kanalı üyelere kilitler').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('kilit-aç').setDescription('Kanal kilidini açar').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('kayit').setDescription('Üyeye Kızıl Kurt rolü verir').addUserOption(o => o.setName('üye').setDescription('Kayıt edilecek üye').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('kayitsiz').setDescription('Üyeyi yeniden kayıtsıza alır').addUserOption(o => o.setName('üye').setDescription('Kayıtsıza alınacak üye').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('seviye').setDescription('Seviyeyi gösterir').addUserOption(o => o.setName('üye').setDescription('Bakılacak üye')),
  new SlashCommandBuilder().setName('sıralama').setDescription('Sunucu XP sıralamasını gösterir'),
  new SlashCommandBuilder().setName('profil').setDescription('Üye profilini gösterir').addUserOption(o => o.setName('üye').setDescription('Bakılacak üye')),
  new SlashCommandBuilder().setName('ticket-ekle').setDescription('Ticket kanalına kullanıcı ekler').addUserOption(o => o.setName('üye').setDescription('Eklenecek üye').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('ticket-çıkar').setDescription('Ticket kanalından kullanıcı çıkarır').addUserOption(o => o.setName('üye').setDescription('Çıkarılacak üye').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
];
commands.push(...systems.commands);

const rolePlan = [
  { key: 'founder', name: '🔴・LİDER', color: 0xff0000, permissions: [PermissionFlagsBits.Administrator], hoist: true },
  { key: 'admin', name: '🟢・YÖNETİM', color: 0x00d166, permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.ViewAuditLog], hoist: true },
  { key: 'mod', name: '⚔️・BOSS YETKİLİ', color: 0xe53935, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewAuditLog], hoist: true },
  { key: 'support', name: '🎫・DESTEK', color: 0xff7043, permissions: [], hoist: true },
  { key: 'bot', name: '🤖・BOTLAR', color: 0x5865f2, permissions: [], hoist: true },
  { key: 'friend', name: '🟠・DOST', color: 0xf39c12, permissions: [], hoist: true },
  { key: 'member', name: '🐺・KIZIL KURT', color: 0x992d22, permissions: [], hoist: true },
  { key: 'new', name: '🔒・KAYITSIZ', color: 0x747f8d, permissions: [], hoist: false },
];

const categories = [
  {
    name: '👋・HOŞ GELDİNİZ',
    access: 'open',
    channels: [
      ['👋・hoş-geldiniz', ChannelType.GuildText, 'Yeni üyeler burada karşılanır ve kayıt bekler.'],
      ['📜・kurallar', ChannelType.GuildText, 'Sunucu kuralları ve önemli bilgiler.'],
      ['💬・kayıt-bekleme', ChannelType.GuildText, 'Kayıtsız üyelerin yetkili bekleme sohbeti.'],
      ['🤝・Hoş Geldiniz', ChannelType.GuildVoice],
    ],
  },
  {
    name: '🎫・DESTEK',
    access: 'open',
    channels: [
      ['📩・destek-aç', ChannelType.GuildText, 'Butonlarla özel destek talebi oluştur.'],
    ],
  },
  {
    name: '📢・BİLGİLENDİRME',
    access: 'limited',
    channels: [
      ['📢・duyurular', ChannelType.GuildText, 'KIZIL KURT duyuruları.'],
      ['🐺・güncel-kadro', ChannelType.GuildText, 'Güncel Kızıl Kurt kadrosu.'],
      ['⚔️・yetki-dağılımları', ChannelType.GuildText, 'Yetki dağılımları ve görevler.'],
    ],
  },
  {
    name: '⚔️・BOSS & LOG',
    access: 'member',
    channels: [
      ['⏰・boss-bildirim', ChannelType.GuildText, 'General, F9 ve Jotun boss bildirimleri.'],
      ['🛡️・general-log', ChannelType.GuildText, 'General set ve kıvrık kayıtları.'],
      ['🛡️・General', ChannelType.GuildVoice],
      ['🕷️・f9-log', ChannelType.GuildText, 'F9 set kayıtları.'],
      ['🕷️・F9', ChannelType.GuildVoice],
    ],
  },
  {
    name: '💬・GENEL',
    access: 'limited',
    channels: [
      ['💬・genel-sohbet', ChannelType.GuildText, 'Kızıl Kurt genel sohbeti.'],
      ['💰・ticaret-chat', ChannelType.GuildText, 'Ticaret ve pazar sohbeti.'],
      ['📸・medya', ChannelType.GuildText, 'Fotoğraf, video ve klip paylaşımı.'],
      ['🤖・bot-komut', ChannelType.GuildText, 'Bot komutları burada kullanılır.'],
    ],
  },
  {
    name: '🔊・SES ODALARI',
    access: 'member',
    channels: [
      ['🐺・KIZIL KURT', ChannelType.GuildVoice],
      ['🔥・Genel Sohbet', ChannelType.GuildVoice],
      ['⚔️・Savaş Ekibi', ChannelType.GuildVoice],
      ['🎬・Film Dizi Odası', ChannelType.GuildVoice],
      ['🎵・Müzik 1', ChannelType.GuildVoice],
      ['➕・Oda Oluştur', ChannelType.GuildVoice],
      ['💤・AFK', ChannelType.GuildVoice],
    ],
  },
];

function staffOverwrites(guild, roles) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.founder.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: roles.admin.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: roles.mod.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  ];
}

function memberOverwrites(guild, roles) {
  const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.member.id, allow: access },
    { id: roles.founder.id, allow: access },
    { id: roles.admin.id, allow: access },
    { id: roles.mod.id, allow: access },
    { id: roles.support.id, allow: access },
    { id: roles.bot.id, allow: access },
  ];
}

function limitedOverwrites(guild, roles) {
  const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roles.friend.id, allow: access },
    { id: roles.member.id, allow: access },
    { id: roles.founder.id, allow: access },
    { id: roles.admin.id, allow: access },
    { id: roles.mod.id, allow: access },
    { id: roles.support.id, allow: access },
    { id: roles.bot.id, allow: access },
  ];
}

function readOnlyOverwrites(guild, roles, accessMode) {
  const viewers = accessMode === 'member'
    ? [roles.member]
    : accessMode === 'limited'
      ? [roles.friend, roles.member]
      : [];
  const overwrites = accessMode === 'open'
    ? [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }]
    : [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }];
  for (const role of viewers) {
    overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
  }
  for (const role of [roles.founder, roles.admin, roles.mod, roles.support, roles.bot]) {
    overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  return overwrites;
}

async function createText(channel, title, description, color = 0x8b0000, components = []) {
  await channel.send({
    embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: '☠ KIZIL KURT' })],
    components,
  });
}

function findChannel(guild, name) {
  return guild.channels.cache.find(channel => channel.name === name && channel.isTextBased());
}

async function sendLog(guild, channelName, title, description, color = 0x5865f2) {
  const channel = findChannel(guild, channelName);
  if (!channel) return;
  await createText(channel, title, description.slice(0, 4000), color).catch(() => null);
}

async function buildServer(guild) {
  await guild.setName('☠ KIZIL KURT ☠').catch(() => null);

  await guild.roles.fetch();
  const blockedRoles = [...guild.roles.cache.values()].filter(
    (role) => role.id !== guild.id && !role.managed && !role.editable,
  );
  if (blockedRoles.length) {
    throw new Error(
      `Kurucu Bot rolü bazı rollerin altında: ${blockedRoles.map((role) => role.name).join(', ')}. Sunucu Ayarları > Roller bölümünde KURUCU BOT rolünü en üste taşı ve /kur komutunu yeniden çalıştır.`,
    );
  }

  const deletableChannels = [...guild.channels.cache.values()];
  for (const channel of deletableChannels) await channel.delete('KIZIL KURT sıfır kurulum');

  const deletableRoles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed && role.editable)
    .sort((a, b) => a.position - b.position);
  for (const role of deletableRoles) await role.delete('KIZIL KURT sıfır kurulum');

  const roles = {};
  // Discord yeni rolleri bot rolünün hemen altında oluşturur. En düşük rolden
  // başlayarak oluşturunca KURUCU en son ve en üstte kalır; ayrıca botun kendi
  // rolünün üzerine taşıma denemesi yapılmadığı için Missing Permissions oluşmaz.
  for (const item of [...rolePlan].reverse()) {
    roles[item.key] = await guild.roles.create({
      name: item.name,
      color: item.color,
      permissions: new PermissionsBitField(item.permissions),
      hoist: item.hoist,
      reason: 'KIZIL KURT sunucu kurulumu',
    });
  }

  // Yetkili kategorisi ilk oluşturulduğu için kanal listesinin en üstünde kalır.
  const staffCategory = await guild.channels.create({
    name: '🔐・YETKİLİ ÖZEL',
    type: ChannelType.GuildCategory,
    permissionOverwrites: staffOverwrites(guild, roles),
  });
  const staffChannels = {};
  for (const [name, type, topic] of [
    ['📌・yetki-bilgileri', ChannelType.GuildText, 'Yetkili rollerinin görev ve izin sınırları.'],
    ['📋・yetkili-sohbet', ChannelType.GuildText, 'Yönetim ekibi özel sohbeti.'],
    ['📝・başvuru-takip', ChannelType.GuildText, 'Yetkili başvurularını takip et.'],
    ['🎫・ticket-log', ChannelType.GuildText, 'Destek taleplerinin kayıt alanı.'],
    ['📥・gelen-log', ChannelType.GuildText, 'Sunucuya katılan üyeler ve davet bilgileri.'],
    ['📤・giden-log', ChannelType.GuildText, 'Sunucudan ayrılan üyeler.'],
    ['🗑️・mesaj-log', ChannelType.GuildText, 'Silinen ve düzenlenen mesajlar.'],
    ['🎭・rol-log', ChannelType.GuildText, 'Üye rol değişiklikleri.'],
    ['🔊・ses-log', ChannelType.GuildText, 'Ses kanalı hareketleri.'],
    ['🔨・mod-log', ChannelType.GuildText, 'Moderasyon kayıtları.'],
    ['🛡️・güvenlik-log', ChannelType.GuildText, 'Spam, reklam ve şüpheli hesap uyarıları.'],
    ['📊・sunucu-log', ChannelType.GuildText, 'Sunucu olay kayıtları.'],
    ['🔊・Yetkili Odası', ChannelType.GuildVoice],
  ]) {
    const permissionOverwrites = name === '🎫・ticket-log'
      ? [
          ...staffOverwrites(guild, roles),
          { id: roles.support.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ]
      : undefined;
    staffChannels[name] = await guild.channels.create({ name, type, topic, parent: staffCategory.id, permissionOverwrites });
  }
  await createText(
    staffChannels['📌・yetki-bilgileri'],
    '🔐 YETKİ DAĞILIMI',
    '**🔴・LİDER:** Tam yönetici; tüm sunucu ve rol ayarları.\n**🟢・YÖNETİM:** Kanal/rol yönetimi, ban, kick, timeout ve mesaj yönetimi.\n**⚔️・BOSS YETKİLİ:** Boss/log işlemleri ve temel moderasyon.\n**🎫・DESTEK:** Yalnızca destek talepleri ve ticket kayıtları.\n**🟠・DOST:** Genel ve bilgilendirme alanlarına sınırlı erişim.\n**🐺・KIZIL KURT:** Boss, log, topluluk ve tüm üye ses alanlarına erişim.\n**🔒・KAYITSIZ:** Yalnızca Hoş Geldiniz alanını görür.',
    0x8b0000,
  );

  await guild.channels.create({
    name: '🎟️・AÇIK TALEPLER',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }],
  });

  const created = {};
  for (const categoryPlan of categories) {
    const baseOverwrites = categoryPlan.access === 'member'
      ? memberOverwrites(guild, roles)
      : categoryPlan.access === 'limited'
        ? limitedOverwrites(guild, roles)
        : [];
    const category = await guild.channels.create({
      name: categoryPlan.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: baseOverwrites,
    });
    for (const [name, type, topic] of categoryPlan.channels) {
      const readOnly = ['📜・kurallar', '📢・duyurular', '🐺・güncel-kadro', '⚔️・yetki-dağılımları', '👋・hoş-geldiniz', '📩・destek-aç', '⏰・boss-bildirim', '🛡️・general-log', '🕷️・f9-log'].includes(name);
      const permissionOverwrites = readOnly ? readOnlyOverwrites(guild, roles, categoryPlan.access) : undefined;
      const channel = await guild.channels.create({ name, type, topic, parent: category.id, permissionOverwrites });
      created[name] = channel;
    }
  }

  const welcome = created['💬・genel-sohbet'];
  await createText(welcome, '🐺 KIZIL KURT’A HOŞ GELDİN', 'Sürüye katıldın. Birlikte savaşır, birlikte güçleniriz.\n\n**KIZIL KURT — TEK SÜRÜ, TEK GÜÇ**');
  await createText(created['📜・kurallar'], '📜 SUNUCU KURALLARI', '1. Üyelere karşı saygılı ol.\n2. Spam, flood ve gereksiz etiket yasaktır.\n3. Reklam ve izinsiz bağlantı paylaşımı yasaktır.\n4. NSFW ve rahatsız edici içerik yasaktır.\n5. Yetkililerin uyarılarını dikkate al.\n6. Discord Topluluk Kuralları geçerlidir.');
  await createText(created['📢・duyurular'], '📢 KIZIL KURT DUYURULARI', 'Tüm önemli gelişmeler ve etkinlikler burada paylaşılacak.');
  await createText(created['👋・hoş-geldiniz'], '👋 KIZIL KURT’A HOŞ GELDİN', 'Yeni gelen üyeler otomatik olarak **🔒・KAYITSIZ** rolünü alır. Yalnızca bu karşılama alanını görebilir. Yetkili kayıt yaptıktan sonra **🐺・KIZIL KURT** rolüyle ana sunucu açılır.', 0x8b0000);

  const ticketButtons = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:support').setLabel('Genel Destek').setEmoji('🎫').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket:complaint').setLabel('Şikâyet').setEmoji('🚨').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:application').setLabel('Yetkili Başvurusu').setEmoji('🤝').setStyle(ButtonStyle.Success),
  )];
  await createText(created['📩・destek-aç'], '🎫 KIZIL KURT DESTEK MERKEZİ', 'İhtiyacına uygun butona bas. Sana özel bir oda açılır ve yalnızca seninle yetkili ekip görebilir.\n\n🎫 **Genel Destek:** Sorunlar ve yardım\n🚨 **Şikâyet:** Üye veya yetkili bildirimi\n🤝 **Yetkili Başvurusu:** Ekibe katılma talebi', 0x8b0000, ticketButtons);
  await createText(created['⏰・boss-bildirim'], '⏰ KIZIL KURT BOSS BİLDİRİMLERİ', 'General, F9 ve Jotun bildirimleri bu kanala gönderilecek.\n\nJotun saatleri: **18:15 • 21:15 • 00:15**', 0x8b0000);
  await createText(created['🛡️・general-log'], '🛡️ GENERAL LOG', 'General ses odasında alınan setler ve bağımsız kıvrık toplamları burada gösterilecek.', 0x3498db);
  await createText(created['🕷️・f9-log'], '🕷️ F9 LOG', 'F9 ses odasında alınan setler burada gösterilecek.', 0x9b59b6);

  const owner = await guild.members.fetch(guild.ownerId).catch(() => null);
  if (owner) await owner.roles.add(roles.founder).catch(() => null);

  const afk = created['💤・AFK'];
  if (afk) await guild.setAFKChannel(afk).catch(() => null);

  return welcome;
}

client.once('clientReady', async () => {
  console.log(`☠ ${client.user.tag} aktif.`);
  await storage.init();
  await systems.init(client);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands.map(command => command.toJSON()) });
  for (const guild of client.guilds.cache.values()) {
    const invites = await guild.invites.fetch().catch(() => null);
    if (invites) inviteCache.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
  }
  console.log(`✅ ${commands.length} slash komutu sunucuya yüklendi.`);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'kur') {
    if (!SETUP_ENABLED) return interaction.reply({ content: '🔒 Sunucu sıfırlama özelliği Railway ayarlarından kapatılmış.', ephemeral: true });
    if (interaction.guildId !== GUILD_ID) return interaction.reply({ content: 'Bu bot yalnızca .env dosyasındaki sunucuda çalışır.', ephemeral: true });
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Bu komut için yönetici yetkisi gerekir.', ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirm:${interaction.user.id}`).setLabel('HER ŞEYİ SİL VE KUR').setEmoji('☠').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`cancel:${interaction.user.id}`).setLabel('Vazgeç').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      content: '⚠️ **SON UYARI:** Bu sunucudaki bütün mevcut kanallar ve botun silebildiği roller kalıcı olarak silinecek. Ardından KIZIL KURT düzeni kurulacak.',
      components: [row],
      ephemeral: true,
    });
  }

  if (interaction.isChatInputCommand() && await systems.handleInteraction(interaction)) return;

  if (interaction.isChatInputCommand()) {
    const name = interaction.commandName;
    const user = interaction.options.getUser('üye');
    const member = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';

    if (name === 'uyar') {
      const warning = await storage.addWarning(interaction.guildId, user.id, interaction.user.id, reason);
      await interaction.reply(`⚠️ ${user} uyarıldı. **ID:** ${warning.id}\n**Sebep:** ${reason}`);
      await sendLog(interaction.guild, '🔨・mod-log', '⚠️ ÜYE UYARILDI', `${user} | Yetkili: ${interaction.user}\nSebep: ${reason}`, 0xf39c12); return;
    }
    if (name === 'uyarılar') {
      const list = await storage.getWarnings(interaction.guildId, user.id);
      const text = list.length ? list.slice(0, 15).map(w => `**#${w.id}** • ${w.reason} • <@${w.moderator_id}>`).join('\n') : 'Bu üyenin uyarısı yok.';
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf39c12).setTitle(`${user.username} • Uyarılar`).setDescription(text)], ephemeral: true }); return;
    }
    if (name === 'uyarı-sil') {
      const removed = await storage.removeWarning(interaction.guildId, interaction.options.getString('id'));
      await interaction.reply({ content: removed ? `✅ #${removed.id} uyarısı silindi.` : '❌ Uyarı bulunamadı.', ephemeral: true }); return;
    }
    if (name === 'sustur') {
      if (!member?.moderatable) return interaction.reply({ content: '❌ Bu üyeyi susturamıyorum; rol sıralamasını kontrol et.', ephemeral: true });
      const minutes = interaction.options.getInteger('dakika'); await member.timeout(minutes * 60000, reason);
      await interaction.reply(`🔇 ${user}, ${minutes} dakika susturuldu.`); await sendLog(interaction.guild, '🔨・mod-log', '🔇 ÜYE SUSTURULDU', `${user} • ${minutes} dakika\nYetkili: ${interaction.user}\nSebep: ${reason}`, 0xe67e22); return;
    }
    if (name === 'at') {
      if (!member?.kickable) return interaction.reply({ content: '❌ Bu üyeyi atamıyorum.', ephemeral: true });
      await member.kick(reason); await interaction.reply(`👢 ${user.tag} sunucudan atıldı.`); await sendLog(interaction.guild, '🔨・mod-log', '👢 ÜYE ATILDI', `${user.tag}\nYetkili: ${interaction.user}\nSebep: ${reason}`, 0xe74c3c); return;
    }
    if (name === 'yasakla') {
      if (!member?.bannable) return interaction.reply({ content: '❌ Bu üyeyi yasaklayamıyorum.', ephemeral: true });
      await member.ban({ reason }); await interaction.reply(`🔨 ${user.tag} yasaklandı.`); await sendLog(interaction.guild, '🔨・mod-log', '🔨 ÜYE YASAKLANDI', `${user.tag}\nYetkili: ${interaction.user}\nSebep: ${reason}`, 0x992d22); return;
    }
    if (name === 'temizle') {
      const count = interaction.options.getInteger('sayı'); const deleted = await interaction.channel.bulkDelete(count, true);
      await interaction.reply({ content: `🧹 ${deleted.size} mesaj silindi.`, ephemeral: true }); return;
    }
    if (name === 'kilit' || name === 'kilit-aç') {
      const locked = name === 'kilit'; await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: locked ? false : null });
      await interaction.reply(locked ? '🔒 Kanal kilitlendi.' : '🔓 Kanal kilidi açıldı.'); return;
    }
    if (name === 'kayit' || name === 'kayitsiz') {
      if (!member) return interaction.reply({ content: '❌ Üye bulunamadı.', ephemeral: true });
      const memberRole = interaction.guild.roles.cache.find(role => role.name === '🐺・KIZIL KURT');
      const newRole = interaction.guild.roles.cache.find(role => role.name === '🔒・KAYITSIZ');
      if (!memberRole || !newRole) return interaction.reply({ content: '❌ Kayıt rolleri bulunamadı.', ephemeral: true });
      if (name === 'kayit') {
        await member.roles.remove(newRole).catch(() => null);
        await member.roles.add(memberRole);
        await interaction.reply(`✅ ${user} kayıt edildi ve **🐺・KIZIL KURT** rolü verildi.`);
        await sendLog(interaction.guild, '🎭・rol-log', '✅ ÜYE KAYIT EDİLDİ', `${user}\nYetkili: ${interaction.user}`, 0x2ecc71);
      } else {
        await member.roles.remove(memberRole).catch(() => null);
        await member.roles.add(newRole);
        await interaction.reply(`🔒 ${user} yeniden **KAYITSIZ** durumuna alındı.`);
        await sendLog(interaction.guild, '🎭・rol-log', '🔒 ÜYE KAYITSIZA ALINDI', `${user}\nYetkili: ${interaction.user}`, 0xf39c12);
      }
      return;
    }
    if (name === 'seviye' || name === 'profil') {
      const target = user || interaction.user; const data = await storage.getXp(interaction.guildId, target.id);
      const warnings = name === 'profil' ? await storage.getWarnings(interaction.guildId, target.id) : [];
      const needed = (Number(data.level) + 1) ** 2 * 100;
      const embed = new EmbedBuilder().setColor(0x8b0000).setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() }).setTitle(name === 'profil' ? '☠ KIZIL KURT PROFİLİ' : '⭐ SEVİYE').addFields({ name: 'Seviye', value: String(data.level), inline: true }, { name: 'XP', value: `${data.xp}/${needed}`, inline: true });
      if (name === 'profil') embed.addFields({ name: 'Uyarı', value: String(warnings.length), inline: true });
      await interaction.reply({ embeds: [embed] }); return;
    }
    if (name === 'sıralama') {
      const rows = await storage.leaderboard(interaction.guildId); const text = rows.length ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — Seviye ${r.level} • ${r.xp} XP`).join('\n') : 'Henüz XP kaydı yok.';
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle('🏆 KIZIL KURT SIRALAMASI').setDescription(text)] }); return;
    }
    if (name === 'ticket-ekle' || name === 'ticket-çıkar') {
      if (!interaction.channel.topic?.startsWith('ticket-owner:')) return interaction.reply({ content: '❌ Bu komut yalnızca ticket kanalında kullanılır.', ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(user.id, name === 'ticket-ekle' ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true } : { ViewChannel: false });
      await interaction.reply(name === 'ticket-ekle' ? `✅ ${user} talebe eklendi.` : `➖ ${user} talepten çıkarıldı.`); return;
    }
  }

  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('register:')) {
    const [, step, key, genderKey] = interaction.customId.split(':');
    const identityNames = {
      woman: '👩・KADIN',
      man: '👨・ERKEK',
      unspecified: '🧑・BELİRTMEK İSTEMİYORUM',
    };
    const ageNames = {
      age1: '🔹・18–21',
      age2: '🔸・22–25',
      age3: '🔻・26+',
    };

    if (step === 'gender' && identityNames[key]) {
      const ageRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`register:age:age1:${key}`).setLabel('18–21').setEmoji('🔹').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`register:age:age2:${key}`).setLabel('22–25').setEmoji('🔸').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`register:age:age3:${key}`).setLabel('26+').setEmoji('🔻').setStyle(ButtonStyle.Primary),
      );
      return interaction.reply({ content: `Cinsiyet seçimin: **${identityNames[key]}**\nŞimdi yaş grubunu seç:`, components: [ageRow], ephemeral: true });
    }

    if (step !== 'age' || !ageNames[key] || !identityNames[genderKey]) return;

    const memberRole = interaction.guild.roles.cache.find(role => role.name === '🐺・KIZIL KURT');
    const newRole = interaction.guild.roles.cache.find(role => role.name === '🔒・KAYITSIZ');
    const identityRoles = Object.values(identityNames)
      .map(name => interaction.guild.roles.cache.find(role => role.name === name))
      .filter(Boolean);
    const ageRoles = Object.values(ageNames)
      .map(name => interaction.guild.roles.cache.find(role => role.name === name))
      .filter(Boolean);
    const selectedIdentity = interaction.guild.roles.cache.find(role => role.name === identityNames[genderKey]);
    const selectedAge = interaction.guild.roles.cache.find(role => role.name === ageNames[key]);

    if (!memberRole || !selectedIdentity || !selectedAge) {
      return interaction.reply({ content: '❌ Kayıt rolleri bulunamadı. Yetkiliye bildir.', ephemeral: true });
    }

    await interaction.member.roles.remove([...identityRoles, ...ageRoles]).catch(() => null);
    if (newRole) await interaction.member.roles.remove(newRole).catch(() => null);
    await interaction.member.roles.add([memberRole, selectedIdentity, selectedAge]);
    return interaction.update({
      content: `✅ Kaydın tamamlandı!\n**${memberRole.name}** • **${selectedIdentity.name}** • **${selectedAge.name}**`,
      components: [],
    });
  }

  if (interaction.customId.startsWith('self:')) {
    const [, group, key] = interaction.customId.split(':');
    const names = Object.fromEntries(rolePlan.map(item => [item.key, item.name]));
    const exclusive = {
      color: ['red', 'purple', 'blue', 'pink', 'green'],
      identity: ['woman', 'man', 'unspecified'],
      age: ['age1', 'age2', 'age3'],
    };
    if (exclusive[group]) {
      const roles = exclusive[group].map(k => interaction.guild.roles.cache.find(r => r.name === names[k])).filter(Boolean);
      await interaction.member.roles.remove(roles).catch(() => null);
      if (key === 'clear') return interaction.reply({ content: '✅ Rol tercihin kaldırıldı.', ephemeral: true });
    }
    const selected = interaction.guild.roles.cache.find(role => role.name === names[key]);
    if (!selected) return interaction.reply({ content: '❌ Rol bulunamadı; yetkiliye bildir.', ephemeral: true });
    if (group === 'toggle' && interaction.member.roles.cache.has(selected.id)) {
      await interaction.member.roles.remove(selected);
      return interaction.reply({ content: `➖ ${selected.name} rolü kaldırıldı.`, ephemeral: true });
    }
    await interaction.member.roles.add(selected);
    return interaction.reply({ content: `✅ ${selected.name} rolü verildi.`, ephemeral: true });
  }

  if (interaction.customId.startsWith('ticket:')) {
    const kind = interaction.customId.split(':')[1];
    const labels = {
      support: ['destek', '🎫 Genel Destek'],
      complaint: ['sikayet', '🚨 Şikâyet'],
      application: ['basvuru', '🤝 Yetkili Başvurusu'],
    };
    if (!labels[kind]) return;

    const existing = interaction.guild.channels.cache.find((channel) => channel.topic === `ticket-owner:${interaction.user.id}`);
    if (existing) return interaction.reply({ content: `Zaten açık bir talebin var: ${existing}`, ephemeral: true });

    const category = interaction.guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === '🎟️・AÇIK TALEPLER');
    const staffNames = ['🔴・LİDER', '🟢・YÖNETİM', '⚔️・BOSS YETKİLİ', '🎫・DESTEK'];
    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      ...staffNames
        .map((name) => interaction.guild.roles.cache.find((role) => role.name === name))
        .filter(Boolean)
        .map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] })),
    ];
    const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'uye';
    const ticket = await interaction.guild.channels.create({
      name: `${labels[kind][0]}-${safeName}`,
      type: ChannelType.GuildText,
      topic: `ticket-owner:${interaction.user.id}`,
      parent: category?.id,
      permissionOverwrites: overwrites,
    });
    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('Talebi Al').setEmoji('🙋').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Talebi Kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    );
    await createText(ticket, labels[kind][1], `${interaction.user}, talebin oluşturuldu. Konuyu ayrıntılı şekilde yaz; yetkili ekip en kısa sürede ilgilenecek.`, kind === 'complaint' ? 0xd32f2f : 0x5865f2, [closeRow]);
    return interaction.reply({ content: `✅ Özel talebin oluşturuldu: ${ticket}`, ephemeral: true });
  }

  if (interaction.customId === 'ticket_claim') {
    const staffNames = ['🔴・LİDER', '🟢・YÖNETİM', '⚔️・BOSS YETKİLİ', '🎫・DESTEK'];
    const isStaff = interaction.member.roles.cache.some(role => staffNames.includes(role.name));
    if (!isStaff) return interaction.reply({ content: 'Bu düğmeyi yalnızca destek ekibi kullanabilir.', ephemeral: true });
    await interaction.reply(`🙋 Talebi ${interaction.user} üstlendi.`);
    return;
  }

  if (interaction.customId === 'ticket_close') {
    const ownerId = interaction.channel.topic?.replace('ticket-owner:', '');
    const staffNames = ['🔴・LİDER', '🟢・YÖNETİM', '⚔️・BOSS YETKİLİ', '🎫・DESTEK'];
    const isStaff = interaction.member.roles.cache.some((role) => staffNames.includes(role.name));
    if (interaction.user.id !== ownerId && !isStaff) {
      return interaction.reply({ content: 'Bu talebi kapatma yetkin yok.', ephemeral: true });
    }
    const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (messages) {
      const transcript = [...messages.values()].reverse().map(message => `[${message.createdAt.toISOString()}] ${message.author.tag}: ${message.content || '[embed/dosya]'}`).join('\n');
      const log = findChannel(interaction.guild, '🎫・ticket-log');
      if (log) await log.send({ content: `🔒 **${interaction.channel.name}** kapatıldı. Kapatan: ${interaction.user}`, files: [new AttachmentBuilder(Buffer.from(transcript || 'Mesaj yok', 'utf8'), { name: `${interaction.channel.name}.txt` })] }).catch(() => null);
    }
    await interaction.reply({ content: '🔒 Konuşma kaydedildi. Talep 5 saniye içinde kapatılacak…' });
    setTimeout(() => interaction.channel.delete('Ticket kapatıldı').catch(() => null), 5000);
    return;
  }

  const [action, userId] = interaction.customId.split(':');
  if (interaction.user.id !== userId) return interaction.reply({ content: 'Bu onay düğmesi sana ait değil.', ephemeral: true });
  if (action === 'cancel') return interaction.update({ content: 'Kurulum iptal edildi. Hiçbir şey silinmedi.', components: [] });
  if (action !== 'confirm') return;

  // Buton etkileşimi zaten sunucudan geldi; REST ile tekrar sorgulamak bazı
  // Discord istemci durumlarında hatalı "Unknown Guild" döndürebiliyor.
  const guild = client.guilds.cache.get(interaction.guildId) || interaction.guild;
  if (!guild) {
    return interaction.update({
      content: '❌ Sunucu bilgisi bot belleğinde bulunamadı. Botu sunucudan çıkarıp Yönetici yetkisiyle yeniden ekle ve tekrar dene.',
      components: [],
    });
  }
  await interaction.update({ content: '☠ Kurulum başladı. Kanallar silineceği için bu mesaj kaybolabilir…', components: [] });
  try {
    const welcome = await buildServer(guild);
    await createText(welcome, '✅ KURULUM TAMAMLANDI', 'KIZIL KURT sunucusu başarıyla sıfırdan kuruldu. Sunucu sahibi otomatik olarak **🔴・LİDER** rolünü aldı.');
    console.log(`✅ ${guild.name} kurulumu tamamlandı.`);
  } catch (error) {
    console.error('Kurulum hatası:', error);
    const fallback = guild.systemChannel || guild.channels.cache.find((channel) => channel.isTextBased());
    if (fallback) await fallback.send(`❌ Kurulum sırasında hata oluştu:\n\`${String(error.message).slice(0, 1500)}\``).catch(() => null);
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageMessages);
  if (INVITE_FILTER && !isStaff && /(discord\.gg\/|discord\.com\/invite\/)/i.test(message.content)) {
    await message.delete().catch(() => null);
    await message.channel.send(`${message.author}, Discord davet bağlantıları yasaktır.`).then(m => setTimeout(() => m.delete().catch(() => null), 5000)).catch(() => null);
    await sendLog(message.guild, '🛡️・güvenlik-log', '🔗 DAVET ENGELLENDİ', `${message.author} • ${message.channel}\n${message.content}`, 0xe74c3c);
    return;
  }
  if (SPAM_FILTER && !isStaff) {
    const now = Date.now(); const key = `${message.guild.id}:${message.author.id}`;
    const recent = (spamTracker.get(key) || []).filter(time => now - time < 7000); recent.push(now); spamTracker.set(key, recent);
    if (recent.length >= 6) {
      await message.delete().catch(() => null); await message.member.timeout(60000, 'Otomatik spam koruması').catch(() => null); spamTracker.delete(key);
      await sendLog(message.guild, '🛡️・güvenlik-log', '🚨 SPAM ENGELLENDİ', `${message.author} 60 saniye susturuldu.`, 0xe74c3c); return;
    }
  }
  const gained = Math.floor(Math.random() * 8) + 8;
  const data = await storage.addXp(message.guild.id, message.author.id, gained).catch(() => null);
  if (data && Number(data.level) > Number(data.previousLevel ?? data.level)) {
    await message.channel.send(`🎉 ${message.author}, **seviye ${data.level}** oldun!`).catch(() => null);
    const rewards = [];
    for (const [level, roleName] of rewards) if (data.level >= level) { const role = message.guild.roles.cache.find(r => r.name === roleName); if (role) await message.member.roles.add(role).catch(() => null); }
  }
});

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  await sendLog(message.guild, '🗑️・mesaj-log', '🗑️ MESAJ SİLİNDİ', `Üye: ${message.author || 'Bilinmiyor'}\nKanal: ${message.channel}\nİçerik: ${message.content || '*İçerik alınamadı*'}`, 0xe74c3c);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot || oldMessage.content === newMessage.content) return;
  await sendLog(oldMessage.guild, '🗑️・mesaj-log', '✏️ MESAJ DÜZENLENDİ', `Üye: ${oldMessage.author}\nKanal: ${oldMessage.channel}\n**Önce:** ${oldMessage.content || '-'}\n**Sonra:** ${newMessage.content || '-'}`, 0xf39c12);
});

client.on('guildMemberRemove', async (member) => {
  const joined = member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Bilinmiyor';
  await sendLog(member.guild, '📤・giden-log', '💀 ÜYE AYRILDI', `${member.user.tag} (${member.id})\nSunucuya katılımı: ${joined}`, 0x7f8c8d);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id)).map(role => role.name);
  const removed = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id)).map(role => role.name);
  if (!added.length && !removed.length) return;
  const tag = '【𝐊𝐙𝐋】';
  const cleanName = String(newMember.displayName || newMember.user.username).replace(/^【𝐊𝐙𝐋】\s*/u, '').trim();
  if (newMember.manageable && added.includes('🐺・KIZIL KURT')) {
    await newMember.setNickname([...`${tag} ${cleanName}`].slice(0, 32).join(''), 'Kızıl Kurt rol etiketi').catch(() => null);
  }
  if (newMember.manageable && removed.includes('🐺・KIZIL KURT')) {
    await newMember.setNickname(cleanName === newMember.user.username ? null : [...cleanName].slice(0, 32).join(''), 'Kızıl Kurt rol etiketi kaldırıldı').catch(() => null);
  }
  await sendLog(newMember.guild, '🎭・rol-log', '🎭 ROL DEĞİŞİKLİĞİ', `${newMember}\n${added.length ? `**Eklendi:** ${added.join(', ')}` : ''}\n${removed.length ? `**Kaldırıldı:** ${removed.join(', ')}` : ''}`, 0x9b59b6);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild;
  if (oldState.channelId !== newState.channelId) {
    await sendLog(guild, '🔊・ses-log', '🔊 SES HAREKETİ', `${newState.member}\n**Önce:** ${oldState.channel?.name || 'Yok'}\n**Sonra:** ${newState.channel?.name || 'Yok'}`, 0x3498db);
  }
  if (newState.channel?.name === '➕・Oda Oluştur') {
    const channel = await guild.channels.create({
      name: `🔊 ${newState.member.displayName} Odası`, type: ChannelType.GuildVoice, parent: newState.channel.parentId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: newState.member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers] },
      ],
    });
    tempVoiceOwners.set(channel.id, newState.member.id); await newState.setChannel(channel).catch(() => null);
  }
  if (oldState.channelId && tempVoiceOwners.has(oldState.channelId)) {
    const oldChannel = oldState.channel;
    if (oldChannel && oldChannel.members.size === 0) { tempVoiceOwners.delete(oldChannel.id); await oldChannel.delete('Geçici oda boş kaldı').catch(() => null); }
  }
});

async function guardDestructive(guild, auditType, label) {
  if (!ANTI_NUKE || SETUP_ENABLED) return;
  const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 }).catch(() => null);
  const entry = logs?.entries.first();
  if (!entry || Date.now() - entry.createdTimestamp > 5000 || entry.executorId === client.user.id || entry.executorId === guild.ownerId) return;
  const key = `${guild.id}:${entry.executorId}`; const now = Date.now();
  const actions = (destructiveTracker.get(key) || []).filter(time => now - time < 10000); actions.push(now); destructiveTracker.set(key, actions);
  if (actions.length < 3) return;
  const member = await guild.members.fetch(entry.executorId).catch(() => null);
  if (member) {
    const removable = member.roles.cache.filter(role => role.id !== guild.id && !role.managed && role.editable);
    await member.roles.remove(removable, 'KIZIL KURT Anti-Nuke').catch(() => null);
  }
  await sendLog(guild, '🛡️・güvenlik-log', '🚨 ANTI-NUKE TETİKLENDİ', `<@${entry.executorId}> 10 saniyede ${actions.length} ${label} işlemi yaptı. Yönetilebilir rolleri kaldırıldı.`, 0xff0000);
  destructiveTracker.delete(key);
}

client.on('channelDelete', channel => guardDestructive(channel.guild, AuditLogEvent.ChannelDelete, 'kanal silme'));
client.on('roleDelete', role => guardDestructive(role.guild, AuditLogEvent.RoleDelete, 'rol silme'));

client.on('error', (error) => {
  console.error('Discord istemci hatası:', error);
});

client.on('guildMemberAdd', async (member) => {
  const newRole = member.guild.roles.cache.find((role) => role.name === '🔒・KAYITSIZ');
  if (newRole) await member.roles.add(newRole).catch(() => null);
  const accountDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  let inviterText = 'Bilinmiyor';
  const invites = await member.guild.invites.fetch().catch(() => null);
  if (invites) {
    const before = inviteCache.get(member.guild.id) || new Map();
    const used = invites.find(invite => (invite.uses || 0) > (before.get(invite.code) || 0));
    if (used?.inviter) inviterText = `${used.inviter} (${used.code})`;
    inviteCache.set(member.guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
  }
  const welcome = member.guild.channels.cache.find((channel) => channel.name === '👋・hoş-geldiniz' && channel.isTextBased());
  if (welcome) {
    await welcome.send({ embeds: [new EmbedBuilder().setColor(0x8b0000).setTitle('🐺 ARAMIZA HOŞ GELDİN').setDescription(`${member}, **KIZIL KURT** sunucusuna katıldın!\nŞu anda **KAYITSIZ** rolündesin. Yetkili kayıt yaptıktan sonra ana sunucuya erişebilirsin.\nSeninle birlikte **${member.guild.memberCount}** kişiyiz.`).setThumbnail(member.user.displayAvatarURL()).addFields({ name: 'Hesap yaşı', value: `${accountDays} gün`, inline: true })] }).catch(() => null);
  }
  await sendLog(member.guild, '📥・gelen-log', '📥 ÜYE KATILDI', `${member} (${member.id})\nHesap yaşı: **${accountDays} gün**\nDavet eden: ${inviterText}\nÜye sayısı: **${member.guild.memberCount}**`, accountDays < 7 ? 0xe74c3c : 0x2ecc71);
  if (accountDays < 7) await sendLog(member.guild, '🛡️・güvenlik-log', '⚠️ YENİ HESAP UYARISI', `${member} hesabı yalnızca **${accountDays} günlük**.`, 0xe74c3c);
});

async function shutdown(signal) {
  console.log(`${signal} alındı; bot güvenli şekilde kapatılıyor.`);
  await systems.shutdown().catch(() => null);
  client.destroy();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) client.login(TOKEN);

module.exports = { commands };

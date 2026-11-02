require('dotenv').config();

const {
  ActionRowBuilder,
  AttachmentBuilder,
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
const systems = require('./systems');

function envValue(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  return value.replace(/^(["'])(.*)\1$/, '$2').trim();
}

const TOKEN = envValue('TOKEN');
const CLIENT_ID = envValue('CLIENT_ID', '1565487624129486848');
const GUILD_ID = envValue('GUILD_ID', '1229703353378799749');
const KURUCU_BOT_ROLE_ID = envValue('KURUCU_BOT_ROLE_ID', '1566897724178173982');
const SETUP_ENABLED = process.env.SETUP_ENABLED !== 'false';

if (!TOKEN) {
  console.error('Eksik Railway değişkeni: TOKEN.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildInvites],
});

const commands = [
  new SlashCommandBuilder()
    .setName('kur')
    .setDescription('KIZIL KURT sunucu düzenini ekran görüntülerine göre kurar')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];
commands.push(...systems.commands);

const rolePlan = [
  { key: 'founder', name: '🔴・LİDER', color: 0xff0000, permissions: [PermissionFlagsBits.Administrator], hoist: true },
  { key: 'admin', name: '🟢・YÖNETİM', color: 0x00d166, permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers], hoist: true },
  { key: 'mod', name: '⚔️・BOSS YETKİLİ', color: 0xe53935, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers], hoist: true },
  { key: 'support', name: '🎫・DESTEK', color: 0xff7043, permissions: [], hoist: true },
  { key: 'bot', name: '🤖・BOTLAR', color: 0x5865f2, permissions: [], hoist: true },
  { key: 'friend', name: '🟠・DOST', color: 0xf39c12, permissions: [], hoist: true },
  { key: 'member', name: '🐺・KIZIL KURT', color: 0x992d22, permissions: [], hoist: true },
  { key: 'new', name: '🔒・KAYITSIZ', color: 0x747f8d, permissions: [], hoist: false },
];

const categories = [
  {
    name: '👋 | KURTBEY HOŞGELDİN',
    access: 'open',
    channels: [
      ['[ 💬 ] kayıt-destek', ChannelType.GuildText, 'Kayıt ve destek talepleri burada karşılanır.'],
      ['[ ⏱️ ] bekleme odası - 1', ChannelType.GuildVoice],
      ['[ ⏱️ ] bekleme odası - 2', ChannelType.GuildVoice],
    ],
  },
  {
    name: '📂 | METİN KANALLARI',
    access: 'limited',
    channels: [
      ['[ 💬 ] genel-sohbet', ChannelType.GuildText, 'Kızıl Kurt genel sohbeti.'],
      ['[ 🤖 ] bot-komutları', ChannelType.GuildText, 'Bot komutları burada kullanılır.'],
      ['[ 📷 ] görsel-içerik', ChannelType.GuildText, 'Fotoğraf, video ve klip paylaşımı.'],
      ['[ 📷 ] efsun-bilgi', ChannelType.GuildText, 'Oyun ve efsun rehberleri.'],
    ],
  },
  {
    name: '🏆 | YETKİLİ ODALARI',
    access: 'staff',
    channels: [
      ['[ 💼 ] yetkili-sohbet', ChannelType.GuildText, 'Yönetim ekibi özel sohbeti.'],
      ['[ 👑 ] Yönetim', ChannelType.GuildVoice],
      ['[ ✅ ] TOPLANTI', ChannelType.GuildVoice],
    ],
  },
  {
    name: '📜 | BİLGİLENDİRME',
    access: 'readOnly',
    channels: [
      ['[ 📋 ] kurallar', ChannelType.GuildText, 'Sunucu kuralları ve önemli bilgiler.'],
      ['[ 🗃️ ] gelen-giden', ChannelType.GuildText, 'Giriş ve çıkış logları.'],
    ],
  },
  {
    name: '⏰・BOSS BİLDİRİMLERİ',
    access: 'readOnly',
    channels: [
      ['⏰・boss-bildirim', ChannelType.GuildText, 'Jotun bildirimleri bu kanala gönderilir.'],
    ],
  },
  {
    name: '💬 | SOHBET ODALARI',
    access: 'member',
    channels: [
      ['[ 🔊 ] Sesli Sohbet 1', ChannelType.GuildVoice],
      ['[ 🔊 ] Sesli Sohbet 2', ChannelType.GuildVoice],
      ['[ 🔊 ] Sesli Sohbet 3', ChannelType.GuildVoice],
      ['[ 🚨 ] savaş odası', ChannelType.GuildVoice],
    ],
  },
  {
    name: '🎮 | EKİP ODALARI',
    access: 'member',
    channels: [
      ['[ 🎮 ] KAFAMA GÖRE', ChannelType.GuildVoice],
      ['[ 🎮 ] KÜFÜRLÜ SOHBET', ChannelType.GuildVoice],
      ['[ 🎮 ] BOŞ TAKILMACA', ChannelType.GuildVoice],
    ],
  },
  {
    name: '🎵 | MÜZİK ODALARI',
    access: 'member',
    channels: [
      ['[ 🎶 ] Müzik Odası 1', ChannelType.GuildVoice],
      ['[ 🎶 ] Müzik Odası 2', ChannelType.GuildVoice],
      ['[ 🎶 ] Müzik Odası 3', ChannelType.GuildVoice],
    ],
  },
  {
    name: '💤 | Klavyeden Uzakta',
    access: 'member',
    channels: [
      ['[ 🔇 ] Rahatsız Etmeyin', ChannelType.GuildVoice],
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

async function createText(channel, title, description, color = 0x8b0000, components = []) {
  await channel.send({
    embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: '☠ KIZIL KURT' })],
    components,
  });
}

async function buildServer(guild) {
  await guild.setName('KIZILKURT DİSCORD').catch(() => null);

  await guild.roles.fetch();
  const blockedRoles = [...guild.roles.cache.values()].filter(
    (role) => role.id !== guild.id && !role.managed && !role.editable && role.id !== KURUCU_BOT_ROLE_ID
  );
  if (blockedRoles.length) {
    throw new Error(
      `Kurucu Bot rolü bazı rollerin altında: ${blockedRoles.map((role) => role.name).join(', ')}. Bot rolünü en üste taşıyın.`
    );
  }

  const deletableChannels = [...guild.channels.cache.values()];
  for (const channel of deletableChannels) await channel.delete('KIZIL KURT sıfır kurulum');

  const deletableRoles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed && role.editable && role.id !== KURUCU_BOT_ROLE_ID)
    .sort((a, b) => a.position - b.position);
  for (const role of deletableRoles) await role.delete('KIZIL KURT sıfır kurulum');

  const roles = {};
  for (const item of [...rolePlan].reverse()) {
    roles[item.key] = await guild.roles.create({
      name: item.name,
      color: item.color,
      permissions: new PermissionsBitField(item.permissions),
      hoist: item.hoist,
      reason: 'KIZIL KURT sunucu kurulumu',
    });
  }

  const created = {};
  for (const categoryPlan of categories) {
    let overwrites = [];
    if (categoryPlan.access === 'staff') overwrites = staffOverwrites(guild, roles);
    else if (categoryPlan.access === 'member') overwrites = memberOverwrites(guild, roles);
    else if (categoryPlan.access === 'limited') overwrites = limitedOverwrites(guild, roles);
    else if (categoryPlan.access === 'readOnly') {
      overwrites = [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }
      ];
    }

    const category = await guild.channels.create({
      name: categoryPlan.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: overwrites,
    });

    for (const [name, type, topic] of categoryPlan.channels) {
      const channel = await guild.channels.create({ name, type, topic, parent: category.id });
      created[name] = channel;
    }
  }

  const owner = await guild.members.fetch(guild.ownerId).catch(() => null);
  if (owner) await owner.roles.add(roles.founder).catch(() => null);

  const afk = created['[ 🔇 ] Rahatsız Etmeyin'];
  if (afk) await guild.setAFKChannel(afk).catch(() => null);

  return created['[ 💬 ] kayıt-destek'];
}

client.once('clientReady', async () => {
  console.log(`☠ ${client.user.tag} aktif.`);
  await systems.init(client);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands.map(command => command.toJSON()) });
  console.log(`✅ ${commands.length} komut yüklendi.`);
});

// Rol Değişikliklerinde Etiket Ekleme/Kaldırma
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id)).map(role => role.name);
  const removed = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id)).map(role => role.name);
  
  if (!added.length && !removed.length) return;

  const tag = '【𝐊𝐙𝐋】';
  const cleanName = String(newMember.displayName || newMember.user.username).replace(/^【𝐊𝐙𝐋】\s*/u, '').trim();

  // Kızıl Kurt Rolü Verildiğinde İsim Güncelleme
  if (newMember.manageable && (added.includes('🐺・KIZIL KURT') || added.some(r => r.includes('KIZIL KURT')))) {
    await newMember.setNickname([...`${tag} ${cleanName}`].slice(0, 32).join(''), 'Kızıl Kurt rol etiketi').catch(() => null);
  }

  // Kızıl Kurt Rolü Alındığında Etiketi Temizleme
  if (newMember.manageable && (removed.includes('🐺・KIZIL KURT') || removed.some(r => r.includes('KIZIL KURT')))) {
    await newMember.setNickname(cleanName === newMember.user.username ? null : [...cleanName].slice(0, 32).join(''), 'Kızıl Kurt rol etiketi kaldırıldı').catch(() => null);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'kur') {
    if (!SETUP_ENABLED) return interaction.reply({ content: '🔒 Kurulum özelliği kapalı.', ephemeral: true });
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Yönetici yetkisi gerekir.', ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirm:${interaction.user.id}`).setLabel('HER ŞEYİ SİL VE KUR').setEmoji('☠').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`cancel:${interaction.user.id}`).setLabel('Vazgeç').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      content: '⚠️ **UYARI:** Sunucudaki tüm kanal ve roller silinerek ekran görüntülerindeki düzen sıfırdan kurulacak!',
      components: [row],
      ephemeral: true,
    });
  }

  if (interaction.isChatInputCommand() && await systems.handleInteraction(interaction)) return;

  const [action, userId] = interaction.customId?.split(':') || [];
  if (action === 'cancel') return interaction.update({ content: 'Kurulum iptal edildi.', components: [] });
  if (action === 'confirm' && interaction.user.id === userId) {
    const guild = client.guilds.cache.get(interaction.guildId) || interaction.guild;
    await interaction.update({ content: '☠ Kurulum başlatıldı...', components: [] });
    try {
      await buildServer(guild);
      console.log('✅ Kurulum tamamlandı.');
    } catch (error) {
      console.error('Kurulum hatası:', error);
    }
  }
});

client.login(TOKEN);

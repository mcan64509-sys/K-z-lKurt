const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Pool } = require('pg');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YouTubeDlpExtractor, setFFmpegPath, setYtDlpPath } = require('discord-player-youtubedlp');

const CONFIG = {
  guildId: '1229703353378799749',
  authorizedRoleId: '1565495763470000140',
  bossChannelId: '1565495798064746546',
  timezone: 'Europe/Istanbul',
  types: {
    general: {
      label: 'GENERAL', emoji: '🛡️', color: 0x3498db,
      voiceChannelId: '1565495800677666866', logChannelId: '1565495798735835197',
      times: ['01:12', '02:43', '04:12', '05:43', '07:12', '08:43', '10:12', '11:43', '13:12', '14:43', '16:12', '17:43', '19:12', '20:43', '22:12', '23:43'],
      reminderMinutes: 10,
    },
    f9: {
      label: 'F9', emoji: '🕷️', color: 0x9b59b6,
      voiceChannelId: '1565495802904977478', logChannelId: '1565495801755467937',
      times: ['00:12', '02:12', '04:12', '06:12', '08:12', '10:12', '12:12', '14:12', '16:12', '18:12', '20:12', '22:12'],
      reminderMinutes: 10,
    },
    jotun: {
      label: 'JOTUN', emoji: '🐺', color: 0x8b0000,
      times: ['00:15', '18:15', '21:15'], reminderMinutes: 0,
    },
  },
};

const commands = [
  new SlashCommandBuilder().setName('log').setDescription('Ses kanalındaki herkese 1 set ekler.')
    .addStringOption(o => o.setName('tur').setDescription('Log türü').setRequired(true).addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addIntegerOption(o => o.setName('kivrik').setDescription('Bu General logunda alınan kıvrık').setMinValue(0).setMaxValue(100000))
    .addStringOption(o => o.setName('not').setDescription('İsteğe bağlı açıklama').setMaxLength(300)),
  new SlashCommandBuilder().setName('set-ekle').setDescription('Kullanıcıya manuel set ekler.')
    .addStringOption(typeOption).addUserOption(o => o.setName('uye').setDescription('Kullanıcı').setRequired(true)).addIntegerOption(amountOption('Eklenecek set')),
  new SlashCommandBuilder().setName('set-sil').setDescription('Kullanıcının setini azaltır.')
    .addStringOption(typeOption).addUserOption(o => o.setName('uye').setDescription('Kullanıcı').setRequired(true)).addIntegerOption(amountOption('Silinecek set')),
  new SlashCommandBuilder().setName('kivrik-ekle').setDescription('General kıvrık toplamına ekler.')
    .addIntegerOption(amountOption('Eklenecek kıvrık')),
  new SlashCommandBuilder().setName('kivrik-sil').setDescription('General kıvrık toplamını azaltır.')
    .addIntegerOption(amountOption('Silinecek kıvrık')),
  new SlashCommandBuilder().setName('sonuc').setDescription('Genel sıralamayı veya kullanıcı sonucunu gösterir.')
    .addStringOption(typeOption).addUserOption(o => o.setName('uye').setDescription('Boş bırakılırsa genel sonuç')),
  new SlashCommandBuilder().setName('log-sil').setDescription('Yanlış alınan logu geri alır.')
    .addIntegerOption(o => o.setName('id').setDescription('Log numarası').setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName('çal').setDescription('Ses kanalında müzik çalar.')
    .addStringOption(o => o.setName('şarkı').setDescription('Şarkı adı veya YouTube bağlantısı').setRequired(true)),
  new SlashCommandBuilder().setName('geç').setDescription('Çalan şarkıyı geçer.'),
  new SlashCommandBuilder().setName('durdur').setDescription('Müziği durdurur ve kuyruğu temizler.'),
  new SlashCommandBuilder().setName('kuyruk').setDescription('Müzik kuyruğunu gösterir.'),
  new SlashCommandBuilder().setName('şimdiçalıyor').setDescription('Çalan şarkıyı gösterir.'),
];

function typeOption(o) {
  return o.setName('tur').setDescription('Log türü').setRequired(true)
    .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' });
}

function amountOption(description) {
  return o => o.setName('miktar').setDescription(description).setMinValue(1).setMaxValue(1000000).setRequired(true);
}

let client;
let pool;
let player;
let notificationTimer;

function card(title, description, color = 0x8b0000) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description)
    .setFooter({ text: '🐺 KIZIL KURT' }).setTimestamp();
}

function isAuthorized(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || interaction.member?.roles?.cache?.has(CONFIG.authorizedRoleId);
}

function requireDatabase(interaction) {
  if (pool) return true;
  interaction.reply({ content: '❌ DATABASE_URL eksik; Railway PostgreSQL bağlantısını ekle.', ephemeral: true }).catch(() => null);
  return false;
}

async function init(discordClient) {
  client = discordClient;
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (databaseUrl) {
    pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } });
    pool.on('error', error => console.error('❌ Kızıl Kurt PostgreSQL:', error));
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kk_user_sets (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, boss_type TEXT NOT NULL,
        set_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild_id,user_id,boss_type)
      );
      CREATE TABLE IF NOT EXISTS kk_logs (
        id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, boss_type TEXT NOT NULL,
        member_ids TEXT[] NOT NULL, moderator_id TEXT NOT NULL, note TEXT,
        curl_amount INTEGER NOT NULL DEFAULT 0, deleted_at TIMESTAMPTZ, deleted_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS kk_curls (
        guild_id TEXT NOT NULL, boss_type TEXT NOT NULL, curl_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(guild_id,boss_type)
      );
      CREATE TABLE IF NOT EXISTS kk_manual_actions (
        id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, boss_type TEXT NOT NULL,
        action_type TEXT NOT NULL, target_user_id TEXT, amount INTEGER NOT NULL,
        moderator_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS kk_notifications (
        guild_id TEXT NOT NULL, boss_type TEXT NOT NULL, boss_date TEXT NOT NULL, boss_time TEXT NOT NULL,
        PRIMARY KEY(guild_id,boss_type,boss_date,boss_time)
      );
    `);
    console.log('✅ Kızıl Kurt log/boss tabloları hazır.');
  } else {
    console.warn('⚠️ DATABASE_URL yok: log ve boss bildirimi devre dışı.');
  }

  player = new Player(client, { skipFFmpeg: false });
  setFFmpegPath('/usr/bin/ffmpeg');
  setYtDlpPath('/usr/local/bin/yt-dlp');
  player.events.on('error', (queue, error) => console.error('❌ Müzik queue:', error));
  player.events.on('playerError', (queue, error) => console.error('❌ Müzik player:', error));
  await player.extractors.loadMulti(DefaultExtractors);
  await player.extractors.register(YouTubeDlpExtractor, { debug: false, searchLimit: 5, ytdlpTimeoutMs: 30000 });

  if (pool) {
    await checkNotifications();
    notificationTimer = setInterval(() => checkNotifications().catch(console.error), 30000);
  }
  console.log('✅ Kızıl Kurt General/F9/Jotun ve müzik sistemi hazır.');
}

function istanbulNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function subtractMinutes(hhmm, amount) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m - amount + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function bossDateForReminder(date, bossTime, reminderTime) {
  if (reminderTime <= bossTime) return date;
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
}

async function checkNotifications() {
  if (!pool || !client?.isReady()) return;
  const channel = await client.channels.fetch(CONFIG.bossChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const now = istanbulNow();
  for (const [type, cfg] of Object.entries(CONFIG.types)) {
    for (const bossTime of cfg.times) {
      const reminderTime = subtractMinutes(bossTime, cfg.reminderMinutes);
      if (now.time !== reminderTime) continue;
      const bossDate = bossDateForReminder(now.date, bossTime, reminderTime);
      const saved = await pool.query(`INSERT INTO kk_notifications(guild_id,boss_type,boss_date,boss_time) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING guild_id`, [CONFIG.guildId, type, bossDate, bossTime]);
      if (!saved.rowCount) continue;
      const timing = cfg.reminderMinutes ? `⏰ **${cfg.reminderMinutes} dakika kaldı!**\n🕒 Boss saati: **${bossTime}**` : `⏰ **Jotun zamanı geldi!**\n🕒 Saat: **${bossTime}**`;
      const content = type === 'jotun' ? '@everyone **🐺 KIZIL KURT UYAN — JOTUN SAATİ!**' : '@everyone **🐺 KIZIL KURT UYAN — BOSS SAATİ!**';
      try {
        await channel.send({ content, embeds: [card(`${cfg.emoji} ${cfg.label}`, timing, cfg.color)], allowedMentions: { parse: ['everyone'] } });
      } catch (error) {
        await pool.query('DELETE FROM kk_notifications WHERE guild_id=$1 AND boss_type=$2 AND boss_date=$3 AND boss_time=$4', [CONFIG.guildId, type, bossDate, bossTime]);
        throw error;
      }
    }
  }
}

function splitText(text, max = 3900) {
  const parts = []; let current = '';
  for (const line of text.split('\n')) {
    if ((current + line + '\n').length > max && current) { parts.push(current.trim()); current = ''; }
    current += `${line}\n`;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

async function logChannel(type) {
  const id = CONFIG.types[type].logChannelId;
  const channel = await client.channels.fetch(id).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

async function handleLog(interaction) {
  if (!isAuthorized(interaction)) return interaction.reply({ content: '❌ Bu komut yalnızca log yetkilisi tarafından kullanılabilir.', ephemeral: true });
  if (!requireDatabase(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  const type = interaction.options.getString('tur');
  const cfg = CONFIG.types[type];
  const curlAmount = type === 'general' ? (interaction.options.getInteger('kivrik') || 0) : 0;
  const note = interaction.options.getString('not') || null;
  const voice = await interaction.guild.channels.fetch(cfg.voiceChannelId).catch(() => null);
  const out = await logChannel(type);
  if (!voice?.isVoiceBased() || !out) return interaction.editReply('❌ Ses veya metin log kanalı bulunamadı.');
  const members = [...voice.members.values()].filter(m => !m.user.bot);
  if (!members.length) return interaction.editReply('❌ Ses kanalında kullanıcı yok.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN'); const counts = new Map();
    for (const member of members) {
      const updated = await db.query(`INSERT INTO kk_user_sets(guild_id,user_id,boss_type,set_count) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,boss_type) DO UPDATE SET set_count=kk_user_sets.set_count+1 RETURNING set_count`, [CONFIG.guildId, member.id, type]);
      counts.set(member.id, Number(updated.rows[0].set_count));
    }
    const saved = await db.query(`INSERT INTO kk_logs(guild_id,boss_type,member_ids,moderator_id,note,curl_amount) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [CONFIG.guildId, type, members.map(m => m.id), interaction.user.id, note, curlAmount]);
    const curls = await db.query(`INSERT INTO kk_curls(guild_id,boss_type,curl_count) VALUES($1,$2,$3) ON CONFLICT(guild_id,boss_type) DO UPDATE SET curl_count=kk_curls.curl_count+EXCLUDED.curl_count RETURNING curl_count`, [CONFIG.guildId, type, curlAmount]);
    await db.query('COMMIT');
    const list = members.sort((a, b) => counts.get(b.id) - counts.get(a.id)).map((m, i) => `${i + 1}. ${m} — **Güncel set: ${counts.get(m.id)}**`).join('\n');
    const header = `**Her kullanıcıya:** +1 set\n**Katılımcı:** ${members.length}\n${type === 'general' ? `**Bu logdaki kıvrık:** ${curlAmount}\n**Güncel kıvrık:** ${curls.rows[0].curl_count}\n` : ''}**Yetkili:** ${interaction.user}\n**Log ID:** #${saved.rows[0].id}${note ? `\n**Not:** ${note}` : ''}\n\n`;
    for (const chunk of splitText(header + list)) await out.send({ embeds: [card(`${cfg.emoji} ${cfg.label} LOG`, chunk, cfg.color)] });
    return interaction.editReply(`✅ ${members.length} kişiye +1 ${cfg.label} set eklendi. Log #${saved.rows[0].id}`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => null); console.error('❌ Log:', error); return interaction.editReply('❌ Log kaydedilemedi.');
  } finally { db.release(); }
}

async function handleSetChange(interaction, direction) {
  if (!isAuthorized(interaction)) return interaction.reply({ content: '❌ Yetkin yok.', ephemeral: true });
  if (!requireDatabase(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  const type = interaction.options.getString('tur'); const user = interaction.options.getUser('uye'); const requested = interaction.options.getInteger('miktar'); const cfg = CONFIG.types[type];
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const old = await db.query('SELECT set_count FROM kk_user_sets WHERE guild_id=$1 AND user_id=$2 AND boss_type=$3 FOR UPDATE', [CONFIG.guildId, user.id, type]);
    const before = Number(old.rows[0]?.set_count || 0); const actual = direction > 0 ? requested : Math.min(requested, before); const after = before + direction * actual;
    await db.query(`INSERT INTO kk_user_sets(guild_id,user_id,boss_type,set_count) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id,boss_type) DO UPDATE SET set_count=EXCLUDED.set_count`, [CONFIG.guildId, user.id, type, after]);
    await db.query('INSERT INTO kk_manual_actions(guild_id,boss_type,action_type,target_user_id,amount,moderator_id) VALUES($1,$2,$3,$4,$5,$6)', [CONFIG.guildId, type, direction > 0 ? 'set_add' : 'set_remove', user.id, actual, interaction.user.id]);
    await db.query('COMMIT');
    const out = await logChannel(type); if (out) await out.send({ embeds: [card(`${direction > 0 ? '➕' : '➖'} ${cfg.label} MANUEL SET`, `${user}\n**Değişiklik:** ${direction > 0 ? '+' : '-'}${actual}\n**Önceki:** ${before}\n**Güncel:** ${after}\n**Yetkili:** ${interaction.user}`, cfg.color)] });
    return interaction.editReply(`✅ ${user} • ${cfg.label}: ${after} set`);
  } catch (error) { await db.query('ROLLBACK').catch(() => null); return interaction.editReply('❌ Set değiştirilemedi.'); } finally { db.release(); }
}

async function handleCurlChange(interaction, direction) {
  if (!isAuthorized(interaction)) return interaction.reply({ content: '❌ Yetkin yok.', ephemeral: true });
  if (!requireDatabase(interaction)) return;
  await interaction.deferReply({ ephemeral: true }); const requested = interaction.options.getInteger('miktar'); const type = 'general';
  const db = await pool.connect();
  try {
    await db.query('BEGIN'); await db.query('INSERT INTO kk_curls(guild_id,boss_type,curl_count) VALUES($1,$2,0) ON CONFLICT DO NOTHING', [CONFIG.guildId, type]);
    const old = await db.query('SELECT curl_count FROM kk_curls WHERE guild_id=$1 AND boss_type=$2 FOR UPDATE', [CONFIG.guildId, type]);
    const before = Number(old.rows[0].curl_count); const actual = direction > 0 ? requested : Math.min(requested, before); const after = before + direction * actual;
    await db.query('UPDATE kk_curls SET curl_count=$3 WHERE guild_id=$1 AND boss_type=$2', [CONFIG.guildId, type, after]);
    await db.query('INSERT INTO kk_manual_actions(guild_id,boss_type,action_type,amount,moderator_id) VALUES($1,$2,$3,$4,$5)', [CONFIG.guildId, type, direction > 0 ? 'curl_add' : 'curl_remove', actual, interaction.user.id]);
    await db.query('COMMIT'); const out = await logChannel(type);
    if (out) await out.send({ embeds: [card(`${direction > 0 ? '➕' : '➖'} GENERAL KIVRIK`, `**Değişiklik:** ${direction > 0 ? '+' : '-'}${actual}\n**Önceki:** ${before}\n**Güncel:** ${after}\n**Yetkili:** ${interaction.user}`, CONFIG.types.general.color)] });
    return interaction.editReply(`✅ General güncel kıvrık: ${after}`);
  } catch (error) { await db.query('ROLLBACK').catch(() => null); return interaction.editReply('❌ Kıvrık değiştirilemedi.'); } finally { db.release(); }
}

async function handleResult(interaction) {
  if (!requireDatabase(interaction)) return;
  const type = interaction.options.getString('tur'); const user = interaction.options.getUser('uye'); const cfg = CONFIG.types[type];
  if (user) {
    const result = await pool.query('SELECT set_count FROM kk_user_sets WHERE guild_id=$1 AND user_id=$2 AND boss_type=$3', [CONFIG.guildId, user.id, type]);
    return interaction.reply({ embeds: [card(`${cfg.emoji} ${cfg.label} KULLANICI SONUCU`, `${user}\n\n**Güncel set:** ${Number(result.rows[0]?.set_count || 0)}`, cfg.color)] });
  }
  const rows = await pool.query('SELECT user_id,set_count FROM kk_user_sets WHERE guild_id=$1 AND boss_type=$2 AND set_count>0 ORDER BY set_count DESC,user_id', [CONFIG.guildId, type]);
  const logs = await pool.query('SELECT COUNT(*)::int count FROM kk_logs WHERE guild_id=$1 AND boss_type=$2 AND deleted_at IS NULL', [CONFIG.guildId, type]);
  const curls = type === 'general' ? await pool.query('SELECT curl_count FROM kk_curls WHERE guild_id=$1 AND boss_type=$2', [CONFIG.guildId, type]) : { rows: [] };
  const list = rows.rows.map((r, i) => `${i + 1}. <@${r.user_id}> — **${r.set_count} set**`).join('\n') || 'Henüz set yok.';
  const header = `**Toplam aktif log:** ${logs.rows[0].count}${type === 'general' ? `\n**Güncel kıvrık:** ${Number(curls.rows[0]?.curl_count || 0)}` : ''}\n\n`;
  return interaction.reply({ embeds: splitText(header + list).map((x, i) => card(`📊 ${cfg.label} GENEL SONUÇ${i ? ` ${i + 1}` : ''}`, x, cfg.color)) });
}

async function handleLogDelete(interaction) {
  if (!isAuthorized(interaction)) return interaction.reply({ content: '❌ Yetkin yok.', ephemeral: true });
  if (!requireDatabase(interaction)) return;
  await interaction.deferReply({ ephemeral: true }); const id = interaction.options.getInteger('id'); const db = await pool.connect();
  try {
    await db.query('BEGIN'); const found = await db.query('SELECT * FROM kk_logs WHERE id=$1 AND guild_id=$2 FOR UPDATE', [id, CONFIG.guildId]); const row = found.rows[0];
    if (!row || row.deleted_at) { await db.query('ROLLBACK'); return interaction.editReply('❌ Aktif log bulunamadı.'); }
    for (const userId of row.member_ids) await db.query('UPDATE kk_user_sets SET set_count=GREATEST(0,set_count-1) WHERE guild_id=$1 AND user_id=$2 AND boss_type=$3', [CONFIG.guildId, userId, row.boss_type]);
    await db.query('UPDATE kk_curls SET curl_count=GREATEST(0,curl_count-$3) WHERE guild_id=$1 AND boss_type=$2', [CONFIG.guildId, row.boss_type, row.curl_amount]);
    await db.query('UPDATE kk_logs SET deleted_at=NOW(),deleted_by=$2 WHERE id=$1', [id, interaction.user.id]); await db.query('COMMIT');
    const out = await logChannel(row.boss_type); if (out) await out.send({ embeds: [card('🗑️ LOG GERİ ALINDI', `**Log ID:** #${id}\n**Kişi:** ${row.member_ids.length}\n**Kıvrık:** ${row.curl_amount}\n**Yetkili:** ${interaction.user}`)] });
    return interaction.editReply(`✅ #${id} logu geri alındı.`);
  } catch (error) { await db.query('ROLLBACK').catch(() => null); return interaction.editReply('❌ Log geri alınamadı.'); } finally { db.release(); }
}

const COOKIE_FILE = '/tmp/kizil-kurt-youtube-cookies.txt';
function ytDlpStream(url) {
  const raw = process.env.YOUTUBE_COOKIES;
  const args = ['--no-playlist', '--no-warnings', '--quiet', '--js-runtimes', 'node', '--remote-components', 'ejs:github'];
  if (raw?.trim()) { fs.writeFileSync(COOKIE_FILE, raw.replace(/\r\n/g, '\n').trim() + '\n', { mode: 0o600 }); args.push('--cookies', COOKIE_FILE); }
  args.push('-f', 'bestaudio[protocol^=http]/bestaudio/best', '-o', '-', url);
  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let stderr = '';
  proc.stderr.on('data', x => { stderr += x.toString(); }); proc.on('close', code => { if (code) console.error('❌ yt-dlp:', stderr.slice(-1500)); }); return proc.stdout;
}

async function handleMusic(interaction) {
  const name = interaction.commandName; const queue = player.nodes.get(interaction.guildId);
  if (name === 'çal') {
    const voice = interaction.member?.voice?.channel; if (!voice) return interaction.reply({ content: '❌ Önce ses kanalına gir.', ephemeral: true });
    await interaction.deferReply(); let query = interaction.options.getString('şarkı');
    try { const url = new URL(query); if (url.hostname === 'music.youtube.com' && url.searchParams.get('v')) query = `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`; } catch {}
    try {
      const result = await player.play(voice, query, { requestedBy: interaction.user, nodeOptions: { metadata: { textChannelId: interaction.channelId }, onBeforeCreateStream: async track => /youtube\.com|youtu\.be/.test(track?.url || query) ? ytDlpStream(track?.url || query) : null, leaveOnEmpty: true, leaveOnEmptyCooldown: 60000, leaveOnEnd: true, leaveOnEndCooldown: 60000 } });
      return interaction.editReply({ embeds: [card('🎵 MÜZİĞE EKLENDİ', `**${result.track.title}**\n⏱️ ${result.track.duration || 'Hesaplanıyor'}\n👤 ${interaction.user}`, 0x57f287)] });
    } catch (error) { console.error('❌ /çal:', error); return interaction.editReply('❌ Şarkı açılamadı; cookies veya logları kontrol et.'); }
  }
  if (name === 'geç') { if (!queue?.currentTrack) return interaction.reply({ content: '❌ Çalan şarkı yok.', ephemeral: true }); const title = queue.currentTrack.title; queue.node.skip(); return interaction.reply(`⏭️ **${title}** geçildi.`); }
  if (name === 'durdur') { if (!queue) return interaction.reply({ content: '❌ Aktif müzik yok.', ephemeral: true }); queue.delete(); return interaction.reply('⏹️ Müzik durduruldu.'); }
  if (name === 'kuyruk') { if (!queue?.currentTrack) return interaction.reply({ content: '❌ Kuyruk boş.', ephemeral: true }); const next = queue.tracks.toArray().slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n') || 'Sırada şarkı yok.'; return interaction.reply({ embeds: [card('🎶 MÜZİK KUYRUĞU', `**Şimdi:** ${queue.currentTrack.title}\n\n${next}`, 0x5865f2)] }); }
  if (name === 'şimdiçalıyor') { if (!queue?.currentTrack) return interaction.reply({ content: '❌ Çalan şarkı yok.', ephemeral: true }); return interaction.reply({ embeds: [card('🎵 ŞİMDİ ÇALIYOR', `**${queue.currentTrack.title}**\n⏱️ ${queue.currentTrack.duration}`, 0x5865f2)] }); }
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand() || interaction.guildId !== CONFIG.guildId) return false;
  const name = interaction.commandName;
  if (name === 'log') { await handleLog(interaction); return true; }
  if (name === 'set-ekle') { await handleSetChange(interaction, 1); return true; }
  if (name === 'set-sil') { await handleSetChange(interaction, -1); return true; }
  if (name === 'kivrik-ekle') { await handleCurlChange(interaction, 1); return true; }
  if (name === 'kivrik-sil') { await handleCurlChange(interaction, -1); return true; }
  if (name === 'sonuc') { await handleResult(interaction); return true; }
  if (name === 'log-sil') { await handleLogDelete(interaction); return true; }
  if (['çal', 'geç', 'durdur', 'kuyruk', 'şimdiçalıyor'].includes(name)) { await handleMusic(interaction); return true; }
  return false;
}

async function shutdown() {
  if (notificationTimer) clearInterval(notificationTimer);
  if (player) player.nodes.cache.forEach(queue => queue.delete());
  if (pool) await pool.end().catch(() => null);
}

module.exports = { commands, init, handleInteraction, shutdown };

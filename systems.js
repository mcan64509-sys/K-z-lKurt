const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YouTubeDlpExtractor, setFFmpegPath, setYtDlpPath } = require('discord-player-youtubedlp');

const CONFIG = {
  guildId: '1566896341068685525',
  bossChannelId: '1565503098347200722',
  timezone: 'Europe/Istanbul',
  jotunTimes: ['00:15', '18:15', '21:15'],
};

const commands = [
  new SlashCommandBuilder().setName('çal').setDescription('Ses kanalında müzik çalar.')
    .addStringOption(o => o.setName('şarkı').setDescription('Şarkı adı veya YouTube bağlantısı').setRequired(true)),
  new SlashCommandBuilder().setName('geç').setDescription('Çalan şarkıyı geçer.'),
  new SlashCommandBuilder().setName('durdur').setDescription('Müziği durdurur ve kuyruğu temizler.'),
  new SlashCommandBuilder().setName('kuyruk').setDescription('Müzik kuyruğunu gösterir.'),
  new SlashCommandBuilder().setName('şimdiçalıyor').setDescription('Çalan şarkıyı gösterir.'),
];

let client;
let player;
let notificationTimer;
let notifiedToday = new Set();

function card(title, description, color = 0x8b0000) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description)
    .setFooter({ text: '🐺 KIZIL KURT' }).setTimestamp();
}

async function init(discordClient) {
  client = discordClient;

  player = new Player(client, { skipFFmpeg: false });
  setFFmpegPath('/usr/bin/ffmpeg');
  setYtDlpPath('/usr/local/bin/yt-dlp');
  player.events.on('error', (queue, error) => console.error('❌ Müzik queue:', error));
  player.events.on('playerError', (queue, error) => console.error('❌ Müzik player:', error));
  await player.extractors.loadMulti(DefaultExtractors);
  await player.extractors.register(YouTubeDlpExtractor, { debug: false, searchLimit: 5, ytdlpTimeoutMs: 30000 });

  checkNotifications();
  notificationTimer = setInterval(() => checkNotifications(), 30000);
  console.log('✅ Müzik ve Jotun bildirim sistemi hazır.');
}

function istanbulNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

async function checkNotifications() {
  if (!client?.isReady()) return;
  const guild = client.guilds.cache.get(CONFIG.guildId);
  const channel = await client.channels.fetch(CONFIG.bossChannelId).catch(() => null)
    || guild?.channels.cache.find(c => c.name === '⏰・boss-bildirim' && c.isTextBased());
  if (!channel?.isTextBased()) return;

  const now = istanbulNow();
  for (const bossTime of CONFIG.jotunTimes) {
    const key = `${now.date}-${bossTime}`;
    if (now.time === bossTime && !notifiedToday.has(key)) {
      notifiedToday.add(key);
      try {
        await channel.send({
          content: '@everyone **🐺 KIZIL KURT UYAN — JOTUN SAATİ!**',
          embeds: [card('🐺 JOTUN', `⏰ **Jotun zamanı geldi!**\n🕒 Saat: **${bossTime}**`, 0x8b0000)],
          allowedMentions: { parse: ['everyone'] }
        });
      } catch (error) {
        console.error('❌ Jotun bildirimi gönderilemedi:', error);
      }
    }
  }
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
    } catch (error) { console.error('❌ /çal:', error); return interaction.editReply('❌ Şarkı açılamadı; cookies veya bağlantıyı kontrol et.'); }
  }
  if (name === 'geç') { if (!queue?.currentTrack) return interaction.reply({ content: '❌ Çalan şarkı yok.', ephemeral: true }); const title = queue.currentTrack.title; queue.node.skip(); return interaction.reply(`⏭️ **${title}** geçildi.`); }
  if (name === 'durdur') { if (!queue) return interaction.reply({ content: '❌ Aktif müzik yok.', ephemeral: true }); queue.delete(); return interaction.reply('⏹️ Müzik durduruldu.'); }
  if (name === 'kuyruk') { if (!queue?.currentTrack) return interaction.reply({ content: '❌ Kuyruk boş.', ephemeral: true }); const next = queue.tracks.toArray().slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n') || 'Sırada şarkı yok.'; return interaction.reply({ embeds: [card('🎶 MÜZİK KUYRUĞU', `**Şimdi:** ${queue.currentTrack.title}\n\n${next}`, 0x5865f2)] }); }
  if (name === 'şimdiçalıyor') { if (!queue?.currentTrack) return interaction.reply({ content: '❌ Çalan şarkı yok.', ephemeral: true }); return interaction.reply({ embeds: [card('🎵 ŞİMDİ ÇALIYOR', `**${queue.currentTrack.title}**\n⏱️ ${queue.currentTrack.duration}`, 0x5865f2)] }); }
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand() || interaction.guildId !== CONFIG.guildId) return false;
  const name = interaction.commandName;
  if (['çal', 'geç', 'durdur', 'kuyruk', 'şimdiçalıyor'].includes(name)) { await handleMusic(interaction); return true; }
  return false;
}

async function shutdown() {
  if (notificationTimer) clearInterval(notificationTimer);
  if (player) player.nodes.cache.forEach(queue => queue.delete());
}

module.exports = { commands, init, handleInteraction, shutdown };

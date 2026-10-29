const { Pool } = require('pg');

const memory = {
  xp: new Map(),
  warnings: new Map(),
};

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } })
  : null;

async function init() {
  if (!pool) {
    console.warn('⚠️ DATABASE_URL yok: XP ve uyarılar yalnızca bot açıkken saklanacak.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_xp (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      last_xp BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS warnings (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✅ PostgreSQL veri tabloları hazır.');
}

async function addXp(guildId, userId, amount) {
  const now = Date.now();
  if (!pool) {
    const key = `${guildId}:${userId}`;
    const row = memory.xp.get(key) || { xp: 0, level: 0, last_xp: 0 };
    if (now - row.last_xp < 60000) return null;
    row.xp += amount;
    row.level = Math.floor(Math.sqrt(row.xp / 100));
    row.last_xp = now;
    memory.xp.set(key, row);
    return row;
  }
  const current = await pool.query('SELECT * FROM user_xp WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  const old = current.rows[0] || { xp: 0, level: 0, last_xp: 0 };
  if (now - Number(old.last_xp) < 60000) return null;
  const xp = Number(old.xp) + amount;
  const level = Math.floor(Math.sqrt(xp / 100));
  await pool.query(`INSERT INTO user_xp(guild_id,user_id,xp,level,last_xp) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=$3,level=$4,last_xp=$5`, [guildId, userId, xp, level, now]);
  return { xp, level, previousLevel: Number(old.level) };
}

async function getXp(guildId, userId) {
  if (!pool) return memory.xp.get(`${guildId}:${userId}`) || { xp: 0, level: 0 };
  const result = await pool.query('SELECT xp,level FROM user_xp WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  return result.rows[0] || { xp: 0, level: 0 };
}

async function leaderboard(guildId, limit = 10) {
  if (!pool) return [...memory.xp.entries()].filter(([key]) => key.startsWith(`${guildId}:`)).map(([key, row]) => ({ user_id: key.split(':')[1], ...row })).sort((a, b) => b.xp - a.xp).slice(0, limit);
  const result = await pool.query('SELECT user_id,xp,level FROM user_xp WHERE guild_id=$1 ORDER BY xp DESC LIMIT $2', [guildId, limit]);
  return result.rows;
}

async function addWarning(guildId, userId, moderatorId, reason) {
  if (!pool) {
    const key = `${guildId}:${userId}`;
    const list = memory.warnings.get(key) || [];
    const row = { id: Date.now(), moderator_id: moderatorId, reason, created_at: new Date() };
    list.push(row); memory.warnings.set(key, list); return row;
  }
  const result = await pool.query('INSERT INTO warnings(guild_id,user_id,moderator_id,reason) VALUES($1,$2,$3,$4) RETURNING *', [guildId, userId, moderatorId, reason]);
  return result.rows[0];
}

async function getWarnings(guildId, userId) {
  if (!pool) return memory.warnings.get(`${guildId}:${userId}`) || [];
  const result = await pool.query('SELECT * FROM warnings WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC', [guildId, userId]);
  return result.rows;
}

async function removeWarning(guildId, id) {
  if (!pool) {
    for (const [key, list] of memory.warnings) {
      if (!key.startsWith(`${guildId}:`)) continue;
      const index = list.findIndex((w) => String(w.id) === String(id));
      if (index >= 0) return list.splice(index, 1)[0];
    }
    return null;
  }
  const result = await pool.query('DELETE FROM warnings WHERE guild_id=$1 AND id=$2 RETURNING *', [guildId, id]);
  return result.rows[0] || null;
}

module.exports = { init, addXp, getXp, leaderboard, addWarning, getWarnings, removeWarning };

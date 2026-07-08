import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from './db.js';

// ── 配置 ─────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'ai-buddy-default-secret-please-change-in-production';
const JWT_EXPIRES_IN = '30d'; // 30 天有效期
const COOKIE_NAME = 'auth_token';
const BCRYPT_ROUNDS = 10;

// ── 密码哈希 ─────────────────────────────────────────────────
export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export async function verifyPassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

// ── JWT 生成与验证 ──────────────────────────────────────────
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// ── 设置 Cookie 选项 ─────────────────────────────────────────
function getCookieOptions() {
  return {
    httpOnly: true, // JS 无法读取，防 XSS
    secure: process.env.NODE_ENV === 'production', // 生产 HTTPS 才发 secure cookie
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 天
    path: '/',
  };
}

// ── 认证中间件 ───────────────────────────────────────────────
// 从 Cookie 或 Authorization Header 提取 JWT，验证后挂载到 req.user
export function authMiddleware(req, res, next) {
  let token = null;

  // 1. 从 Cookie 读取
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
  }

  // 2. 从 Authorization Header 读取（用于 API 调用）
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  // 3. 从 URL 查询参数读取（用于 WebHook 等场景）
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      data: null,
      error: { message: '未登录，请先登录' },
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      data: null,
      error: { message: 'Token 无效或已过期' },
    });
  }

  // 验证用户是否仍然存在（可选，但更安全）
  req.user = {
    id: decoded.id,
    username: decoded.username,
    nickname: decoded.nickname,
  };
  next();
}

// ── 可选认证中间件（已登录就挂载 req.user，未登录不报错）──
export function optionalAuthMiddleware(req, res, next) {
  let token = null;

  if (req.cookies && req.cookies[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
  } else if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = {
        id: decoded.id,
        username: decoded.username,
        nickname: decoded.nickname,
      };
    }
  }
  next();
}

// ── 路由辅助函数 ─────────────────────────────────────────────

// 设置 JWT Cookie
export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, getCookieOptions());
}

// 清除 JWT Cookie
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// ── 用户操作 ─────────────────────────────────────────────────

// 注册
export async function registerUser({ username, password, nickname }) {
  // 检查用户名是否已存在
  const [existing] = await pool.query(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  if (existing.length > 0) {
    throw new Error('用户名已存在');
  }

  // 验证密码强度
  if (!password || password.length < 6) {
    throw new Error('密码至少 6 个字符');
  }
  if (!username || username.length < 3 || username.length > 30) {
    throw new Error('用户名需 3-30 个字符');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new Error('用户名只能包含字母、数字和下划线');
  }

  const passwordHash = await hashPassword(password);
  const finalNickname = nickname || username;

  const [result] = await pool.query(
    'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
    [username, passwordHash, finalNickname]
  );

  const user = {
    id: result.insertId,
    username,
    nickname: finalNickname,
  };

  // 为新用户创建默认任务分组
  await createDefaultGroupsForUser(user.id);

  return user;
}

// 为新用户自动创建默认任务分组
export async function createDefaultGroupsForUser(userId) {
  const defaultGroups = [
    { id: `${userId}000001`, name: '品牌发展', color: '#06b6d4', sort_order: 2, keywords: ['品牌', '发展'] },
    { id: `${userId}000002`, name: '营运标准', color: '#ec4899', sort_order: 3, keywords: ['营运', '标准'] },
    { id: `${userId}000003`, name: '加盟商管', color: '#f59e0b', sort_order: 4, keywords: ['加盟', '门店'] },
    { id: `${userId}000004`, name: '产运数据', color: null, sort_order: 5, keywords: [] },
    { id: `${userId}000005`, name: '日常管理', color: '#ef4444', sort_order: 6, keywords: [] },
    { id: `${userId}000006`, name: '个人项目', color: null, sort_order: 7, keywords: [] },
    { id: `${userId}000007`, name: '其他', color: null, sort_order: 8, keywords: [] },
  ];

  for (const g of defaultGroups) {
    await pool.query(
      'INSERT INTO task_groups (id, user_id, name, color, sort_order, keywords) VALUES (?, ?, ?, ?, ?, ?)',
      [g.id, userId, g.name, g.color, g.sort_order, JSON.stringify(g.keywords)]
    );
  }
}

// 登录
export async function loginUser({ username, password }) {
  const [rows] = await pool.query(
    'SELECT id, username, password_hash, nickname, avatar_url FROM users WHERE username = ? LIMIT 1',
    [username]
  );

  if (rows.length === 0) {
    throw new Error('用户名或密码错误');
  }

  const user = rows[0];
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('用户名或密码错误');
  }

  // 更新最后登录时间
  await pool.query(
    'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
    [user.id]
  );

  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
  };
}

// 获取当前用户信息
export async function getCurrentUser(userId) {
  const [rows] = await pool.query(
    'SELECT id, username, nickname, avatar_url, created_at, last_login_at FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

// 更新用户资料（昵称、头像）
export async function updateUserProfile(userId, { nickname, avatar_url }) {
  const updates = [];
  const params = [];

  if (nickname !== undefined) {
    updates.push('nickname = ?');
    params.push(nickname);
  }
  if (avatar_url !== undefined) {
    updates.push('avatar_url = ?');
    params.push(avatar_url);
  }

  if (updates.length === 0) {
    throw new Error('没有需要更新的字段');
  }

  params.push(userId);
  await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  return getCurrentUser(userId);
}

// ══════════════════════════════════════════════════════════════
// API Key 管理（供外部工具/SKILL 使用）
// ══════════════════════════════════════════════════════════════

// 生成新的 API Key（明文形式返回给用户一次）
export function generateApiKey() {
  // 64 字符的随机字符串：32 字节十六进制
  return 'buddy_' + crypto.randomBytes(32).toString('hex');
}

// 哈希 API Key 用于存储
export async function hashApiKey(plainKey) {
  // 用 SHA256 而非 bcrypt，因为 API Key 已经是高熵随机串
  // 性能更好，且能精确匹配查找（bcrypt 每次哈希结果不同）
  return crypto.createHash('sha256').update(plainKey).digest('hex');
}

// ── API Key 可逆加密（支持"再次查看明文"，用户已确认此取舍） ──────
// 独立密钥，不复用 JWT_SECRET（语义不同 + 轮换 JWT 会导致 key 无法解密）
// 沿用 memos 的 AES-256-CBC + sha256(env) 派生密钥模式
const APIKEY_ENCRYPTION_KEY = process.env.APIKEY_ENCRYPTION_KEY || 'ai-buddy-apikey-secret-2026';

function encryptApiKey(plainKey) {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(APIKEY_ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  // 密文格式：base64(IV[16] + ciphertext)，与 decryptMemo 一致
  return Buffer.concat([iv, enc]).toString('base64');
}

function decryptApiKey(cipherB64) {
  const raw = Buffer.from(cipherB64, 'base64');
  const iv = raw.subarray(0, 16);
  const ciphertext = raw.subarray(16);
  const key = crypto.createHash('sha256').update(APIKEY_ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}

// 为用户创建 API Key（返回明文 + 元数据）
export async function createApiKeyForUser(userId, { name = 'Default', expiresInDays } = {}) {
  const plainKey = generateApiKey();
  const keyHash = await hashApiKey(plainKey);
  const keyCipher = encryptApiKey(plainKey); // 可逆加密，支持后续反查明文
  const keyPrefix = plainKey.slice(0, 12); // 用于显示和识别
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await pool.query(
    `INSERT INTO api_keys (user_id, key_hash, key_cipher, key_prefix, name, expires_at, is_legacy)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [userId, keyHash, keyCipher, keyPrefix, name, expiresAt]
  );

  return {
    api_key: plainKey,         // 仅显示一次
    key_prefix: keyPrefix,
    name,
    expires_at: expiresAt,
  };
}

// 反查 API Key 明文（仅新建格式 is_legacy=0 的 key 可反查）
export async function revealApiKey(userId, keyId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, key_cipher, is_legacy, is_active, key_prefix, name
     FROM api_keys
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [keyId, userId]
  );
  if (rows.length === 0) return { ok: false, code: 404, message: 'API Key 不存在' };
  const row = rows[0];
  if (!row.is_active) return { ok: false, code: 400, message: '该 Key 已撤销' };
  if (row.is_legacy || !row.key_cipher) {
    return { ok: false, code: 400, message: '该 Key 为旧格式（单向哈希），无法反查明文，请撤销后重新创建' };
  }
  let plainKey;
  try {
    plainKey = decryptApiKey(row.key_cipher);
  } catch (e) {
    return { ok: false, code: 500, message: '解密失败（密钥可能已变更）：' + e.message };
  }
  // 记录反查日志（不记明文）
  console.log(`[apikey-reveal] user=${userId} key=${keyId} prefix=${row.key_prefix} name=${row.name} ts=${new Date().toISOString()}`);
  return { ok: true, api_key: plainKey, key_prefix: row.key_prefix };
}

// 用 API Key 查找用户（验证用）
export async function getUserByApiKey(plainKey) {
  if (!plainKey || !plainKey.startsWith('buddy_')) return null;
  const keyHash = await hashApiKey(plainKey);

  // 查找匹配的 key
  const [rows] = await pool.query(
    `SELECT id, user_id, name, expires_at, last_used_at
     FROM api_keys
     WHERE key_hash = ? AND is_active = TRUE
     LIMIT 1`,
    [keyHash]
  );

  if (rows.length === 0) return null;
  const key = rows[0];

  // 检查是否过期
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return null;
  }

  // 更新最后使用时间
  await pool.query(
    'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
    [key.id]
  );

  // 获取用户信息
  const [users] = await pool.query(
    'SELECT id, username, nickname FROM users WHERE id = ? LIMIT 1',
    [key.user_id]
  );
  if (users.length === 0) return null;

  return {
    user: users[0],
    api_key_id: key.id,
    api_key_name: key.name,
  };
}

// 列出用户的所有 API Key（不包含明文）
export async function listApiKeysForUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, name, key_prefix, last_used_at, expires_at, is_active, is_legacy, created_at
     FROM api_keys
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

// 撤销 API Key
export async function revokeApiKey(userId, keyId) {
  const [result] = await pool.query(
    `UPDATE api_keys SET is_active = FALSE
     WHERE id = ? AND user_id = ?`,
    [keyId, userId]
  );
  return result.affectedRows > 0;
}

// 修改密码
export async function changePassword(userId, oldPassword, newPassword) {
  // 验证旧密码
  const [rows] = await pool.query(
    'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (rows.length === 0) {
    throw new Error('用户不存在');
  }

  const isValid = await verifyPassword(oldPassword, rows[0].password_hash);
  if (!isValid) {
    throw new Error('原密码错误');
  }

  // 验证新密码强度
  if (!newPassword || newPassword.length < 6) {
    throw new Error('新密码至少 6 个字符');
  }

  const newPasswordHash = await hashPassword(newPassword);
  await pool.query(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [newPasswordHash, userId]
  );

  return { success: true };
}

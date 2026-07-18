import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import {
  pool, TABLE_COLUMNS, JSON_COLUMNS, DATETIME_COLUMNS, BOOLEAN_COLUMNS, PUBLIC_TABLES
} from './db.js';
import {
  authMiddleware, optionalAuthMiddleware, generateToken,
  setAuthCookie, clearAuthCookie, registerUser, loginUser, getCurrentUser,
  updateUserProfile, changePassword,
  createApiKeyForUser, listApiKeysForUser, revokeApiKey, revealApiKey, getUserByApiKey,
  superAdminMiddleware, authOrApiKeyMiddleware,
  encryptVault, decryptVault, generateVaultToken, vaultAuthMiddleware
} from './auth.js';
import { parseShare, parseAndDownload, listOfflineFiles, resolveOfflinePath, redownload, deleteOfflineFiles, extractUrl, downloadFromParsedData } from './extract.js';
import { getUserSetting, updateUserSetting } from './user-settings.js';
import { fetchFeed, refreshSource, refreshAllSources, startRssScheduler } from './rss.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS 配置 ───────────────────────────────────────────────
// 生产环境明确允许同源 + 常见本地开发地址
const CORS_ORIGIN = process.env.NODE_ENV === 'production'
  ? ['https://buddy.bajiaolu.cn', 'http://localhost:5173', 'http://127.0.0.1:5173']
  : true;
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true, // 允许发送 Cookie
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 预检缓存 24 小时，减少 OPTIONS 请求
}));
// 显式处理 OPTIONS 预检，记录延迟
app.options('*', (req, res) => {
  res.sendStatus(204);
});
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── 头像静态服务（免鉴权，文件名含随机串不可枚举；低敏感资源） ──────────
const AVATARS_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(AVATARS_DIR, { recursive: true });
app.use('/api/avatars', express.static(AVATARS_DIR, {
  maxAge: '7d',
  setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=604800'); },
}));

// ── 健康图片静态服务（药物照片、就诊附件等） ──────────────────────
const HEALTH_IMG_DIR = path.join(__dirname, '..', 'uploads', 'health');
fs.mkdirSync(HEALTH_IMG_DIR, { recursive: true });
app.use('/api/health/images', express.static(HEALTH_IMG_DIR, {
  maxAge: '7d',
  setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=604800'); },
}));

// ── 头像上传 multer 配置 ──────────────────────────────────────────
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => {
      const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'png';
      const rand = crypto.randomBytes(8).toString('hex');
      cb(null, `${req.user.id}_${Date.now()}_${rand}.${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('仅支持 jpg/png/webp/gif 图片'), ok);
  },
});

// ── 健康图片上传 multer 配置（药物照片、就诊附件等，5MB） ──────────
const healthImgUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, HEALTH_IMG_DIR),
    filename: (req, file, cb) => {
      const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
      const rand = crypto.randomBytes(8).toString('hex');
      cb(null, `health_${req.user.id}_${Date.now()}_${rand}.${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('仅支持 jpg/png/webp/gif 图片'), ok);
  },
});

// ── 公开端点（不需要登录）──────────────────────────────────

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════
// 社媒内容解析（抖音/B站/小红书/公众号等分享文本一键识别）
// ══════════════════════════════════════════════════════════════

// 仅解析（不下载）：返回 title / platform / cover_url / summary 等
app.post('/api/extract', authMiddleware, async (req, res) => {
  const input = (req.body?.input || req.body?.text || '').toString();
  if (!input) {
    return res.json({ data: null, error: { message: '缺少 input 字段' } });
  }
  try {
    const result = await parseShare(input);
    if (result.code !== 200) {
      return res.json({ data: result, error: { message: result.message || '解析失败' } });
    }
    return res.json({ data: result, error: null });
  } catch (err) {
    console.error('extract error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 已废弃：/api/extract/download 和 /api/extract/redownload ──
// 离线下载现在由 reading 的创建/更新接口自动处理：
//   - POST /api/v1/reading 传 is_offline=true → 创建后后台自动下载
//   - PATCH /api/reading/:id 传 is_offline=true → 开始离线下载
//   - PATCH /api/reading/:id 传 is_offline=false → 删除离线文件
//   - 不传 is_offline → 不处理离线状态
app.post('/api/extract/download', authMiddleware, async (req, res) => {
  return res.json({
    data: null,
    error: { message: '此接口已废弃，请直接在创建/更新阅读项时传 is_offline=true，由后端自动处理离线下载' }
  });
});

app.post('/api/extract/redownload', authMiddleware, async (req, res) => {
  return res.json({
    data: null,
    error: { message: '此接口已废弃，请通过 PATCH /api/reading/:id 传 is_offline=true 重新离线' }
  });
});

// ── 后台异步离线下载工具 ──────────────────────────────────
// 下载可能耗时较长（几十秒），创建/更新接口立即返回，后台异步执行。
// 下载成功后自动更新 is_offline=true 和 offline_path；失败则回滚。
function triggerOfflineDownloadAsync(userId, readingId, url, parsedData) {
  // fire-and-forget：不阻塞响应
  (async () => {
    try {
      console.log(`[offline] 开始后台下载: reading_id=${readingId}, url=${url?.slice(0, 80)}, has_parsed_data=${!!parsedData}`);
      let result;
      if (parsedData) {
        // 用传入的解析结果直接下载，不再重新解析（避免 IP 限流）
        result = await downloadFromParsedData(parsedData, url);
      } else {
        const input = String(url || '');
        if (!input) {
          console.error(`[offline] reading_id=${readingId} 无 url，跳过下载`);
          return;
        }
        result = await parseAndDownload(input);
      }
      if (result.code === 200 && result.offline_path) {
        await pool.query(
          'UPDATE reading_items SET is_offline = 1, offline_path = ? WHERE id = ? AND user_id = ?',
          [result.offline_path, readingId, userId]
        );
        console.log(`[offline] 下载成功: reading_id=${readingId}, offline_path=${result.offline_path}`);
      } else {
        console.error(`[offline] 下载失败: reading_id=${readingId}, message=${result.message}`);
        await pool.query(
          'UPDATE reading_items SET is_offline = 0, offline_path = NULL WHERE id = ? AND user_id = ?',
          [readingId, userId]
        );
      }
    } catch (err) {
      console.error(`[offline] 异常: reading_id=${readingId}, err=`, err);
      try {
        await pool.query(
          'UPDATE reading_items SET is_offline = 0, offline_path = NULL WHERE id = ? AND user_id = ?',
          [readingId, userId]
        );
      } catch (_) {}
    }
  })();
}

// 后台异步自动解析补全（不阻塞响应）
function triggerAutoParseAsync(userId, readingId, url) {
  (async () => {
    try {
      console.log(`[auto_parse] 后台开始解析: reading_id=${readingId}, url=${url?.slice(0, 80)}`);
      const parsed = await parseShare(url);
      if (parsed.code === 200) {
        const updates = {};
        if (parsed.title) updates.title = parsed.title;
        if (parsed.cover_url) updates.cover_url = parsed.cover_url;
        if (parsed.platform) updates.platform = parsed.platform;
        if (parsed.summary) updates.summary = parsed.summary;
        if (Object.keys(updates).length > 0) {
          const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
          const vals = Object.values(updates);
          vals.push(readingId, userId);
          await pool.query(`UPDATE reading_items SET ${sets} WHERE id = ? AND user_id = ?`, vals);
          console.log(`[auto_parse] 解析完成并更新: reading_id=${readingId}, fields=${Object.keys(updates).join(',')}`);
        }
      } else {
        console.error(`[auto_parse] 解析失败: reading_id=${readingId}, code=${parsed.code}`);
      }
    } catch (err) {
      console.error(`[auto_parse] 异常: reading_id=${readingId}, err=`, err.message);
    }
  })();
}

// ── 从 parsed_data 提取元信息 ──────────────────────────────────
// 输入：用户传入的完整 API 返回格式 { code, data: { vid, host, displayTitle, videoItemVoList: [...] } }
// 输出：{ title, cover_url, platform, summary, has_video, has_markdown }
// 跟 parseShare 返回的字段对齐，方便复用
function extractMetaFromParsedData(parsed) {
  if (!parsed) return null;
  const data = parsed.data || {};
  const rawItems = data.videoItemVoList || parsed.items || [];

  // 标题
  let title = data.displayTitle || data.title || parsed.title || '';
  // 清洗 HTML（公众号标题可能带 span 标签）
  title = title
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return ''; }
    })
    .replace(/\s+/g, ' ').trim();

  // 封面
  let cover_url = null;
  for (const v of rawItems) {
    const qa = (v.qualityAlias || v.quality || '').toLowerCase();
    if (qa.includes('封面') || qa.includes('cover')) {
      cover_url = v.baseUrl;
      break;
    }
  }
  if (!cover_url) {
    for (const v of rawItems) {
      if (v.fileType === 'image') {
        cover_url = v.baseUrl;
        break;
      }
    }
  }

  // 平台
  const platform = (function normalizePlatform(host) {
    if (!host) return 'other';
    const h = String(host).toLowerCase();
    if (h.includes('douyin')) return 'douyin';
    if (h.includes('kuaishou') || h.includes('ksapp')) return 'kuaishou';
    if (h.includes('bilibili') || h === 'b23.tv' || h === 'bili2233.cn') return 'bilibili';
    if (h.includes('xiaohongshu') || h.includes('xhscdn') || h.includes('xhs')) return 'xiaohongshu';
    if (h.includes('weixin') || h.includes('mp.weixin') || h.includes('wechat') || h.includes('weixinpub')) return 'wechat';
    if (h.includes('youtube') || h.includes('youtu.be') || h.includes('yt')) return 'youtube';
    if (h.includes('tiktok')) return 'tiktok';
    if (h.includes('weibo')) return 'weibo';
    if (h.includes('ixigua')) return 'xigua';
    if (h.includes('zhihu')) return 'zhihu';
    return 'other';
  })(data.host || parsed.host || '');

  // markdown / summary
  let summary = '';
  let has_markdown = false;
  for (const v of rawItems) {
    const qa = (v.qualityAlias || v.quality || '').toLowerCase();
    if (v.fileType === 'video' && qa.includes('markdown')) {
      const t = String(v.baseUrl || '');
      const isRealMd = /(^|\n)#{1,6}\s|^!\[|]\(http/m.test(t);
      if (isRealMd) {
        has_markdown = true;
        summary = t.slice(0, 1000);
        break;
      }
    }
  }

  const has_video = rawItems.some(i =>
    i.fileType === 'video' && !/markdown/i.test(i.quality || i.qualityAlias || '')
  );

  return { title, cover_url, platform, summary, has_video, has_markdown };
}

// 列出某条 reading 的离线文件
app.get('/api/reading/:id/files', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 必须是数字' } });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, offline_path, is_offline FROM reading_items WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    const row = rows[0];
    if (!row) {
      return res.json({ data: null, error: { message: '记录不存在或无权限' } });
    }
    if (!row.is_offline || !row.offline_path) {
      return res.json({ data: { ok: true, dir: null, files: [], message: '该文章未离线' } });
    }
    const result = await listOfflineFiles(row.offline_path);
    if (!result.ok) {
      return res.json({ data: result, error: { message: result.message } });
    }
    return res.json({ data: result, error: null });
  } catch (err) {
    console.error('reading/files error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 下载/预览某个离线文件（路径 /api/reading-files/:dirName/:fileName）
// 鉴权：必须能查到属于该用户，且 offline_path 等于 dirName
app.get('/api/reading-files/:dirName/:fileName', authMiddleware, async (req, res) => {
  const { dirName, fileName } = req.params;
  // dirName 形如 "<host>-<vid>-<标题>"，防穿越
  if (!dirName || !fileName || /[/\\]/.test(dirName) || /[/\\]/.test(fileName)) {
    return res.status(400).json({ data: null, error: { message: '非法路径' } });
  }
  try {
    // 查 user_id 关联的 reading_items，看是否存在 offline_path 包含 dirName
    const [rows] = await pool.query(
      'SELECT id, offline_path FROM reading_items WHERE user_id = ? AND is_offline = 1 AND offline_path LIKE ?',
      [req.user.id, `%${dirName}`]
    );
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: '未找到对应离线目录' } });
    }
    // 找到匹配的 reading_item，用它真正的 offline_path 拼文件
    const matched = rows[0];
    const safePath = resolveOfflinePath(matched.offline_path);
    if (!safePath) {
      return res.status(400).json({ data: null, error: { message: '路径越界' } });
    }
    const filePath = path.join(safePath, fileName);
    // 再次校验 filePath 仍然在 safePath 内
    if (!filePath.startsWith(safePath + path.sep)) {
      return res.status(400).json({ data: null, error: { message: '非法文件路径' } });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ data: null, error: { message: '文件不存在' } });
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(400).json({ data: null, error: { message: '不是文件' } });
    }
    const wantDownload = req.query.download !== '0';
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (wantDownload) {
      // 下载：Content-Disposition: attachment
      const encoded = encodeURIComponent(fileName);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
    } else {
      // 预览：按 mime type 发送
      const ext = path.extname(fileName).toLowerCase();
      const mime = {
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp',
        '.md': 'text/markdown; charset=utf-8',
        '.json': 'application/json',
      }[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
    }
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('reading-files error:', err);
    res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// 更新 reading_items（编辑用）
app.patch('/api/reading/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 必须是数字' } });
  }
  const body = req.body || {};
  // is_offline 三态：
  //   - 传 true  → 需要开启离线（触发下载）
  //   - 传 false → 需要关闭离线（删除离线文件）
  //   - 不传     → 不处理离线状态
  const offlineKey = Object.keys(body).includes('is_offline') ? 'is_offline' : (Object.keys(body).includes('isOffline') ? 'isOffline' : null);
  const wantOfflineTrue = offlineKey && (body[offlineKey] === true || body[offlineKey] === 1 || body[offlineKey] === 'true');
  const wantOfflineFalse = offlineKey && (body[offlineKey] === false || body[offlineKey] === 0 || body[offlineKey] === 'false');

  const ALLOWED_FIELDS = [
    'url', 'title', 'summary', 'cover_url', 'platform',
    'category', 'is_read', 'is_starred', 'is_offline', 'offline_path',
    'tags',
  ];
  const updates = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.includes(k)) {
      // is_offline 特殊处理：true 时先置 false（后台下载完再更新），false 时同步删文件
      if (k === 'is_offline' || k === 'isOffline') {
        if (wantOfflineTrue) {
          updates.is_offline = false;
          updates.offline_path = null;
        } else if (wantOfflineFalse) {
          updates.is_offline = false;
          updates.offline_path = null;
        } else {
          continue; // 不传或非法值，不更新
        }
      } else {
        updates[k] = v;
      }
    }
  }
  // 先查出当前记录（需要 url 用于下载，需要 offline_path 用于删除）
  const [rows] = await pool.query(
    'SELECT id, url, offline_path, is_offline FROM reading_items WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );
  const current = rows[0];
  if (!current) {
    return res.json({ data: null, error: { message: '记录不存在或无权限' } });
  }
  try {
    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates).map((c) => `\`${c}\` = ?`).join(', ');
      const preparedValues = Object.keys(updates).map((c) => prepareValue('reading_items', c, updates[c]));
      const sql = `UPDATE reading_items SET ${setClause} WHERE id = ? AND user_id = ?`;
      await pool.query(sql, [...preparedValues, id, req.user.id]);
    }
    // 返回成功
    res.json({ data: { success: true, is_offline: wantOfflineTrue ? true : (wantOfflineFalse ? false : !!current.is_offline) }, error: null });
    // 后台异步处理离线操作
    if (wantOfflineTrue) {
      // 开启离线：触发后台下载
      triggerOfflineDownloadAsync(req.user.id, id, body.url || current.url);
    } else if (wantOfflineFalse && current.offline_path) {
      // 关闭离线：删除本地文件（同步即可，很快）
      const del = deleteOfflineFiles(current.offline_path);
      if (!del.ok) {
        console.error(`[offline] 删除失败: reading_id=${id}, err=${del.message}`);
      } else {
        console.log(`[offline] 已删除离线文件: reading_id=${id}, path=${current.offline_path}`);
      }
    }
  } catch (err) {
    console.error('reading PATCH error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 用户设置(当前主要是离线保存地址)───────────────────────

app.get('/api/user-settings', authMiddleware, async (req, res) => {
  try {
    const settings = await getUserSetting(req.user.id);
    return res.json({ data: settings, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

app.put('/api/user-settings', authMiddleware, async (req, res) => {
  try {
    const settings = await updateUserSetting(req.user.id, req.body || {});
    return res.json({ data: settings, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ══════════════════════════════════════════════════════════════════════
// RSS 订阅阅读
// - GET    /api/rss/sources           列出当前用户的订阅源
// - POST   /api/rss/sources           新建订阅源（创建后立即后台抓取一次）
// - PATCH  /api/rss/sources/:id       更新订阅源（name/url/color/description）
// - DELETE /api/rss/sources/:id       删除订阅源（级联删除文章）
// - POST   /api/rss/sources/:id/refresh 手动触发抓取
// - GET    /api/rss/articles          列出文章（支持 source_id/is_read/is_starred/q 过滤，published_at|created_at 排序）
// - GET    /api/rss/articles/grouped   按订阅源分组返回
// - PATCH  /api/rss/articles/:id       更新文章（is_read/is_starred）
// - DELETE /api/rss/articles/:id       删除文章
// ══════════════════════════════════════════════════════════════════════

// 列出订阅源
app.get('/api/rss/sources', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, name, url, description, site_url, color,
              last_fetched_at, last_status, last_error, article_count,
              created_at, updated_at
       FROM rss_sources
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [req.user.id]
    );
    return res.json({ data: rows.map(r => transformRow('rss_sources', r)), error: null });
  } catch (err) {
    console.error('rss/sources GET error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 新建订阅源
app.post('/api/rss/sources', authMiddleware, async (req, res) => {
  const { url, name, color, description } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.json({ data: null, error: { message: '缺少 url' } });
  }
  // 简单 URL 校验
  try { new URL(url); } catch { return res.json({ data: null, error: { message: 'url 不合法' } }); }
  try {
    // 先创建（status=pending），随后后台抓取
    const [result] = await pool.query(
      `INSERT INTO rss_sources (user_id, name, url, color, description, last_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, (name || '').slice(0, 255) || '', url, color || '#6b7280', (description || '').slice(0, 65535) || null]
    );
    const sourceId = result.insertId;
    const [rows] = await pool.query(
      `SELECT id, user_id, name, url, description, site_url, color,
              last_fetched_at, last_status, last_error, article_count,
              created_at, updated_at
       FROM rss_sources WHERE id = ?`,
      [sourceId]
    );
    const source = rows[0];
    // 立即返回，后台抓取
    refreshSource({ id: sourceId, user_id: req.user.id, name: source.name, url: source.url }).catch(() => {});
    return res.json({ data: transformRow('rss_sources', source), error: null });
  } catch (err) {
    console.error('rss/sources POST error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 更新订阅源
app.patch('/api/rss/sources/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 不合法' } });
  }
  const body = req.body || {};
  const ALLOWED = ['name', 'url', 'color', 'description'];
  const sets = [];
  const params = [];
  for (const k of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      if (k === 'url') {
        try { new URL(body.url); } catch { return res.json({ data: null, error: { message: 'url 不合法' } }); }
      }
      sets.push(`\`${k}\` = ?`);
      params.push(body[k]);
    }
  }
  // 如果 url 改了，触发重新抓取
  const urlChanged = Object.prototype.hasOwnProperty.call(body, 'url');
  try {
    const [rows] = await pool.query('SELECT id, user_id, name, url FROM rss_sources WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: '订阅源不存在或无权限' } });
    }
    if (sets.length > 0) {
      sets.push('`updated_at` = CURRENT_TIMESTAMP');
      params.push(id, req.user.id);
      await pool.query(`UPDATE rss_sources SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
    }
    const [updated] = await pool.query(
      `SELECT id, user_id, name, url, description, site_url, color,
              last_fetched_at, last_status, last_error, article_count,
              created_at, updated_at
       FROM rss_sources WHERE id = ?`,
      [id]
    );
    // url 变了：触发抓取（用新 url）
    if (urlChanged) {
      const newUrl = body.url;
      refreshSource({ id, user_id: req.user.id, name: updated[0].name, url: newUrl }).catch(() => {});
    }
    return res.json({ data: transformRow('rss_sources', updated[0]), error: null });
  } catch (err) {
    console.error('rss/sources PATCH error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 删除订阅源（级联删除文章）
app.delete('/api/rss/sources/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 不合法' } });
  }
  try {
    const [result] = await pool.query('DELETE FROM rss_sources WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (result.affectedRows === 0) {
      return res.json({ data: null, error: { message: '订阅源不存在或无权限' } });
    }
    // 文章由外键 ON DELETE CASCADE 自动删除
    return res.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('rss/sources DELETE error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 手动触发抓取
app.post('/api/rss/sources/:id/refresh', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 不合法' } });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, name, url FROM rss_sources WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: '订阅源不存在或无权限' } });
    }
    const src = rows[0];
    // 异步触发，立即返回（前端轮询）
    refreshSource(src).catch(() => {});
    return res.json({ data: { success: true, message: '已在后台开始抓取' }, error: null });
  } catch (err) {
    console.error('rss/sources/refresh error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 列出文章
// query: source_id, is_read, is_starred, q, order=published_at|created_at, dir=desc|asc, limit, offset
app.get('/api/rss/articles', authMiddleware, async (req, res) => {
  try {
    const { source_id, is_read, is_starred, q } = req.query;
    const orderCol = (req.query.order === 'created_at') ? 'created_at' : 'published_at';
    const dir = (req.query.dir === 'asc') ? 'ASC' : 'DESC';
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);

    const where = ['a.user_id = ?'];
    const params = [req.user.id];
    if (source_id) {
      where.push('a.source_id = ?');
      params.push(parseInt(source_id, 10));
    }
    if (is_read === 'true' || is_read === '1') where.push('a.is_read = 1');
    else if (is_read === 'false' || is_read === '0') where.push('a.is_read = 0');
    if (is_starred === 'true' || is_starred === '1') where.push('a.is_starred = 1');

    if (q) {
      where.push('(a.title LIKE ? OR a.summary LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const sql = `
      SELECT a.id, a.user_id, a.source_id, a.guid, a.url, a.title, a.summary,
             a.cover_url, a.author, a.categories, a.published_at, a.is_read, a.is_starred,
             a.created_at, a.updated_at,
             s.name AS source_name, s.color AS source_color
      FROM rss_articles a
      LEFT JOIN rss_sources s ON s.id = a.source_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.${orderCol} IS NULL ${dir === 'DESC' ? 'DESC' : 'ASC'}, a.${orderCol} ${dir}, a.id ${dir}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const [rows] = await pool.query(sql, params);
    const data = rows.map(r => {
      const { source_name, source_color, ...rest } = r;
      const transformed = transformRow('rss_articles', rest);
      return { ...transformed, source_name, source_color };
    });
    return res.json({ data, error: null });
  } catch (err) {
    console.error('rss/articles GET error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 按订阅源分组返回
app.get('/api/rss/articles/grouped', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
    const isReadFilter = req.query.is_read;
    const isStarredFilter = req.query.is_starred;

    // 先拉所有订阅源（按 created_at 升序，保持用户添加顺序）
    const [sources] = await pool.query(
      `SELECT id, name, color, site_url, article_count, last_fetched_at, last_status
       FROM rss_sources WHERE user_id = ? ORDER BY created_at ASC`,
      [req.user.id]
    );

    // 每个源取最新 N 条
    const where = ['a.user_id = ?'];
    const params = [req.user.id];
    if (isReadFilter === 'false' || isReadFilter === '0') {
      where.push('a.is_read = 0');
    } else if (isReadFilter === 'true' || isReadFilter === '1') {
      where.push('a.is_read = 1');
    }
    if (isStarredFilter === 'true' || isStarredFilter === '1') {
      where.push('a.is_starred = 1');
    }
    const sql = `
      SELECT a.id, a.source_id, a.url, a.title, a.summary, a.cover_url, a.author,
             a.categories, a.published_at, a.is_read, a.is_starred, a.created_at
      FROM rss_articles a
      WHERE ${where.join(' AND ')}
      ORDER BY a.published_at IS NULL DESC, a.published_at DESC, a.id DESC
      LIMIT 1000
    `;
    const [articles] = await pool.query(sql, params);

    // 按 source_id 分组
    const groupMap = new Map();
    for (const a of articles) {
      if (!groupMap.has(a.source_id)) groupMap.set(a.source_id, []);
      groupMap.get(a.source_id).push(transformRow('rss_articles', a));
    }

    const data = sources.map(s => ({
      source: { id: s.id, name: s.name, color: s.color, site_url: s.site_url, article_count: s.article_count, last_fetched_at: s.last_fetched_at, last_status: s.last_status },
      articles: (groupMap.get(s.id) || []).slice(0, limit),
    }));
    return res.json({ data, error: null });
  } catch (err) {
    console.error('rss/articles/grouped error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 更新文章
app.patch('/api/rss/articles/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 不合法' } });
  }
  const body = req.body || {};
  const sets = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(body, 'is_read')) {
    sets.push('`is_read` = ?');
    params.push(body.is_read ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'is_starred')) {
    sets.push('`is_starred` = ?');
    params.push(body.is_starred ? 1 : 0);
  }
  if (sets.length === 0) {
    return res.json({ data: null, error: { message: '没有可更新字段' } });
  }
  try {
    const [result] = await pool.query(
      `UPDATE rss_articles SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
      [...params, id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.json({ data: null, error: { message: '文章不存在或无权限' } });
    }
    return res.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('rss/articles PATCH error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 删除文章
app.delete('/api/rss/articles/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 不合法' } });
  }
  try {
    // 先取出 source_id 用于更新计数
    const [rows] = await pool.query(
      'SELECT source_id FROM rss_articles WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: '文章不存在或无权限' } });
    }
    const sourceId = rows[0].source_id;
    await pool.query('DELETE FROM rss_articles WHERE id = ? AND user_id = ?', [id, req.user.id]);
    // 重新统计源的文章数
    await pool.query(
      'UPDATE rss_sources SET article_count = (SELECT COUNT(*) FROM rss_articles WHERE source_id = ?) WHERE id = ?',
      [sourceId, sourceId]
    ).catch(() => {});
    return res.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('rss/articles DELETE error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 预览 RSS 源（不落库，用于添加前确认源可用并预读源信息）
app.post('/api/rss/preview', authMiddleware, async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    return res.json({ data: null, error: { message: '缺少 url' } });
  }
  try { new URL(url); } catch { return res.json({ data: null, error: { message: 'url 不合法' } }); }
  try {
    const feed = await fetchFeed(url);
    return res.json({
      data: {
        title: feed.title,
        link: feed.link,
        description: feed.description,
        sample_count: feed.items.length,
        sample_items: feed.items.slice(0, 3).map(it => ({ title: it.title, link: it.link, published_at: it.published_at })),
      },
      error: null,
    });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 认证路由 ────────────────────────────────────────────────

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    const user = await registerUser({ username, password, nickname });
    const token = generateToken(user);
    setAuthCookie(res, token);
    return res.json({
      data: { user, token },
      error: null,
    });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ══════════════════════════════════════════════════════════════
// API Key 管理（用户在网页上创建，供外部工具使用）
// ══════════════════════════════════════════════════════════════

// 创建新的 API Key
app.post('/api/auth/api-keys', authMiddleware, async (req, res) => {
  try {
    const { name, expires_in_days } = req.body;
    const result = await createApiKeyForUser(req.user.id, {
      name: name || 'Default',
      expiresInDays: expires_in_days,
    });
    return res.json({ data: result, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 列出当前用户的所有 API Key
app.get('/api/auth/api-keys', authMiddleware, async (req, res) => {
  try {
    const keys = await listApiKeysForUser(req.user.id);
    return res.json({ data: keys, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 撤销 API Key
app.delete('/api/auth/api-keys/:id', authMiddleware, async (req, res) => {
  try {
    const success = await revokeApiKey(req.user.id, parseInt(req.params.id, 10));
    return res.json({ data: { success }, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 反查 API Key 明文（仅新建格式可反查，旧格式 is_legacy 提示重建）
app.get('/api/auth/api-keys/:id/reveal', authMiddleware, async (req, res) => {
  try {
    const result = await revealApiKey(req.user.id, parseInt(req.params.id, 10));
    if (!result.ok) {
      return res.json({ data: null, error: { message: result.message, code: result.code } });
    }
    return res.json({ data: { api_key: result.api_key, key_prefix: result.key_prefix }, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ data: null, error: { message: '请输入用户名和密码' } });
    }
    const user = await loginUser({ username, password });
    const token = generateToken(user);
    setAuthCookie(res, token);
    return res.json({
      data: { user, token },
      error: null,
    });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 登出
app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ data: { success: true }, error: null });
});

// 获取当前用户（需要登录）
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await getCurrentUser(req.user.id);
    if (!user) {
      return res.json({ data: null, error: { message: '用户不存在' } });
    }
    return res.json({ data: user, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 更新用户资料（需要登录）
app.patch('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { nickname, avatar_url } = req.body;
    const user = await updateUserProfile(req.user.id, { nickname, avatar_url });
    return res.json({ data: user, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 上传头像（需要登录）—— 文件存 uploads/avatars/，avatar_url 存为 /api/avatars/<filename>
app.post('/api/auth/avatar', authMiddleware, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.json({ data: null, error: { message: err.message || '上传失败' } });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.json({ data: null, error: { message: '未收到文件' } });
    const avatarUrl = `/api/avatars/${req.file.filename}`;
    const user = await updateUserProfile(req.user.id, { avatar_url: avatarUrl });
    return res.json({ data: { ...user, avatar_url: avatarUrl }, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 上传健康图片（药物照片、就诊附件等）—— 文件存 uploads/health/
app.post('/api/health/upload', authMiddleware, (req, res, next) => {
  healthImgUpload.single('file')(req, res, (err) => {
    if (err) return res.json({ data: null, error: { message: err.message || '上传失败' } });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.json({ data: null, error: { message: '未收到文件' } });
    const url = `/api/health/images/${req.file.filename}`;
    return res.json({ data: { url, filename: req.file.filename }, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 修改密码（需要登录）
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.json({ data: null, error: { message: '请输入原密码和新密码' } });
    }
    const result = await changePassword(req.user.id, old_password, new_password);
    return res.json({ data: result, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 工具函数 ────────────────────────────────────────────────

const ALLOWED_TABLES = new Set(Object.keys(TABLE_COLUMNS));
const TABLES_WITH_USER_ID = new Set([
  'tasks', 'task_groups', 'task_members', 'task_tags', 'task_comments',
  'memos', 'task_notes', 'reading_items', 'quick_notes',
  'rss_sources', 'rss_articles',
  'health_profiles', 'health_visits', 'health_medications',
  'vault_items'
]);

function validateColumn(table, column) {
  return TABLE_COLUMNS[table]?.includes(column);
}

function escapeId(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

function isoToMysqlDatetime(value) {
  if (typeof value !== 'string') return value;
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/);
  if (isoMatch) return `${isoMatch[1]} ${isoMatch[2]}`;
  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]} 00:00:00`;
  return value;
}

function mysqlDatetimeToIso(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return value;
  const dtMatch = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/);
  if (dtMatch) return `${dtMatch[1]}T${dtMatch[2]}.000Z`;
  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}T00:00:00.000Z`;
  return value;
}

function prepareValue(table, column, value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (BOOLEAN_COLUMNS[table]?.includes(column)) {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value ? 1 : 0;
  }
  if (DATETIME_COLUMNS[table]?.includes(column)) {
    return isoToMysqlDatetime(value);
  }
  if (JSON_COLUMNS[table]?.includes(column) && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function transformRow(table, row) {
  if (!row) return row;
  for (const col of (JSON_COLUMNS[table] || [])) {
    if (row[col] !== null && typeof row[col] === 'string') {
      try { row[col] = JSON.parse(row[col]); } catch {}
    }
  }
  for (const col of (DATETIME_COLUMNS[table] || [])) {
    if (row[col] !== null && row[col] !== undefined) {
      row[col] = mysqlDatetimeToIso(row[col]);
    }
  }
  for (const col of (BOOLEAN_COLUMNS[table] || [])) {
    if (row[col] !== null && row[col] !== undefined) {
      row[col] = row[col] === 1 || row[col] === true;
    }
  }
  return row;
}

function parseFilters(filterArray, table, userId) {
  const conditions = [];
  const params = [];

  // 自动注入 user_id 过滤（仅对需要登录的表）
  if (TABLES_WITH_USER_ID.has(table) && userId != null) {
    conditions.push('`user_id` = ?');
    params.push(userId);
  }

  for (const f of filterArray) {
    const parts = f.split(':');
    if (parts.length < 3) continue;
    const type = parts[0];
    const column = parts[1];
    const valueStr = parts.slice(2).join(':');

    if (!validateColumn(table, column)) continue;
    // 禁止客户端覆盖 user_id 过滤
    if (column === 'user_id') continue;

    let value;
    try { value = JSON.parse(valueStr); } catch { value = valueStr; }

    const col = escapeId(column);
    switch (type) {
      case 'eq':
        if (value === null) conditions.push(`${col} IS NULL`);
        else if (typeof value === 'boolean') {
          conditions.push(`${col} = ?`);
          params.push(value ? 1 : 0);
        } else {
          conditions.push(`${col} = ?`);
          params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        }
        break;
      case 'neq':
        if (value === null) conditions.push(`${col} IS NOT NULL`);
        else { conditions.push(`${col} != ?`); params.push(value); }
        break;
      case 'is':
        if (value === null) conditions.push(`${col} IS NULL`);
        else if (value === true) conditions.push(`${col} = 1`);
        else if (value === false) conditions.push(`${col} = 0`);
        break;
      case 'in':
        if (Array.isArray(value) && value.length > 0) {
          conditions.push(`${col} IN (${value.map(() => '?').join(', ')})`);
          params.push(...value);
        }
        break;
      case 'gt':
        conditions.push(`${col} > ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'gte':
        conditions.push(`${col} >= ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'lt':
        conditions.push(`${col} < ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'lte':
        conditions.push(`${col} <= ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'like':
        conditions.push(`${col} LIKE ?`);
        params.push(value);
        break;
    }
  }

  return { conditions, params };
}

function parseOrder(orderArray, table) {
  const orderClauses = [];
  for (const o of orderArray) {
    const [column, direction] = o.split(':');
    if (!validateColumn(table, column)) continue;
    if (column === 'user_id') continue; // 禁止按 user_id 排序
    const dir = direction === 'desc' ? 'DESC' : 'ASC';
    orderClauses.push(`${escapeId(column)} ${dir}`);
  }
  return orderClauses;
}

function parseSelect(selectStr, table) {
  if (!selectStr || selectStr === '*') return '*';
  const columns = selectStr.split(',').map(c => c.trim()).filter(Boolean);
  const valid = columns.filter(c => validateColumn(table, c));
  if (valid.length === 0) return '*';
  return valid.map(c => escapeId(c)).join(', ');
}

// ── 通用 CRUD 中间件 ────────────────────────────────────────
// 业务表需要登录后才能访问
function requireAuthForBusinessTable(req, res, next) {
  const { table } = req.params;
  // users 表走专门路由，不在这里处理
  if (table === 'users') {
    return res.json({ data: null, error: { message: 'Forbidden' } });
  }
  if (PUBLIC_TABLES.has(table)) return next();
  if (TABLES_WITH_USER_ID.has(table)) return authMiddleware(req, res, next);
  return next();
}

// ════════════════════════════════════════════════════════════
// 部署状态查询接口（必须在通用 CRUD 路由之前注册）
// 读取 deploy/.last-deploy.json 返回最近一次部署执行情况
// ════════════════════════════════════════════════════════════

app.get('/api/deploy/status', authOrApiKeyMiddleware, superAdminMiddleware, async (req, res) => {
  const deployDir = path.join(__dirname, '..', 'deploy');
  const statusFile = path.join(deployDir, '.last-deploy.json');
  const onceLogDir = path.join(deployDir, 'once', '.logs');

  try {
    // 1. 最近一次部署状态
    let lastDeploy = null;
    try {
      lastDeploy = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    } catch {}

    // 2. once 任务已执行记录
    const doneFile = path.join(deployDir, 'once', '.done');
    let doneTasks = [];
    try { doneTasks = fs.readFileSync(doneFile, 'utf-8').trim().split('\n').filter(Boolean); }
    catch {}

    // 3. once 任务目录下的所有脚本
    let pendingTasks = [];
    try {
      pendingTasks = fs.readdirSync(path.join(deployDir, 'once'))
        .filter(f => f.endsWith('.sh'))
        .map(f => ({
          name: f,
          executed: doneTasks.includes(f),
        }));
    } catch {}

    // 4. once 日志列表（按修改时间倒序）
    let onceLogs = [];
    try {
      onceLogs = fs.readdirSync(onceLogDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const stat = fs.statSync(path.join(onceLogDir, f));
          return { name: f.replace('.log', ''), size: stat.size, mtime: stat.mtime.toISOString() };
        })
        .sort((a, b) => new Date(b.mtime) - new Date(a.mtime))
        .slice(0, 10);
    } catch {}

    // 5. 历史部署记录（最近 10 份）
    const historyDir = path.join(deployDir, '.deploys');
    let history = [];
    try {
      history = fs.readdirSync(historyDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const stat = fs.statSync(path.join(historyDir, f));
          return { file: f, mtime: stat.mtime.toISOString() };
        })
        .sort((a, b) => new Date(b.mtime) - new Date(a.mtime))
        .slice(0, 10);
    } catch {}

    // 6. 实时 git HEAD
    let gitHead = null;
    try {
      const { execSync } = await import('child_process');
      const projectDir = path.join(__dirname, '..');
      gitHead = {
        commit: execSync('git rev-parse --short HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim(),
        message: execSync('git log -1 --format=%s', { cwd: projectDir, encoding: 'utf-8' }).trim(),
        author: execSync('git log -1 --format=%an', { cwd: projectDir, encoding: 'utf-8' }).trim(),
        time: execSync('git log -1 --format=%ci', { cwd: projectDir, encoding: 'utf-8' }).trim(),
      };
    } catch {}

    return res.json({
      data: {
        last_deploy: lastDeploy,
        git_head: gitHead,
        once_tasks: pendingTasks,
        once_logs: onceLogs,
        history,
      },
      error: null,
    });
  } catch (err) {
    console.error('deploy/status error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 获取某个 once 任务的完整日志
app.get('/api/deploy/once-log/:name', authOrApiKeyMiddleware, superAdminMiddleware, async (req, res) => {
  const logFile = path.join(__dirname, '..', 'deploy', 'once', '.logs', `${req.params.name}.log`);
  // 防路径穿越
  if (!logFile.startsWith(path.join(__dirname, '..', 'deploy', 'once', '.logs'))) {
    return res.json({ data: null, error: { message: '非法路径' } });
  }
  try {
    if (!fs.existsSync(logFile)) {
      return res.json({ data: null, error: { message: '日志不存在' } });
    }
    const content = fs.readFileSync(logFile, 'utf-8');
    return res.json({ data: { name: req.params.name, content }, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 获取历史部署详情
app.get('/api/deploy/history/:file', authOrApiKeyMiddleware, superAdminMiddleware, async (req, res) => {
  const historyDir = path.join(__dirname, '..', 'deploy', '.deploys');
  const filePath = path.join(historyDir, req.params.file);
  // 防路径穿越：只允许 .json 文件名
  if (!/^[\w.-]+\.json$/.test(req.params.file) || !filePath.startsWith(historyDir)) {
    return res.json({ data: null, error: { message: '非法路径' } });
  }
  try {
    if (!fs.existsSync(filePath)) {
      return res.json({ data: null, error: { message: '历史记录不存在' } });
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return res.json({ data: content, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});



app.post('/api/batch', authMiddleware, async (req, res) => {
  const t0 = Date.now();
  const queries = req.body?.queries || [];
  if (!Array.isArray(queries) || queries.length === 0) {
    return res.json({ data: null, error: { message: 'queries 必须是非空数组' } });
  }
  if (queries.length > 10) {
    return res.json({ data: null, error: { message: '单次最多 10 条查询' } });
  }
  try {
    const results = await Promise.all(
      queries.map(async (q, idx) => {
        const t1 = Date.now();
        const { table, select, filter, order, limit } = q;
        if (!ALLOWED_TABLES.has(table)) {
          return { error: `Table "${table}" not found` };
        }
        try {
          const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
          const orders = Array.isArray(order) ? order : order ? [order] : [];
          const userId = TABLES_WITH_USER_ID.has(table) ? req.user?.id : null;
          const { conditions, params } = parseFilters(filters, table, userId);
          const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
          const selectClause = parseSelect(select, table);
          const orderClauses = parseOrder(orders, table);
          const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
          const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';
          const sql = `SELECT ${selectClause} FROM ${escapeId(table)} ${whereClause} ${orderClause} ${limitClause}`;
          const t2 = Date.now();
          const [rows] = await pool.query(sql, params);
          const t3 = Date.now();
          const mapped = rows.map(row => transformRow(table, row));
          const t4 = Date.now();
          console.log(`[batch][${idx}] ${table}: build=${t2 - t1}ms, query=${t3 - t2}ms, map=${t4 - t3}ms, rows=${rows.length}`);
          return { data: mapped };
        } catch (err) {
          return { error: err.message };
        }
      })
    );
    const total = Date.now() - t0;
    console.log(`[batch] total=${total}ms queries=${queries.length}`);
    return res.json({ data: results, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ════════════════════════════════════════════════════════════════════
// 密码保险箱（Vault）—— 加密存储敏感信息
// ════════════════════════════════════════════════════════════════════

// 解锁保险箱：用登录密码验证，签发 1 小时有效的 vault_token
app.post('/api/vault/unlock', authMiddleware, async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.json({ data: null, error: { message: '请输入登录密码' } });
  }
  try {
    const [rows] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: '用户不存在' } });
    }
    const bcrypt = (await import('bcryptjs')).default;
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) {
      return res.json({ data: null, error: { message: '密码错误' } });
    }
    const vaultToken = generateVaultToken(req.user);
    return res.json({
      data: { vault_token: vaultToken, expires_in: 3600 },
      error: null,
    });
  } catch (err) {
    console.error('vault unlock error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 列出保险箱条目（返回元数据，不含明文密码）
app.get('/api/vault/items', authMiddleware, async (req, res) => {
  try {
    const { category, keyword, is_active } = req.query;
    const conditions = ['user_id = ? AND deleted_at IS NULL'];
    const params = [req.user.id];
    if (category && category !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }
    if (is_active !== undefined && is_active !== 'all') {
      conditions.push('is_active = ?');
      params.push(is_active === 'true' ? 1 : 0);
    }
    if (keyword) {
      conditions.push('(title LIKE ? OR username LIKE ? OR phone LIKE ? OR email LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    const sql = `SELECT id, category, title, username, phone, email, login_methods, url, is_active, tags, created_at, updated_at
                  FROM vault_items WHERE ${conditions.join(' AND ')}
                  ORDER BY updated_at DESC`;
    const [rows] = await pool.query(sql, params);
    return res.json({ data: rows, error: null });
  } catch (err) {
    console.error('vault list error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 获取单个条目明文（需 vault_token）
app.get('/api/vault/items/:id', authMiddleware, vaultAuthMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 无效' } });
  }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM vault_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, req.user.id]
    );
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: '条目不存在' } });
    }
    const item = rows[0];
    let secret = '';
    let notes = '';
    try { secret = decryptVault(item.cipher_secret); } catch (e) { secret = '[解密失败]'; }
    try { notes = item.cipher_notes ? decryptVault(item.cipher_notes) : ''; } catch (e) { notes = '[解密失败]'; }
    return res.json({
      data: {
        ...item,
        secret,
        notes,
        cipher_secret: undefined,
        cipher_notes: undefined,
      },
      error: null,
    });
  } catch (err) {
    console.error('vault get error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 创建条目（前端传明文，后端加密存储）
app.post('/api/vault/items', authMiddleware, async (req, res) => {
  const { category = 'password', title, username, phone, email, login_methods, secret, url, notes, tags, is_active = true } = req.body || {};
  if (!title) {
    return res.json({ data: null, error: { message: '标题不能为空' } });
  }
  if (!secret) {
    return res.json({ data: null, error: { message: '密码/密钥不能为空' } });
  }
  try {
    const cipherSecret = encryptVault(secret);
    const cipherNotes = notes ? encryptVault(notes) : null;
    const [result] = await pool.query(
      `INSERT INTO vault_items (user_id, category, title, username, phone, email, login_methods, cipher_secret, url, cipher_notes, is_active, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, category, title, username || null, phone || null, email || null,
       JSON.stringify(login_methods || []), cipherSecret, url || null, cipherNotes, is_active ? 1 : 0, JSON.stringify(tags || [])]
    );
    return res.json({ data: { id: result.insertId }, error: null });
  } catch (err) {
    console.error('vault create error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 更新条目
app.patch('/api/vault/items/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 无效' } });
  }
  const { category, title, username, phone, email, login_methods, secret, url, notes, tags, is_active } = req.body || {};
  const updates = [];
  const params = [];
  if (category !== undefined) { updates.push('category = ?'); params.push(category); }
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (username !== undefined) { updates.push('username = ?'); params.push(username); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (login_methods !== undefined) { updates.push('login_methods = ?'); params.push(JSON.stringify(login_methods || [])); }
  if (secret !== undefined) { updates.push('cipher_secret = ?'); params.push(encryptVault(secret)); }
  if (url !== undefined) { updates.push('url = ?'); params.push(url); }
  if (notes !== undefined) { updates.push('cipher_notes = ?'); params.push(notes ? encryptVault(notes) : null); }
  if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags || [])); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (updates.length === 0) {
    return res.json({ data: null, error: { message: '没有需要更新的字段' } });
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id, req.user.id);
  try {
    const [result] = await pool.query(
      `UPDATE vault_items SET ${updates.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      params
    );
    if (result.affectedRows === 0) {
      return res.json({ data: null, error: { message: '条目不存在或无权限' } });
    }
    return res.json({ data: { ok: true }, error: null });
  } catch (err) {
    console.error('vault update error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 软删除条目
app.delete('/api/vault/items/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 无效' } });
  }
  try {
    const [result] = await pool.query(
      'UPDATE vault_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.json({ data: null, error: { message: '条目不存在或无权限' } });
    }
    return res.json({ data: { ok: true }, error: null });
  } catch (err) {
    console.error('vault delete error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ════════════════════════════════════════════════════════════════════
// 健康档案模块 —— 专用查询接口（基础 CRUD 走通用路由）
// ════════════════════════════════════════════════════════════════════

// 获取档案列表（含最近就诊 + 当前用药 + 下次就诊倒计时）
app.get('/api/health/profiles/with-stats', authMiddleware, async (req, res) => {
  try {
    const [profiles] = await pool.query(
      `SELECT * FROM health_profiles WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [req.user.id]
    );
    for (const p of profiles) {
      const tp = transformRow('health_profiles', p);
      Object.assign(p, tp);
      // 最近一次就诊
      const [lastVisit] = await pool.query(
        `SELECT id, visit_date, hospital, diagnosis FROM health_visits
         WHERE profile_id = ? ORDER BY visit_date DESC LIMIT 1`,
        [p.id]
      );
      p.last_visit = lastVisit[0] ? transformRow('health_visits', lastVisit[0]) : null;
      // 下次就诊
      const [nextVisit] = await pool.query(
        `SELECT id, next_visit_date, hospital FROM health_visits
         WHERE profile_id = ? AND next_visit_date IS NOT NULL AND next_visit_date >= CURDATE()
         ORDER BY next_visit_date ASC LIMIT 1`,
        [p.id]
      );
      p.next_visit = nextVisit[0] ? transformRow('health_visits', nextVisit[0]) : null;
      // 当前用药数量
      const [[medCount]] = await pool.query(
        `SELECT COUNT(*) as count FROM health_medications
         WHERE profile_id = ? AND status = 'active'`,
        [p.id]
      );
      p.active_medication_count = medCount.count;
      // 就诊总次数
      const [[visitCount]] = await pool.query(
        `SELECT COUNT(*) as count FROM health_visits WHERE profile_id = ?`,
        [p.id]
      );
      p.visit_count = visitCount.count;
    }
    return res.json({ data: profiles, error: null });
  } catch (err) {
    console.error('health profiles stats error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 获取档案详情（含就诊记录 + 用药清单）
app.get('/api/health/profiles/:id/detail', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 无效' } });
  }
  try {
    const [profiles] = await pool.query(
      'SELECT * FROM health_profiles WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, req.user.id]
    );
    if (profiles.length === 0) {
      return res.json({ data: null, error: { message: '档案不存在' } });
    }
    const profile = transformRow('health_profiles', profiles[0]);
    const [visits] = await pool.query(
      `SELECT * FROM health_visits WHERE profile_id = ? ORDER BY visit_date DESC`,
      [id]
    );
    const [medications] = await pool.query(
      `SELECT * FROM health_medications WHERE profile_id = ? ORDER BY status DESC, created_at DESC`,
      [id]
    );
    // 把药物按 visit_id 分组：visits[].medications，未关联就诊的归到顶层 medications
    const visitIds = new Set(visits.map(v => v.id));
    const visitsMedMap = {};
    const topMeds = [];
    for (const m of medications) {
      const tm = transformRow('health_medications', m);
      if (tm.visit_id && visitIds.has(tm.visit_id)) {
        if (!visitsMedMap[tm.visit_id]) visitsMedMap[tm.visit_id] = [];
        visitsMedMap[tm.visit_id].push(tm);
      } else {
        topMeds.push(tm);
      }
    }
    const visitsOut = visits.map(v => {
      const tv = transformRow('health_visits', v);
      tv.medications = visitsMedMap[v.id] || [];
      return tv;
    });
    return res.json({
      data: {
        ...profile,
        visits: visitsOut,
        medications: topMeds,
      },
      error: null,
    });
  } catch (err) {
    console.error('health profile detail error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ════════════════════════════════════════════════════════════
// 通用 CRUD 路由
// ════════════════════════════════════════════════════════════

// SELECT
app.get('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { select, filter, order, limit, single, count } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const userId = TABLES_WITH_USER_ID.has(table) ? req.user?.id : null;
    const { conditions, params } = parseFilters(filters, table, userId);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const selectClause = parseSelect(select, table);
    const orderClauses = parseOrder(orders, table);
    const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

    let countResult = null;
    if (count === 'exact') {
      const countSql = `SELECT COUNT(*) as total FROM ${escapeId(table)} ${whereClause}`;
      const [countRows] = await pool.query(countSql, params);
      countResult = countRows[0]?.total ?? 0;
    }

    const sql = `SELECT ${selectClause} FROM ${escapeId(table)} ${whereClause} ${orderClause} ${limitClause}`;
    const [rows] = await pool.query(sql, params);
    const data = rows.map(row => transformRow(table, row));

    if (single === '1') {
      return res.json({ data: data[0] || null, error: null, count: countResult });
    }
    return res.json({ data, error: null, count: countResult });
  } catch (err) {
    console.error('SELECT error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// INSERT
app.post('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: 'No data provided' } });
    }

    // reading_items: 收集需要后台离线下载的行 / 后台异步解析的行
    const offlinePending = []; // { id, url, parsedData }
    const autoParsePending = []; // { rowIdx, url }

    const validCols = TABLE_COLUMNS[table];
    const columns = [];
    const valueRows = [];

    // 自动注入 user_id
    const autoUserId = TABLES_WITH_USER_ID.has(table) ? req.user.id : null;

    for (const row of rows) {
      // reading_items 特殊处理
      if (table === 'reading_items') {
        // 1) url 兼容分享文本：自动提取真实 URL
        if (row.url) {
          const extracted = extractUrl(row.url);
          if (extracted && extracted !== row.url) {
            row.url = extracted;
          }
        }
        // 2) parsed_data: 直接使用传入的解析结果（跳过服务端解析，避免 IP 限流）
        const parsedData = row.parsed_data || row.parsedData;
        if (parsedData && typeof parsedData === 'object') {
          const meta = extractMetaFromParsedData(parsedData);
          if (meta) {
            if (!row.title && meta.title) row.title = meta.title;
            if (!row.cover_url && meta.cover_url) row.cover_url = meta.cover_url;
            if (!row.platform && meta.platform) row.platform = meta.platform;
            if (!row.summary && meta.summary) row.summary = meta.summary;
          }
        }
        // 3) auto_parse: 服务端自动解析（仅当没有 parsed_data 时才调用）
        //    async_parse=true 时立即返回，后台异步解析补全；否则同步等待解析完成
        const wantAutoParse = row.auto_parse === true || row.autoParse === true || row.auto_parse === 'true';
        const asyncParse = row.async_parse === true || row.asyncParse === true || row.async_parse === 'true';
        const hasParsedData = !!(parsedData && typeof parsedData === 'object');
        if (wantAutoParse && row.url && !hasParsedData) {
          if (asyncParse) {
            // 异步模式：先记录一下，存库后触发后台解析
            autoParsePending.push({ rowIdx: valueRows.length, url: row.url });
          } else {
            // 同步模式（默认）：等待解析完成
            try {
              const parsed = await parseShare(row.url);
              if (parsed.code === 200) {
                if (!row.title && parsed.title) row.title = parsed.title;
                if (!row.cover_url && parsed.cover_url) row.cover_url = parsed.cover_url;
                if (!row.platform && parsed.platform) row.platform = parsed.platform;
                if (!row.summary && parsed.summary) row.summary = parsed.summary;
              }
            } catch (parseErr) {
              console.error('[auto_parse] 解析失败:', parseErr.message);
            }
          }
        }
      }

      // reading_items is_offline=true 特殊处理：先存 false，后台下载完再更新
      const wantOffline = table === 'reading_items' && (row.is_offline === true || row.is_offline === 1 || row.is_offline === 'true');
      if (table === 'reading_items' && wantOffline) {
        row.is_offline = false;
        row.offline_path = null;
      }

      const allKeys = new Set();
      for (const key of Object.keys(row)) {
        if (validCols.includes(key) && key !== 'user_id') allKeys.add(key);
      }
      if (autoUserId !== null) {
        allKeys.add('user_id');
      }
      if (columns.length === 0) {
        columns.push(...allKeys);
      }

      const values = columns.map(col => {
        if (col === 'user_id') return autoUserId;
        return prepareValue(table, col, row[col]);
      });
      valueRows.push(values);

      // 记录需要离线的行（用行在数组中的索引，后面拿到 insertId 再补）
      if (wantOffline) {
        const pd = row.parsed_data || row.parsedData;
        offlinePending.push({
          rowIdx: valueRows.length - 1,
          url: row.url,
          parsedData: pd && typeof pd === 'object' ? pd : null,
        });
      }
    }

    const placeholders = valueRows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const allValues = valueRows.flat();
    const columnList = columns.map(c => escapeId(c)).join(', ');
    const sql = `INSERT INTO ${escapeId(table)} (${columnList}) VALUES ${placeholders}`;

    const [result] = await pool.query(sql, allValues);

    let data = null;
    if (rows.length === 1) {
      const firstWantOffline = offlinePending.some(p => p.rowIdx === 0);
      const firstWantAutoParse = autoParsePending.some(p => p.rowIdx === 0);
      data = { ...rows[0], user_id: autoUserId, is_offline: firstWantOffline ? true : (rows[0].is_offline ?? false) };
      if (result.insertId) data.id = result.insertId;
      // 触发后台离线下载
      if (firstWantOffline && result.insertId) {
        const p = offlinePending.find(p => p.rowIdx === 0);
        triggerOfflineDownloadAsync(req.user.id, result.insertId, p?.url || rows[0].url, p?.parsedData || null);
      }
      // 触发后台自动解析
      if (firstWantAutoParse && result.insertId) {
        const p = autoParsePending.find(p => p.rowIdx === 0);
        triggerAutoParseAsync(req.user.id, result.insertId, p.url);
      }
    } else {
      data = rows.map((r, i) => {
        const insertedId = result.insertId ? result.insertId + i : r.id;
        const wantOffline = offlinePending.some(p => p.rowIdx === i);
        const wantAutoParse = autoParsePending.some(p => p.rowIdx === i);
        const item = { ...r, user_id: autoUserId, is_offline: wantOffline ? true : (r.is_offline ?? false) };
        if (insertedId) item.id = insertedId;
        if (wantOffline && insertedId) {
          const p = offlinePending.find(p => p.rowIdx === i);
          triggerOfflineDownloadAsync(req.user.id, insertedId, p?.url || r.url, p?.parsedData || null);
        }
        if (wantAutoParse && insertedId) {
          const p = autoParsePending.find(p => p.rowIdx === i);
          triggerAutoParseAsync(req.user.id, insertedId, p.url);
        }
        return item;
      });
    }

    return res.json({ data, error: null });
  } catch (err) {
    console.error('INSERT error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// UPDATE
app.patch('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { filter, order, limit, single, return: returnData, select } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const userId = TABLES_WITH_USER_ID.has(table) ? req.user?.id : null;
    const { conditions, params } = parseFilters(filters, table, userId);
    if (conditions.length === 0) {
      return res.json({ data: null, error: { message: 'UPDATE requires filter' } });
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const patch = req.body;
    const validCols = TABLE_COLUMNS[table];
    const setColumns = [];
    const setParams = [];

    // reading_items is_offline 三态处理
    const isReadingTable = table === 'reading_items';
    let wantOfflineTrue = false;
    let wantOfflineFalse = false;
    let affectedRows = [];
    let overridePatch = { ...patch };

    if (isReadingTable) {
      const offlineKey = Object.keys(patch).includes('is_offline') ? 'is_offline' : (Object.keys(patch).includes('isOffline') ? 'isOffline' : null);
      if (offlineKey) {
        const v = patch[offlineKey];
        if (v === true || v === 1 || v === 'true') {
          wantOfflineTrue = true;
          overridePatch.is_offline = false;
          overridePatch.offline_path = null;
        } else if (v === false || v === 0 || v === 'false') {
          wantOfflineFalse = true;
          overridePatch.is_offline = false;
          overridePatch.offline_path = null;
        }
      }
      // 更新前先查出受影响的行（用于后续离线文件删除/下载）
      if (wantOfflineTrue || wantOfflineFalse) {
        const selectSql = `SELECT id, url, offline_path, is_offline FROM ${escapeId(table)} ${whereClause}`;
        const [rows] = await pool.query(selectSql, params);
        affectedRows = rows;
      }
    }

    for (const [key, value] of Object.entries(overridePatch)) {
      // 禁止客户端修改主键、user_id 和 password_hash（防止主键冲突）
      if (key === 'id' || key === 'user_id' || key === 'password_hash') continue;
      if (validCols.includes(key)) {
        setColumns.push(`${escapeId(key)} = ?`);
        setParams.push(prepareValue(table, key, value));
      }
    }

    // 自动更新 updated_at
    const TABLES_WITH_UPDATED_AT = ['tasks', 'task_groups', 'memos', 'task_notes', 'health_profiles', 'health_medications', 'vault_items'];
    if (TABLES_WITH_UPDATED_AT.includes(table) && !overridePatch.updated_at) {
      setColumns.push('`updated_at` = CURRENT_TIMESTAMP');
    }

    if (setColumns.length === 0 && !(isReadingTable && (wantOfflineTrue || wantOfflineFalse))) {
      return res.json({ data: null, error: { message: 'No valid columns to update' } });
    }

    const orderClauses = parseOrder(orders, table);
    const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

    if (setColumns.length > 0) {
      const sql = `UPDATE ${escapeId(table)} SET ${setColumns.join(', ')} ${whereClause} ${orderClause} ${limitClause}`;
      const allParams = [...setParams, ...params];
      await pool.query(sql, allParams);
    }

    // 后台处理离线操作
    if (isReadingTable && affectedRows.length > 0) {
      for (const row of affectedRows) {
        if (wantOfflineTrue) {
          triggerOfflineDownloadAsync(req.user.id, row.id, overridePatch.url || row.url);
        } else if (wantOfflineFalse && row.offline_path) {
          const del = deleteOfflineFiles(row.offline_path);
          if (!del.ok) {
            console.error(`[offline] 删除失败: reading_id=${row.id}, err=${del.message}`);
          } else {
            console.log(`[offline] 已删除离线文件: reading_id=${row.id}, path=${row.offline_path}`);
          }
        }
      }
    }

    if (returnData === '1') {
      const selectClause = parseSelect(select, table);
      const selectSql = `SELECT ${selectClause} FROM ${escapeId(table)} ${whereClause}`;
      const [rows] = await pool.query(selectSql, params);
      const data = rows.map(row => transformRow(table, row));
      if (single === '1') return res.json({ data: data[0] || null, error: null });
      return res.json({ data, error: null });
    }

    return res.json({ data: null, error: null });
  } catch (err) {
    console.error('UPDATE error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// DELETE
app.delete('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { filter, order, limit } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const userId = TABLES_WITH_USER_ID.has(table) ? req.user?.id : null;
    const { conditions, params } = parseFilters(filters, table, userId);
    if (conditions.length === 0) {
      return res.json({ data: null, error: { message: 'DELETE requires filter' } });
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const orderClauses = parseOrder(orders, table);
    const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

    const sql = `DELETE FROM ${escapeId(table)} ${whereClause} ${orderClause} ${limitClause}`;
    await pool.query(sql, params);

    return res.json({ data: null, error: null });
  } catch (err) {
    console.error('DELETE error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ══════════════════════════════════════════════════════════════
// SKILL API v1（供 buddy-skill 工具使用，使用 API Key 认证）
// ══════════════════════════════════════════════════════════════

const API_KEY_TABLES = new Set(['tasks', 'task_groups', 'memos', 'task_notes', 'reading_items', 'quick_notes']);

// API Key 认证中间件
async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({
      data: null,
      error: { message: '缺少 X-API-Key 请求头' },
    });
  }
  const result = await getUserByApiKey(apiKey);
  if (!result) {
    return res.status(401).json({
      data: null,
      error: { message: 'API Key 无效或已过期' },
    });
  }
  req.user = result.user;
  req.apiKeyId = result.api_key_id;
  next();
}

// 列出任务
app.get('/api/v1/tasks', apiKeyAuth, async (req, res) => {
  const filters = parseApiFilters(req.query, 'tasks');
  const userId = req.user.id;
  const { sql, params } = buildSelectSql('tasks', userId, filters, {
    order: req.query.order,
    limit: req.query.limit,
  });
  const [rows] = await pool.query(sql, params);
  res.json({ data: rows.map(r => transformRow('tasks', r)), error: null });
});

// 获取单条任务
app.get('/api/v1/tasks/:id', apiKeyAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 必须是数字' } });
  }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    const row = rows[0];
    if (!row) {
      return res.json({ data: null, error: { message: '任务不存在或无权限' } });
    }
    res.json({ data: transformRow('tasks', row), error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 创建任务
app.post('/api/v1/tasks', apiKeyAuth, async (req, res) => {
  try {
    const row = { ...req.body, user_id: req.user.id };
    const { sql, params } = buildInsertSql('tasks', [row]);
    const [result] = await pool.query(sql, params);
    res.status(201).json({ data: { ...row, id: result.insertId || row.id }, error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 更新任务
app.patch('/api/v1/tasks/:id', apiKeyAuth, async (req, res) => {
  try {
    const { sql, params } = buildUpdateSql('tasks', req.user.id, parseInt(req.params.id, 10), req.body);
    if (!sql) {
      return res.json({ data: null, error: { message: '没有可更新的字段' } });
    }
    await pool.query(sql, params);
    res.json({ data: { success: true }, error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 删除任务（必须 confirm=true）
app.delete('/api/v1/tasks/:id', apiKeyAuth, async (req, res) => {
  if (req.query.confirm !== 'true') {
    return res.json({
      data: null,
      error: {
        message: '删除任务需要 confirm=true。SKILL 必须先向用户列出计划并取得确认。',
        code: 'CONFIRMATION_REQUIRED',
      },
    });
  }
  try {
    await pool.query(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?',
      [parseInt(req.params.id, 10), req.user.id]
    );
    res.json({ data: { success: true }, error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 批量整理任务（dry_run=true 时只列计划不执行）
app.post('/api/v1/tasks/organize', apiKeyAuth, async (req, res) => {
  try {
    const { plan, dry_run = true } = req.body;

    if (!plan || !Array.isArray(plan) || plan.length === 0) {
      return res.json({ data: null, error: { message: 'plan 必须是包含操作的数组' } });
    }

    // 校验 plan 格式
    for (const op of plan) {
      if (!op.action || !['update', 'delete', 'create'].includes(op.action)) {
        return res.json({
          data: null,
          error: { message: `不支持的操作：${op.action}（仅支持 create/update/delete）` },
        });
      }
    }

    if (dry_run) {
      // dry_run 模式只返回计划预览，不实际执行
      return res.json({
        data: {
          dry_run: true,
          plan,
          affected_tasks: plan.filter(o => o.id).map(o => o.id),
          summary: plan.map(op => describePlanOp(op)),
        },
        error: null,
      });
    }

    // 实际执行：用事务确保原子性
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const results = [];
      for (const op of plan) {
        if (op.action === 'update') {
          const { sql, params } = buildUpdateSql('tasks', req.user.id, op.id, op.changes || {});
          if (sql) {
            const [r] = await conn.query(sql, params);
            results.push({ id: op.id, action: 'update', affected: r.affectedRows });
          }
        } else if (op.action === 'delete') {
          const [r] = await conn.query(
            'DELETE FROM tasks WHERE id = ? AND user_id = ?',
            [op.id, req.user.id]
          );
          results.push({ id: op.id, action: 'delete', affected: r.affectedRows });
        } else if (op.action === 'create') {
          const row = { ...op.data, user_id: req.user.id };
          const { sql, params } = buildInsertSql('tasks', [row]);
          const [r] = await conn.query(sql, params);
          results.push({ id: r.insertId || row.id, action: 'create' });
        }
      }
      await conn.commit();
      res.json({ data: { dry_run: false, results }, error: null });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 通用列表接口（备忘/阅读/随记）
for (const table of ['memos', 'reading_items', 'quick_notes']) {
  app.get(`/api/v1/${table === 'reading_items' ? 'reading' : table === 'memos' ? 'memos' : 'quick-notes'}`, apiKeyAuth, async (req, res) => {
    const filters = parseApiFilters(req.query, table);
    const { sql, params } = buildSelectSql(table, req.user.id, filters, {
      order: req.query.order,
      limit: req.query.limit,
    });
    const [rows] = await pool.query(sql, params);
    res.json({ data: rows.map(r => transformRow(table, r)), error: null });
  });

  app.get(`/api/v1/${table === 'reading_items' ? 'reading' : table === 'memos' ? 'memos' : 'quick-notes'}/:id`, apiKeyAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.json({ data: null, error: { message: 'id 必须是数字' } });
    }
    try {
      const [rows] = await pool.query(
        `SELECT * FROM ${escapeId(table)} WHERE id = ? AND user_id = ?`,
        [id, req.user.id]
      );
      const row = rows[0];
      if (!row) {
        return res.json({ data: null, error: { message: '记录不存在或无权限' } });
      }
      res.json({ data: transformRow(table, row), error: null });
    } catch (err) {
      res.json({ data: null, error: { message: err.message } });
    }
  });

  app.post(`/api/v1/${table === 'reading_items' ? 'reading' : table === 'memos' ? 'memos' : 'quick-notes'}`, apiKeyAuth, async (req, res) => {
    try {
      const body = req.body || {};
      let row = { ...body, user_id: req.user.id };

      // ── reading_items 特殊处理 ──────────────────────────────────
      if (table === 'reading_items') {
        // 1) url 兼容分享文本：自动提取真实 URL
        if (row.url) {
          const extracted = extractUrl(row.url);
          if (extracted && extracted !== row.url) {
            row.url = extracted;
          }
        }

        // 2) parsed_data: 直接使用传入的解析结果（跳过服务端解析，避免 IP 限流）
        //    用户传的字段优先级最高，parsed_data 只补空字段
        const parsedData = body.parsed_data || body.parsedData;
        if (parsedData && typeof parsedData === 'object') {
          const meta = extractMetaFromParsedData(parsedData);
          if (meta) {
            if (!row.title && meta.title) row.title = meta.title;
            if (!row.cover_url && meta.cover_url) row.cover_url = meta.cover_url;
            if (!row.platform && meta.platform) row.platform = meta.platform;
            if (!row.summary && meta.summary) row.summary = meta.summary;
          }
        }

        // 3) auto_parse: 服务端自动解析补全（仅当没有 parsed_data 且用户明确要求时才调用）
        //    async_parse=true 时立即返回，后台异步解析补全；否则同步等待解析完成
        const wantAutoParse = body.auto_parse === true || body.autoParse === true || body.auto_parse === 'true';
        const asyncParse = body.async_parse === true || body.asyncParse === true || body.async_parse === 'true';
        const hasParsedData = !!(parsedData && typeof parsedData === 'object');
        let needAsyncParse = false;
        if (wantAutoParse && row.url && !hasParsedData) {
          if (asyncParse) {
            needAsyncParse = true;
          } else {
            try {
              const parsed = await parseShare(row.url);
              if (parsed.code === 200) {
                if (!row.title && parsed.title) row.title = parsed.title;
                if (!row.cover_url && parsed.cover_url) row.cover_url = parsed.cover_url;
                if (!row.platform && parsed.platform) row.platform = parsed.platform;
                if (!row.summary && parsed.summary) row.summary = parsed.summary;
              }
            } catch (parseErr) {
              // 解析失败不影响保存，只打日志
              console.error('[auto_parse] 解析失败:', parseErr.message);
            }
          }
        }
      }

      // reading_items: is_offline=true 时先置 false，返回后后台异步下载再更新
      const wantOffline = table === 'reading_items' && (row.is_offline === true || row.is_offline === 1 || row.is_offline === 'true');
      if (table === 'reading_items' && wantOffline) {
        row.is_offline = false;
        row.offline_path = null;
      }
      const { sql, params } = buildInsertSql(table, [row]);
      const [result] = await pool.query(sql, params);
      const insertId = result.insertId || row.id;
      res.status(201).json({ data: { ...row, id: insertId, is_offline: wantOffline }, error: null });
      // reading_items: 后台异步触发离线下载
      if (table === 'reading_items' && wantOffline) {
        const pd = body.parsed_data || body.parsedData;
        triggerOfflineDownloadAsync(req.user.id, insertId, row.url, pd && typeof pd === 'object' ? pd : null);
      }
      // reading_items: 后台异步自动解析
      if (table === 'reading_items' && needAsyncParse) {
        triggerAutoParseAsync(req.user.id, insertId, row.url);
      }
    } catch (err) {
      res.json({ data: null, error: { message: err.message } });
    }
  });
}

// v1 PATCH /reading/:id - 更新阅读项（供 Skill/API Key 调用，支持 is_offline 三态）
app.patch('/api/v1/reading/:id', apiKeyAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 必须是数字' } });
  }
  const body = req.body || {};
  const ALLOWED_FIELDS = [
    'url', 'title', 'summary', 'cover_url', 'platform',
    'category', 'is_read', 'is_starred', 'is_offline', 'tags',
  ];
  // is_offline 三态：传 true→下载、传 false→删文件、不传→不处理
  const hasOfflineKey = Object.keys(body).includes('is_offline') || Object.keys(body).includes('isOffline');
  const offlineKey = Object.keys(body).includes('is_offline') ? 'is_offline' : 'isOffline';
  const wantOfflineTrue = hasOfflineKey && (body[offlineKey] === true || body[offlineKey] === 1 || body[offlineKey] === 'true');
  const wantOfflineFalse = hasOfflineKey && (body[offlineKey] === false || body[offlineKey] === 0 || body[offlineKey] === 'false');

  // 查当前行
  const [rows] = await pool.query(
    'SELECT id, url, offline_path, is_offline FROM reading_items WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );
  const current = rows[0];
  if (!current) {
    return res.json({ data: null, error: { message: '记录不存在或无权限' } });
  }

  const patch = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'isOffline') {
      // isOffline 别名 → is_offline
      if (wantOfflineTrue) { patch.is_offline = false; patch.offline_path = null; }
      else if (wantOfflineFalse) { patch.is_offline = false; patch.offline_path = null; }
      continue;
    }
    if (k === 'is_offline') {
      if (wantOfflineTrue) { patch.is_offline = false; patch.offline_path = null; }
      else if (wantOfflineFalse) { patch.is_offline = false; patch.offline_path = null; }
      continue;
    }
    if (ALLOWED_FIELDS.includes(k)) patch[k] = v;
  }

  try {
    if (Object.keys(patch).length > 0) {
      const { sql, params } = buildUpdateSql('reading_items', req.user.id, id, patch);
      if (sql) await pool.query(sql, params);
    }
    res.json({
      data: { success: true, id, is_offline: wantOfflineTrue ? true : (wantOfflineFalse ? false : !!current.is_offline) },
      error: null,
    });
    // 后台异步处理离线
    if (wantOfflineTrue) {
      triggerOfflineDownloadAsync(req.user.id, id, body.url || current.url);
    } else if (wantOfflineFalse && current.offline_path) {
      const del = deleteOfflineFiles(current.offline_path);
      if (!del.ok) {
        console.error(`[offline] 删除失败: reading_id=${id}, err=${del.message}`);
      } else {
        console.log(`[offline] 已删除离线文件: reading_id=${id}, path=${current.offline_path}`);
      }
    }
  } catch (err) {
    console.error('v1 reading PATCH error:', err);
    res.json({ data: null, error: { message: err.message } });
  }
});

// 获取任务分组
app.get('/api/v1/task-groups', apiKeyAuth, async (req, res) => {
  const { sql, params } = buildSelectSql('task_groups', req.user.id, [], { order: 'sort_order:asc' });
  const [rows] = await pool.query(sql, params);
  res.json({ data: rows.map(r => transformRow('task_groups', r)), error: null });
});

// 获取当前用户信息（验证 API Key 用）
app.get('/api/v1/me', apiKeyAuth, async (req, res) => {
  res.json({ data: req.user, error: null });
});

// ══════════════════════════════════════════════════════════════
// SKILL API：加密备忘追加（油猴脚本 / 外部工具调用）
// 客户端 AES-256-CBC 加密 → 服务端解密 → 追加到指定标题的备忘
// ══════════════════════════════════════════════════════════════

const MEMO_ENCRYPTION_KEY = process.env.MEMO_ENCRYPTION_KEY || 'ai-buddy-memo-secret-2026';

// AES-256-CBC 解密
// 密文格式：base64(IV[16字节] + ciphertext)
function decryptMemo(encryptedBase64) {
  const raw = Buffer.from(encryptedBase64, 'base64');
  const iv = raw.subarray(0, 16);
  const ciphertext = raw.subarray(16);
  const key = crypto.createHash('sha256').update(MEMO_ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

app.post('/api/v1/memos/append-encrypted', apiKeyAuth, async (req, res) => {
  const { encrypted, target_title } = req.body || {};
  if (!encrypted) {
    return res.json({ data: null, error: { message: '缺少 encrypted 字段' } });
  }

  let plaintext;
  try {
    plaintext = decryptMemo(encrypted);
  } catch (err) {
    return res.json({ data: null, error: { message: '解密失败：' + err.message } });
  }

  if (!plaintext.trim()) {
    return res.json({ data: null, error: { message: '解密后内容为空' } });
  }

  const memoTitle = (target_title || '未准入加盟商').trim();

  try {
    // 查找同名备忘（未删除）
    const [rows] = await pool.query(
      'SELECT * FROM memos WHERE user_id = ? AND title = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1',
      [req.user.id, memoTitle]
    );

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const appendBlock = `\n\n--- ${ts} ---\n${plaintext.trim()}\n`;

    if (rows.length > 0) {
      // 追加到现有备忘
      const memo = rows[0];
      const newContent = (memo.content || '') + appendBlock;
      await pool.query(
        'UPDATE memos SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [newContent, memo.id, req.user.id]
      );
      res.json({
        data: { id: memo.id, title: memoTitle, action: 'appended', length: newContent.length },
        error: null,
      });
    } else {
      // 创建新备忘
      const [result] = await pool.query(
        'INSERT INTO memos (user_id, title, content, memo_type) VALUES (?, ?, ?, ?)',
        [req.user.id, memoTitle, appendBlock.trimStart(), 'note']
      );
      res.json({
        data: { id: result.insertId, title: memoTitle, action: 'created', length: appendBlock.length },
        error: null,
      });
    }
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// ══════════════════════════════════════════════════════════════
// SKILL API：社媒内容解析（供 buddy-skill / 外部工具调用）
// ══════════════════════════════════════════════════════════════

app.post('/api/v1/extract', apiKeyAuth, async (req, res) => {
  const input = (req.body?.input || req.body?.text || '').toString();
  if (!input) {
    return res.json({ data: null, error: { message: '缺少 input 字段' } });
  }
  try {
    const result = await parseShare(input);
    if (result.code !== 200) {
      return res.json({ data: result, error: { message: result.message || '解析失败' } });
    }
    return res.json({ data: result, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

app.post('/api/v1/extract/download', apiKeyAuth, async (req, res) => {
  const input = (req.body?.input || req.body?.text || '').toString();
  if (!input) {
    return res.json({ data: null, error: { message: '缺少 input 字段' } });
  }
  try {
    const result = await parseAndDownload(input);
    return res.json({ data: result, error: result.code === 200 ? null : { message: result.message } });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 工具函数：SKILL API 用的 SQL 构建 ─────────────────────

function parseApiFilters(query, table) {
  const filters = [];
  for (const key of Object.keys(query)) {
    if (key.startsWith('filter_')) {
      const col = key.slice(7);
      if (!validateColumn(table, col)) continue;
      const value = query[key];
      // 数组形式（多个值）= in 查询
      if (Array.isArray(value)) {
        filters.push({ type: 'in', column: col, value });
      } else {
        filters.push({ type: 'eq', column: col, value });
      }
    } else if (key === 'q' && typeof query[key] === 'string') {
      // 简单模糊查询（title 包含关键字）
      filters.push({ type: 'like', column: 'title', value: `%${query[key]}%` });
    } else if (key === 'status' || key === 'priority' || key === 'is_project' || key === 'is_read' || key === 'is_starred') {
      // 常用字段直接作为过滤
      const value = query[key];
      if (Array.isArray(value)) {
        filters.push({ type: 'in', column: key, value });
      } else {
        filters.push({ type: 'eq', column: key, value: value === 'true' ? true : value === 'false' ? false : value });
      }
    }
  }
  return filters;
}

function buildSelectSql(table, userId, filters, { order, limit } = {}) {
  const conditions = ['`user_id` = ?'];
  const params = [userId];

  for (const f of filters) {
    if (!validateColumn(table, f.column)) continue;
    if (f.column === 'user_id') continue;
    const col = escapeId(f.column);
    if (f.type === 'eq') {
      conditions.push(`${col} = ?`);
      params.push(prepareValue(table, f.column, f.value));
    } else if (f.type === 'in' && Array.isArray(f.value) && f.value.length) {
      const placeholders = f.value.map(() => '?').join(', ');
      conditions.push(`${col} IN (${placeholders})`);
      params.push(...f.value);
    } else if (f.type === 'like') {
      conditions.push(`${col} LIKE ?`);
      params.push(f.value);
    }
  }

  let orderClause = '';
  if (order) {
    const orderClauses = parseOrder([order], table);
    if (orderClauses.length > 0) orderClause = `ORDER BY ${orderClauses.join(', ')}`;
  }
  const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

  const sql = `SELECT * FROM ${escapeId(table)} WHERE ${conditions.join(' AND ')} ${orderClause} ${limitClause}`;
  return { sql, params };
}

function buildInsertSql(table, rows) {
  const validCols = TABLE_COLUMNS[table];
  const allKeys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (validCols.includes(key)) allKeys.add(key);
    }
  }
  const columns = [...allKeys];
  const valueRows = rows.map(row => columns.map(col => prepareValue(table, col, row[col])));
  const placeholders = valueRows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const sql = `INSERT INTO ${escapeId(table)} (${columns.map(c => escapeId(c)).join(', ')}) VALUES ${placeholders}`;
  return { sql, params: valueRows.flat() };
}

function buildUpdateSql(table, userId, id, patch) {
  const validCols = TABLE_COLUMNS[table];
  const setColumns = [];
  const setParams = [];
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'user_id' || key === 'id') continue;
    if (validCols.includes(key)) {
      setColumns.push(`${escapeId(key)} = ?`);
      setParams.push(prepareValue(table, key, value));
    }
  }
  if (['tasks', 'task_groups', 'memos', 'task_notes', 'health_profiles', 'health_medications', 'vault_items'].includes(table) && !patch.updated_at) {
    setColumns.push('`updated_at` = CURRENT_TIMESTAMP');
  }
  if (setColumns.length === 0) return { sql: null, params: [] };
  const sql = `UPDATE ${escapeId(table)} SET ${setColumns.join(', ')} WHERE id = ? AND user_id = ?`;
  return { sql, params: [...setParams, id, userId] };
}

function describePlanOp(op) {
  if (op.action === 'update') {
    const changes = Object.entries(op.changes || {}).map(([k, v]) => `${k}=${v}`).join(', ');
    return `更新任务 ${op.id}: ${changes}`;
  }
  if (op.action === 'delete') {
    return `删除任务 ${op.id}`;
  }
  if (op.action === 'create') {
    return `创建任务: ${op.data?.title || '(无标题)'}`;
  }
  return JSON.stringify(op);
}

// ── 启动服务器 ──────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`AI-Buddy API server running on http://127.0.0.1:${PORT}`);
  // 启动 RSS 定时抓取（每 30 分钟）
  startRssScheduler(30 * 60 * 1000);
});

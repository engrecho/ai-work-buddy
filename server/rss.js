/**
 * RSS / Atom 订阅源抓取与解析
 *
 * 设计要点：
 * - 不依赖第三方包（避免 DOMParser），用最小化 XML tag 解析
 * - 支持 RSS 2.0（item/title/link/pubDate/description/content:encoded/category）+ Atom（entry/title/link[@href]/published/summary/category[@term]）
 * - 支持 gzip/charset 处理（fetch 自动解 gzip，只需处理 charset）
 * - 文章唯一标识：优先 guid，否则 link，否则标题 hash
 */

import { pool } from './db.js';

// ── XML 解析工具 ──────────────────────────────────────────────
// 极简 tag 抓取：仅匹配首个出现的 <tag>...</tag>（不嵌套同名 tag 时安全）
function pickTag(xml, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[2] : null;
}

function pickAllTags(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: m[1] || '', inner: m[2] || '' });
  }
  return out;
}

function pickAttr(attrs, name) {
  if (!attrs) return null;
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}

// 去除 XML/HTML 实体并清洗
function decodeEntities(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t) => t)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return ''; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; }
    })
    .trim();
}

function stripHtml(html) {
  if (!html) return '';
  // 1. 先提取 CDATA 并解码实体（让 &lt;a&gt; 变成 <a>，方便后续剥离）
  let s = decodeEntities(String(html));
  // 2. 剥离 script / style / br / p / 所有标签
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function extractCoverFromHtml(html) {
  if (!html) return null;
  // 先提取 CDATA 并解码实体，再搜索 img 标签
  const decoded = decodeEntities(String(html));
  const m = decoded.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// ── 时间解析 ──────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  // RFC822: Wed, 02 Jul 2025 08:00:00 +0800
  // ISO8601: 2025-07-02T08:00:00Z 或 2025-07-02T08:00:00+08:00
  const t = new Date(str);
  if (!isNaN(t.getTime())) return t;
  return null;
}

// ── 主解析入口 ────────────────────────────────────────────
/**
 * 解析 RSS/Atom XML 文本，返回归一化结构
 * @returns {{ title, link, description, items: Array }}
 */
export function parseFeedXml(xml) {
  if (!xml || typeof xml !== 'string') {
    throw new Error('空内容');
  }

  // 检测类型
  const isAtom = /<feed[\s>]/i.test(xml) || /<atom:feed[\s>]/i.test(xml);
  const isRss = /<rss[\s>]/i.test(xml) || /<rdf:RDF[\s>]/i.test(xml);

  if (!isAtom && !isRss) {
    // 容错：有 <item> 也认为是 RSS
    if (!/<item[\s>]/i.test(xml) && !/<entry[\s>]/i.test(xml)) {
      throw new Error('未识别的订阅源格式（不是 RSS/Atom）');
    }
  }

  let feedTitle = '';
  let feedLink = '';
  let feedDesc = '';
  const items = [];

  if (isAtom || /<entry[\s>]/i.test(xml)) {
    // ── Atom ──
    const feedTitleEl = pickTag(xml, 'title');
    if (feedTitleEl) feedTitle = stripHtml(feedTitleEl);

    // feed 的 link：优先 alternate 关系
    const feedLinks = pickAllTags(xml, 'link');
    for (const l of feedLinks) {
      const rel = pickAttr(l.attrs, 'rel');
      const href = pickAttr(l.attrs, 'href');
      if (href && (!rel || rel === 'alternate')) {
        feedLink = href;
        break;
      }
    }

    const feedSubEl = pickTag(xml, 'subtitle');
    if (feedSubEl) feedDesc = stripHtml(feedSubEl);

    const entries = pickAllTags(xml, 'entry');
    for (const e of entries) {
      const inner = e.inner;
      const itTitle = stripHtml(pickTag(inner, 'title') || '');
      // entry link：优先 alternate 或无 rel
      let itLink = '';
      const links = pickAllTags(inner, 'link');
      for (const l of links) {
        const rel = pickAttr(l.attrs, 'rel');
        const href = pickAttr(l.attrs, 'href');
        if (href && (!rel || rel === 'alternate')) {
          itLink = href;
          break;
        }
      }
      // fallback：自闭合 link 无 href 时取文本
      if (!itLink) {
        const txtLink = pickTag(inner, 'link');
        if (txtLink) itLink = decodeEntities(txtLink).trim();
      }
      const guid = decodeEntities(pickTag(inner, 'id') || itLink || itTitle || '').trim();
      const pubRaw = pickTag(inner, 'published') || pickTag(inner, 'updated');
      const pubDate = parseDate(pubRaw);
      const summaryRaw = pickTag(inner, 'summary') || pickTag(inner, 'content') || '';
      const contentRaw = pickTag(inner, 'content') || pickTag(inner, 'summary') || '';
      const authorEl = pickTag(inner, 'name') || pickTag(inner, 'author');
      const cats = pickAllTags(inner, 'category')
        .map(c => pickAttr(c.attrs, 'term'))
        .filter(Boolean);

      items.push({
        guid,
        title: itTitle.slice(0, 500),
        link: itLink,
        published_at: pubDate,
        summary: stripHtml(summaryRaw).slice(0, 1000),
        content: contentRaw,
        cover_url: extractCoverFromHtml(contentRaw || summaryRaw),
        author: authorEl ? stripHtml(authorEl).slice(0, 255) : '',
        categories: cats.slice(0, 10),
      });
    }
  } else {
    // ── RSS 2.0 / RDF ──
    const chanTitle = pickTag(xml, 'title');
    if (chanTitle) feedTitle = stripHtml(chanTitle);

    const chanLink = pickTag(xml, 'link');
    if (chanLink) feedLink = decodeEntities(chanLink).trim();

    const chanDesc = pickTag(xml, 'description');
    if (chanDesc) feedDesc = stripHtml(chanDesc);

    const itemEls = pickAllTags(xml, 'item');
    for (const it of itemEls) {
      const inner = it.inner;
      const itTitle = stripHtml(pickTag(inner, 'title') || '');
      // link / guid 可能被 CDATA 包裹，用 decodeEntities 解开
      const itLink = decodeEntities(pickTag(inner, 'link') || '').trim();
      const guid = decodeEntities(pickTag(inner, 'guid') || itLink || itTitle || '').trim();
      const pubRaw = pickTag(inner, 'pubDate') || pickTag(inner, 'published') || pickTag(inner, 'dc:date');
      const pubDate = parseDate(pubRaw);
      const descRaw = pickTag(inner, 'description') || '';
      const contentRaw = pickTag(inner, 'content:encoded') || pickTag(inner, 'description') || '';
      const authorEl = pickTag(inner, 'author') || pickTag(inner, 'dc:creator');
      const cats = pickAllTags(inner, 'category')
        .map(c => stripHtml(c.inner || ''))
        .filter(Boolean);

      items.push({
        guid,
        title: itTitle.slice(0, 500),
        link: itLink,
        published_at: pubDate,
        summary: stripHtml(descRaw).slice(0, 1000),
        content: contentRaw,
        cover_url: extractCoverFromHtml(contentRaw || descRaw),
        author: authorEl ? decodeEntities(authorEl).slice(0, 255) : '',
        categories: cats.slice(0, 10),
      });
    }
  }

  return {
    title: feedTitle,
    link: feedLink,
    description: feedDesc,
    items,
  };
}

// ── 抓取 RSS 源 ──────────────────────────────────────────
/**
 * 抓取指定 URL 的 RSS 内容
 * @param {string} url
 * @returns {Promise<{ title, link, description, items: Array }>}
 */
export async function fetchFeed(url) {
  if (!url) throw new Error('缺少 url');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // 用一个常见的 RSS 阅读器 UA，避免被部分网站拦截
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Buddy RSS Reader; +https://github.com/engrecho/AI-buddy)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    // 检测是否被重定向到了非 RSS 路径（常见于 RSS URL 失效被网站 302 到首页/落地页）
    const finalUrl = res.url || url;
    const finalCt = (res.headers.get('content-type') || '').toLowerCase();

    const buf = await res.arrayBuffer();
    // 简单 charset 探测：优先 HTTP header，其次 XML 声明
    let charset = 'utf-8';
    const ctMatch = finalCt.match(/charset=([^;]+)/);
    if (ctMatch) charset = ctMatch[1].trim();
    // TextDecoder 对某些 charset（如 gbk）可能不支持，做 fallback
    let text;
    try {
      text = new TextDecoder(charset, { fatal: false }).decode(buf);
    } catch (_) {
      // 不支持的 charset，回退 utf-8
      text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    }
    // 检查 XML 声明里的 encoding（如果与 header 不同，以 XML 声明为准）
    const xmlDecl = text.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
    if (xmlDecl && xmlDecl[1].toLowerCase() !== charset.toLowerCase()) {
      try {
        text = new TextDecoder(xmlDecl[1], { fatal: false }).decode(buf);
      } catch (_) { /* 用之前 utf-8 解码的 */ }
    }

    // ── 检测是否返回了 HTML 而非 RSS/Atom ──
    // 去掉 BOM 和前导空白后看开头
    const head = text.replace(/^\uFEFF?/, '').trimStart().slice(0, 500).toLowerCase();
    const looksLikeXml = head.startsWith('<?xml') || head.startsWith('<rss') || head.startsWith('<feed') || head.startsWith('<rdf:rdf');
    const looksLikeHtml = head.startsWith('<!doctype html') || head.startsWith('<html') || (finalCt.includes('text/html') && !looksLikeXml);

    if (looksLikeHtml) {
      // 给出有意义的错误，前端能展示给用户
      const redirHint = res.redirected ? `（被重定向到 ${finalUrl}）` : '';
      throw new Error(`此 URL 返回的是 HTML 页面而非 RSS/Atom 订阅内容${redirHint}，请检查 URL 是否正确或已失效`);
    }

    // 如果既不像 XML 也不像 HTML，尝试解析看看
    return parseFeedXml(text);
  } finally {
    clearTimeout(timer);
  }
}

// ── 拉取并落库单个源 ────────────────────────────────────────
/**
 * 抓取 RSS 源并写入文章（去重）
 * @param {object} source rss_sources 一行 { id, user_id, name, url }
 * @returns {Promise<{ ok: boolean, added: number, total: number, message?: string }>}
 */
export async function refreshSource(source) {
  if (!source || !source.id || !source.user_id || !source.url) {
    return { ok: false, added: 0, total: 0, message: '源信息不完整' };
  }
  const t0 = Date.now();
  try {
    console.log(`[rss] 抓取开始: source_id=${source.id}, url=${source.url.slice(0, 80)}`);
    const feed = await fetchFeed(source.url);
    let added = 0;
    const items = feed.items || [];
    if (items.length === 0) {
      await pool.query(
        `UPDATE rss_sources SET last_fetched_at = NOW(), last_status = 'success', last_error = NULL, article_count = (SELECT COUNT(*) FROM rss_articles WHERE source_id = ?) WHERE id = ?`,
        [source.id, source.id]
      );
      return { ok: true, added: 0, total: 0 };
    }

    // 取出此源已有 guid，避免逐条查询
    const [existing] = await pool.query(
      'SELECT guid FROM rss_articles WHERE source_id = ?',
      [source.id]
    );
    const existSet = new Set(existing.map(r => r.guid));

    // 批量插入新文章
    const newItems = items.filter(it => it.guid && !existSet.has(it.guid));
    if (newItems.length > 0) {
      const values = newItems.map(it => [
        source.user_id,
        source.id,
        it.guid.slice(0, 760),
        (it.link || '').slice(0, 65535),
        (it.title || '(无标题)').slice(0, 500),
        (it.summary || '').slice(0, 65535),
        (it.content || '').slice(0, 16777215),
        (it.cover_url || null),
        (it.author || null),
        JSON.stringify(it.categories || []),
        it.published_at ? new Date(it.published_at) : null,
      ]);
      // 分批 insert（每批 100 条，避免单条 SQL 过长）
      const BATCH = 100;
      for (let i = 0; i < values.length; i += BATCH) {
        const slice = values.slice(i, i + BATCH);
        // 注意：11 个字段对应 11 个 ?（之前误写 12 个导致 SQL 报错）
        const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const params = slice.flat();
        await pool.query(
          `INSERT IGNORE INTO rss_articles
            (user_id, source_id, guid, url, title, summary, content, cover_url, author, categories, published_at)
           VALUES ${placeholders}`,
          params
        );
      }
      added = newItems.length;
    }

    // 更新源状态
    await pool.query(
      `UPDATE rss_sources
       SET last_fetched_at = NOW(),
           last_status = 'success',
           last_error = NULL,
           article_count = (SELECT COUNT(*) FROM rss_articles WHERE source_id = ?),
           name = COALESCE(NULLIF(?, ''), name),
           site_url = COALESCE(NULLIF(?, ''), site_url),
           description = COALESCE(NULLIF(?, ''), description)
       WHERE id = ?`,
      [source.id, feed.title || '', feed.link || '', feed.description || '', source.id]
    );

    const ms = Date.now() - t0;
    console.log(`[rss] 抓取成功: source_id=${source.id}, added=${added}/${items.length}, ${ms}ms`);
    return { ok: true, added, total: items.length };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error(`[rss] 抓取失败: source_id=${source.id}, err=${msg}`);
    try {
      await pool.query(
        `UPDATE rss_sources SET last_fetched_at = NOW(), last_status = 'error', last_error = ? WHERE id = ?`,
        [msg.slice(0, 1000), source.id]
      );
    } catch (_) {}
    return { ok: false, added: 0, total: 0, message: msg };
  }
}

// ── 拉取全部源（定时调用） ────────────────────────────────────
export async function refreshAllSources() {
  try {
    const [sources] = await pool.query(
      `SELECT id, user_id, name, url FROM rss_sources ORDER BY last_fetched_at ASC`
    );
    if (sources.length === 0) return;
    console.log(`[rss] 定时任务开始，共 ${sources.length} 个源`);
    let okCount = 0;
    let failCount = 0;
    // 串行，避免被对方限流
    for (const s of sources) {
      const r = await refreshSource(s);
      if (r.ok) okCount++;
      else failCount++;
      // 间隔 2s，减轻对方服务器压力
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`[rss] 定时任务完成：成功 ${okCount}，失败 ${failCount}`);
  } catch (err) {
    console.error('[rss] 定时任务异常:', err);
  }
}

// ── 启动定时器（30 分钟） ───────────────────────────────────
let _timer = null;
export function startRssScheduler(intervalMs = 30 * 60 * 1000) {
  if (_timer) return;
  // 启动后 10s 跑一次（让服务先起来）
  setTimeout(() => {
    refreshAllSources().catch(() => {});
  }, 10 * 1000);
  _timer = setInterval(() => {
    refreshAllSources().catch(() => {});
  }, intervalMs);
  console.log(`[rss] 定时器已启动，间隔 ${Math.round(intervalMs / 60000)} 分钟`);
}

// 社媒内容解析与下载服务
// 封装 ~/.workbuddy/skills/greenvideo-extract/scripts/ 下的两个脚本：
//   - greenvideo_extract.cjs --json    解析分享文本/URL，返回 {title, host, vid, items, ...}
//   - download_videos.cjs              解析 + 下载所有资源到本地目录
//
// 注意：所有 spawn 都加 60s 超时；解析失败要原样返回错误，不要吞。

import { execFile, spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

// 技能目录：优先用环境变量；找不到则用默认 ~/.workbuddy/skills/greenvideo-extract
const SKILL_DIR =
  process.env.GV_SKILL_DIR ||
  path.join(os.homedir(), '.workbuddy', 'skills', 'greenvideo-extract');

// Node 运行时：优先受管版本
const NODE_BIN =
  process.env.GV_NODE ||
  '/Users/jaylon/.workbuddy/binaries/node/versions/22.22.2/bin/node';

// 输出根目录：默认 ./gv_downloads，相对当前进程工作目录
const OUTPUT_ROOT = process.env.GV_OUTPUT || path.join(process.cwd(), 'gv_downloads');

const EXTRACT_SCRIPT = path.join(SKILL_DIR, 'scripts', 'greenvideo_extract.cjs');
const DOWNLOAD_SCRIPT = path.join(SKILL_DIR, 'scripts', 'download_videos.cjs');

const SPAWN_TIMEOUT_MS = 90 * 1000; // 90s

function log(...args) {
  if (process.env.DEBUG) console.log('[extract]', ...args);
}

function execWithTimeout(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = execFile(bin, args, { ...opts, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (settled) return;
      settled = true;
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`执行超时 (${SPAWN_TIMEOUT_MS}ms): ${bin} ${args.join(' ')}`));
    }, SPAWN_TIMEOUT_MS);
    child.on('exit', () => clearTimeout(timer));
  });
}

/**
 * 把 greenvideo 解析出来的 host 字符串映射成 AI-buddy 的 platform 标识。
 * platform 取值约定：
 *   douyin / kuaishou / bilibili / xiaohongshu / wechat /
 *   youtube / tiktok / weibo / xigua / zhihu / other
 */
export function normalizePlatform(host) {
  if (!host) return 'other';
  const h = String(host).toLowerCase();
  if (h.includes('douyin')) return 'douyin';
  if (h.includes('kuaishou') || h.includes('ksapp')) return 'kuaishou';
  if (h.includes('bilibili') || h === 'b23.tv' || h === 'bili2233.cn') return 'bilibili';
  if (h.includes('xiaohongshu') || h.includes('xhscdn') || h.includes('xhs')) return 'xiaohongshu';
  if (h.includes('weixin') || h.includes('mp.weixin') || h.includes('wechat')) return 'wechat';
  if (h.includes('youtube') || h.includes('youtu.be') || h.includes('yt')) return 'youtube';
  if (h.includes('tiktok')) return 'tiktok';
  if (h.includes('weibo')) return 'weibo';
  if (h.includes('ixigua')) return 'xigua';
  if (h.includes('zhihu')) return 'zhihu';
  if (h.includes('twitter') || h === 'x.com' || h === 't.co') return 'twitter';
  if (h.includes('facebook') || h === 'fb.com' || h.includes('fb.watch')) return 'facebook';
  if (h.includes('instagram')) return 'instagram';
  return 'other';
}

/**
 * 从分享文本或 URL 中识别一段 url。
 * - 优先用正则匹配 http(s)://
 * - 如果整段就是 URL，也返回它
 */
export function extractUrl(text) {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/[^\s\u4e00-\u9fa5]+/);
  if (m) {
    // 去除尾部标点
    return m[0].replace(/[，。！？、；:,!?;)\]\}]+$/g, '');
  }
  // 兜底：整段就是一个 URL（无 http 前缀）
  const t = text.trim();
  if (/^[\w.-]+\.[a-z]{2,}/i.test(t)) return 'https://' + t;
  return null;
}

/**
 * 解析一段分享文本/URL，返回结构化的元信息。
 * @param {string} input  抖音分享文本 / 视频 URL / 文章 URL
 * @returns {Promise<{
 *   code: number,
 *   message: string,
 *   url: string,
 *   platform: string,
 *   title: string,
 *   vid: string,
 *   cover_url: string|null,
 *   items: Array<{quality, fileType, size, baseUrl, canDirectDownload}>,
 *   has_video: boolean,
 *   has_markdown: boolean,
 *   host: string,
 * }>}
 */
export async function parseShare(input) {
  if (!input || !String(input).trim()) {
    return { code: 400, message: 'input 不能为空' };
  }

  const url = extractUrl(input);
  log('parseShare input:', input.slice(0, 60), 'url:', url);

  if (!fs.existsSync(EXTRACT_SCRIPT)) {
    return {
      code: 500,
      message: `未找到 extract 脚本：${EXTRACT_SCRIPT}。请确认已安装 greenvideo-extract skill。`,
    };
  }

  let stdout;
  try {
    const r = await execWithTimeout(NODE_BIN, [EXTRACT_SCRIPT, '--json', input]);
    stdout = r.stdout;
  } catch (e) {
    return {
      code: 500,
      message: `调用 extract 失败：${e.message}`,
      stderr: e.stderr || '',
    };
  }

  // 提取 marker 之间的 JSON
  const beginIdx = stdout.indexOf('__GV_JSON_BEGIN__');
  const endIdx = stdout.indexOf('__GV_JSON_END__');
  if (beginIdx < 0 || endIdx < 0) {
    return { code: 500, message: 'extract 脚本输出未找到 JSON marker', raw: stdout };
  }
  const jsonStr = stdout.slice(beginIdx + '__GV_JSON_BEGIN__'.length, endIdx).trim();
  let j;
  try {
    j = JSON.parse(jsonStr);
  } catch (e) {
    return { code: 500, message: `extract 响应 JSON 解析失败：${e.message}` };
  }

  const code = Number(j.code);
  if (code !== 200 || !j.data) {
    return {
      code,
      message: j.message || '解析失败',
      platform: normalizePlatform(j.data?.host),
    };
  }

  const data = j.data;
  const items = (data.videoItemVoList || []).map((v) => ({
    quality: v.qualityAlias || String(v.quality || ''),
    fileType: v.fileType,
    size: v.size,
    canDirectDownload: v.canDirectDownload,
    baseUrl: v.baseUrl,
  }));

  // 找封面：qualityAlias 含「封面」/fileType 为 image 且 quality 含 cover 的项
  let cover = null;
  for (const v of data.videoItemVoList || []) {
    const qa = (v.qualityAlias || '').toLowerCase();
    if (qa.includes('封面') || qa.includes('cover')) {
      cover = v.baseUrl;
      break;
    }
  }
  if (!cover) {
    for (const v of data.videoItemVoList || []) {
      if (v.fileType === 'image') {
        cover = v.baseUrl;
        break;
      }
    }
  }

  // 找 markdown 文本（公众号/小红书图文）：fileType=video 且 qualityAlias 含「markdown」，
  // 但要排除一些"标题文本"被误识别成 markdown 的情况：纯短文本 + 没有真 markdown 标记
  let mdText = null;
  for (const v of data.videoItemVoList || []) {
    const qa = (v.qualityAlias || '').toLowerCase();
    if (v.fileType === 'video' && qa.includes('markdown')) {
      const t = String(v.baseUrl || '');
      // 真 markdown 至少含一个 # 标题 / ![]() 图片 / [](http 链接
      const isRealMd = /(^|\n)#{1,6}\s|m!\[|]\(http/.test(t);
      if (isRealMd) {
        mdText = t;
        break;
      }
    }
  }

  const platform = normalizePlatform(data.host);
  const hasVideo = items.some((i) => i.fileType === 'video' && !/markdown/i.test(i.quality || ''));
  const hasMarkdown = Boolean(mdText);

  return {
    code: 200,
    message: j.message || 'ok',
    url: url || '',
    platform,
    title: data.displayTitle || data.title || '',
    vid: data.vid || '',
    cover_url: cover,
    host: data.host || '',
    items,
    has_video: hasVideo,
    has_markdown: hasMarkdown,
    // 公众号/小红书图文把 markdown 文本作为 summary 来源
    summary: hasMarkdown ? mdText.slice(0, 1000) : '',
  };
}

/**
 * 解析并下载到 server 端本地目录。
 * 完成后返回离线路径（gv_downloads/<平台>-<vid>-<标题>/）。
 */
export async function parseAndDownload(input) {
  if (!input || !String(input).trim()) {
    return { code: 400, message: 'input 不能为空' };
  }

  if (!fs.existsSync(DOWNLOAD_SCRIPT)) {
    return {
      code: 500,
      message: `未找到 download 脚本：${DOWNLOAD_SCRIPT}。`,
    };
  }

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(NODE_BIN, [DOWNLOAD_SCRIPT, input], {
      env: { ...process.env, GV_OUTPUT: OUTPUT_ROOT, GV_NODE: NODE_BIN },
    });
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({
        code: 504,
        message: '下载超时（90s）',
        stdout,
        stderr,
      });
    }, SPAWN_TIMEOUT_MS);

    child.on('close', (code_) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // 从输出里抓 [OK]   <host>/<vid>  -> <dir> 行
      const m = stdout.match(/\[OK\]\s+(\S+)\/(\S+)\s+->\s+(\S+)/);
      if (m) {
        resolve({
          code: 200,
          message: '下载完成',
          host: m[1],
          vid: m[2],
          offline_path: m[3],
          stdout,
        });
        return;
      }
      // 失败的情况
      resolve({
        code: 500,
        message: `下载失败 (exit ${code_})`,
        stdout,
        stderr,
      });
    });
  });
}

// 社媒内容解析与下载服务
// 解析/下载脚本由 buddy-skill 自包含(项目内置,不再依赖外部 ExtractVideoSkill):
//   - buddy-skill/scripts/video_extract.cjs --json   解析分享文本/URL
//   - buddy-skill/scripts/download_videos.cjs        解析 + 下载所有资源到本地目录
//
// 注意：所有 spawn 都加 90s 超时；解析失败要原样返回错误，不要吞。
//
// 默认保存地址优先级：
//   1) 环境变量 GV_OUTPUT
//   2) 项目内 data/offline/

import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 脚本目录:buddy-skill 自包含(相对于 server/ 上一级的 buddy-skill/scripts/)
const BUDDY_SKILL_DIR = path.resolve(__dirname, '..', 'buddy-skill');
const BUDDY_SKILL_SCRIPTS = path.join(BUDDY_SKILL_DIR, 'scripts');

// Node 运行时：默认用当前进程自己的 Node（process.execPath），保证跨平台一致
// 用户可通过环境变量 GV_NODE 强制覆盖
const NODE_BIN = process.env.GV_NODE || process.execPath;

// 输出根目录(默认):<项目根>/data/offline
const DEFAULT_OUTPUT_ROOT = path.resolve(__dirname, '..', 'data', 'offline');

const EXTRACT_SCRIPT = path.join(BUDDY_SKILL_SCRIPTS, 'video_extract.cjs');
const DOWNLOAD_SCRIPT = path.join(BUDDY_SKILL_SCRIPTS, 'download_videos.cjs');

const SPAWN_TIMEOUT_MS = 90 * 1000; // 90s

/**
 * 解析最终的输出根目录
 * 下载路径由服务端统一配置,用户不可在客户端修改。
 * 优先级:GV_OUTPUT 环境变量 > 项目内 data/offline 默认目录
 */
export function resolveOutputRoot() {
  if (process.env.GV_OUTPUT) return process.env.GV_OUTPUT;
  return DEFAULT_OUTPUT_ROOT;
}

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
 * 把 ExtractVideoSkill 解析出来的 host 字符串映射成 AI-buddy 的 platform 标识。
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
 * 去掉 HTML 标签 + 解码常见 HTML 实体。
 * 用于清洗 ExtractVideoSkill 抽取出来的「公众号原始 HTML 标题」等脏数据。
 * 例：`<span class="js_title_inner">极空间重磅更新</span>` -> `极空间重磅更新`
 */
export function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]+>/g, ' ')         // 标签替换成空格（处理 <a><b> 紧贴的情况）
    .replace(/&nbsp;/g, ' ')         // 常见实体
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return ''; }
    })
    .replace(/\s+/g, ' ')            // 合并空白
    .trim();
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
      message: `未找到 extract 脚本：${EXTRACT_SCRIPT}。请确认 buddy-skill/scripts/ 下已内置 video_extract.cjs。`,
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

  // 清洗 title：ExtractVideoSkill 直接把公众号原始 HTML 塞回来（带 <span class=...>）
  const rawTitle = data.displayTitle || data.title || '';
  const cleanTitle = stripHtml(rawTitle);

  return {
    code: 200,
    message: j.message || 'ok',
    url: url || '',
    platform,
    title: cleanTitle,
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

  const outputRoot = resolveOutputRoot();
  fs.mkdirSync(outputRoot, { recursive: true });

  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(NODE_BIN, [DOWNLOAD_SCRIPT, input], {
      env: { ...process.env, GV_OUTPUT: outputRoot, GV_NODE: NODE_BIN },
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
        // 落库只存 basename（避免绑定到绝对路径，方便以后换 OUTPUT_ROOT）
        const dirAbs = m[3].replace(/\/+$/, '');
        const dirName = path.basename(dirAbs);
        resolve({
          code: 200,
          message: '下载完成',
          host: m[1],
          vid: m[2],
          offline_path: dirName,
          offline_path_abs: dirAbs,
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

/**
 * 安全解析 offline_path：必须是 OUTPUT_ROOT 的子目录或等于 OUTPUT_ROOT。
 * 接受两种入参：
 *   - 绝对路径（download 脚本输出）：校验必须位于 OUTPUT_ROOT 内
 *   - 子目录 basename（落库形态）：拼回 OUTPUT_ROOT 后再校验
 * 防止路径穿越攻击（../../../etc/passwd）。
 */
export function resolveOfflinePath(offlinePath) {
  if (!offlinePath) return null;
  const root = path.resolve(resolveOutputRoot());
  // 兼容末尾斜杠
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;

  let resolved;
  if (path.isAbsolute(offlinePath)) {
    // 绝对路径：直接 resolve，不拼接
    resolved = path.resolve(offlinePath);
  } else {
    // 相对 / basename：拼到 OUTPUT_ROOT 下
    resolved = path.join(root, offlinePath);
  }

  // 必须以 root + sep 开头，或等于 root
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

/**
 * 列出离线目录下的所有可下载文件。
 * 返回 { ok, dir, files: [{ name, category, size, mtime, ext, download_url, preview_url }] }
 */
export async function listOfflineFiles(offlinePath) {
  const dir = resolveOfflinePath(offlinePath);
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, code: 404, message: '离线目录不存在' };
  }
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    return { ok: false, code: 400, message: 'offline_path 不是目录' };
  }

  const files = fs.readdirSync(dir, { withFileTypes: true });
  const fileInfos = [];
  const baseName = path.basename(dir);
  for (const f of files) {
    if (f.isDirectory()) continue; // 跳过子目录（暂不递归）
    if (f.name.startsWith('._') || f.name === '.DS_Store') continue; // 跳过 macOS 噪音
    const full = path.join(dir, f.name);
    try {
      const s = fs.statSync(full);
      const ext = path.extname(f.name).toLowerCase().slice(1);
      let category = 'other';
      if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) category = 'video';
      else if (['mp3', 'm4a', 'aac', 'ogg', 'wav'].includes(ext)) category = 'audio';
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) category = 'image';
      else if (ext === 'md' || ext === 'markdown') category = 'markdown';
      else if (f.name === 'info.json') category = 'info';

      const encodedDir = encodeURIComponent(baseName);
      const encodedName = encodeURIComponent(f.name);
      fileInfos.push({
        name: f.name,
        category,
        size: s.size,
        mtime: s.mtime.toISOString(),
        ext,
        download_url: `/api/reading-files/${encodedDir}/${encodedName}`,
        preview_url: `/api/reading-files/${encodedDir}/${encodedName}?download=0`,
      });
    } catch (e) {
      // 单个文件 stat 失败不影响整体
      continue;
    }
  }
  // 排序：视频/音频/封面/图片/MD/info 在前
  const order = { video: 0, audio: 1, image: 2, markdown: 3, info: 4, other: 5 };
  fileInfos.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9));
  return { ok: true, dir: baseName, files: fileInfos };
}

/**
 * 重新走 extract+download 流程（用于"重新下载"按钮）
 * @param {string} input 分享文本/URL
 * @returns {Promise<{code, message, host?, vid?, offline_path?, stderr?}>}
 */
export async function redownload(input) {
  return parseAndDownload(input);
}

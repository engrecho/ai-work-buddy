#!/usr/bin/env node
/**
 * 首次使用初始化脚本
 *
 * 触发场景：
 *   1) download_videos.cjs 检测到没有任何配置来源(无 GV_OUTPUT、无 ~/.all-platform-video-extract/config.json)时
 *   2) 用户主动运行 `node scripts/init_config.cjs` 时
 *
 * 行为：
 *   交互式询问默认保存地址和解析服务地址，
 *   写入 ~/.all-platform-video-extract/config.json (chmod 600)。
 *
 * 也可以非交互式使用：
 *   node init_config.cjs --output /path/to/save --host https://xxx.cc/
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const CONFIG_DIR = path.join(os.homedir(), '.all-platform-video-extract');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const SKILL_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(SKILL_DIR, 'downloads');
const DEFAULT_HOST = 'https://greenvideo.cc/';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output' || a === '-o') out.output = argv[++i];
    else if (a === '--host'   || a === '-H') out.host   = argv[++i];
    else if (a === '--help'   || a === '-h') out.help   = true;
  }
  return out;
}

function printHelp() {
  console.log(`用法: node init_config.cjs [选项]

选项:
  -o, --output <dir>   默认保存地址(直接写入,不再询问)
  -H, --host   <url>   解析服务地址(直接写入,不再询问)
  -h, --help           显示本帮助

如果省略所有参数,脚本会交互式询问两项。
`);
}

function ask(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const hint = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${hint}: `, (answer) => {
      const v = (answer || '').trim();
      resolve(v || defaultValue || '');
    });
  });
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // 已存在或其他错误,创建不一定要做——这里只对配置文件目录做 mkdir
  }
}

function writeConfig(config) {
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch (_) {}
}

function loadExisting() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const existing = loadExisting();
  if (existing) {
    console.log(`检测到已有配置: ${CONFIG_FILE}`);
    console.log(JSON.stringify(existing, null, 2));
    console.log('如需修改请直接编辑该文件,或删除后重跑本脚本。');
  }

  let output = args.output;
  let host = args.host;

  if (!output || !host) {
    console.log('\n=== 首次使用配置 ===');
    console.log('接下来会询问两项配置,直接回车使用默认值。\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!output) output = await ask(rl, '默认保存地址(视频/图片/公众号 MD 都会保存到这里)', DEFAULT_OUTPUT);
      if (!host)   host   = await ask(rl, '解析服务地址(默认 https://greenvideo.cc/)', DEFAULT_HOST);
    } finally {
      rl.close();
    }
  }

  // 兜底
  output = output || DEFAULT_OUTPUT;
  host   = host   || DEFAULT_HOST;

  // 输出目录提前建好,首次下载不踩坑
  ensureDir(output);

  const config = {
    output_root: path.resolve(output),
    host: host.replace(/\/+$/, '') + '/',
    created_at: new Date().toISOString(),
  };
  writeConfig(config);

  console.log('\n配置已写入:');
  console.log(`  ${CONFIG_FILE}`);
  console.log(JSON.stringify(config, null, 2));
}

main().catch((e) => {
  console.error('初始化失败:', e.message);
  process.exit(1);
});

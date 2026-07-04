// 配置管理
// API Key 存储在 ~/.buddy-skill/config.json（仅当前用户可读）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const CONFIG_DIR = path.join(os.homedir(), '.buddy-skill');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  api_base: 'http://localhost:3000/api/v1',
  api_key: '',
};

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch (err) {
    throw new Error(`配置文件解析失败: ${err.message}`);
  }
}

export function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getConfigPath() {
  return CONFIG_FILE;
}

// 交互式配置初始化
export async function initConfigInteractive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  console.log('=== buddy-skill 初始化 ===\n');

  const existing = loadConfig();
  if (existing) {
    console.log(`已找到现有配置 (api_base: ${existing.api_base})`);
    const overwrite = await question('是否覆盖？ (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('已取消');
      rl.close();
      return existing;
    }
  }

  const api_base = (await question('API Base URL [https://buddy.bajiaolu.cn/api/v1]: ')).trim()
    || 'https://buddy.bajiaolu.cn/api/v1';

  const api_key = (await question('API Key (buddy_xxx...): ')).trim();

  if (!api_key.startsWith('buddy_')) {
    console.error('API Key 格式错误，必须以 buddy_ 开头');
    rl.close();
    process.exit(1);
  }

  rl.close();

  const config = { api_base, api_key };
  saveConfig(config);
  console.log(`\n配置已保存到: ${CONFIG_FILE}`);
  console.log('请确保文件权限仅当前用户可读（chmod 600）');
  return config;
}

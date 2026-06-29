import { createClient } from '@supabase/supabase-js';

// ============================================================
// 数据库连接配置
// ============================================================
// 环境变量（通过 .env 文件或构建时注入）
const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ENV_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 旧版兼容（如果未设置环境变量，使用原始硬编码值）
const LEGACY_SUPABASE_URL = "https://dbc23lmh865kibbhuu.database.nocode.cn";
const LEGACY_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.UKr75xTBFk4W61wrVVaUphEDFqBUdEROoEL7GfFrjJE";

const SUPABASE_ANON_KEY = ENV_SUPABASE_ANON_KEY || LEGACY_SUPABASE_ANON_KEY;

const isDev = import.meta.env.DEV;

// ── 确定 API 基础 URL ──────────────────────────────────────
// 1. 开发环境：通过 Vite proxy 代理，避免 CORS
// 2. 生产环境 + 设置了 VITE_SUPABASE_URL：使用指定的 URL
// 3. 生产环境 + 未设置 VITE_SUPABASE_URL：使用同源（Nginx 代理 /rest/v1/）
// 4. 兜底：使用旧版远程地址（已停用，仅兼容参考）
let SUPABASE_URL;

if (isDev) {
  // 开发环境：通过 Vite proxy 转发到 PostgREST
  SUPABASE_URL = `${window.location.protocol}//${window.location.host}/supabase-api`;
} else if (ENV_SUPABASE_URL) {
  // 生产环境：显式指定 API 地址
  SUPABASE_URL = ENV_SUPABASE_URL;
} else {
  // 生产环境：同源访问（Nginx 反向代理 /rest/v1/ 到 PostgREST）
  SUPABASE_URL = `${window.location.protocol}//${window.location.host}`;
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

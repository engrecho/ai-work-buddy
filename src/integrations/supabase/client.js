import { createClient } from '@supabase/supabase-js';

const SUPABASE_REMOTE_URL = "https://dbc23lmh865kibbhuu.database.nocode.cn";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.UKr75xTBFk4W61wrVVaUphEDFqBUdEROoEL7GfFrjJE";

// 开发环境通过 Vite proxy 代理，避免 CORS 问题
// 生产环境直接请求远程数据库
const isDev = import.meta.env.DEV;
const SUPABASE_URL = isDev
  ? `${window.location.protocol}//${window.location.host}/supabase-api`
  : SUPABASE_REMOTE_URL;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

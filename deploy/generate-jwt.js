#!/usr/bin/env node
/**
 * 生成 PostgREST 所需的 JWT Secret 和 Anon Key Token
 *
 * 用法: node generate-jwt.js
 *
 * 将输出的值填入 postgrest.conf 和 .env 文件
 */
const crypto = require('crypto');

// 1. 生成随机 JWT Secret（64 字符 hex）
const jwtSecret = crypto.randomBytes(32).toString('hex');

// 2. 构建 JWT Payload（与原 Supabase anon key 格式一致）
const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
    role: 'anon',
    iss: 'postgrest',
    iat: Math.floor(Date.now() / 1000),
    exp: 1904745600, // 2030-06-30
};

// 3. Base64URL 编码
function base64url(obj) {
    return Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

const headerB64 = base64url(header);
const payloadB64 = base64url(payload);
const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const anonKey = `${headerB64}.${payloadB64}.${signature}`;

// 4. 输出结果
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          PostgREST JWT 配置生成完毕                           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【1】JWT Secret（填入 postgrest.conf 的 jwt-secret）');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(jwtSecret);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【2】Anon Key（填入 .env 的 VITE_SUPABASE_ANON_KEY）');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(anonKey);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('请将以上两个值分别复制到对应配置文件中');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

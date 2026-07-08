module.exports = {
  apps: [{
    name: 'ai-buddy-api',
    script: 'server/index.js',
    cwd: '/www/wwwroot/buddy.bajiaolu.cn',
    env: {
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_USER: 'buddy',
      DB_PASSWORD: 'NX62WP4bDJikBNih',
      DB_NAME: 'buddy',
      PORT: '3000',
      // 必填：JWT 签名密钥，部署后请改成你自己的随机字符串
      JWT_SECRET: 'ai-buddy-production-please-change-this-secret',
      // 离线下载统一根目录（所有下载文件存这里，前端/API 均从此读取）
      GV_OUTPUT: '/www/wwwroot/buddy.bajiaolu.cn/data/offline',
      // API Key 可逆加密密钥（支持反查明文；丢失则所有 key 退化为不可反查，请勿轻易变更）
      APIKEY_ENCRYPTION_KEY: 'ai-buddy-apikey-prod-please-change',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
  }],
};

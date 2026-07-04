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
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
  }],
};

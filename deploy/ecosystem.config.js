// PM2 进程配置（云服务器部署用）
// 用法：pm2 start deploy/ecosystem.config.js
//      pm2 save && pm2 startup   # 开机自启
module.exports = {
  apps: [
    {
      name: 'qrcode-shop',
      script: 'server.js',
      cwd: __dirname + '/..',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        PORT: 3000,
        NODE_ENV: 'production'
      }
    }
  ]
};

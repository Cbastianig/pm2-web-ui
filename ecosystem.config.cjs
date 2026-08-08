module.exports = {
  apps: [
    {
      name: 'pm2-process-web-ui',
      script: 'start.pm2.mjs',
      args: '--prod -s ../client dist/server/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
}

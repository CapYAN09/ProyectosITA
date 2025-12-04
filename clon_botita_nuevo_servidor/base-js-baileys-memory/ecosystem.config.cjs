// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'bot-ita',
    script: './src/app.js',  // O './start-simple.js' si creaste ese archivo
    watch: false,
    autorestart: true,
    max_restarts: 20,
    min_uptime: '10s',
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production',
      PORT: 3008
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
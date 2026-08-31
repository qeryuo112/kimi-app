module.exports = {
  apps: [{
    name: 'kimiokc',
    script: 'dist/boot.js',
    cwd: '/opt/kimiokc',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '1500M',
    restart_delay: 3000,
    max_restarts: 5,
    min_uptime: '10s'
  }]
};

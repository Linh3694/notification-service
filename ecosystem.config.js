module.exports = {
  apps: [{
    name: 'notification-service',
    script: 'app.js',
    instances: 1, // 🔧 FIX: Scale to 1 instance to prevent duplicate notifications
    instance_var: 'INSTANCE_ID',
    autorestart: true,
    watch: false,
    max_memory_restart: '1536M', // 💡 INCREASED: 1.5GB (1536MB) for safety margin
    env: {
      NODE_ENV: 'development',
      PORT: 5001
    },
    // Enhanced logging configuration
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    kill_timeout: 5000,
    listen_timeout: 8000,
    shutdown_with_message: true,

    // Additional PM2 optimizations
    node_args: '--max-old-space-size=1024 --optimize-for-size', // Limit memory + optimize
    env_production: {
      NODE_ENV: 'production',
      PORT: 5001,
      // Disable debug logging in production
      DEBUG: false,
      // Enable clustering optimizations
      UV_THREADPOOL_SIZE: 4,
      // Production memory settings
      NODE_OPTIONS: '--max-old-space-size=1024'
    }
  }]
}; 
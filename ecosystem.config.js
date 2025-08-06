module.exports = {
  apps: [
    {
      name: 'notification-service-1',
      script: 'app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5003,
        INSTANCE_ID: '1'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5003,
        INSTANCE_ID: '1'
      },
      error_file: './logs/err-1.log',
      out_file: './logs/out-1.log',
      log_file: './logs/combined-1.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 8000,
      shutdown_with_message: true
    },
    {
      name: 'notification-service-2',
      script: 'app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5004,
        INSTANCE_ID: '2'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5004,
        INSTANCE_ID: '2'
      },
      error_file: './logs/err-2.log',
      out_file: './logs/out-2.log',
      log_file: './logs/combined-2.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 8000,
      shutdown_with_message: true
    }
  ]
}; 
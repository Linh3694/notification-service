module.exports = {
  apps: [
    {
      name: 'notification-service-1',
      script: 'app.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5003
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5003
      },
      error_file: './logs/notification-service-1-error.log',
      out_file: './logs/notification-service-1-out.log',
      log_file: './logs/notification-service-1-combined.log',
      time: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'notification-service-2',
      script: 'app.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5004
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5004
      },
      error_file: './logs/notification-service-2-error.log',
      out_file: './logs/notification-service-2-out.log',
      log_file: './logs/notification-service-2-combined.log',
      time: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
}; 
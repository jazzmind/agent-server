/**
 * PM2 Ecosystem Configuration for Agent Server
 * 
 * This configuration ensures the agent-server loads environment variables
 * from the .env file before starting.
 */

module.exports = {
  apps: [{
    name: 'agent-server',
    script: './start-with-env.sh',
    cwd: process.env.PWD || '/srv/agent',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: '/var/log/pm2/agent-server-error.log',
    out_file: '/var/log/pm2/agent-server-out.log',
    time: true,
    kill_timeout: 5000,
  }]
};

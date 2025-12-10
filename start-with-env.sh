#!/bin/bash
#
# Start agent-server with environment variables loaded from .env file
#
# PM2 doesn't natively support .env files, so this wrapper script
# sources the .env file before starting the Node.js application.
#

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the .env file if it exists
if [ -f "${SCRIPT_DIR}/.env" ]; then
    echo "Loading environment from ${SCRIPT_DIR}/.env"
    set -a  # Automatically export all variables
    source "${SCRIPT_DIR}/.env"
    set +a
else
    echo "Warning: .env file not found at ${SCRIPT_DIR}/.env"
fi

# Start the application
exec npm start

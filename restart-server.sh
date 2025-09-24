#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PORT=4111

echo -e "${YELLOW}🔄 Restarting Agent Server on port $PORT...${NC}"

# Check if a process is running on port 4111
PID=$(lsof -ti:$PORT)

if [ ! -z "$PID" ]; then
    echo -e "${YELLOW}⚠️  Found process running on port $PORT (PID: $PID)${NC}"
    echo -e "${RED}🛑 Terminating existing process...${NC}"

    # Kill the process
    kill -9 $PID 2>/dev/null

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Successfully terminated process on port $PORT${NC}"
    else
        echo -e "${RED}❌ Failed to terminate process. You may need to run with sudo.${NC}"
        exit 1
    fi

    # Wait a moment for the port to be released
    sleep 2
else
    echo -e "${GREEN}✅ No existing process found on port $PORT${NC}"
fi

# Check if PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
    echo -e "${YELLOW}📦 PostgreSQL is not running. Starting PostgreSQL...${NC}"
    brew services start postgresql@17 2>/dev/null || brew services start postgresql 2>/dev/null
    sleep 3

    if pg_isready -q 2>/dev/null; then
        echo -e "${GREEN}✅ PostgreSQL started successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start PostgreSQL. Please start it manually.${NC}"
    fi
else
    echo -e "${GREEN}✅ PostgreSQL is already running${NC}"
fi

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw agent_server_dev; then
    echo -e "${GREEN}✅ Database 'agent_server_dev' exists${NC}"
else
    echo -e "${YELLOW}📊 Creating database 'agent_server_dev'...${NC}"
    createdb agent_server_dev

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database created successfully${NC}"

        # Run migrations
        echo -e "${YELLOW}🔄 Running database migrations...${NC}"
        npm run migrate:up

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Migrations completed successfully${NC}"
        else
            echo -e "${RED}⚠️  Migration failed, but continuing...${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to create database${NC}"
    fi
fi

# Start the server
echo -e "${GREEN}🚀 Starting Agent Server on port $PORT...${NC}"
echo -e "${YELLOW}📝 Server will be available at:${NC}"
echo -e "   ${GREEN}Playground: http://localhost:$PORT/${NC}"
echo -e "   ${GREEN}API:        http://localhost:$PORT/api${NC}"
echo ""

# Export environment variables and start the server
export NODE_ENV=development
export NODE_OPTIONS="--experimental-global-webcrypto"

# Run the dev server
npm run dev
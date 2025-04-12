#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Document Management Internal Test${NC}"
echo -e "${YELLOW}-------------------------------${NC}"

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if curl -s http://localhost:3000 > /dev/null; then
  echo -e "${GREEN}Server is running on http://localhost:3000${NC}"
  SERVER_RUNNING=true
else
  echo -e "${YELLOW}Server is not running. Starting development server...${NC}"
  SERVER_RUNNING=false
  # Start server in background
  npm run dev > server.log 2>&1 &
  SERVER_PID=$!
  
  # Wait for server to start (max 30 seconds)
  echo -e "${YELLOW}Waiting for server to start...${NC}"
  for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null; then
      echo -e "${GREEN}Server started successfully!${NC}"
      break
    fi
    
    if [ $i -eq 30 ]; then
      echo -e "${RED}Server failed to start within 30 seconds${NC}"
      echo -e "${YELLOW}Check server.log for details${NC}"
      kill $SERVER_PID
      exit 1
    fi
    
    echo -n "."
    sleep 1
  done
  echo ""
fi

# Install dependencies if needed
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install uuid node-fetch@2.6.7 firebase-admin dotenv

# Run the internal test
echo -e "${YELLOW}Running internal test...${NC}"
npm run test:internal

TEST_EXIT_CODE=$?

# Clean up
if [ "$SERVER_RUNNING" = false ]; then
  echo -e "${YELLOW}Stopping development server...${NC}"
  kill $SERVER_PID
fi

# Final status message
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}All tests passed successfully!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed. Check the logs above for details.${NC}"
  exit 1
fi 
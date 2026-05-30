#!/bin/bash
cd "$(dirname "$0")"
echo "[1/3] Starting MySQL..."
"/c/Program Files/MySQL/MySQL Server 8.4/bin/mysqld" --datadir="$(pwd)/mysql_data" --port=3306 --console &
MYSQL_PID=$!
echo "[2/3] Waiting for MySQL..."
sleep 4
echo "[3/3] Starting App..."
export PATH="/c/Program Files/nodejs:$PATH"
export NODE_ENV=production
node dist/boot.js
kill $MYSQL_PID 2>/dev/null

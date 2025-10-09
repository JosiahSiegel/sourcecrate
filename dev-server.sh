#!/bin/bash
# Local development server for SourceCrate
# Kills any process on port 3000 and starts http-server

PORT=3000

echo "🔍 Checking for processes on port $PORT..."

# Check if port is in use
if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null 2>&1; then
    PID=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
    PROCESS_NAME=$(tasklist //FI "PID eq $PID" //FO CSV //NH 2>/dev/null | cut -d',' -f1 | tr -d '"' || echo "Unknown")

    echo "⚠️  Port $PORT is in use by process $PROCESS_NAME (PID: $PID)"
    echo ""
    echo "Attempting to kill it..."

    # Try to kill the process
    if taskkill //PID $PID //F > /dev/null 2>&1; then
        echo "✅ Process killed successfully"
        sleep 2
    else
        echo "❌ Failed to kill process (Access Denied - may require admin privileges)"
        echo ""
        echo "Options:"
        echo "  1. Use a different port: ./dev-server.sh 3001"
        echo "  2. Manually close the application using port $PORT"
        echo "  3. Run this script as Administrator"
        echo "  4. Kill manually: taskkill //PID $PID //F"
        echo ""
        read -p "Press Enter to try a different port (3001), or Ctrl+C to cancel..."
        PORT=3001
    fi
fi

# Final check
if netstat -ano | grep ":$PORT " | grep LISTENING > /dev/null 2>&1; then
    echo "❌ Port $PORT still in use. Exiting."
    exit 1
fi

echo "✅ Port $PORT is available"
echo "🚀 Starting development server on http://localhost:$PORT"
echo "📝 Press Ctrl+C to stop"
echo ""

# Start http-server with:
# -p PORT: specified port
# -c-1: disable caching (always serve fresh files)
# -o: open browser automatically
npx http-server -p $PORT -c-1 -o

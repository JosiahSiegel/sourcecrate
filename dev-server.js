#!/usr/bin/env node

/**
 * Cross-platform development server for SourceCrate
 * Kills any process on port 3000 and starts http-server
 */

import { spawn, execSync } from 'child_process';
import { platform } from 'os';

const PORT = process.argv[2] || 3000;
const isWindows = platform() === 'win32';

console.log(`🔍 Checking for processes on port ${PORT}...`);

/**
 * Check if server is already running and serving content
 */
async function isServerHealthy() {
  try {
    const response = await fetch(`http://localhost:${PORT}/index.html`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if port is in use and kill process if found
 */
async function checkAndKillPort() {
  try {
    let pid = null;

    if (isWindows) {
      // Windows: Use netstat to find process
      const netstatOutput = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' }).trim();
      if (netstatOutput) {
        const lines = netstatOutput.split('\n');
        const listeningLine = lines.find(line => line.includes('LISTENING'));
        if (listeningLine) {
          pid = listeningLine.trim().split(/\s+/).pop();
        }
      }
    } else {
      // Unix: Use lsof to find process
      try {
        const lsofOutput = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' }).trim();
        if (lsofOutput) {
          pid = lsofOutput.split('\n')[0];
        }
      } catch (error) {
        // lsof returns non-zero if port not in use
        pid = null;
      }
    }

    if (pid) {
      console.log(`⚠️  Port ${PORT} is in use by PID: ${pid}`);

      // Check if it's already serving our app
      const healthy = await isServerHealthy();
      if (healthy) {
        console.log('✅ Server is already running and healthy');
        console.log(`🌐 Available at http://localhost:${PORT}`);

        // If running in Playwright, exit successfully (it will reuse the server)
        if (process.env.PLAYWRIGHT) {
          console.log('🎭 Playwright will reuse existing server');
          process.exit(0);
        }

        // Otherwise, don't start a duplicate server
        console.log('💡 Use Ctrl+C to stop the existing server if needed');
        process.exit(0);
      }

      console.log('Attempting to kill it...');

      try {
        if (isWindows) {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } else {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        }
        console.log('✅ Process killed successfully');

        // Wait for port to be released
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('❌ Failed to kill process (may require admin/sudo privileges)');
        console.error('');
        console.error('Options:');
        console.error(`  1. Use a different port: node dev-server.js 3001`);
        console.error(`  2. Manually close the application using port ${PORT}`);
        console.error(`  3. Run with elevated privileges`);
        process.exit(1);
      }
    } else {
      console.log(`✅ Port ${PORT} is available`);
    }
  } catch (error) {
    // Port not in use or command failed
    console.log(`✅ Port ${PORT} is available`);
  }
}

/**
 * Start http-server
 */
function startServer() {
  console.log(`🚀 Starting development server on http://localhost:${PORT}`);
  console.log('📝 Press Ctrl+C to stop');
  console.log('');

  // Start http-server with:
  // -p PORT: specified port
  // -c-1: disable caching (always serve fresh files)
  // -g: enable gzip compression (matches GitHub Pages behavior)
  // -o: open browser automatically (only for manual dev, not for E2E tests)

  const args = ['-p', PORT, '-c-1', '-g'];

  // Only open browser if not running in CI or test mode
  if (!process.env.CI && !process.env.PLAYWRIGHT) {
    args.push('-o');
  }

  const httpServer = spawn('npx', ['http-server', ...args], {
    stdio: 'inherit',
    shell: true
  });

  httpServer.on('error', (error) => {
    console.error('❌ Failed to start http-server:', error.message);
    process.exit(1);
  });

  httpServer.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ http-server exited with code ${code}`);
      process.exit(code);
    }
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down development server...');
    httpServer.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    httpServer.kill();
    process.exit(0);
  });
}

// Main execution
(async () => {
  await checkAndKillPort();
  startServer();
})();

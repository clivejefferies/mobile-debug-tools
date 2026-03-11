// This script wraps the real test execution for ease of use
// It sets ADB_PATH and invokes the test file
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADB_PATH = "/Users/clivejefferies/Library/Android/sdk/platform-tools/adb";
const TEST_FILE = path.join(__dirname, 'wait_for_element_real.ts');
const env = { ...process.env, ADB_PATH };
const child = spawn('npx', ['tsx', TEST_FILE], {
    env: { ...process.env, ADB_PATH },
    stdio: 'inherit'
});
child.on('exit', (code) => {
    process.exit(code || 0);
});

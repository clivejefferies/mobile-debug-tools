import { AndroidInteract } from "../src/android/interact.js";
import { AndroidObserve } from "../src/android/observe.js";
// Set ADB path from user context
process.env.ADB_PATH = "/Users/clivejefferies/Library/Android/sdk/platform-tools/adb";
const APP_ID = "com.ideamechanics.modul8";
const DEVICE_ID = "51181FDAP0031Y"; // From `adb devices` output
async function runRealTest() {
    console.log(`Connecting to device ${DEVICE_ID}...`);
    const interact = new AndroidInteract();
    const observe = new AndroidObserve();
    try {
        // 1. Start App
        console.log(`\nStarting app ${APP_ID}...`);
        await interact.startApp(APP_ID, DEVICE_ID);
        // Give it a moment to render
        console.log("Waiting 3s for app to render...");
        await new Promise(r => setTimeout(r, 3000));
        // 2. Get UI Tree to find a valid text target
        console.log("\nFetching UI Tree to find a target text...");
        const tree = await observe.getUITree(DEVICE_ID);
        if (tree.error) {
            console.error("Failed to get UI Tree:", tree.error);
            return;
        }
        // Find first visible element with text
        const targetElement = tree.elements.find(e => e.text && e.text.length > 0 && e.visible);
        if (!targetElement || !targetElement.text) {
            console.warn("No visible text elements found on screen to test with.");
            console.log("Elements found:", tree.elements.length);
            return;
        }
        const targetText = targetElement.text;
        console.log(`Found target element: "${targetText}"`);
        // 3. Test waitForElement (Success Case)
        console.log(`\nTest 1: Waiting for existing element "${targetText}" (should succeed)...`);
        const start1 = Date.now();
        const result1 = await interact.waitForElement(targetText, 5000, DEVICE_ID);
        const elapsed1 = Date.now() - start1;
        console.log(`Result: ${result1.found ? "PASS" : "FAIL"}`);
        console.log(`Found Element: ${result1.element?.text}`);
        console.log(`Time taken: ${elapsed1}ms`);
        // 4. Test waitForElement (Timeout Case)
        const missingText = "THIS_TEXT_SHOULD_NOT_EXIST_XYZ_123";
        console.log(`\nTest 2: Waiting for missing element "${missingText}" (should timeout)...`);
        const start2 = Date.now();
        // Use short timeout 2s
        const result2 = await interact.waitForElement(missingText, 2000, DEVICE_ID);
        const elapsed2 = Date.now() - start2;
        console.log(`Result: ${!result2.found ? "PASS" : "FAIL"}`);
        console.log(`Found: ${result2.found}`);
        console.log(`Time taken: ${elapsed2}ms (expected ~2000ms)`);
    }
    catch (error) {
        console.error("Test failed with error:", error);
    }
}
runRealTest();

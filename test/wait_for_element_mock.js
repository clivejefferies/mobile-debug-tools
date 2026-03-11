import { AndroidInteract } from "../src/android/interact.js";
import { AndroidObserve } from "../src/android/observe.js";
// Mock the observe method
// We need to override the prototype method directly
// Since we are using ES modules, we need to handle the import correctly or just override the instance method if possible.
// But getUITree is an instance method on AndroidObserve, which AndroidInteract instantiates internally.
// We can override the prototype of AndroidObserve to affect all instances.
const originalGetUITree = AndroidObserve.prototype.getUITree;
async function runTests() {
    console.log("Starting tests for wait_for_element...");
    const interact = new AndroidInteract();
    // ---------------------------------------------------------
    // Test 1: Element found immediately
    // ---------------------------------------------------------
    console.log("\nTest 1: Element found immediately");
    AndroidObserve.prototype.getUITree = async () => ({
        device: { platform: "android", id: "mock", osVersion: "12", model: "Pixel", simulator: true },
        screen: "",
        resolution: { width: 1080, height: 1920 },
        elements: [{
                text: "Target",
                type: "Button",
                contentDescription: null,
                clickable: true,
                enabled: true,
                visible: true,
                bounds: [0, 0, 100, 100],
                resourceId: null
            }]
    });
    const start1 = Date.now();
    const result1 = await interact.waitForElement("Target", 1000);
    const elapsed1 = Date.now() - start1;
    console.log("Result:", result1.found === true ? "PASS" : "FAIL");
    console.log("Element:", result1.element ? "FOUND" : "MISSING");
    console.log("Elapsed:", elapsed1, "ms");
    // ---------------------------------------------------------
    // Test 2: Element not found (timeout)
    // ---------------------------------------------------------
    console.log("\nTest 2: Element not found (timeout)");
    AndroidObserve.prototype.getUITree = async () => ({
        device: { platform: "android", id: "mock", osVersion: "12", model: "Pixel", simulator: true },
        screen: "",
        resolution: { width: 1080, height: 1920 },
        elements: []
    });
    const start2 = Date.now();
    // Use a short timeout for test speed, but long enough to sleep at least once
    const result2 = await interact.waitForElement("Target", 1200);
    const elapsed2 = Date.now() - start2;
    console.log("Result:", result2.found === false ? "PASS" : "FAIL");
    // Should wait at least 1200ms
    console.log("Elapsed time (should be >= 1200ms):", elapsed2, elapsed2 >= 1200 ? "PASS" : "FAIL");
    // ---------------------------------------------------------
    // Test 3: Element found after polling
    // ---------------------------------------------------------
    console.log("\nTest 3: Element found after polling");
    let calls = 0;
    AndroidObserve.prototype.getUITree = async () => {
        calls++;
        if (calls < 3) {
            return {
                device: { platform: "android", id: "mock", osVersion: "12", model: "Pixel", simulator: true },
                screen: "",
                resolution: { width: 1080, height: 1920 },
                elements: []
            };
        }
        return {
            device: { platform: "android", id: "mock", osVersion: "12", model: "Pixel", simulator: true },
            screen: "",
            resolution: { width: 1080, height: 1920 },
            elements: [{
                    text: "Target",
                    type: "Button",
                    contentDescription: null,
                    clickable: true,
                    enabled: true,
                    visible: true,
                    bounds: [0, 0, 100, 100],
                    resourceId: null
                }]
        };
    };
    const start3 = Date.now();
    const result3 = await interact.waitForElement("Target", 2000);
    const elapsed3 = Date.now() - start3;
    console.log("Result:", result3.found === true ? "PASS" : "FAIL");
    console.log("Calls:", calls, calls === 3 ? "PASS" : "FAIL");
    // Expected calls: 0ms (fail), 500ms (fail), 1000ms (success). Elapsed should be >= 1000ms.
    console.log("Elapsed time (should be >= 1000ms):", elapsed3, elapsed3 >= 1000 ? "PASS" : "FAIL");
    // ---------------------------------------------------------
    // Test 4: Error handling (fast failure)
    // ---------------------------------------------------------
    console.log("\nTest 4: Error handling (fast failure)");
    AndroidObserve.prototype.getUITree = async () => ({
        device: { platform: "android", id: "mock", osVersion: "12", model: "Pixel", simulator: true },
        screen: "",
        resolution: { width: 0, height: 0 },
        elements: [],
        error: "ADB Connection Failed"
    });
    const start4 = Date.now();
    const result4 = await interact.waitForElement("Target", 5000);
    const elapsed4 = Date.now() - start4;
    console.log("Result:", result4.found === false && result4.error === "ADB Connection Failed" ? "PASS" : "FAIL");
    console.log("Error Message:", result4.error);
    // Should fail fast, not wait for timeout
    console.log("Elapsed time (should be < 500ms):", elapsed4, elapsed4 < 500 ? "PASS" : "FAIL");
    // Restore original
    AndroidObserve.prototype.getUITree = originalGetUITree;
}
runTests().catch(console.error);

import { XMLParser } from "fast-xml-parser"
import { GetUITreeResponse, UIElement } from "../../types.js"
import { getAdbCmd, execAdb, getAndroidDeviceMetadata, getDeviceInfo, delay, getScreenResolution, traverseNode } from "../../utils/android/utils.js"
import { deriveSnapshotMetadata } from "../snapshot-metadata.js"
import { remainingBudget } from '../../utils/operation-budget.js'
import { createObservationMeasurement } from '../performance-metrics.js'
export async function collectGetUITree(deviceId?: string): Promise<GetUITreeResponse> {
  const measurement = createObservationMeasurement('android')
  let metadata
  try {
    metadata = await measurement.timed('metadata_ms', () => getAndroidDeviceMetadata("", deviceId))
  } catch (error) {
    measurement.setOutcome('unavailable')
    measurement.finish()
    throw error
  }
  const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)

  try {
    // Get screen resolution first
    const resolution = await measurement.timed('resolution_ms', () => getScreenResolution(deviceId));
    if (resolution.width === 0 && resolution.height === 0) {
      throw new Error("Failed to get screen resolution. Is the device connected and authorized?");
    }

    const xmlContent = await readAndroidTree(deviceId, measurement)
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const result = await measurement.timed('parse_ms', async () => parser.parse(xmlContent));

    const elements: UIElement[] = [];

    // The root is usually hierarchy -> node
    if (result.hierarchy && result.hierarchy.node) {
      // If the root is an array (unlikely for root, but good to be safe) or single object
      if (Array.isArray(result.hierarchy.node)) {
        result.hierarchy.node.forEach((n: Parameters<typeof traverseNode>[0]) => traverseNode(n, elements));
      } else {
        traverseNode(result.hierarchy.node, elements);
      }
    }

    const snapshotMetadata = deriveSnapshotMetadata(`android:${deviceInfo.id}`, {
      screen: "",
      resolution,
      elements
    }, 'ui_tree')

    measurement.setOutcome('observed')
    const response = measurement.bindObservation({
      device: deviceInfo,
      screen: "",
      resolution,
      elements,
      ...snapshotMetadata
    })
    measurement.finish()
    return response
  } catch (e) {
    const errorMessage = `Failed to get UI tree. ADB Path: '${getAdbCmd()}'. Error: ${e instanceof Error ? e.message : String(e)}`;
    console.error(errorMessage);
    const snapshotMetadata = deriveSnapshotMetadata(`android:${deviceInfo.id}`, null, 'ui_tree')
    measurement.setOutcome('unavailable')
    measurement.finish()
    return {
      device: deviceInfo,
      screen: "",
      resolution: { width: 0, height: 0 },
      elements: [],
      ...snapshotMetadata,
      error: errorMessage
    };
  }
}

async function readAndroidTree(deviceId: string | undefined, measurement: ReturnType<typeof createObservationMeasurement>) {
  // Retry Logic
  let xmlContent = '';
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    remainingBudget()
    attempts++;
    try {
      // The first read starts immediately so it remains fresh for in-place UI changes.
      // Delay only a retry after a failed or invalid acquisition.
      if (attempts > 1) {
        await measurement.timed('observation_wait_ms', () => delay(Math.min(remainingBudget(300 + (attempts * 100)), 300 + (attempts * 100))));
      }
      remainingBudget()

      xmlContent = await measurement.physicalRead(async () => {
        await execAdb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], deviceId)
        const content = await execAdb(['shell', 'cat', '/sdcard/ui.xml'], deviceId)
        if (!content || !content.trim() || content.includes('ERROR:')) throw new Error('Empty or invalid UI dump')
        return content
      })
      break
    } catch (e) {
      if (e instanceof Error && e.message === 'ACTION_TIMEOUT') throw e
      console.error(`Attempt ${attempts} failed: ${e}`);
    }

    if (attempts === maxAttempts) {
      throw new Error(`Failed to retrieve valid UI dump after ${maxAttempts} attempts.`);
    }
  }

  return xmlContent
}

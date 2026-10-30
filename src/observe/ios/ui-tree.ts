import { remainingBudget } from '../../utils/operation-budget.js'
import { execCmd } from '../../utils/exec.js'
import { createObservationMeasurement } from '../performance-metrics.js'
import { GetUITreeResponse, UIElement } from "../../types.js"
import { getIOSDeviceMetadata, getIdbCmd, isIDBInstalled } from "../../utils/ios/utils.js"
import { deriveSnapshotMetadata } from '../snapshot-metadata.js'
import { delay } from './context.js'
import { traverseIDBNode } from './ui-elements.js'
export async function collectGetUITree(deviceId: string = "booted"): Promise<GetUITreeResponse> {
  const measurement = createObservationMeasurement('ios')
  let device
  try {
    device = await measurement.timed('metadata_ms', () => getIOSDeviceMetadata(deviceId))
  } catch (error) {
    measurement.setOutcome('unavailable')
    measurement.finish()
    throw error
  }
  const deviceKey = `ios:${device.id}`

  const idbExists = await measurement.timed('capability_check_ms', () => isIDBInstalled());
  if (!idbExists) {
    const snapshotMetadata = deriveSnapshotMetadata(deviceKey, null, 'ui_tree')
    measurement.setOutcome('unavailable')
    measurement.finish()
    return missingIDBResponse(device, snapshotMetadata)
  }

  const targetUdid = (device.id && device.id !== 'booted') ? device.id : undefined;

  const acquisition = await readIOSTree(targetUdid, measurement)
  if (!acquisition.success) {
    const snapshotMetadata = deriveSnapshotMetadata(deviceKey, null, 'ui_tree')
    measurement.setOutcome('unavailable'); measurement.finish()
    return {
      device, screen: '', resolution: { width: 0, height: 0 }, elements: [], ...snapshotMetadata,
      error: 'Failed to retrieve valid UI dump after 3 attempts.'
    }
  }

  const jsonContent = acquisition.tree
  try {
    const elements: UIElement[] = await measurement.timed('conversion_ms', async () => {
      const parsed: UIElement[] = []
      if (Array.isArray(jsonContent)) {
        for (const node of jsonContent) traverseIDBNode(node, parsed)
      } else {
        traverseIDBNode(jsonContent!, parsed)
      }
      return parsed
    })

    let width = 0;
    let height = 0;
    if (elements.length > 0) {
      const rootBounds = elements[0].bounds;
      width = rootBounds[2] - rootBounds[0];
      height = rootBounds[3] - rootBounds[1];
    }

    const snapshotMetadata = deriveSnapshotMetadata(deviceKey, {
      screen: "",
      resolution: { width, height },
      elements
    }, 'ui_tree')

    measurement.setOutcome('observed')
    const response = measurement.bindObservation({
      device,
      screen: "",
      resolution: { width, height },
      elements,
      ...snapshotMetadata
    })
    measurement.finish()
    return response
  } catch (e) {
    const snapshotMetadata = deriveSnapshotMetadata(deviceKey, null, 'ui_tree')
    measurement.setOutcome('unavailable')
    measurement.finish()
    return {
      device,
      screen: "",
      resolution: { width: 0, height: 0 },
      elements: [],
      ...snapshotMetadata,
      error: `Failed to parse idb output: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

async function readIOSTree(targetUdid: string | undefined, measurement: ReturnType<typeof createObservationMeasurement>) {
  let jsonContent: import('./ui-elements.js').IDBElement | import('./ui-elements.js').IDBElement[] | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    remainingBudget()
    attempts++;
    try {
      await measurement.timed('observation_wait_ms', () => delay(Math.min(remainingBudget(300 + (attempts * 100)), 300 + (attempts * 100))));
      remainingBudget()

      const args = ['ui', 'describe-all', '--json'];
      if (targetUdid) {
        args.push('--udid', targetUdid);
      }

      const output = await measurement.physicalRead(async () => {
        const result = await execCmd(getIdbCmd(), args, { timeout: remainingBudget() })
        if (result.stderr === 'ACTION_TIMEOUT') throw new Error('ACTION_TIMEOUT')
        if (result.exitCode !== 0) throw new Error(`idb failed (code ${result.exitCode}): ${result.stderr}`)
        if (!result.stdout.trim()) throw new Error('Empty idb UI tree output')
        return result.stdout
      })

      if (output && output.trim().length > 0) {
        jsonContent = await measurement.timed('parse_ms', async () => JSON.parse(output));
        break; // Success
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'ACTION_TIMEOUT') throw e
      console.error(`Attempt ${attempts} failed: ${e}`);
    }

    if (attempts === maxAttempts) {
      return { success: false, tree: null };
    }
  }

  return { success: true, tree: jsonContent }
}

function missingIDBResponse(device: GetUITreeResponse['device'], snapshotMetadata: ReturnType<typeof deriveSnapshotMetadata>): GetUITreeResponse {
  return {
    device,
    screen: "",
    resolution: { width: 0, height: 0 },
    elements: [],
    ...snapshotMetadata,
    error: "iOS UI tree retrieval requires 'idb' (iOS Device Bridge). Please install it via Homebrew: `brew tap facebook/fb && brew install idb-companion` and `pip3 install fb-idb`."
  };
}

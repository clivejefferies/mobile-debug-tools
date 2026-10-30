import { GetCurrentScreenResponse } from "../../types.js"
import { execAdb, getAndroidDeviceMetadata, getDeviceInfo } from "../../utils/android/utils.js"
export async function collectGetCurrentScreen(deviceId?: string): Promise<GetCurrentScreenResponse> {
  const metadata = await getAndroidDeviceMetadata("", deviceId)
  const deviceInfo = getDeviceInfo(deviceId || 'default', metadata)

  try {
    const output = await execAdb(['shell', 'dumpsys', 'activity', 'activities'], deviceId, { timeout: 10000 })
    const lines = output.split('\n');
    let resumedLine = lines.find(line => /^\s*mResumedActivity:/.test(line));

    if (!resumedLine) {
      resumedLine = lines.find(line => /^\s*ResumedActivity:/.test(line));
    }

    if (!resumedLine) {
      return {
        device: deviceInfo,
        package: "",
        activity: "",
        shortActivity: "",
        error: "Could not find 'mResumedActivity' in dumpsys output"
      }
    }

    const match = resumedLine.match(/ActivityRecord\{[^ ]*(?:\s+[^ ]+)*\s+([^\/ ]+)\/([^ \{}]+)[^}]*\}/);

    if (match) {
      const packageName = match[1];
      let activityName = match[2];

      if (activityName.startsWith('.')) {
        activityName = packageName + activityName;
      }

      const shortActivity = activityName.split('.').pop() || activityName;

      return {
        device: deviceInfo,
        package: packageName,
        activity: activityName,
        shortActivity: shortActivity
      };
    } else {
      return {
        device: deviceInfo,
        package: "",
        activity: "",
        shortActivity: "",
        error: `Found resumed activity line but failed to parse: '${resumedLine.trim()}'`
      }
    }

  } catch (e) {
    return {
      device: deviceInfo,
      package: "",
      activity: "",
      shortActivity: "",
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

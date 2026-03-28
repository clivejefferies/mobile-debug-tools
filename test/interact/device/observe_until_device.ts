(async function main(){
  try{
    const inter = await import('../../../src/interact/index.ts')
    const manage = await import('../../../src/manage/index.ts')
    const ToolsInteract = (inter as any).ToolsInteract
    const ToolsManage = (manage as any).ToolsManage

    const ANDROID_ID = process.env.ANDROID_DEVICE || 'emulator-5554'
    const IOS_UDID = process.env.IOS_DEVICE || '2EFFD8FD-5D09-47CC-95F8-28BBE30AF7ED'
    console.log('Device test starting. Android:', ANDROID_ID, 'iOS:', IOS_UDID)

    // Start modul8 on both platforms if present
    try { await ToolsManage.startAppHandler({ platform: 'android', appId: 'com.ideamechanics.modul8', deviceId: ANDROID_ID }); console.log('Started android app (if installed)') } catch(e){ console.error('Android start skipped:', e.message || e) }
    try { await ToolsManage.startAppHandler({ platform: 'ios', appId: 'com.ideamechanics.modul8.Modul8', deviceId: IOS_UDID }); console.log('Started ios app (if installed)') } catch(e){ console.error('iOS start skipped:', e.message || e) }

    // Press Generate Session on iOS, then wait for Play session
    try {
      const iFound = await ToolsInteract.findElementHandler({ query: 'Generate Session', platform: 'ios', deviceId: IOS_UDID, timeoutMs: 10000 })
      if (iFound && iFound.found && iFound.element && iFound.element.tapCoordinates) {
        const c = iFound.element.tapCoordinates
        await ToolsInteract.tapHandler({ platform: 'ios', x: c.x, y: c.y, deviceId: IOS_UDID })
        console.log('Tapped Generate Session on iOS at', c)
      } else {
        console.warn('Generate Session not found on iOS; skipping tap')
      }
      const iRes = await ToolsInteract.observeUntilHandler({ type: 'ui', query: 'Play session', timeoutMs: 100000, pollIntervalMs: 500, stability_ms: 1000, observationDelayMs: 40000, platform: 'ios', deviceId: IOS_UDID })
      console.log('iOS observe result (Play session):', JSON.stringify(iRes, null, 2))
    } catch (e) { console.error('iOS flow error:', e) }

  } catch (e) { console.error('ERR', e); process.exit(1) }
})()

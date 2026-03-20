#!/usr/bin/env node
import { ToolsManage } from '../../../dist/tools/manage.js'

async function main() {
  const project = '/Users/clivejefferies/Projects/modul8'
  console.log('Running KMP build+install for project', project)
  // Use projectType=kmp and let handler pick android by default for KMP
  // Request iOS explicitly for this run to test iOS build path
  const res = await ToolsManage.buildAndInstallHandler({ platform: 'ios', projectPath: project, projectType: 'kmp', timeout: 600000, deviceId: undefined })
  console.log(JSON.stringify(res, null, 2))
  if (res.result && res.result.success) process.exit(0)
  process.exit(1)
}

main().catch(e => { console.error(e); process.exit(2) })
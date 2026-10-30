export type BuildEnv = Record<string, string | undefined>

export interface IOSBuildOptions {
  variant?: string
  workspace?: string
  project?: string
  scheme?: string
  destinationUDID?: string
  derivedDataPath?: string
  buildJobs?: number
  forceClean?: boolean
  xcodeCmd?: string
  env?: BuildEnv
}

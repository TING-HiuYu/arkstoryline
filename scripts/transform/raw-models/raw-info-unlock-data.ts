export interface RawRequiredStage {
  stageId?: string
  [field: string]: unknown
}

export interface RawInfoUnlockData {
  storyCode?: string
  storyName?: string
  storyInfo?: string
  storyTxt?: string
  avgTag?: string
  storySort?: number
  requiredStages?: readonly RawRequiredStage[]
  [field: string]: unknown
}

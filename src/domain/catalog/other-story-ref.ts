export type OtherStoryType =
  | 'timeline'
  | 'log'
  | 'news'
  | 'picture'
  | 'challengeBook'
  | 'landmark'

export interface OtherStoryRef {
  id: string
  albumId: string
  type: OtherStoryType
  title: string
  path?: string
  imageId?: string
  musicId?: string
  distributeMusic: boolean
}

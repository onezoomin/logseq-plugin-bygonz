import { Mixin } from 'ts-mixer'
import { WithHistory, ModWho, TimeStampedBase } from 'bygonz'

export type CompoundKeyNumStr = [number, string]

/*
:block/properties-text-values
:block/uuid
:block/properties
:block/journal
:block/left
:block/refs
:block/properties-order
:block/format
:block/content
:db/id
:block/path-refs
:block/parent
:block/unordered
:block/page
*/
// BlockParams can be used for a js obj that will be cast to Block or BlockVM
export interface BlockParams {
  // ID: string // => :block/uuid #uuid
  'uuid': string

  creator?: string
  created?: number

  modifier?: string
  modified?: number

  isDeleted?: boolean
  ':db/id': number
  'content': string
  'journal'?: boolean
  'unordered'?: boolean
  'left'?: any
  'refs'?: any
  'properties-order'?: any
  'format'?: any
  'path-refs'?: any
  'parent'?: any
  'page'?: any
  'properties'?: any
  'properties-text-values'?: Record<string, any>
}

export class Block extends Mixin(TimeStampedBase, ModWho) {
  // ID: string // => :block/uuid #uuid
  'uuid': string
  isDeleted?: boolean
  ':db/id': number
  'content': string
  'journal'?: boolean
  'unordered'?: boolean
  'left'?: any
  'refs'?: any
  'properties-order'?: any
  'format'?: any
  'path-refs'?: any
  'parent'?: any
  'page'?: any
  'properties'?: any
  'properties-text-values'?: Record<string, any>

  constructor (obj: BlockParams) {
    super(obj) // all Mixedin supers are called in left to right order
    Object.assign(this, obj)
  }
}

export class BlockVM extends Mixin(Block, WithHistory) {
  public get ID () {
    return this.uuid
  }

  public get blockAsDataLog () {
    // TODO remember ID => :block/uuid
    return `TODO fetch current block props rolled up like logseq expects it for rendering eg:
    {:block/uuid #uuid "63619191-9216-4ff6-8fa3-fc34c4af7d1e",
    :block/properties {},
    :block/journal? true,
    :block/left {:db/id 322},
    :block/format :markdown,
    :block/content "Basic Mock Tree for Sync",
    :db/id 323,
    :block/path-refs [{:db/id 19}],
    :block/parent {:db/id 19},
    :block/unordered true, 
    :block/page {:db/id 19}}`
  }

  async getBlockHistoryEntries () {
    return (await this.getEntityHistory()).filter((eachLog) => eachLog.at === ':block/content')
  }

  async getBlockHistoryValues () {
    return Object.values(await this.getAttributeHistory(':block/content'))
  }

  async setBlockContent (blockContent: string) {
    console.log('set', this.uuid, blockContent)
    const { getInitializedBlocksDB } = await import('./bygonz')
    const blocksDB = await getInitializedBlocksDB()
    void blocksDB.Blocks.update(this.uuid, { content: blockContent })
  }

  async setDeleted () {
    throw new Error('DIFFERENT WAY OF DOING THINGS,DON\'T CALL')
    // console.log('del', this.uuid)
    // const { getInitializedBlocksDB } = await import('./bygonz')
    // const blocksDB = await getInitializedBlocksDB()
    // void blocksDB.Blocks.update(this.uuid, { content: '-deleted-' /* HACK for testing */, isDeleted: true })
  }
}

// export const initialBlocks = [
//   new Block({
//     ID: '6362c03c-fd5f-49e5-af3e-7459a1f09b33',
//     ':block/uuid': '6362c03c-fd5f-49e5-af3e-7459a1f09b33',
//     ':db/id': 539,
//     ':block/unordered': true,
//     ':block/parent': {
//       id: 19,
//     },
//     ':block/path-refs': [
//       {
//         id: 19,
//       },
//     ],
//     ':block/content': 'Basic Mock Tree for Sync',
//     ':block/page': {
//       id: 19,
//     },
//     ':block/left': {
//       id: 538,
//     },
//     ':block/format': 'markdown',
//   }),
// ]

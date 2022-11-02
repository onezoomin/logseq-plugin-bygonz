import { Mixin } from 'ts-mixer'
import { WithHashID, WithHistory, ModWho, TimeStampedBase } from 'bygonz'

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
  ID: string // => :block/uuid #uuid 

  creator?: string
  created?: number

  modifier?: string
  modified?: number

  isDeleted?: boolean
  ':db/id': number
  ':block/content': string
  ':block/journal'?: boolean
  ':block/unordered'?: boolean
  ':block/left'?: any
  ':block/refs'?: any
  ':block/properties-order'?: any
  ':block/format'?: any
  ':block/path-refs'?: any
  ':block/parent'?: any
  ':block/page'?: any
  ':block/properties'?: any
  ':block/properties-text-values'?: Record<string, any>
}

export class Block extends Mixin(TimeStampedBase, ModWho) {
  ID: string // => :block/uuid #uuid 
  isDeleted?: boolean
  ':db/id': number
  ':block/content': string
  ':block/journal'?: boolean
  ':block/unordered'?: boolean
  ':block/left'?: any
  ':block/refs'?: any
  ':block/properties-order'?: any
  ':block/format'?: any
  ':block/path-refs'?: any
  ':block/parent'?: any
  ':block/page'?: any
  ':block/properties'?: any
  ':block/properties-text-values'?: Record<string, any>

  constructor(obj: BlockParams) {
    super(obj) // all Mixedin supers are called in left to right order
    Object.assign(this, obj)
  }
}

export class BlockVM extends Mixin(Block, WithHistory) {
  public get blockAsDataLog() {
    //TODO remember ID => :block/uuid
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
    :block/page {:db/id 19}}
    `
  }

  async getBlockHistoryEntries() {
    return (await this.getEntityHistory()).filter((eachLog) => eachLog.at === ':block/content')
  }

  async getBlockHistoryValues() {
    return Object.values(await this.getAttributeHistory(':block/content'))
  }

  async setBlockContent(blockContent: string) {
    console.log('set', this.ID, blockContent)
    const { getInitializedBlocksDB } = await import('./bygonz')
    const blocksDB = await getInitializedBlocksDB()
    void blocksDB.Blocks.update(this.ID, { ':block/content': blockContent })
  }

  async setDeleted() {
    console.log('del', this.ID)
    const { getInitializedBlocksDB } = await import('./bygonz')
    const blocksDB = await getInitializedBlocksDB()
    void blocksDB.Blocks.update(this.ID, { ':block/content': '-deleted-', isDeleted: true })
  }

}

export const initialBlocks = [
  new Block({
    ID: "6362c03c-fd5f-49e5-af3e-7459a1f09b33",
    ":db/id": 539,
    ":block/unordered": true,
    ":block/parent": {
      "id": 19
    },
    ":block/path-refs": [
      {
        "id": 19
      }
    ],
    ":block/content": "Basic Mock Tree for Sync",
    ":block/page": {
      "id": 19
    },
    ":block/left": {
      "id": 538
    },
    ":block/format": "markdown"
  }),
]

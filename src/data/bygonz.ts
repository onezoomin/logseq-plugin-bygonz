import type { Table } from 'bygonz'

import { BlockParams, BlockVM } from './LogSeqBlock'
import { BygonzDexie, DexiePlusParams, Subscription } from 'bygonz'

const userAddressDef = 'defaultFixThisSoItNeverShowsUpAnywhere'

const stores = {
  Blocks: 'uuid, content, created, modified, owner, modifier',
  // Subscriptions: 'id++, account',
  // Schemes: 'ID, name, created, modified, owner, modifier',
}

const mappings = {
  Blocks: BlockVM,
  // Schemes: SchemeVM,
}
const subscriptions: Subscription[] = [
  new Subscription({
    type: 'ipfs',
    info: {
      // appCreator: appNameObj.creator,
      // appName: appNameObj.name,
      accountName: 'bygonztest',
      logId: 'bygonztestlog',
    },
  }),
  // new Subscription({
  //   type: 'ipfs',
  //   info: {
  //     // appCreator: appNameObj.creator,
  //     // appName: appNameObj.name,
  //     accountName: 'work-profile',
  //   },
  // }),
]
const options = {
  conflictThresholds: {
    red: 120,
    yellow: 600,
  },
  conflictHandlers: {},
  author: {
    name: userAddressDef,
    email: 'userAddressDef@publickey.eth',
  },
  userAddressDef,
  // prePopulateTables: {
  //   Blocks: initialBlocks,
  // },
  subscriptions,
}

export class BlocksDB extends BygonzDexie {
  // Declare implicit table properties. (just to inform Typescript. Instanciated by Dexie in stores() method)
  // {entity}Params | {entity}VM allows for partial objects to be used in add and put and for the class of retrieved entities to include getters
  public Blocks: Table<BlockParams | BlockVM, string>
  // public Subscriptions: Table<{id?: number, info: {accountName: string}, fileCount?: number}, number>
  // public Schemes: Table<TaskParams | TaskVM, CompoundKeyNumStr>

  async init (userAddress = userAddressDef) {
    console.warn('init - so, setup pls?', self)
    if (self.document !== undefined) {
      await this.setup(userAddress) // in super
    }
  }

  constructor (...params: DexiePlusParams) {
    super(...params)
    this.doMappings()
    // super(params[0]) // reactivity works if extending Dexie (not loaded from CDN) and using these normal instantiations
    // this.version(1).stores(stores)
  }
}

let blocksDB: BlocksDB
export const getInitializedBlocksDB = async (userAddress = userAddressDef) => {
  if (blocksDB) return blocksDB
  blocksDB = new BlocksDB('BygonzBlocks', stores, mappings, { ...options, userAddress })
  console.warn('blocks db coming', blocksDB)

  await blocksDB.init(userAddress)
  return blocksDB
}

import type { Table } from 'bygonz'

import { BlockParams, BlockVM, initialBlocks } from './LogSeqBlock'
import { BygonzDexie, DexiePlusParams, Subscription } from 'bygonz'

const userAddressDef = 'defaultFixThisSoItNeverShowsUpAnywhere'

const stores = {
    Blocks: 'ID, content, row, created, modified, owner, modifier',
    // Subscriptions: 'id++, account',
    // Schemes: 'ID, name, created, modified, owner, modifier',
}

const mappings = {
    Blocks: BlockVM,
    // Schemes: SchemeVM,
}
// const subscriptions: Subscription[] = [
//   new Subscription({
//     type: 'wnfs',
//     info: {
//       appCreator: appNameObj.creator,
//       appName: appNameObj.name,
//       accountName: 'onezoom',
//     },
//   }),
// ]
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
    prePopulateTables: {
        Blocks: initialBlocks
    }
    //   subscriptions,
}

export class BlocksDB extends BygonzDexie {
    // Declare implicit table properties. (just to inform Typescript. Instanciated by Dexie in stores() method)
    // {entity}Params | {entity}VM allows for partial objects to be used in add and put and for the class of retrieved entities to include getters
    public Blocks: Table<BlockParams | BlockVM, string>
    // public Subscriptions: Table<{id?: number, info: {accountName: string}, fileCount?: number}, number>
    // public Schemes: Table<TaskParams | TaskVM, CompoundKeyNumStr>

    async init(userAddress = userAddressDef) {
        if (self.document !== undefined) {
            await this.setup(userAddress) // in super

        }
    }

    constructor(...params: DexiePlusParams) {
        super(...params)
        this.doMappings()
        // super(params[0]) // reactivity works if extending Dexie (not loaded from CDN) and using these normal instantiations
        // this.version(1).stores(stores)
    }
}

let blocksDB: BlocksDB
export const getInitializedBlocksDB = async (userAddress = userAddressDef) => {
    if (blocksDB) return blocksDB
    blocksDB = new BlocksDB('LogSeqBlocks', stores, mappings, { ...options, userAddress })
    await blocksDB.init(userAddress)
    return blocksDB
}

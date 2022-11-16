import { Logger } from 'logger'
import { partition, groupBy, mapValues, find } from 'lodash-es'
import { BlocksDB } from './bygonz'
import { BlockEntity, IDatom } from '@logseq/libs/dist/LSPlugin'
import { allPromises, OpLogObj } from 'bygonz'
import { mapBlockToBlockVM, mapBlockValueToBygonzValue } from './blocks-to-bygonz'
import { BlockParams, BlockVM } from './LogSeqBlock'
import Mutex from 'await-mutex'

const { ERROR, WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { prefix: '[DB]', performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars
type ChangeEvent = Parameters<Parameters<typeof logseq.DB.onChanged>[0]>[0]
interface AddOp {
  op: 'add'
  data: BlockParams
}
interface UpdateOp {
  op: 'update'
  bygonzID: string
  data: Partial<BlockParams>
}
type ChangeOp = AddOp | UpdateOp

const handleDBChangeMutex = new Mutex()

export async function handleDBChangeEvent (event: ChangeEvent, blocksDB: BlocksDB) {
  const {
    blocks,
    txData, // entityID, attribute, value, transaction, op(false=before,true=after)
    txMeta,
  } = event
  DEBUG(`MUTEX? handleChange${txMeta?.outlinerOp ? ` (op=${txMeta?.outlinerOp})` : ''}`, event)
  const unlockMutex = await handleDBChangeMutex.lock()
  try {
    return DEBUG.group(`handleChange${txMeta?.outlinerOp ? ` (op=${txMeta?.outlinerOp})` : ''}`, event, async () => {
      if (!txData) return

      const changeSets: ChangeOp[] = []

      if (txMeta?.outlinerOp === 'deleteBlocks') {
        for (const block of blocks) {
          const bygonzID = block.properties?.bygonz ?? block.uuid
          if (!bygonzID) { ERROR('deleted', block); throw new Error('Failed to get bygonzID from deleted block') }
          changeSets.push({ op: 'update', bygonzID, data: { isDeleted: true } })
        }
      } else {
        // Index data
        const atomsByEntityID = groupBy(txData, '[0]')
        const entitiesByID = mapValues(groupBy(blocks, 'id'), matches => {
          if (matches.length > 1) throw new Error('Multiple blocks with same ID')
          return matches[0]
        })
        DEBUG({ atomsByEntityID, entitiesByID })
        // Iterate over individual entities
        for (const [entityID, atoms] of Object.entries(atomsByEntityID)) {
          const entity = entitiesByID[entityID]
          const changeSet = await mapAtomsToDBChangeSet(entity, atoms, entityID, txMeta, blocksDB)

          if (changeSet) changeSets.push(changeSet)

          // if (txMeta?.outlinerOp === 'saveBlock') {
          //   const contentChanges = atomsForAttribute('content')
          // } else if (txMeta?.outlinerOp === 'moveBlocks') {
        }
      }

      if (changeSets.length) {
        console.groupCollapsed('[DB transaction]', changeSets)
        try {
          await blocksDB.transaction('rw', blocksDB.Blocks, async () => {
            for (const dbOp of changeSets) {
              DEBUG('saving changeSet', dbOp)
              if (dbOp.op === 'add') {
                await blocksDB.Blocks.add(dbOp.data)
              } else {
                await blocksDB.Blocks.update(dbOp.bygonzID, dbOp.data)
              }
            }
          })
        } finally {
          console.groupEnd()
        }
      }
    })
  } finally {
    unlockMutex()
  }
}
async function mapAtomsToDBChangeSet (
  block: BlockEntity,
  atoms: IDatom[],
  entityID: string,
  txMeta: { [key: string]: unknown, outlinerOp: string } | undefined,
  blocksDB: BlocksDB,
): Promise<ChangeOp | null> {
  if (!entityID) {
    WARN('Ignoring change op without bygonzID', { block, atoms })
    return null
  }
  if (!block.parent || !block.page) {
    WARN('Ignoring block without page or parent:', { block })
    return null
  }
  const bygonzID = block.properties?.bygonz ?? block.uuid
  const existingVM = await blocksDB.Blocks.get(bygonzID)

  if (!existingVM) {
    const blockVM = await mapBlockToBlockVM(bygonzID, block)
    DEBUG('Change event for non-existent VM... creating', { bygonzID, block, blockVM })
    return { op: 'add', data: blockVM }
  } else {
    const atomsByAttribute = groupBy(atoms, '[1]')
    const atomsForAttribute = (attr: string) => {
      const atomsForAttr = atomsByAttribute[attr]
      if (atomsForAttr.length === 0) { return [[], []] }

      const [after, before] = partition(atomsForAttr, '[4]') // partition by op (if false, it's the retraction)
        .map(list => list.map(atom => atom[2])) // for each atoms list get just the value of the atom
      DEBUG('[DB.saveBlock] content:', [before, after])
      if (before.length > 1) { WARN('Hm... retraction count > 1:', attr, before, { entityID, atoms }) }
      if (after.length !== 1) { ERROR('WTF?  new value count != 1:', attr, after, { entityID, atoms }) }
      return [before, after]
    }
    DEBUG('atomsByAttribute', atomsByAttribute)

    const attrWhitelist = ['content', 'parent', 'left']
    const attrsToCheck = Object.keys(atomsByAttribute).filter(a => attrWhitelist.includes(a))
    const changeSet: Partial<BlockVM> = {}
    for (const attr of attrsToCheck) {
      const [before, after] = atomsForAttribute(attr)
      // DEBUG(`Changed? '${attr}' `, after, { before, entity, bygonzID })
      // if (after.length) {
      const dbBefore = (await blocksDB.Blocks.get(bygonzID))?.[attr]
      DEBUG(`Saving new '${attr}' value:`, after, { entity: block, bygonzID })
      if (!((await allPromises(before.map(async v => await mapBlockValueToBygonzValue(attr, v)))).includes(dbBefore))) {
        WARN('vm state was different than \'before\' of DB change:', { before, dbBefore, bygonzID, entity: block })
      }
      const newVal = after[0]
      const mappedNewVal = await mapBlockValueToBygonzValue(attr, newVal)
      DEBUG(`Mapped value for '${attr}':`, mappedNewVal)
      if (mappedNewVal) {
        changeSet[attr] = mappedNewVal
      }
      // }
    }

    return { op: 'update', bygonzID, data: changeSet }
  }
}

// ------------- //
// Discarded PoC //
// ------------- //
// export async function applyAppLogs (appLogs: OpLogObj[]) {
//   DEBUG('Applying new applogs:', appLogs)
//   const atomsByEntityID = groupBy(appLogs, 'en')
//   for (const [entityID, atoms] of Object.entries(atomsByEntityID)) {
//     const atomsByAttribute = groupBy(atoms, 'at')
//     DEBUG('atomsByAttribute', atomsByAttribute)
//     //   const attrWhitelist = ['content', 'parent', 'left'] - can also just save all for now
//     const attrsToCheck = Object.keys(atomsByAttribute)//.filter(a => attrWhitelist.includes(a))
//     for (const attr of attrsToCheck) {
//       const newValues = atomsByAttribute[attr]
//       if (newValues.length > 1) WARN(`More than one change of ${attr}, choosing last`, { newValues, atoms }) // HACK: WANTED: situation handling?
//       const newValue = newValues[newValues.length - 1]
//       DEBUG(`Saving new '${attr}' value:`, newValue, { entity, bygonzID })
//       if (attr === 'content') {
//         await logseq.Editor.updateBlock(...)
//       }
//     }
//   }
// }

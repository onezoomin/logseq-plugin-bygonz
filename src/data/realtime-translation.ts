import { Logger } from 'logger'
import { partition, groupBy, mapValues, find } from 'lodash-es'
import { BlocksDB } from './bygonz'
import { BlockEntity, IDatom } from '@logseq/libs/dist/LSPlugin'
import { allPromises, OpLogObj } from 'bygonz'
import { mapBlockValueToBygonzValue } from './blocks-to-bygonz'
import { BlockParams, BlockVM } from './LogSeqBlock'

const { ERROR, WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { prefix: '[DB]', performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars
type ChangeEvent = Parameters<Parameters<typeof logseq.DB.onChanged>[0]>[0]

export async function handleDBChangeEvent (event: ChangeEvent, blocksDB: BlocksDB) {
  const {
    blocks,
    txData, // entityID, attribute, value, transaction, op(false=before,true=after)
    txMeta,
  } = event
  DEBUG(`handleChange${txMeta?.outlinerOp ? ` (op=${txMeta?.outlinerOp})` : ''}`, event)
  if (!txData) return

  // Index data
  const atomsByEntityID = groupBy(txData, '[0]')
  const entitiesByID = mapValues(groupBy(blocks, 'id'), matches => {
    if (matches.length > 1) throw new Error('Multiple blocks with same ID')
    return matches[0]
  })
  DEBUG({ atomsByEntityID, entitiesByID })
  const changeSetByEntityID: Record<string, Partial<BlockVM>> = {}
  // Iterate over individual entities
  for (const [entityID, atoms] of Object.entries(atomsByEntityID)) {
    const entity = entitiesByID[entityID]
    const [bygonzID, eachChangeSet] = await mapAtomsToDBChangeSet(entity, atoms, entityID, txMeta, blocksDB)
    if (eachChangeSet) changeSetByEntityID[bygonzID] = eachChangeSet
    // if (txMeta?.outlinerOp === 'saveBlock') {
    //   const contentChanges = atomsForAttribute('content')
    // } else if (txMeta?.outlinerOp === 'moveBlocks') {
  }

  console.groupCollapsed('[DB transaction]', changeSetByEntityID)
  try {
    await blocksDB.transaction('rw', blocksDB.Blocks, async () => {
      for (const [bygonzID, changeSet] of Object.entries(changeSetByEntityID)) {
        DEBUG({ bygonzID, changeSet })
        await blocksDB.Blocks.update(bygonzID, changeSet)
      }
    })
  } finally {
    console.groupEnd()
  }
}
async function mapAtomsToDBChangeSet (
  entity: BlockEntity,
  atoms: IDatom[],
  entityID: string,
  txMeta: { [key: string]: unknown, outlinerOp: string } | undefined,
  blocksDB: BlocksDB,
) {
  const bygonzID = entity.properties?.bygonz ?? entity.uuid
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

  //   const attrWhitelist = ['content', 'parent', 'left']
  const attrsToCheck = Object.keys(atomsByAttribute)// .filter(a => attrWhitelist.includes(a))
  const changeSet: Partial<BlockVM> = {}
  for (const attr of attrsToCheck) {
    const [before, after] = atomsForAttribute(attr)
    // DEBUG(`Changed? '${attr}' `, after, { before, entity, bygonzID })
    // if (after.length) {
    const dbBefore = (await blocksDB.Blocks.get(bygonzID))?.[attr]
    DEBUG(`Saving new '${attr}' value:`, after, { entity, bygonzID })
    if (!((await allPromises(before.map(async v => await mapBlockValueToBygonzValue(attr, v)))).includes(dbBefore))) {
      WARN('vm state was different than \'before\' of DB change:', { before, dbBefore, bygonzID, entity })
    }
    const newVal = after[0]
    const mappedNewVal = await mapBlockValueToBygonzValue(attr, newVal)
    DEBUG(`Mapped value for '${attr}':`, mappedNewVal)
    if (mappedNewVal) {
      changeSet[attr] = mappedNewVal
    }
    // }
  }
  return [bygonzID, changeSet]
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

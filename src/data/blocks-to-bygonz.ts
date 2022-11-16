import { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { BlocksDB } from './bygonz'
import { BlockParams, BlockVM } from './LogSeqBlock'
import { detailedDiff } from 'deep-object-diff'

import { debounce, remove, pull } from 'lodash-es'
import { Logger } from 'logger'
import { sleep } from 'bygonz'

const { ERROR, WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars

export interface BlockWithChildren extends /* Omit< */BlockEntity/* , 'children'> */ {
  children: BlockWithChildren[]
}

const matchesBygonzID = (child: BlockEntity, bygonzID: string) =>
  child.uuid === bygonzID || child.properties?.bygonz === bygonzID

export const saveBlockRecursively = debounce(async (currentBlock: BlockEntity, blocksDB: BlocksDB) => {
  console.groupCollapsed('Initiating save from:', currentBlock)
  try {
    await _saveBlockRecursively(currentBlock, blocksDB)
  } finally { console.groupEnd() }
}, 1000) as (currentBlock: BlockEntity, blocksDB: BlocksDB) => void // remove the Promise, as debounce won't let us wait for it

export async function _saveBlockRecursively (currentBlock: BlockEntity, blocksDB: BlocksDB) {
  DEBUG('Saving block recursion:', { currentBlock })
  const currentBlockWithKids = await logseq.Editor
    .getBlock(currentBlock?.uuid, { includeChildren: true }) as BlockWithChildren
  DEBUG({ currentBlockWithKids })
  const { children } = currentBlockWithKids

  let bygonzID = currentBlock.uuid
  if (currentBlock.properties?.bygonz) {
    DEBUG('Using bygonz override UUID:', { currentBlock })
    // HACK workaround for https://github.com/logseq/logseq/issues/7283
    // TODO: if this were to become a serious implementation necessity, we'd also need to map e.g. references in the content
    bygonzID = currentBlock.properties.bygonz
  }

  // persist UUID - https://github.com/logseq/logseq/issues/4141
  if (!currentBlock.properties?.id && !currentBlock.properties?.bygonz) {
    DEBUG('Pinning UUID:', currentBlock)
    await logseq.Editor.upsertBlockProperty(currentBlock.uuid, 'id', currentBlock.uuid)
  }

  const mappedBlockObj = await mapBlockToBlockVM(bygonzID, currentBlock, true)
  const currentBlockByg = await blocksDB.Blocks.get(bygonzID)
  if (!currentBlockByg) {
    await blocksDB.Blocks.add(mappedBlockObj)
    DEBUG('adding', { mappedBlockObj })
  } else {
    const diff = detailedDiff(currentBlockByg as object, mappedBlockObj as object) as { added: Partial<BlockParams>, updated: Partial<BlockParams> }
    DEBUG({ currentBlockByg, diff })
    const updateObj = { ...diff.added, ...diff.updated }
    // TODO: handle deleted ?
    if (Object.keys(updateObj).length) {
      DEBUG('updating with', { updateObj })

      await blocksDB.Blocks.update(bygonzID, updateObj)
    }
  }

  const unseenVMChildren = await (await blocksDB.Blocks.filter(b => b.parent === bygonzID)).toArray()
  DEBUG('VM children:', unseenVMChildren)
  const idToBygonzId = new Map([currentBlockWithKids, ...currentBlockWithKids.children]
    .map(child => [child.id, child.properties?.bygonz ?? child.uuid]))
  for (const child of children) {
    DEBUG('Recursing into child:', child)
    remove(unseenVMChildren, { uuid: child.uuid })
    // @ts-expect-error
    child.parent = bygonzID // we map parent-child relationship with possibly different set of IDs
    const leftAsBygonzID = idToBygonzId.get(child.left.id)
    if (!leftAsBygonzID) throw new Error(`Failed to lookup child's left.id ${child.left.id}`)
    child.left = leftAsBygonzID
    await _saveBlockRecursively(child, blocksDB)
  }
  DEBUG('Unseen (i.e. removed) VM children:', unseenVMChildren)
  for (const childVM of unseenVMChildren) {
    await blocksDB.Blocks.update(childVM.uuid, { isDeleted: true })
  }
}

export async function mapBlockValueToBygonzValue (attribute: string, inputVal: any): Promise<any | undefined> {
  if (attribute === 'children' || attribute === 'uuid') {
    return undefined
  } else if (['parent', 'left'].includes(attribute) && // we actually set parent in the for (child of children), because here we only have the :db/id, and this way we save ourselves a lookup
    typeof inputVal !== 'string' // HACK from logseq, it's an object, when we set it, it's a UUID string
  ) {
    const id = typeof inputVal === 'number' ? inputVal : inputVal.id
    VERBOSE(`Lookup uuid for ${attribute}`, id)
    const block = (await logseq.Editor.getBlock(id))
    if (!block) { ERROR(inputVal); throw new Error(`Failed to lookup by db id ${id}`) }
    return block.properties?.bygonz ?? block.uuid
  } else if (attribute === 'content') {
    return inputVal
      .replaceAll(/\n[^\n]+::[^\n]+/g, '') // HACK removes md props
      .replaceAll(/:PROPERTIES:.+:END:/gis, '').trim() // HACK removes org mode props
  } else {
    return inputVal
  }
}

export async function mapBlockToBlockVM (bygonzID: string, block: BlockEntity, skipParentLeft = false): Promise<BlockParams> {
  const mappedBlockObj: Partial<BlockParams> = { uuid: bygonzID /*, ':db/id': targetBlock.id */ }
  for (const eachKey of Object.keys(block)) {
    const inputVal = block[eachKey]
    if (skipParentLeft && ['parent', 'left'].includes(eachKey) && typeof inputVal !== 'string') continue
    const mappedVal = await mapBlockValueToBygonzValue(eachKey, inputVal)
    if (mappedVal !== undefined) {
      mappedBlockObj[`${eachKey}`] = mappedVal
    }
  }
  return mappedBlockObj as BlockParams
}

export async function initiateLoadFromBlock (block: BlockEntity, blockVMs: BlockVM[]) {
  console.groupCollapsed('Initiating load from:', block)
  try {
    const t = performance.now()
    const blockWithChildren = await logseq.Editor
      .getBlock(block.uuid, { includeChildren: true }) as BlockWithChildren
    DEBUG('CURRENT w/c:', blockWithChildren, (performance.now() - t))

    // t = performance.now()
    // const recursiveDatalog = await logseq.DB.datascriptQuery(`
    //   [:find [(pull ?b [*]) (pull ?c [*])]
    //     :where
    //     [?b :block/uuid "${block.uuid}"]
    //     [?c :block/parent ?b]]
    // `) // [or (?d :block/parent ?d) (?d :block/parent ?c)]]
    // DEBUG('CURRENT from datalog:', recursiveDatalog, (performance.now() - t))

    await loadBlocksRecursively(blockWithChildren, blockVMs)

    // await logseq.Editor.upsertBlockProperty(currentBlock.uuid, 'id', 'f39e6a9e-863b-44d4-9fe9-10c985d100eb')
    // // Delete all children 😈
    // for (const block of flatMapRecursiveChildren(currentBlockWithChildren)) {
    //   if (block === currentBlockWithChildren) continue
    //   DEBUG('REMOVING', block)
    //   await logseq.Editor.removeBlock(block.uuid)
    // }
  } finally { console.groupEnd() }
}

export async function loadBlocksRecursively (
  currentBlock: BlockWithChildren,
  blockVMs: BlockVM[],
  currentVM: BlockVM | undefined = undefined,
  recursion = 0,
  rootBlockUUID = currentBlock.uuid,
) {
  if (recursion > 10) throw new Error('Recursion limit reached')
  if (!currentVM) {
    VERBOSE('no vm passed', { currentBlock, blockVMs })
    if (recursion !== 0) throw new Error('empty targetVM but inside recursion')
    currentVM = blockVMs.find(b => (
      b.uuid === currentBlock.uuid ||
      b.uuid === currentBlock.properties?.bygonz
    ))
    if (!currentVM) throw new Error('still no vm found') // TODO: show alert
  }

  // Update self
  DEBUG(`Updating ${currentBlock.uuid}`, { currentBlock, currentVM, blockVMs })
  await logseq.Editor.updateBlock(
    currentBlock.uuid,
    currentVM.content, // TODO: check if different at all
    /* { properties:  currentBlock.properties { foo: 'bar' } } */ // TODO DOESN'T WORK
  )
  await logseq.Editor.upsertBlockProperty(currentBlock.uuid, 'bygonz', currentVM.uuid)

  // TODO ... oh and also all the other props
  // await sleep(1000)

  // Add / Update children
  const childVMs = blockVMs
    .filter(b => b.parent === currentVM!.uuid)
  const unseenChildren = currentBlock.children
  for (const childVM of childVMs) {
    DEBUG('Updating childVM', childVM)
    const matchingBlock: BlockWithChildren | undefined | null = unseenChildren
      .find(child => matchesBygonzID(child, childVM.uuid))
    DEBUG('Matching child?', matchingBlock)
    if (!matchingBlock) {
      if (childVM.isDeleted) {
        DEBUG('Did not find block for deleted childVM, so skipping', { childVM, matchingBlock })
        continue
      }
      // Create it
      DEBUG('Creating child:', currentBlock.uuid, childVM.content/*  { sibling: false/* , customUUID: childVM.uuid * /, properties: { id: childVM.uuid } } */)
      const newBlock = await logseq.Editor.insertBlock(
        currentBlock.uuid,
        childVM.content,
        // 'parent': we don't need to set it because we're already putting it in the right place
        { sibling: false/* , customUUID: childVM.uuid */, properties: { /* id: childVM.uuid, */ bygonz: childVM.uuid } },
      )
      DEBUG('Insert result:', { newBlock })
      if (!newBlock) { ERROR('empty insert result for', { childVM }); throw new Error('Empty insert result') }
      // await sleep(1000)

      // DEBUG('Pinning UUID:', childVM.uuid, 'on', newBlock)
      // await logseq.Editor.upsertBlockProperty(newBlock.uuid, 'bygonz', childVM.uuid)
      // await sleep(500)
      // await logseq.Editor.upsertBlockProperty(newBlock.uuid, 'uuid', childVM.uuid)
      // await sleep(2500)
      // DEBUG('get by old 1 ?', await logseq.Editor.getBlock(newBlock.uuid)) /* throw new Error('Empty get afert insert') */
      // matching = await logseq.Editor.getBlock(childVM.uuid/* , { includeChildren: true } */) as BlockWithChildren
      // if (!matching) {
      //   ERROR('empty get afert insert', { childVM, newBlock }) /* throw new Error('Empty get afert insert') */
      //   DEBUG('get by old 2 ?', await logseq.Editor.getBlock(newBlock.uuid)) /* throw new Error('Empty get afert insert') */
      //   matching = { ...newBlock, uuid: newBlock.uuid, children: [] } as BlockWithChildren
      // } else DEBUG('insert->getBlock result:', matching)

      await loadBlocksRecursively({ ...newBlock, children: [] }, blockVMs, childVM, recursion + 1, rootBlockUUID)
    } else {
      if (childVM.isDeleted) {
        DEBUG('Found matching block for deleted childVM, so deleting it', { childVM, matchingBlock })
        await logseq.Editor.removeBlock(matchingBlock.uuid)
        continue
      }
      // Remove from unseen children list
      pull(unseenChildren, matchingBlock)
      await loadBlocksRecursively(matchingBlock, blockVMs, childVM, recursion + 1, rootBlockUUID)
    }
  }

  // Delete unseen
  if (unseenChildren.length) {
    DEBUG(`Removing unseen children of '${currentBlock.uuid}':`, unseenChildren)
    for (const child of unseenChildren) {
      await logseq.Editor.removeBlock(child.uuid)
    }
  }

  // Update order
  // TODO: Optimizable to a clever algorithm (but I want to get it to work before optimizing :P)
  const updatedBlockWithChildren = await logseq.Editor.getBlock(currentBlock.uuid, { includeChildren: true }) as BlockWithChildren
  if (!updatedBlockWithChildren) throw new Error(`Can't get updated currentBlock ${currentBlock.uuid}`)
  DEBUG('Checking if sibling order is correct', { updatedBlockWithChildren })
  const idToBygonzId = new Map([updatedBlockWithChildren, ...updatedBlockWithChildren.children]
    .map(child => [child.id, child.properties?.bygonz ?? child.uuid]))
  for (const childVM of childVMs) {
    if (childVM.isDeleted) {
      continue
    }
    DEBUG('Checking orderliness of childVM', childVM)
    const matchingBlock: BlockWithChildren | undefined | null = updatedBlockWithChildren.children
      .find(child => matchesBygonzID(child, childVM.uuid))
    if (!matchingBlock) throw new Error(`Failed to find block for childVM in ordering step ${childVM.uuid}`)
    const currentLeftAsBygonzId = idToBygonzId.get(matchingBlock.left.id)
    if (!currentLeftAsBygonzId) throw new Error(`Failed to look up left.id ${matchingBlock.left.id} for childBlock in ordering step`)
    const matches = childVM.left === currentLeftAsBygonzId
    DEBUG('Checking if left matches', matches, { currentLeftUuid: currentLeftAsBygonzId, childVM, matchingBlock })
    if (!matches) {
      if (childVM.left === idToBygonzId.get(matchingBlock.parent.id)) {
        DEBUG('childVM.left is parent, so moving as first child', { matchingBlock, updatedBlockWithChildren })
        await logseq.Editor.moveBlock(matchingBlock.uuid, updatedBlockWithChildren.uuid, { children: true /* i.e. move as a child */ })
      } else {
        const realUuidForLeft = updatedBlockWithChildren.children
          .find(child => matchesBygonzID(child, childVM.left))?.uuid
        if (!realUuidForLeft) {
          /* throw new Error  */ERROR(`Failed to find real sibling for childVM.left ${JSON.stringify(childVM.left)}`, updatedBlockWithChildren)
          continue // for now, ignore glitches (as we're missing stable transactions)
        }
        DEBUG('childVM.left is sibling, so moving after it', { matchingBlock, realUuidForLeft })
        await logseq.Editor.moveBlock(matchingBlock.uuid, realUuidForLeft)
      }
    }
  }
}

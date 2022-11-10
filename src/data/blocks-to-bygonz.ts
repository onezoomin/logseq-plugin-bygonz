import { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { BlocksDB } from './bygonz'
import { BlockParams, BlockVM } from './LogSeqBlock'
import { detailedDiff } from 'deep-object-diff'

import { debounce, remove } from 'lodash-es'
import { Logger } from 'logger'
import { sleep } from 'bygonz'

const { ERROR, WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars

export interface BlockWithChildren extends /* Omit< */BlockEntity/* , 'children'> */ {
  children: BlockWithChildren[]
}

export const saveBlockRecursively = debounce(async (currentBlock: BlockEntity, blocksDB: BlocksDB) => {
  console.groupCollapsed('Initiating save from:', currentBlock)
  try {
    await _saveBlockRecursively(currentBlock, blocksDB)
  } finally { console.groupEnd() }
}, 1000)

export async function _saveBlockRecursively (currentBlock: BlockEntity, blocksDB: BlocksDB) {
  DEBUG('Saving block recursion:', { currentBlock })
  const currentBlockWithKids = await logseq.Editor
    .getBlock(currentBlock?.uuid, { includeChildren: true }) as BlockWithChildren
  console.log({ currentBlockWithKids })
  const { children } = currentBlockWithKids

  let bygonzID = currentBlock.uuid
  if (currentBlock.properties?.bygonz) {
    DEBUG('Using bygonz override UUID:', { currentBlock })
    // HACK workaround for https://github.com/logseq/logseq/issues/7283
    // TODO: if this were to become a serious implementation necessity, we'd also need to map e.g. references in the content
    bygonzID = currentBlock.properties.bygonz
  }
  const currentBlockByg = await blocksDB.Blocks.get(bygonzID)
  const mappedBlockObj: Partial<BlockParams> = { uuid: bygonzID /*, ':db/id': targetBlock.id */ }
  for (const eachKey of Object.keys(currentBlock)) {
    if (eachKey === 'children' || eachKey === 'uuid') {
      continue
    } else if (
      eachKey === 'parent' && // we actually set parent in the for (child of children), because here we only have the :db/id, and this way we save ourselves a lookup
        typeof currentBlock[eachKey] !== 'string' // from logseq, it's an object, when we set it, it's a string
    ) {
      continue
    } else if (eachKey === 'content') {
      mappedBlockObj[`${eachKey}`] = currentBlock[eachKey]
        .replaceAll(/\n[^\n]+::[^\n]+/g, '') // HACK removes md props
        .replaceAll(/:PROPERTIES:.+:END:/gis, '').trim() // HACK removes org mode props
    } else {
      mappedBlockObj[`${eachKey}`] = currentBlock[eachKey]
    }
  }

  // persist UUID - https://github.com/logseq/logseq/issues/4141
  if (!currentBlock.properties?.id && !currentBlock.properties?.bygonz) {
    DEBUG('Pinning UUID:', currentBlock)
    await logseq.Editor.upsertBlockProperty(currentBlock.uuid, 'id', currentBlock.uuid)
  }

  if (!currentBlockByg) {
    await blocksDB.Blocks.add(mappedBlockObj as BlockParams)
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
  for (const child of children) {
    DEBUG('Recursing into child:', child)
    remove(unseenVMChildren, { uuid: child.uuid })
    // @ts-expect-error
    child.parent = bygonzID // we map parent-child relationship with possibly different set of IDs
    await _saveBlockRecursively(child, blocksDB)
  }
  DEBUG('Unseen (i.e. removed) VM children:', unseenVMChildren)
  for (const childVM of unseenVMChildren) {
    await blocksDB.Blocks.update(childVM.uuid, { isDeleted: true })
  }
}

export async function initiateLoadFromBlock (block: BlockEntity, blockVMs: BlockVM[]) {
  console.groupCollapsed('Initiating load from:', block)
  try {
    const blockWithChildren = await logseq.Editor
      .getBlock(block?.uuid, { includeChildren: true }) as BlockWithChildren
    DEBUG('CURRENT w/c:', blockWithChildren)

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
    if (!currentVM) throw new Error('still no vm found') // TODO:  show alert
  }

  // Update self
  DEBUG('Updating', currentBlock, '- matching VM:', currentVM, { blockVMs })
  await logseq.Editor.updateBlock(
    currentBlock.uuid,
    currentVM.content, // TODO: check if different at all
    /* { properties:  currentBlock.properties { foo: 'bar' } } */ // TODO DOESN'T WORK
  )
  await logseq.Editor.upsertBlockProperty(currentBlock.uuid, 'bygonz', currentVM.uuid)

  // TODO ... oh and also all the other props
  // await sleep(1000)

  // Find & update children
  const childVMs = blockVMs
    .filter(b => b.parent === currentVM!.uuid)
  for (const childVM of childVMs) {
    DEBUG('Updating childVM', childVM)
    const matching: BlockWithChildren | undefined | null = currentBlock.children
      .find(child => (
        child.uuid === childVM.uuid ||
        child.properties?.bygonz === childVM.uuid
      ))
    DEBUG('Matching child?', matching)
    if (!matching) {
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
      await loadBlocksRecursively(matching, blockVMs, childVM, recursion + 1, rootBlockUUID)
    }
  }
}

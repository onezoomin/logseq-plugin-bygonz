import { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { BlocksDB } from './bygonz'
import { BlockParams, BlockVM } from './LogSeqBlock'
import { detailedDiff } from 'deep-object-diff'

import { Logger } from 'logger'
import { sleep } from 'bygonz'

const { ERROR, WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars

export interface BlockWithChildren extends /* Omit< */BlockEntity/* , 'children'> */ {
  children: BlockWithChildren[]
}

export async function saveBlockRecursively (currentBlock: BlockEntity, blocksDB: BlocksDB) {
  const currentBlockWithKids = await logseq.Editor
    .getBlock(currentBlock?.uuid, { includeChildren: true }) as BlockWithChildren
  console.log({ currentBlockWithKids })
  const { children } = currentBlockWithKids

  const currentBlockByg = await blocksDB.Blocks.get(currentBlock.uuid)
  const mappedBlockObj: Partial<BlockParams> = { uuid: currentBlock.uuid /*, ':db/id': targetBlock.id */ }
  for (const eachKey of Object.keys(currentBlock)) {
    if (eachKey === 'children' /* || eachKey === 'parent' */) {
      continue
    } else if (eachKey === 'parent' && typeof currentBlock[eachKey] !== 'string') {
    //   mappedBlockObj[`${eachKey}`] = await logseq.Editor.getBlockProperty(targetBlock[eachKey].id, 'uuid')
      continue
    } else {
      mappedBlockObj[`${eachKey}`] = currentBlock[eachKey]
    } // HACK Does this mapping make sense?
  }

  // persist UUID - https://github.com/logseq/logseq/issues/4141
  if (!currentBlock.properties?.id) {
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

      await blocksDB.Blocks.update(currentBlock.uuid, updateObj)
    }
  }

  for (const child of children) {
    DEBUG('Recursing into child:', child)
    // @ts-expect-error
    child.parent = currentBlock.uuid
    await saveBlockRecursively(child, blocksDB)
  }
}

export async function loadBlocksRecursively (
  currentBlock: BlockWithChildren,
  blockVMs: BlockVM[],
  currentVM: BlockVM | undefined = undefined,
  recursion = 0,
) {
  if (recursion > 10) throw new Error('Recursion limit reached')
  if (!currentVM) {
    VERBOSE('no vm passed', { currentBlock, blockVMs })
    if (recursion !== 0) throw new Error('empty targetVM but inside recursion')
    currentVM = blockVMs.find(b => b.uuid === currentBlock.uuid)
    if (!currentVM) {
      VERBOSE('still no vm found')
      const matchingVMs = blockVMs.filter(b => !b.parent) // in bygonz the root nodes don't have a parent
      if (matchingVMs.length !== 1) { ERROR('Blocks list:', blockVMs); throw new Error(`Failed to determine root block in blocks list (${matchingVMs.length} matches)`) }
      currentVM = matchingVMs[0]
    }
  }

  // Update self
  DEBUG('Updating', currentBlock, '- matching VM:', currentVM, { blockVMs })
  // await logseq.Editor.upsertBlockProperty(currentBlock.uuid, 'content', currentVM.content) // TODO: check if different at all
  // TODO ... oh and also all the other props
  // await sleep(500)

  // Find & update children
  const childVMs = blockVMs
    .filter(b => b.parent === currentVM!.uuid)
  for (const childVM of childVMs) {
    const matching: BlockWithChildren | undefined | null = currentBlock.children
      .find(child => (
        child.uuid === childVM.uuid ||
        child.properties?.bygonz === childVM.uuid
      ))
    DEBUG('Updating child:', matching, 'from', childVM)
    if (!matching) {
      // Create it
      DEBUG('Creating child:', currentBlock.uuid, childVM.content/*  { sibling: false/* , customUUID: childVM.uuid * /, properties: { id: childVM.uuid } } */)
      const newBlock = await logseq.Editor.insertBlock(
        currentBlock.uuid,
        childVM.content,
        { sibling: false/* , customUUID: childVM.uuid */, properties: { /* id: childVM.uuid, */ bygonz: childVM.uuid } },
      )
      DEBUG('Insert result:', { newBlock })
      await sleep(500)
      if (!newBlock) { ERROR('empty insert result for', { childVM }); throw new Error('Empty insert result') }

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

      await loadBlocksRecursively({ ...newBlock, children: [] }, blockVMs, childVM, recursion + 1)
    } else {
      await loadBlocksRecursively(matching, blockVMs, childVM, recursion + 1)
    }
  }
}

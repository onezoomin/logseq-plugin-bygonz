import { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { BlocksDB } from './bygonz'
import { BlockParams, BlockVM } from './LogSeqBlock'
import { detailedDiff } from 'deep-object-diff'

import { Logger } from 'logger'

const { ERROR, WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars

export interface BlockWithChildren extends /* Omit< */BlockEntity/* , 'children'> */ {
  children: BlockWithChildren[]
}

export async function saveBlockRecursively (targetBlock: BlockEntity, blocksDB: BlocksDB) {
  const currentBlockWithKids = await logseq.Editor
    .getBlock(targetBlock?.uuid, { includeChildren: true }) as BlockWithChildren
  console.log({ currentBlockWithKids })
  const { children } = currentBlockWithKids

  const currentBlockByg = await blocksDB.Blocks.get(targetBlock.uuid)
  const mappedBlockObj: Partial<BlockParams> = { uuid: targetBlock.uuid /*, ':db/id': targetBlock.id */ }
  for (const eachKey of Object.keys(targetBlock)) {
    if (eachKey === 'children' /* || eachKey === 'parent' */) {
      continue
    } else if (eachKey === 'parent' && typeof targetBlock[eachKey] !== 'string') {
    //   mappedBlockObj[`${eachKey}`] = await logseq.Editor.getBlockProperty(targetBlock[eachKey].id, 'uuid')
      continue
    } else {
      mappedBlockObj[`${eachKey}`] = targetBlock[eachKey]
    } // HACK Does this mapping make sense?
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

      await blocksDB.Blocks.update(targetBlock.uuid, updateObj)
    }
  }

  for (const child of children) {
    DEBUG('Recursing into child:', child)
    // @ts-expect-error
    child.parent = ID
    await saveBlockRecursively(child, blocksDB)
  }
}

export async function loadBlocksRecursively (currentBlock: BlockWithChildren, blockVMs: BlockVM[], currentVM: BlockVM | undefined = undefined, recursion = 0) {
  if (recursion > 10) throw new Error('Recursion limit reached')
  if (!currentVM) {
    if (recursion !== 0) throw new Error('empty targetVM but inside recursion')
    currentVM = blockVMs.find(b => b.ID === currentBlock.uuid)
    if (!currentVM) {
      const matchingVMs = blockVMs.filter(b => !b.parent) // in bygonz the root nodes don't have a parent
      if (matchingVMs.length !== 1) { ERROR('Blocks list:', blockVMs); throw new Error(`Failed to determine root block in blocks list (${matchingVMs.length} matches)`) }
      currentVM = matchingVMs[0]
    } else { throw new Error(`${recursion === 0 ? 'Root ' : ''}Block ${currentBlock.uuid} has no matching VM`) }
  }

  // Update self
  DEBUG('Updating', currentBlock, '- matching VM:', currentVM, { blockVMs })
  await logseq.Editor.updateBlock(currentBlock.uuid, currentVM.content)

  // Find & update children
  const childVMs = blockVMs
    .filter(b => b.parent === currentVM!.ID)
  for (const childVM of childVMs) {
    let matching: BlockWithChildren | undefined | null = currentBlock.children.find(child => child.uuid === childVM.uuid)
    DEBUG('Updating child:', matching, 'from', childVM)
    if (!matching) {
      // Create it
      DEBUG('Creating child:', currentBlock.uuid, childVM.content, { sibling: false, customUUID: childVM.uuid /*, properties: { TODO } */ })
      const newBlock = await logseq.Editor.insertBlock(
        currentBlock.uuid,
        childVM.content,
        { sibling: false, customUUID: childVM.uuid /*, properties: { TODO } */ },
      )
      ERROR('empty insert result for', childVM)
      if (!newBlock) throw new Error('Empty insert result')
      matching = await logseq.Editor.getBlock(newBlock.uuid, { includeChildren: true }) as BlockWithChildren
    }
    await loadBlocksRecursively(matching, blockVMs, childVM, recursion + 1)
  }
}

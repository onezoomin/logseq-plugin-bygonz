import { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { BlocksDB } from './bygonz'
import { BlockParams, BlockVM } from './LogSeqBlock'
import { detailedDiff } from 'deep-object-diff'

import { Logger } from 'logger'
const { WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars

export type BlockWithChildren = BlockEntity & { children: BlockWithChildren[] }

export async function saveBlockRecursively (targetBlock: BlockEntity, blocksDB: BlocksDB) {
  const ID = targetBlock.uuid
  const currentBlockWithKids = await logseq.Editor
    .getBlock(targetBlock?.uuid, { includeChildren: true }) as BlockWithChildren
  console.log({ currentBlockWithKids })
  const { children } = currentBlockWithKids

  const currentBlockByg = await blocksDB.Blocks.get(ID)
  const mappedBlockObj: Partial<BlockParams> = { ID, ':db/id': targetBlock.id }
  for (const eachKey of Object.keys(targetBlock)) {
    if (eachKey === 'children' /* || eachKey === 'parent' */) {
      continue
    } else if (eachKey === 'parent' && typeof targetBlock[eachKey] !== 'string') {
    //   mappedBlockObj[`:block/${eachKey}`] = await logseq.Editor.getBlockProperty(targetBlock[eachKey].id, 'uuid')
      continue
    } else {
      mappedBlockObj[`:block/${eachKey}`] = targetBlock[eachKey]
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

      await blocksDB.Blocks.update(ID, updateObj)
    }
  }

  for (const child of children) {
    DEBUG('Recursing into child:', child)
    // @ts-expect-error
    child.parent = ID
    await saveBlockRecursively(child, blocksDB)
  }
}

export async function loadBlocksAndChildren (targetBlock: BlockEntity, blocks: BlockVM[]) {
//   const parentIDs = blocks.map(b => b[':block/parent'])
  const matchingRoots = blocks
  // .filter(b => b.ID === currentBlock.uuid)
    // .filter(b => !parentIDs.includes(b.ID))
    .filter(b => !b[':block/parent'])
  DEBUG('Found root block matching?:', matchingRoots/* , parentIDs */)

  if (matchingRoots.length) {
    await logseq.Editor.updateBlock(targetBlock.uuid, matchingRoots[0][':block/content'])
    await loadBlocksChildrenRecursively(targetBlock, blocks)
  }
}

async function loadBlocksChildrenRecursively (targetBlock: Pick<BlockEntity, 'uuid'>, blocks: BlockVM[]) {
  const children = blocks
    //   .filter(b => b.ID !== matchingRoots[0].ID)
    .filter(b => b[':block/parent'] === targetBlock.uuid)
    .map(b => ({
      uuid: b[':block/uuid'],
      content: b[':block/content'],
      // parent: b[':block/parent'],
      // children?: Array<BlockEntity | BlockUUIDTuple>;
    }))
  const insert = await logseq.Editor.insertBatchBlock(targetBlock.uuid, children, { sibling: false })
  DEBUG('children inserted:', children, insert)

  for (const child of children) {
    DEBUG('Recursing into child:', child)
    await loadBlocksChildrenRecursively(child, blocks)
  }
}

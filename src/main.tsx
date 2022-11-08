import '@logseq/libs'

import React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import { logseq as PL } from '../package.json'
import { BlockEntity, SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'

import { BlocksDB, getInitializedBlocksDB } from './data/bygonz'
import { BlockParams, BlockVM } from './data/LogSeqBlock'

import { detailedDiff } from 'deep-object-diff'

// import { initIPFS, loadBlockFromIPFS } from './data/ipfs'
import { Logger } from 'logger'
import { Buffer } from 'buffer'
import { BlockWithChildren, loadBlocksAndChildren, saveBlockRecursively } from './data/blocks-to-bygonz'
import { flatMapRecursiveChildren } from './utils'
globalThis.Buffer = Buffer

const { WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars

const settings: SettingSchemaDesc[] = [
  {
    title: 'Bygonz Sync Interval',
    key: 'Bygonz Sync Interval',
    type: 'number',
    default: 60,
    description: 'Set the length of time between sync polling in seconds',
  },
]

const css = (t, ...args) => String.raw(t, ...args)

const pluginId = PL.id
let blocksDB: BlocksDB

function main () {
  console.info(`#${pluginId}: MAIN`)
  logseq.useSettingsSchema(settings)

  const root = ReactDOM.createRoot(document.getElementById('app')!)

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

  function createModel () {
    return {
      show () {
        logseq.showMainUI()
      },
    }
  }

  logseq.provideModel(createModel())
  logseq.setMainUIInlineStyle({
    zIndex: 11,
  })

  const openIconName = 'template-plugin-open'

  logseq.provideStyle(css`
    .${openIconName} {
      opacity: 0.55;
      font-size: 20px;
      margin-top: 4px;
    }

    .${openIconName}:hover {
      opacity: 0.9;
    }

    .tag {
      border: 1px dotted purple;
      border-radius: 12px;
      padding-x: 4px;
    }
  `)

  logseq.Editor.registerSlashCommand('ipfs', async (e) => {
    const maybeCid = (await logseq.Editor.getEditingBlockContent()).trim()
    const currentBlock = await logseq.Editor.getCurrentBlock()
    console.log('slash command', e, { maybeCid, currentBlock })
    if (!currentBlock) throw new Error('no current block')
    throw new Error('TODO')

    // const targetBlock = await logseq.Editor.insertBlock(targetBlock.uuid, '🚀 Fetching ...', { before: true })
    // if (!targetBlock) throw new Error('Insert result is null')

    // /* const blocks: IBatchBlock[] =  */await loadBlockFromIPFS(maybeCid, currentBlock)
    // await logseq.Editor.insertBatchBlock(targetBlock.uuid, blocks, {
    //   sibling: false,
    // })
  })

  logseq.provideModel({
    async startPomoTimer (e: any) {
      const { pomoId, slotId, blockUuid } = e.dataset
      const startTime = Date.now()

      const block = await logseq.Editor.getBlock(blockUuid)
      const flag = `{{renderer :pomodoro_${pomoId}`
      const newContent = block?.content?.replace(`${flag}}}`,
        `${flag},${startTime}}}`)
      if (!newContent) return
      await logseq.Editor.updateBlock(blockUuid, newContent)
      renderTimer({ pomoId, slotId, startTime })
    },

    async bygonzReset () {
      await indexedDB.deleteDatabase('BygonzBlocks')
      await indexedDB.deleteDatabase('BygonzLogDB_BygonzBlocks')
      await indexedDB.deleteDatabase('bygonz_ipfs_persist')
      // window.parent.location.reload()
      // await logseq.App.relaunch()
      WARN('reload please 💁')
    },
    async bygonzSave () {
      const currentBlock = await logseq.Editor.getCurrentBlock()
      if (currentBlock) {
        await saveBlockRecursively(currentBlock, blocksDB)
      }
    },

    async bygonzLoad () {
      // LOG('Triggering SYNC') // ? I think this was a brainfart...
      // await blocksDB.triggerSubscriptionSync()

      const currentBlock = await logseq.Editor.getCurrentBlock()
      if (currentBlock) {
        const currentBlockWithKids = await logseq.Editor
          .getBlock(currentBlock?.uuid, { includeChildren: true }) as BlockWithChildren

        // Delete all children 😈
        for (const block of flatMapRecursiveChildren(currentBlockWithKids)) {
          if (block === currentBlockWithKids) continue
          DEBUG('REMOVING', block)
          await logseq.Editor.removeBlock(block.uuid)
        }

        DEBUG('DB:', blocksDB)
        const entitiesResult = await blocksDB.getEntitiesAsOf()
        DEBUG('Blocks:', entitiesResult)
        const newBlocks: BlockVM[] = entitiesResult.entityArray
        await loadBlocksAndChildren(currentBlock, newBlocks)

        LOG('SYNC done 🎉')
      }
    },
  })

  function renderTimer ({
    pomoId, slotId,
    startTime, durationMins,
  }: any) {
    if (!startTime) return
    const durationTime = (durationMins || logseq.settings?.pomodoroTimeLength || 25) * 60 // default 20 minus
    const keepKey = `${logseq.baseInfo.id}--${pomoId}` // -${slotId}
    // const keepOrNot = () => logseq.App.queryElementById(keepKey)

    logseq.provideUI({
      key: pomoId,
      slot: slotId,
      reset: true,
      template: '<a class="pomodoro-timer-btn is-done">🍅 ✅</a>',
    })
  }

  logseq.App.onMacroRendererSlotted(({ slot, payload }) => {
    const [type, startTime, durationMins] = payload.arguments
    if (!type?.startsWith(':bygonz_')) return
    const identity = type.split('_')[1]?.trim()
    if (!identity) return
    const pomoId = `bygonz_${identity}`
    if (!startTime?.trim()) {
      return logseq.provideUI({
        key: pomoId,
        slot,
        reset: true,
        template: `
        <button
          class="pomodoro-timer-btn is-start mr-2 bg-green-200"
          style="border: 1px dashed lightgrey; padding: 0.5rem 1rem;border-radius: 0.5rem;"
          data-slot-id="${slot}" 
          data-pomo-id="${pomoId}"
          data-block-uuid="${payload.uuid}"
          data-on-click="bygonzSave"
          >save to bygonz</button>
        <button
          class="pomodoro-timer-btn is-start mr-2 bg-yellow-200"
          style="border: 1px dashed lightgrey; padding: 0.5rem 1rem;border-radius: 0.5rem;"
          data-slot-id="${slot}" 
          data-pomo-id="${pomoId}"
          data-block-uuid="${payload.uuid}"
          data-on-click="bygonzLoad"
          >load from bygonz</button>
        <button
          class="pomodoro-timer-btn is-start bg-red-400"
          style="border: 1px dashed lightgrey; padding: 0.5rem 1rem;border-radius: 0.5rem;"
          data-slot-id="${slot}" 
          data-pomo-id="${pomoId}"
          data-block-uuid="${payload.uuid}"
          data-on-click="bygonzReset"
          >reset bygonz</button>
        `,
      })
    }

    // reset slot ui
    renderTimer({ pomoId, slotId: slot, startTime, durationMins })
  })

  logseq.App.registerUIItem('toolbar', {
    key: openIconName,
    template: `
      <div data-on-click="show" class="${openIconName}">⚙️ Bygonz</div>
    `,
  })

  setTimeout(() => {
    // initIPFS().catch(e => console.error('IPFS init failure', e))
    ((async () => {
      blocksDB = await getInitializedBlocksDB()
    })()).catch(e => console.error('bygonz init failure', e))
  })
}

logseq.ready(main).catch(console.error)

if (import.meta.hot) {
  console.log('[logseq-bygonz] 🤖 Hot reload detected - TODO handle properly')
  main() // <- worth a try...?
}

if (!navigator.userAgent.includes('Electron')) {
  console.log('NOT electron - launching...', main)
  main()
}

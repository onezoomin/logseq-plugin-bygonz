import type { BlockEntity, IDatom, SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'

import '@logseq/libs'

import React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import { logseq as PL } from '../package.json'

import { BlocksDB, getInitializedBlocksDB, getAllBlockVMs } from './data/bygonz'
import { BlockParams, BlockVM } from './data/LogSeqBlock'

import { detailedDiff } from 'deep-object-diff'

// import { initIPFS, loadBlockFromIPFS } from './data/ipfs'
import { Logger } from 'logger'
import { Buffer } from 'buffer'
import { initiateLoadFromBlock, saveBlockRecursively } from './data/blocks-to-bygonz'
import { OpLogObj, OpLogVM, sleep } from 'bygonz'
import { handleDBChangeEvent } from './data/realtime-translation'

// import { flatMapRecursiveChildren } from './utils'
globalThis.Buffer = Buffer

const { ERROR, WARN, LOG, DEBUG, VERBOSE } = Logger.setup(Logger.DEBUG, { performanceEnabled: true }) // eslint-disable-line @typescript-eslint/no-unused-vars

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

const toggles = {
  realtime: true,
  changeListener: false,
}
let isLoading = false

async function bygonzReset () {
  await indexedDB.deleteDatabase('BygonzBlocks')
  await indexedDB.deleteDatabase('BygonzLogDB_BygonzBlocks')
  await indexedDB.deleteDatabase('bygonz_ipfs_persist')
  // window.parent.location.reload()
  // await logseq.App.relaunch()
  WARN('reload please 💁')
}

async function bygonzSave () {
  const currentBlock = await logseq.Editor.getCurrentBlock()
  await logseq.Editor.exitEditingMode(true)
  // await sleep(500) // HACK otherwise root note content might not update
  if (currentBlock) {
    saveBlockRecursively(currentBlock, blocksDB)
    // logseq.DB.onBlockChanged(currentBlock.uuid,
    //   (block: BlockEntity, txData: IDatom[], txMeta?: { [key: string]: any, outlinerOp: string } | undefined) => {
    //     DEBUG('onBlockChanged:', { block, txData, txMeta })
    //     saveBlockRecursively(block, blocksDB)
    //   },
    // )
  }
}

async function bygonzLoad ({ currentBlock = null, fromBackground = false, newAppLogs = undefined }: { currentBlock?: BlockEntity | null, fromBackground?: boolean, newAppLogs?: OpLogVM[] }) {
  LOG('SYNC init 🎉', { currentBlock, fromBackground, newAppLogs })
  const blockVMs: BlockVM[] = await getAllBlockVMs() // these should be mapped to VMs from the bygonz fx
  DEBUG('singleBlockHistory', await blockVMs[0]?.getEntityHistory())
  try {
    isLoading = true

    // HACK for realtime testing  ((6370c5a2-1db6-4ec3-addd-0562d37919cd)) ((6372988d-ebe6-4eec-b4a6-8ad4d1fa7a64))
    const pinUuid = false // '6372988d-ebe6-4eec-b4a6-8ad4d1fa7a64' // '6370b62b-86fa-4031-92cf-59542992e161' // '636fef43-edd1-4ec9-8144-36fb1f443cc3'
    // How to?
    // 1. set pinUuid to true
    // 2. reset DB, refresh, save desired blocks
    // 3. copy block uuid of root node to an empty block and add `/bygonz`, triggering load
    // 4. set pinUuid to the real UUID of the new target root node
    if (pinUuid) {
      if (currentBlock && !fromBackground) {
        // = from slash command
        await initiateLoadFromBlock(currentBlock, blockVMs)
      } else {
        // /* if (newAppLogs) */ await applyAppLogs(newAppLogs); else
        await initiateLoadFromBlock(await logseq.Editor.getBlock(pinUuid)!, blockVMs)
      }
      return
    }

    if (!currentBlock && !fromBackground) {
      currentBlock = await logseq.Editor.getCurrentBlock()
      DEBUG('Initiated from Button - current block?', currentBlock)
      if (currentBlock) {
        // user deliberately chose to sync this block - so sync this block. and only this block.
        await logseq.Editor.exitEditingMode(true)
        await sleep(500) // HACK otherwise root note content did not update
        await initiateLoadFromBlock(currentBlock, blockVMs)
        await sleep(500)
        return
      }
    }

    // Try to find the BlockVM roots in LogSeq tree
    const rootVMs = blockVMs.filter(b => !b.parent) // in bygonz the root nodes don't have a parent
    // if (rootVMs.length !== 1) { ERROR('Blocks list:', blockVMs); throw new Error(`Failed to determine root block in blocks list (${rootVMs.length} matches)`) }
    for (const root of rootVMs) {
      LOG('Checking if root exists in our LogSeq:', root.uuid)
      let block = await logseq.Editor.getBlock(root.uuid)
      if (!block) {
        const resultUuid = await logseq.DB.datascriptQuery(`
          [:find (pull ?b [:block/uuid])
            :where
            [?b :block/properties ?prop]
            [(get ?prop :bygonz) ?v]
            [(= ?v "${root.uuid}")]
        ]`)
        DEBUG('QUERY RESULT', resultUuid)
        block = await logseq.Editor.getBlock(resultUuid[0][0].uuid)
      }
      if (!block) {
        WARN(`didn't find bygonz root block in local LogSeq: ${root.uuid}`)
        continue
      }
      await initiateLoadFromBlock(block, blockVMs)
    }
    LOG('SYNC done 🎉')
  } finally { setTimeout(() => { isLoading = false }, 500) } // HACK: workaround or change events sent off by our load
}

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

  logseq.Editor.registerSlashCommand('bygonz', async (event) => {
    const maybeUuid = (await logseq.Editor.getEditingBlockContent()).trim()
    DEBUG('[ /bygonz ] called', { event, maybeUuid })
    const blockVMs: BlockVM[] = await getAllBlockVMs()
    const matchingVM = blockVMs.find(vm => vm.uuid === maybeUuid)
    if (!matchingVM) throw new Error('Slash ID not found in BlocksDB') // TODO: show message
    const currentBlock = await logseq.Editor.getCurrentBlock()
    if (!currentBlock) throw new Error('Slash command but no current block?!') // HACK: use event->block
    DEBUG('[ /bygonz ] gathered facts', maybeUuid, { matchingVM, currentBlock, blockVMs })

    // DEBUG('Pinning bygonz ID', matchingVM.uuid)
    // await logseq.Editor.upsertBlockProperty(currentBlock.uuid, 'bygonz', matchingVM.uuid)
    await bygonzLoad({ currentBlock })

    const targetBlock = await logseq.Editor.insertBlock(
      currentBlock.uuid, '🚀 Fetching ...',
      { sibling: false, customUUID: matchingVM.uuid })
    if (!targetBlock) throw new Error('Insert result is null')
    await bygonzLoad({ currentBlock: targetBlock })

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
    bygonzReset,
    bygonzLoad,
    bygonzSave,
  })

  function renderTimer ({
    pomoId, slotId,
    startTime, durationMins,
  }: any) {
    if (!startTime) return
    // const durationTime = (durationMins || logseq.settings?.pomodoroTimeLength || 25) * 60 // default 20 minus
    // const keepKey = `${logseq.baseInfo.id}--${pomoId}` // -${slotId}
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
    key: 'pomodoro_timer', template: `
    <div><p style="font-size: large; opacity: 50%;" class="button">XXX</p></div>`,
  })

  const togglesBaseClass = 'bygonz-toggles'
  const renderToolbarItems = () => {
    DEBUG('Rendering toolbar items')
    logseq.App.registerUIItem('toolbar', {
      key: 'template-plugin-open',
      template: `
        <div data-on-click="onToolbarClick" data-toggles="realtime" class="${togglesBaseClass} ${toggles.realtime ? 'bg-green-100' : ''}">Realtime</div>
      `,
    })
  }
  logseq.provideModel({
    onToolbarClick: (event) => {
      console.log('toolbar click', event, { toggles })
      const toggle = event.dataset.toggles
      toggles[toggle] = !toggles[toggle]
      if (toggle === 'realtime') {
        if (toggles[toggle]) {
          LOG('Enabling realtime listener')
          // logseq.DB.onChanged((event) => {
          //   VERBOSE('onChange listener', event)
          //   if (!toggles[toggle]) return
          //   void onDBChange(event).catch(err => ERROR('onDBChange error', err))
          // })
        } else {
          LOG('Disabling realtime listener')
          // don't know how to disable, so we just check in the listener above
        }
      }
      renderToolbarItems()
    },
  })
  logseq.provideStyle(css`
    .${togglesBaseClass} {
      opacity: 0.55;
      font-size: 30%;
      /* margin-top: 4px; */
      border: 1px solid #ccc;
      padding: 5px 7px;
      border-radius: 5px;
      margin-top: 5px;
    }

    .${togglesBaseClass}:hover {
      opacity: 0.9;
    }

    .tag {
      border: 1px dotted purple;
      border-radius: 12px;
      padding-x: 4px;
    }
  `)
  renderToolbarItems()

  logseq.DB.onChanged((event) => {
    VERBOSE('onChange listener', event, toggles)
    if (!toggles.realtime) return
    if (isLoading) return WARN('Skipping ChangeEvent as isLoading=true', event) // HACK: find better way to check if we did this
    void handleDBChangeEvent(event, blocksDB).catch(err => ERROR('onDBChange error', err))
  })

  setTimeout(() => {
    // initIPFS().catch(e => console.error('IPFS init failure', e))
    ((async () => {
      blocksDB = await getInitializedBlocksDB()
      blocksDB.addUpdateListener(async ({ added }) => {
        await bygonzLoad({ fromBackground: true, newAppLogs: added })
      })
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

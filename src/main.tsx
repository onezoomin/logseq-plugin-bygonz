import '@logseq/libs'

import React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import { logseq as PL } from '../package.json'
import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'

import { getInitializedBlocksDB } from './data/bygonz'
import { BlockParams } from './data/LogSeqBlock'

import { detailedDiff } from 'deep-object-diff'
import { initIPFS, loadBlockFromIPFS } from './data/ipfs'

import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

const settings: SettingSchemaDesc[] = [
  {
    title: 'Bygonz Sync Interval',
    key: 'Bygonz Sync Interval',
    type: 'number',
    default: 60,
    description: 'Set the length of time between sync polling in seconds',
  },
]

// @ts-expect-error
const css = (t, ...args) => String.raw(t, ...args)

const pluginId = PL.id

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

    // const targetBlock = await logseq.Editor.insertBlock(targetBlock.uuid, '🚀 Fetching ...', { before: true })
    // if (!targetBlock) throw new Error('Insert result is null')

    /* const blocks: IBatchBlock[] =  */await loadBlockFromIPFS(maybeCid, currentBlock)
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
    async bygonzSync ({
      pomoId, slotId,
      startTime, durationMins,
    }: any) {
      const blocksDB = await getInitializedBlocksDB()
      const currentBlock = await logseq.Editor.getCurrentBlock()
      if (currentBlock) {
        const ID = currentBlock.uuid
        const currentBlockWithKids = await logseq.Editor.getBlock(currentBlock?.uuid, { includeChildren: true })
        console.log({ currentBlockWithKids })
        const currentBlockByg = await blocksDB.Blocks.get(ID)
        const mappedBlockObj: Partial<BlockParams> = { ID, ':db/id': currentBlock.id }
        for (const eachKey of Object.keys(currentBlock)) {
          if (eachKey === 'children') continue
          mappedBlockObj[`:block/${eachKey}`] = currentBlock[eachKey]
        }
        if (!currentBlockByg) {
          blocksDB.Blocks.add(mappedBlockObj)
          console.log('adding', { mappedBlockObj })
        } else {
          const diff = detailedDiff(currentBlockByg as object, mappedBlockObj as object)
          console.log({ currentBlockByg, diff })
          const updateObj = { ...diff.added, ...diff.updated }
          if (Object.keys(updateObj).length) {
            console.log('updating with', { updateObj })

            blocksDB.Blocks.update(ID, updateObj)
          }
        }
      }
      logseq.provideUI({
        key: pomoId,
        slot: slotId,
        reset: true,
        template: `<a class="pomodoro-timer-btn ${currentBlock ? 'known-block' : 'unknown-block'}"> - bygonz ${currentBlock ? ' ✅' : '🍅'} -</a>`,
      })
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
            class="pomodoro-timer-btn is-start"
            style="border: 1px dashed lightgrey; padding: 0.5rem 1rem;border-radius: 0.5rem;"
            data-slot-id="${slot}" 
            data-pomo-id="${pomoId}"
            data-block-uuid="${payload.uuid}"
            data-on-click="bygonzSync"
          >bygonz</button>
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
    initIPFS().catch(e => console.error('IPFS init failure', e))
  })
}

logseq.ready(main).catch(console.error)

if (!navigator.userAgent.includes('Electron')) {
  console.log('NOT electron - launching...', main)
  main()
}

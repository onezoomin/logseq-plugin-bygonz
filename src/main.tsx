import "@logseq/libs";

import React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { logseq as PL } from "../package.json";
import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'


import { getInitializedBlocksDB } from "./data/bygonz";
import { BlockParams } from "./data/LogSeqBlock";

const settings: SettingSchemaDesc[] = [
  {
    title: "Bygonz Sync Interval",
    key: "Bygonz Sync Interval",
    type: "number",
    default: 60,
    description: "Set the length of time between sync polling in seconds",
  }
]
logseq.useSettingsSchema(settings);


// @ts-expect-error
const css = (t, ...args) => String.raw(t, ...args);

const pluginId = PL.id;

function main() {
  console.info(`#${pluginId}: MAIN`);
  const root = ReactDOM.createRoot(document.getElementById("app")!);

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  function createModel() {
    return {
      show() {
        logseq.showMainUI();
      },
    };
  }

  logseq.provideModel(createModel());
  logseq.setMainUIInlineStyle({
    zIndex: 11,
  });

  const openIconName = "template-plugin-open";

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
  `);
  
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
    async bygonzSync () {
      const blocksDB = await getInitializedBlocksDB()
      const currentBlock = await logseq.Editor.getCurrentBlock()
  
      if (currentBlock) {
        const currentBlockWithKids = await logseq.Editor.getBlock(currentBlock?.uuid, { includeChildren: true })
        console.log({ currentBlockWithKids })
        let currentBlockByg = await blocksDB.Blocks.get(currentBlock.uuid)
        if (!currentBlockByg) {
          const mappedBlockObj: Partial<BlockParams> = { ID: currentBlock.uuid, ':db/id': currentBlock.id }
          for (const eachKey of Object.keys(currentBlock)) {
            if (eachKey === 'children') continue
            mappedBlockObj[`:block/${eachKey}`] = currentBlock[eachKey]
          }
          blocksDB.Blocks.add(mappedBlockObj)
        }
        console.log({ currentBlockByg })
  
      }
  
    }
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
      template: `<a class="pomodoro-timer-btn is-done">🍅 ✅</a>`,
    })
  }
  
  logseq.App.onMacroRendererSlotted(({ slot, payload }) => {
    const [type, startTime, durationMins] = payload.arguments
    if (!type?.startsWith(':bygonz_')) return
    const identity = type.split('_')[1]?.trim()
    if (!identity) return
    const pomoId = 'pomodoro-timer-start_' + identity
    if (!startTime?.trim()) {
      return logseq.provideUI({
        key: pomoId,
        slot, reset: true,
        template: `
          <button
          class="pomodoro-timer-btn is-start"
          data-slot-id="${slot}" 
          data-pomo-id="${identity}"
          data-block-uuid="${payload.uuid}"
          data-on-click="bygonzSync">
          > bygonz <
          </button>
        `,
      })
    }

    // reset slot ui
    renderTimer({ pomoId, slotId: slot, startTime, durationMins })
  })

  logseq.App.registerUIItem("toolbar", {
    key: openIconName,
    template: `
      <div data-on-click="show" class="${openIconName}">⚙️ Bygonz</div>
    `,
  });
}

logseq.ready(main).catch(console.error);

import React, { useRef } from "react";
import { getInitializedBlocksDB } from "./data/bygonz";
import { BlockParams } from "./data/LogSeqBlock";
import { useAppVisible } from "./utils";


XMLHttpRequestUpload
function App() {
  const innerRef = useRef<HTMLDivElement>(null);
  const visible = useAppVisible();
  if (visible) {
    (async () => {
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

    })()


    return (
      <main
        className="backdrop-filter backdrop-blur-md fixed inset-0 flex items-center justify-center"
        onClick={(e) => {
          if (!innerRef.current?.contains(e.target as any)) {
            window.logseq.hideMainUI();
          }
        }}
      >
        <div ref={innerRef} className="text-size-2em">
          Welcome to [[Logseq]] Plugins!
          <br />
          <br />
          <a className="cursor-pointer text-blue" onClick={() => logseq.App.relaunch()}>Refresh</a>

        </div>
      </main>
    );
  }
  return null;
}

export default App;

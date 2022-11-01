import React, { useRef } from "react";
import { useAppVisible } from "./utils";

function App() {
  const innerRef = useRef<HTMLDivElement>(null);
  const visible = useAppVisible();
  if (visible) {
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
          <a className="cursor-pointer text-blue" onClick={()=>logseq.App.relaunch()}>Refresh</a>
       
        </div>
      </main>
    );
  }
  return null;
}

export default App;

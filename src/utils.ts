import { BlockEntity, LSPluginUserEvents } from '@logseq/libs/dist/LSPlugin.user'
import React from 'react'
import { BlockWithChildren } from './data/blocks-to-bygonz'

export type Overwrite<T, O> = Omit<T, keyof O> & O

let _visible = logseq.isMainUIVisible

function subscribeLogseqEvent<T extends LSPluginUserEvents> (
  eventName: T,
  handler: (...args: any) => void,
) {
  logseq.on(eventName, handler)
  return () => {
    logseq.off(eventName, handler)
  }
}

const subscribeToUIVisible = (onChange: () => void) =>
  subscribeLogseqEvent('ui:visible:changed', ({ visible }) => {
    _visible = visible
    onChange()
  })

export const useAppVisible = () => {
  return React.useSyncExternalStore(subscribeToUIVisible, () => _visible)
}

export function flatMapRecursiveChildren (block: BlockWithChildren): BlockEntity[] {
  return [block, ...block.children.flatMap(flatMapRecursiveChildren)]
}

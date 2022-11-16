// import OrbitDB from 'orbitdb'
import Log from 'ipfs-log'
// import * as IPFS from 'ipfs'
import { DateTime } from 'luxon'
import IdentityProvider from 'orbit-db-identity-provider'
import keystore from 'keystore-idb'
import { multiaddr } from '@multiformats/multiaddr'
import * as IPFS from 'ipfs-http-client'
import { BlockEntity } from '@logseq/libs/dist/LSPlugin'

let identity: any
let ipfs: IPFS.IPFSHTTPClient
// let orbitdb: OrbitDB
let log: Log

export async function initIPFS () {
  console.log('Initializing IPFS...')
  // const keystore = await keystore.init({ storeName: 'keystore' })
  identity = await IdentityProvider.createIdentity({ id: `manutest${navigator.userAgent.includes('Electron') ? 'electron' : 'browser'}` })
  ipfs = IPFS.create({
    url: 'http://127.0.0.1:5001/',
  })
  await ipfs.pubsub.subscribe('manutest', (msg) => {
    console.log('[pubsub] message:', msg)
  })

  /* ipfs = await IPFS.create({ / * repo: "./path-for-js-ipfs-repo" * /
    // start: false,
    // config: {
    // //   Bootstrap: [
    // //     '/dns4/ipfs-rtc-star.tam.ma/tcp/443/wss/p2p-webrtc-star',
    // //     // Leave this blank for now. We'll need it later
    // //   ],
    //   Addresses: {
    //     Swarm: [
    //     //   '/dns4/star.thedisco.zone/tcp/9090/wss/p2p-webrtc-star',
    //       '/dns4/ipfs-rtc-star.tam.ma/tcp/443/wss/p2p-webrtc-star',
    //     ],
    //   },
    // },
    // libp2p: {
    //   // p2p configuration
    // },
    EXPERIMENTAL: {
      ipnsPubsub: true,
    },
  })
  await ipfs.bootstrap.add(multiaddr('/dns4/ipfs-rtc-star.tam.ma/tcp/443/wss/p2p-webrtc-star'))
  await ipfs.swarm.connect(multiaddr('/dns4/ipfs-rtc-star.tam.ma/tcp/443/wss/p2p-webrtc-star')) */
  //   ipfs.once('ready', async function () {
  //     console.log('[IPFS] ready')
  //   })
  // Create OrbitDB instance
  //   orbitdb = await OrbitDB.createInstance(ipfs)
  log = await Log.fromMultihash(ipfs, identity, 'zdpuAqcVr61WHWqXGpgrPg7UU471piijXvGAjskp1CTDxxTmp')
  //   log = new Log(ipfs, identity, {
  //     logId: 'testlog',
  //     // access: ...
  //   })
  // @ts-expect-error
  window.identity = identity
  // @ts-expect-error
  window.ipfs = ipfs
  // @ts-expect-error
  window.log = log
  //   window.orbitdb = orbitdb
  console.log('Initialized IPFS', { identity, ipfs, log/* , orbitdb */ })

  //   log.events.on('replicated', (...args: any[]) => {
  //     console.log('[ipfs-log] replicated', args)
  //   })

  await log.append({ some: 'data', time: DateTime.now().toISO() })
  //   await log.append('text')
  console.log('log:', log.values.map((e: any) => e.payload))
  console.log('heads:', log.heads.map((t: any) => t.hash))
  const logHash = await log.toMultihash()
  console.log('LOG ADDRESS:', logHash)
  await ipfs.pubsub.publish('manutest', Buffer.from(logHash))
}

// for ease of development
// @ts-expect-error
window.Log = Log

export async function loadBlockFromIPFS (cid: string, targetBlock: BlockEntity): Promise<void> {
  const placeholder = await logseq.Editor.insertBlock(targetBlock.uuid, '🚀 Fetching ...', { before: false, focus: false })
  if (!placeholder) throw new Error('failed to create placeholder')

  const otherLog = await Log.fromMultihash(ipfs, identity, cid)
  console.log('resolved log:', otherLog)

  await logseq.Editor.updateBlock(placeholder.uuid, JSON.stringify(otherLog.values.map((v: any) => v.payload), undefined, 2))
}

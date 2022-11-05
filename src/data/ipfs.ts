import Log from 'ipfs-log'
import * as IPFS from 'ipfs'
import IdentityProvider from 'orbit-db-identity-provider'

let identity: any
let ipfs: IPFS.IPFS
let log: Log

export async function initIPFS () {
  console.log('Initializing IPFS...')
  identity = await IdentityProvider.createIdentity({ id: `manutest${navigator.userAgent.includes('Electron') ? 'electron' : 'browser'}` })
  ipfs = await IPFS.create({ /* repo: "./path-for-js-ipfs-repo" */
    // start: false,
    config: {
      Addresses: {
        Swarm: [
        //   '/dns4/star.thedisco.zone/tcp/9090/wss/p2p-webrtc-star',
          '/dns4/ipfs-rtc-star.tam.ma/tcp/443/wss/p2p-webrtc-star',
        ],
      },
    },
    EXPERIMENTAL: {
      ipnsPubsub: true,
    },
  })
  log = new Log(ipfs, identity, {
    logId: 'testlog',
    // access: ...
  })
  // @ts-expect-error
  window.identity = identity
  // @ts-expect-error
  window.ipfs = ipfs
  // @ts-expect-error
  window.log = log
  console.log('Initialized IPFS', { identity, ipfs, log })

  //   log.events.on('replicated', (...args: any[]) => {
  //     console.log('[ipfs-log] replicated', args)
  //   })

  await log.append({ some: 'data' })
  await log.append('text')
  console.log('log:', log.values.map((e: any) => e.payload))
  console.log('tails:', log.tails.map(t => t.hash))
}

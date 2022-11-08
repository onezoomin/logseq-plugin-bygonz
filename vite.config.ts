import reactPlugin from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import logseqDevPlugin from 'vite-plugin-logseq'
// import globals from "rollup-plugin-node-globals";
import { globalPolyfill } from 'vite-plugin-global-polyfill'
import nodePolyfills from 'rollup-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    logseqDevPlugin(),
    reactPlugin(),
    globalPolyfill(),
    // @ ts-expect-error
    // nodePolyfills({}),
    // { ...globals(), name: 'rollup-plugin-node-globals' },
  ],
  // Makes HMR available for development
  build: {
    target: 'es2020',
    // minify: "esbuild",
  },
  optimizeDeps: {
    esbuildOptions: { target: 'es2020' },
    // https://vitejs.dev/config/server-options.html#server-watch
    exclude: ['bygonz'],
  },

  define: {
    'process.env': {},
  },

  // BYGONZ HOT RELOAD - https://vitejs.dev/config/server-options.html#server-watch
  server: {
    watch: {
      ignored: [
        // '!**/node_modules/bygonz/**',
        '!../ztax/**',
      ],
    },
  },
})

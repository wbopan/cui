import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import * as path from 'path'

export default defineConfig({
  root: 'src/web',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192x192.png', 'icon-512x512.png'],
      manifest: false, // Use our existing manifest.json
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      }
    })
  ],
  publicDir: '../../public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/web/index.html')
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['wenbo-macbook.dala-cobia.ts.net', 'cui.wenbo.io', 'localhost', '127.0.0.1', 'cui1.wenbo.io', 'cui2.wenbo.io', 'cui.tai.chat', 'measurements-struggle-slight-campbell.trycloudflare.com'],
  }
})

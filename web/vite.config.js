import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'CampeonApp',
        short_name: 'CampeonApp',
        description: 'Gestión de campeonatos de fútbol y microfútbol — inscripciones, fixture y resultados en vivo.',
        lang: 'es',
        theme_color: '#0b3565',
        background_color: '#0b3565',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Esta app depende de datos en vivo (marcador, cronómetro) — cachear
        // agresivamente rompería eso. El service worker solo existe para cumplir
        // el requisito técnico de "instalable", no para funcionar sin conexión.
        globPatterns: [],
        navigateFallback: null,
        // Sin esto, un service worker viejo puede seguir controlando pestañas ya
        // abiertas hasta que se cierren todas — con skipWaiting + clientsClaim,
        // la versión nueva toma el control apenas termina de instalarse.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true }
    }
  }
})

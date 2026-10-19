import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 127.0.0.1 evita la ambigüedad IPv6(::1)/IPv4 que produce "AggregateError [ECONNREFUSED]".
  const backendTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000'

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api': {
          target: backendTarget,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.error(
                `[vite-proxy] No se pudo conectar a ${backendTarget} ` +
                  `(¿backend en ejecución y en ese puerto?): ${err.code || err.message}`
              )
            })
          },
        },
      },
    },
  }
})

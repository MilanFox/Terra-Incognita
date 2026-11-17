// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from 'path';

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/i18n',
    '@vite-pwa/nuxt',
  ],

  ssr: false,

  components: [{ path: './components', pathPrefix: false }],

  devtools: { enabled: true },

  app: {
    head: {
      meta: [{ name: 'theme-color', content: '#182640' }],
      link: [
        {
          rel: 'icon',
          type: 'image/x-icon',
          href: '/favicon.ico',
        },
        {
          rel: 'apple-touch-icon',
          href: '/apple-touch-icon-180x180.png',
        },
      ],
    },
  },

  css: ['@assets/scss/main.scss'],

  alias: {
    '@assets': resolve(__dirname, './app/assets'),
    '@components': resolve(__dirname, './app/components'),
    '@atoms': resolve(__dirname, './app/components/atoms'),
    '@molecules': resolve(__dirname, './app/components/molecules'),
    '@organisms': resolve(__dirname, './app/components/organisms'),
    '@stores': resolve(__dirname, './app/stores'),
    '@composables': resolve(__dirname, './app/composables'),
    '@layouts': resolve(__dirname, './app/layouts'),
    '@middleware': resolve(__dirname, './app/middleware'),
  },

  sourcemap: {
    server: false,
    client: true,
  },

  experimental: {
    serverAppConfig: false,
  },

  compatibilityDate: '2025-11-01',

  vite: {
    build: {
      cssCodeSplit: false,
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "@assets/scss/global.scss" as *;',
        },
      },
    },
    worker: {
      format: 'es',
    },
  },

  postcss: {
    plugins: {
      'postcss-pxtorem': {
        rootValue: 16,
        unitPrecision: 3,
        propList: ['*', '!border*'],
        replace: true,
        mediaQuery: true,
        minPixelValue: 2,
      },
    },
  },

  hooks: {
    // @nuxtjs/i18n 10.6 rewrites #build/#app imports in its shared runtime via a glob id filter, which never matches paths containing "(" or ")". Same rewrite, plain substring match; a no-op on normal paths.
    'nitro:config'(nitroConfig) {
      if (!nitroConfig.rollupConfig) return;
      const { plugins } = nitroConfig.rollupConfig;
      const i18nSharedRuntimePathFix = {
        name: 'i18n-shared-runtime-path-fix',
        transform(code: string, id: string) {
          if (!id.includes('/@nuxtjs/i18n/dist/runtime/shared/')) return undefined;
          let fixed = code.includes('useRuntimeConfig()') ? `import { useRuntimeConfig } from "nitropack/runtime";\n${code}` : code;
          fixed = fixed
            .replace(/import.+["']#app["'];?/, 'const __nuxtMock = { runWithContext: async (fn) => await fn() };')
            .replaceAll('useNuxtApp()', '__nuxtMock')
            .replaceAll('#build/i18n-route-resources.mjs', '#internal/i18n-route-resources.mjs')
            .replaceAll('#build/i18n-options.mjs', '#internal/i18n-options.mjs');
          return fixed === code ? undefined : { code: fixed, map: null };
        },
      };
      nitroConfig.rollupConfig.plugins = [...(Array.isArray(plugins) ? plugins : plugins ? [plugins] : []), i18nSharedRuntimePathFix];
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'de', name: 'Deutsch', file: 'de.json' },
    ],
    detectBrowserLanguage: false,
  },

  pwa: {
    registerType: 'prompt',
    manifest: {
      name: 'Terra Incognita',
      short_name: 'Terra Incognita',
      description: 'Geography quiz games played on a world map.',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      background_color: '#182640',
      theme_color: '#182640',
      icons: [
        { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,json,geojson,svg,png,ico,webmanifest,txt}'],
      globIgnores: ['200.html', '404.html'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      cleanupOutdatedCaches: true,
    },
  },
});

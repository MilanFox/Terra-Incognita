// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from 'path';

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/i18n',
  ],

  ssr: false,

  components: [{ path: './components', pathPrefix: false }],

  devtools: { enabled: true },

  app: {
    head: {
      link: [
        {
          rel: 'icon',
          type: 'image/x-icon',
          href: '/favicon.ico',
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
    detectBrowserLanguage: {
      useCookie: false,
      fallbackLocale: 'en',
    },
  },
});

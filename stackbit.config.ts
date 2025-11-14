import type { Config } from '@stackbit/types';
import { SanityContentSource } from '@stackbit/cms-sanity';

const config: Config = {
  stackbitVersion: '0.6.0',
  ssgName: 'astro',
  nodeVersion: '20',
  contentSources: [
    new SanityContentSource({
      projectId: process.env.SANITY_PROJECT_ID!,
      dataset: process.env.SANITY_DATASET || 'production',
      token: process.env.SANITY_TOKEN!,
      previewMode: 'live'
    })
  ],
  modelExtensions: [{ name: 'page', type: 'page', urlPath: '/{slug}' }],
  experimental: {
    ssg: {
      name: 'Astro',
      logPatterns: {
        up: ['astro-dev-toolbar']
      },
      directoryIndex: 'index',
      passthrough: ['/vite-hmr/**']
    }
  }
};

export default config;

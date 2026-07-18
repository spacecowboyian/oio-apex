import type { StorybookConfig } from '@storybook/react-vite';
import { renderMiddlewarePlugin } from './render-middleware.mjs';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp"
  ],
  "framework": "@storybook/react-vite",
  // registers POST /render on Storybook's own dev server — see
  // render-middleware.mjs. Only relevant for `storybook dev`; a static
  // `storybook build` has no server for this to hook into, which is fine —
  // batch-export is a dev-only tool anyway.
  async viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins ?? [];
    viteConfig.plugins.push(renderMiddlewarePlugin());
    return viteConfig;
  }
};
export default config;
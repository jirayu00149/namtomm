import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

config.dangerous = {
  ...config.dangerous,
  disableIncrementalCache: true,
  disableTagCache: true,
};

export default config;
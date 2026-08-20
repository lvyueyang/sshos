/**
 * vitest 独立配置：不加载 vite.config.ts 的 tanstackStart / nitro 插件，
 * 避免构建插件注册的句柄阻止测试进程退出
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});

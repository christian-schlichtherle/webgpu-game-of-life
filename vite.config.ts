import { defineConfig } from "vite";

export default defineConfig({
  base: "/webgpu-game-of-life/",
  build: {
    target: "esnext",
  },
  assetsInclude: ["**/*.wgsl"],
});

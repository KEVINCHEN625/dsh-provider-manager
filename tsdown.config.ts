import { defineConfig } from "tsdown";
export default defineConfig([
  {
    entry: {
      index: "src/host/index.ts",
      oauth: "src/host/oauth-entry.ts",
    },
    format: "esm",
    platform: "node",
    outDir: "lib",
    clean: false,
    dts: false,
  },
  {
    entry: { client: "src/client/index.tsx" },
    format: "cjs",
    platform: "browser",
    outDir: "lib",
    clean: false,
    dts: false,
    external: ["react", "react/jsx-runtime", "@deepseek-ai/cordis"],
    define: { "process.env.NODE_ENV": '"production"' },
    outputOptions: {
      entryFileNames: "client.js",
      banner:
        'window.__ModuleLoader__.load({id:"dsh-provider-manager",factory:(require)=>{',
      intro: "var module={exports:{}};var exports=module.exports;",
      footer: "return module.exports;}});",
    },
  },
]);

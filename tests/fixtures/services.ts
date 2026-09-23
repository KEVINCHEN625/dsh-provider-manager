export function fixture() {
  const sections: any[] = [
    {
      ns: "llm-opencode-go",
      revision: 1,
      value: { apiKeyEnv: "OPENCODE_API_KEY", apiKey: "SENTINEL", models: [] },
    },
    {
      ns: "llm-commandcode",
      revision: 1,
      value: {},
      secrets: [{ path: ["apiKey"], set: false }],
    },
    {
      ns: "llm-pi-ai",
      revision: 1,
      value: { providers: {}, untouched: "keep" },
    },
  ];
  const values = new Map([["OPENCODE_API_KEY", "SYNTHETIC"]]);
  let writable = true;
  const writes: any[] = [];
  const services: any = {
    settings: {
      writable: true,
      installSection: (_ctx: any, ns: string, _schema: any, defaults: any) => {
        if (!sections.some((s) => s.ns === ns))
          sections.push({ ns, revision: 0, value: defaults });
      },
      describe: () => structuredClone(sections),
      mutate: async (ns: string, ops: any[], revision: number) => {
        const d = sections.find((x) => x.ns === ns);
        if (d.revision !== revision)
          throw Object.assign(new Error(), { code: "SETTINGS_CONFLICT" });
        writes.push(ops);
        for (const op of ops) {
          let o = d.value;
          for (const k of op.path.slice(0, -1)) o = o[k] ??= {};
          if (op.op === "unset") delete o[op.path.at(-1)];
          else o[op.path.at(-1)] = op.value;
        }
        d.revision++;
      },
    },
    credentials: {
      describe: async (ref: string) => ({
        configured: values.has(ref),
        writable,
        source: writable ? "file" : "env",
      }),
      set: async (ref: string, v: string) => {
        values.set(ref, v);
      },
      resolve: async (ref: string) =>
        values.has(ref)
          ? { value: values.get(ref), source: writable ? "file" : "env" }
          : undefined,
    },
    llm: {
      registerAdapter: () => ({ dispose() {} }),
      registerConfigurableProviders: () => ({ dispose() {} }),
      listProviders: () => [
        { id: "opencode-go", name: "OpenCode Go" },
        { id: "commandcode", name: "Command Code" },
      ],
      listConfigurableProviders: () => [],
      listModels: async () => [
        { id: "example", name: "Example", api: "anthropic-messages" },
      ],
    },
  };
  return {
    services,
    sections,
    values,
    writes,
    readonly: () => (writable = false),
  };
}

export function chat(field = "reasoning", tool = true) {
  const chunks = [
    { choices: [{ index: 0, delta: { [field]: "native thought" } }] },
    ...(tool
      ? [
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_mock",
                      type: "function",
                      function: { name: "lookup", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          },
        ]
      : [{ choices: [{ index: 0, delta: { content: "done" } }] }]),
    {
      choices: [
        { index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
    },
  ];
  return new Response(
    chunks
      .map(
        (c) =>
          `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", model: "deepseek-v4.1-flash", ...c })}\n\n`,
      )
      .join("") + "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
}
export function messages(tool = true) {
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        content: [],
        model: "minimax-m3",
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "native thought" },
    },
    { type: "content_block_stop", index: 0 },
    ...(tool
      ? [
          {
            type: "content_block_start",
            index: 1,
            content_block: {
              type: "tool_use",
              id: "call_mock",
              name: "lookup",
              input: {},
            },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: "{}" },
          },
          { type: "content_block_stop", index: 1 },
        ]
      : [
          {
            type: "content_block_start",
            index: 1,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { type: "text_delta", text: "done" },
          },
          { type: "content_block_stop", index: 1 },
        ]),
    {
      type: "message_delta",
      delta: { stop_reason: tool ? "tool_use" : "end_turn" },
      usage: { output_tokens: 3 },
    },
    { type: "message_stop" },
  ];
  return new Response(
    events
      .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
export function responses() {
  const items = [
    {
      type: "reasoning",
      id: "rs_mock",
      summary: [{ type: "summary_text", text: "native thought" }],
      encrypted_content: "cipher",
    },
    {
      type: "function_call",
      id: "fc_mock",
      call_id: "call_mock",
      name: "lookup",
      arguments: "{}",
      status: "completed",
    },
  ];
  const events = [
    {
      type: "response.created",
      response: { id: "resp_mock", status: "in_progress" },
    },
  ];
  items.forEach((item, output_index) => {
    events.push({ type: "response.output_item.added", item, output_index });
    if (item.type === "reasoning")
      events.push({
        type: "response.reasoning_summary_text.delta",
        output_index,
        delta: "native thought",
      });
    events.push({ type: "response.output_item.done", item, output_index });
  });
  events.push({
    type: "response.completed",
    response: {
      id: "resp_mock",
      status: "completed",
      output: items,
      usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 },
    },
  });
  return new Response(
    events
      .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

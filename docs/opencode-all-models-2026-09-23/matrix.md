# OpenCode Go 模型核对矩阵（2026-09-23）

这是规划输入，不是运行时目录。官方 GET 列出40个ID；31项协议获官方端点表明确支持，9项待核实；38项有models.dev Go元数据，2项缺失。待核实字段禁止填猜测值。执行时先刷新并记录差异。

来源：[Go模型列表](https://opencode.ai/zen/go/v1/models)、[Go协议文档](https://opencode.ai/docs/go/)、[models.dev](https://models.dev/api.json)。原始快照与机器可读matrix.json同目录。C=Chat Completions，R=Responses，A=Anthropic Messages。数字为tokens，非K/M近似。

| ID | 协议 | 上下文 | 独立输入上限 | 最大输出 | 思考能力（原始声明） | 状态 |
|---|---|---:|---:|---:|---|---|
| minimax-m3 | A | 1000000 | 未独立声明 | 131072 | 开关 | — |
| minimax-m2.7 | A | 204800 | 未独立声明 | 131072 | 推理模型；未声明可调档位 | — |
| minimax-m2.5 | A | 204800 | 未独立声明 | 65536 | 推理模型；未声明可调档位 | deprecated |
| kimi-k3 | C | 1048576 | 未独立声明 | 131072 | max | — |
| kimi-k2.7-code | C | 262144 | 未独立声明 | 262144 | 推理模型；未声明可调档位 | — |
| kimi-k2.6 | C | 262144 | 未独立声明 | 65536 | 推理模型；未声明可调档位 | — |
| longcat-2.0 | C | 1000000 | 未独立声明 | 131072 | 开关 | — |
| kimi-k2.5 | 待核实 | 262144 | 未独立声明 | 65536 | 推理模型；未声明可调档位 | deprecated |
| glm-5.2 | C | 1000000 | 未独立声明 | 131072 | high/max | — |
| glm-5.3-flash | C | 1000000 | 未独立声明 | 131072 | low/high/max | — |
| glm-5.3 | C | 1000000 | 未独立声明 | 131072 | low/high/max | — |
| glm-5.1 | C | 202752 | 未独立声明 | 32768 | 推理模型；未声明可调档位 | — |
| glm-5 | 待核实 | 202752 | 未独立声明 | 32768 | 推理模型；未声明可调档位 | deprecated |
| deepseek-v4-pro | C | 1000000 | 未独立声明 | 384000 | high/max | — |
| deepseek-v4-flash | C | 1000000 | 未独立声明 | 384000 | low/high/max | — |
| deepseek-flash | 待核实 | 待核实 | 未独立声明 | 待核实 | 待核实 | — |
| deepseek-v4.1-flash | C | 1000000 | 未独立声明 | 384000 | low/high/max | — |
| deepseek-v4-flash-vision-exp | C | 1000000 | 未独立声明 | 384000 | 开关；low/high/max | — |
| qwen3.7-max | A | 1000000 | 未独立声明 | 65536 | 开关；budget_tokens ≤ 262144 | — |
| qwen3.8-max | A | 1000000 | 未独立声明 | 131072 | 开关；low/medium/xhigh；budget_tokens ≤ 262144 | — |
| qwen3.8-flash | A | 1000000 | 未独立声明 | 131072 | 开关；low/medium/xhigh；budget_tokens（上限未声明） | — |
| qwen3.7-plus | A | 1000000 | 未独立声明 | 65536 | 开关；budget_tokens ≤ 262144 | — |
| qwen3.6-plus | A | 1000000 | 未独立声明 | 65536 | 开关；budget_tokens ≤ 81920 | — |
| qwen3.5-plus | 待核实 | 262144 | 未独立声明 | 65536 | 开关；budget_tokens ≤ 81920 | deprecated |
| mimo-v2-pro | 待核实 | 1048576 | 未独立声明 | 128000 | 推理模型；未声明可调档位 | deprecated |
| mimo-v2-omni | 待核实 | 262144 | 未独立声明 | 128000 | 推理模型；未声明可调档位 | deprecated |
| mimo-v2.6-pro | C | 1048576 | 未独立声明 | 131072 | 推理模型；未声明可调档位 | — |
| mimo-v2.6-flash | C | 1048576 | 未独立声明 | 131072 | 推理模型；未声明可调档位 | — |
| mimo-v2.5-pro | C | 1048576 | 未独立声明 | 128000 | 推理模型；未声明可调档位 | — |
| mimo-v2.5 | C | 1000000 | 未独立声明 | 128000 | 推理模型；未声明可调档位 | — |
| hy4-preview | C | 1024000 | 未独立声明 | 64000 | none/high | — |
| hy3 | C | 256000 | 192000 | 128000 | none/low/high | — |
| hy3-preview | 待核实 | 待核实 | 未独立声明 | 待核实 | 待核实 | — |
| gpt-5.6-luna | R | 1050000 | 922000 | 128000 | none/low/medium/high/xhigh/max | — |
| grok-4.5 | 待核实 | 500000 | 未独立声明 | 500000 | low/medium/high | deprecated |
| grok-4.7 | R | 500000 | 未独立声明 | 500000 | low/medium/high/xhigh | — |
| grok-4.6 | R | 500000 | 未独立声明 | 500000 | low/medium/high/xhigh | — |
| muse-spark-1.3-contributor | R | 1048576 | 未独立声明 | 131072 | minimal/low/medium/high/xhigh | — |
| muse-spark-1.2-contributor | R | 1048576 | 未独立声明 | 131072 | minimal/low/medium/high/xhigh | — |
| omen-alpha | 待核实 | 500000 | 未独立声明 | 128000 | low/high | deprecated |

注意：deepseek-flash、hy3-preview仍在官方列表，但缺Go目录参数，不能擅自等同其他模型。ox-alpha-free只在metadata目录中出现，本批不自动加入。omen-alpha等协议待核实，不能沿用旧插件前缀猜测。budget最大值可能高于输出上限，不能当请求默认值。完整输入模态与原始reasoning_options见matrix.json；DSH未支持的模态不可宣传已可用。

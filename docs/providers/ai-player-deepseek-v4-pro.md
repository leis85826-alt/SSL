# DS-V4-Pro 接入参数依据

来源：用户于2026-10-23粘贴的「Ai头号玩家」站内“全部复制”API接入文档。以下为与本项目接入有关的摘要；未通过真实账户验证服务性能，也未登录或读取用户密钥。

- 模型ID：`deepseek-v4-pro`；显示名：DS-V4-Pro。
- 根地址：`https://api.lk888.ai`。
- 模型清单：`GET /v1/models`。
- 聊天端点：`POST /v1/chat/completions`，OpenAI Chat Completions兼容协议。
- 推荐鉴权：`Authorization: Bearer $API_KEY`。文档还列出x-api-key、x-goog-api-key和URL key鉴权，本项目不采用URL传密钥。
- 必填：model、messages。
- 可选：stream、temperature、max_tokens、tools、response_format（json_object或JSON Schema）。
- 流式请求使用`stream:true`；响应是text/event-stream，每条`data: {...}`，终止事件为`data: [DONE]`。
- 平台自动注入`stream_options.include_usage=true`，末尾chunk可包含token用量；usage chunk不一定有choices。

提供的文档没有关闭推理、快速模式、reasoning_effort或thinking参数说明，也没有响应耗时保证。本项目不擅自发送这些参数，不自动换模型或重试收费调用。

文档结束事件应结束应用层读取，不依赖HTTP连接关闭。token用量只保留prompt_tokens、completion_tokens、total_tokens的非负整数用于诊断；不将推理原文发往前端或日志。

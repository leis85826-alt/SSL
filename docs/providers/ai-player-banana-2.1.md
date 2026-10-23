# Ai头号玩家 banana-2.1 媒体协议接入依据

来源：用户在对话提供的“纳米香蕉 2.1 按次 · 接入文档”。此文件是接入摘要，不表示已使用真实账号验证。

- 默认根地址 https://api.lk888.ai，当前基础地址配置 https://api.lk888.ai/v1。
- 模型 ID `banana-2.1`，类型图片生成；不能使用聊天 JSON 方案接口代替。
- Bearer 鉴权；GET /v1/models 查看清单。
- POST /v1/media/generate：顶层 model、prompt、params。响应 code=200、data.task_id。
- GET /v1/media/status?task_id=...：返回 task_id、state、is_final、progress、result_url、result_type、error、cost。state 仅 pending/running/success/failed；必须严格 is_final=true 才处理终态；status/status_group 仅展示，不能用于业务判断。
- 推荐3—5秒轮询；本实现4秒，暂停后只恢复原任务查询，不重建任务。
- aspectRatio 必填：1:1、2:3、3:2、3:4、4:3、4:5、5:4、9:16、16:9、21:9、1:4、4:1、1:8、8:1。
- imageSize 必填：1K、2K、4K。thinkingLevel 可选 minimal/high；本实现默认 minimal。
- 示例参数另有 n=1、web_search=true。本实现固定 n=1，web_search 用户可选、默认关闭。
- 文档支持最多14张参考图、Gemini generateContent/streamGenerateContent、URL结果扩展及 notify_url 回调（顶层字段）；本轮按用户确认只接入“已保存绿化方案文字→效果图”的媒体轮询流程，不实现参考图上传、Gemini 协议或 webhook，不声称这些能力已接入。
- 文档称 success 返回永久对象存储地址，failed 自动退款；实际链接可用性/退款以服务商记录为准，本轮未真实验证。

## 实施契约

独立图片配置 Cookie `__Host-roadscape-image`，90天；与聊天配置隔离。用户可明确选择沿用**同一基础地址**已保存的聊天密钥，换地址不复用旧密钥。服务端仍验证目的地址、禁止重定向、限制响应大小、脱敏错误。

同源接口：GET/POST/DELETE `/api/image/config`，GET `/api/image/test`（只读取清单，不创建图片），POST `/api/image/generate`，POST `/api/image/status`。后者接受加密任务凭据而非任意 task_id。凭据绑定浏览器、服务商、密钥指纹、项目、原方案摘要，24小时过期；不含 API 密钥。更换原密钥/服务商后须恢复原配置再查，其他浏览器不能复用凭据。服务商原始 task_id 会显示，可在服务商后台核查。

任务创建 POST 不自动重试。客户端先持久化创建防重标记并在同源 Web Lock 下提交，重复点击/其他标签页有待完成标记时拒绝创建；刷新不会重发 POST。调用前标记保存失败则不下单。网络结果不明时保留 unknown 标记，用户先核查服务商记录再明确清除本机标记；该操作不会取消或退费。

不是服务商侧幂等保障：清空网站数据、不同浏览器/电脑或直接调用API仍可创建多个收费任务。若服务商未提供幂等键，不宣称实现跨设备 exactly-once。停止等待只取消本地查询；无取消任务接口。自动查询最多10分钟，之后保留凭据供手动继续。

图片和任务元数据存于原本机项目的 effectImages/imageTask/imagePreferences，工程方案与坐标不写回。版本输入快照排除这三类图片界面字段，恢复旧植物方案时保留效果图与待查询任务。生成结果按 source_digest 关联原方案，任务期间方案变化仍保留已付费图片并标注过期。工作空间备份包含图片链接及元数据，不含远端图片原件；用户应另存原图。

## 验证与发布

`node scripts/build-cloudflare.mjs` 后运行 `node --test tests/cloudflare-model.test.mjs tests/image-model.test.mjs`，35项通过。HTTPS Chromium 模拟验证独立图片配置、清单检查无任务创建、停止/刷新/恢复不重复下单、参数及图片链接恢复、失败保留旧结果、原方案和两张 SVG 保持一致。上游均为模拟，无真实API密钥或收费调用。

该模块接入现有 Cloudflare adapter；原 Sites 的 worker/index.js 单独部署不提供图片 API。静态 web 上传也不提供服务端任务接口。本轮在独立分支验证后合入 feature/cloudflare-model 供既有 Cloudflare CI 构建，不改 main、M05 S1 分支或数据库。

回退代码至 `51c0fc9` 可撤回图片入口；保留浏览器项目数据，不清除本机存储。已创建的服务商任务不随回滚取消，任务编号仍可在服务商后台查询，不能回滚收费。已存图片链接可在备份中读取。

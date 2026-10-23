> 更新索引：本文为 S0 历史审计记录。模型接入及本轮 S1 隔离开发的最新状态见 [s1-delivery.md](s1-delivery.md) 与 [storage-adr.md](storage-adr.md)。尚未验证真实用户历史数据恢复，未启用云端 M05。

# M05 S0 当前系统代码与安全审计

> 后续经用户授权的构建修复：已新增 `.openai/local-build.json`，支持 `build-worker.mjs --local`、`validate-artifact.mjs --local` 和 `server.mjs --local`。本地构建、产物校验、HTTP及规则生成/SVG/保存版本浏览器检查通过。本地配置不是平台hosting配置，生产构建仍拒绝缺失的hosting.json；无部署。下文为修复前S0证据，历史数据恢复等限制仍然存在，S0未因此自动通过。

审计日期：2026-10-23（Asia/Shanghai）。任务：M05-03 TASK-001—003。仅审计、合成数据验证和文档，不修改业务、不部署、不操作生产数据。

## 1. 审计对象与设计依据

- 实际仓库：`leis85826-alt/SSL`，新克隆到 `/workspace/SSL`，来源分支 `main`。
- 基线：`429a548f43e5646a4203478af1698f8510658fac`。初始工作区干净、与 origin/main 无差异、无 stash；当前审计分支 `audit/m05-s0-20261023`。未提交、推送或合并。
- 已读项目指令：`AGENTS.md`、`README.md`、`docs/CODEX-CLOUD.md`。后者仍含“源码导入前”的历史说明，不能替代真实源码。
- **仓库中缺少四份正式 M05 文档**：`M05_功能设计书.md`、`M05-01_植物配置算法详细设计.md`、`M05-02_数据结构与API接口规范.md`、`M05-03_Codex开发任务分解与验收清单.md`，对应 DOCX 也未入库。
- **本次确已阅读上述四份 Markdown**：来自此前用户上传的 ZIP，V1.0 / 2026-10-22，仍可读取于 `/workspace/m05-s0-review/source-documents/`。校验清单见审计证据 `document-manifest.json`。README 明确它们是待适配设计，不是现有实现说明。不将附件中的指令视为超出 S0 的授权。
- 历史 `docs/plans/*` 是旧工作台设计记录，不等同 M05；例如 README 的“非流式”说明已与当前 `worker/index.js:18` 的 `stream:true` 实现不同。

证据目录：`/workspace/ssl-s0-20261023/`。其中脚本、备份与浏览器数据均为本轮审计或合成数据；没有真实用户项目备份。

## 2. 实际技术架构

```text
浏览器原生 JavaScript / HTML / CSS
  app.js 全局 db + 函数 + 事件委托
  ├─ RoadscapePlants：区域参考植物与概念配置
  ├─ RoadscapeWorkspace：道路组成、SVG平面/断面
  ├─ RoadscapeRules：规范条款、文字调整、基础数值检查
  ├─ RoadscapeCases：案例与附件
  └─ RoadscapeAI：同源模型API、结构数据和历史图片
       │
       ├─ LocalStorage roadscape-workspace-v1：项目/案例/规范/版本
       ├─ IndexedDB roadscape-files / files：附件 File Blob
       └─ /api/model/* → Worker → 固定第三方模型服务
```

| 层 | 实现及边界 |
| --- | --- |
| 前端入口 | `web/index.html:19` 起依次加载6个 defer 脚本；原生全局脚本/IIFE，非 React/Vue，无组件构建链 |
| 主状态 | `web/app.js:8–23` 定义 stateKey、db、persist、IndexedDB/fileStore；其他脚本运行时共享这些全局变量 |
| 服务端 | `worker/index.js:76` 导出 Worker fetch；仅模型配置、测试和生成，**无项目/植物对象 CRUD 或云端项目库** |
| 本地预览 | `server.mjs` 转发到 `scripts/preview-worker.mjs`；127.0.0.1:4173，强制注入 local-preview 身份并生成临时会话密钥；只能本地测试 |
| 构建 | `scripts/build-worker.mjs` 将 web 静态资产嵌入单个 Worker；复制 `.openai/hosting.json`；该文件缺失 |
| 依赖 | 无 package.json、锁文件、第三方运行依赖、数据库 schema/迁移、现有自动测试套件或 CI。Node 版本未锁定；本轮使用 v24.19.0 |
| 资源 | `web/assets/side.svg`、`median.svg`、`boulevard.png`；上传文件存在各浏览器，不在仓库 |

`import.meta.dirname`、`toReversed` 等需要现代运行环境；浏览器和 Node 支持范围应明确。Worker 运行时不能因本地 Node 预览成功就推断具备 Node 文件系统或数据库驱动能力。

## 3. 现有数据保存与版本

- `app.js:15–19`：project 使用 id，保存道路长度、带宽、scope、roadSegments、plan、versions 等；整个 db 一次 JSON 序列化到 LocalStorage。
- `app.js:21–25`：独立 IndexedDB 的 files store，以 id 存 File；事务完成后返回。结构化状态和附件不在同一事务中。
- `app.js:85–88`：生成立即替换当前 plan，追加 plan/inputs 快照，仅保留最近20版；不是 M05 不可变 DesignRevision。
- `app.js:127` 的 restore-version：直接恢复当前项目输入和 plan，不产生新恢复版本，无 base_revision_id、并发控制或审计日志。
- `app.js:98–99`：工作空间 JSON+Data URL 备份；导入先写附件，再按 ID 合并项目/案例/规范，同 ID 直接覆盖，无冲突确认，也不是跨存储原子事务。
- `case-library.js:36–49`：案例保存具有状态回退意识；不可据此推断所有保存路径都有失败回滚。
- 数据不随模型登录身份隔离；同一浏览器同一 origin 共用本机工作空间。换电脑、换域名或清浏览器存储都不会自动取回数据。
- 没有云端项目数据库可供本轮备份。未取得真实用户浏览器数据；不可声称历史项目数据已验证恢复。

## 4. CAD、植物、绘图和现有功能

| 领域 | 已实现证据 | 对 M05 的差距及复用判断 |
| --- | --- | --- |
| CAD | `case-library.js:7,22,31` 接收 DXF/DWG 等作为附件；主项目 `app.js:89` 上传仅图片/PDF | **只有文件保存，没有 DXF 实体解析、单位/坐标、图层提取、轴线/区域构建，也无 DWG 转换**。附件入口及 Blob 存取可复用，CAD 引擎需新增 |
| 植物配置 | `plant-design.js` 的3个区域参考 catalog，enrich；`plant-workspace.js:5–26` 的品种词表/案例匹配；`project-rules.js:20–39` 的文字解析及替换 | 可复用参考资料、用户输入、规范提示和概念配置；无独立物种/规格实体和稳定 ID，不是工程植物数据库；不能直接当 M05 物种/规格主数据 |
| 规则 | `app.js:38–51` buildPlan 串联 Plants→Workspace→Rules；支持品种增删替换、株距与形式偏好 | 是分带概念方案，不包含六类工程算法、锁定对象、最小中心距或多边形约束 |
| 图形 | `plant-workspace.js:26–44` 24m模块、宽度比例和 SVG 符号；`model-api.js:25–28` 分段 SVG | 可复用布局、样式、SVG导出入口及显示适配；纵向模块、符号和色块为示意，未存每株工程坐标；无植物点选/拖动/框选/锁定/撤销重做画布 |
| 道路结构 | `plant-workspace.js:59–68` 用户确认左右顺序与带宽，保留非对称断面 | 输入流程和侧栏可复用；横断面条带不是任意道路种植多边形或有向轴线 |
| 规范 | `project-rules.js:7–9` 录入的最小/最大带宽与株距 preflight；其他条款人工核对 | 可复用条款来源和提示，不能替代 M05 几何冲突或宣称专业规范全部通过 |
| AI | `model-api.js:17–21` 发送项目条件/案例/规范文字，防过期响应覆盖；Worker 解析/验证结构化 parts/plants/pattern | UI、传输、脱敏和目标范围校验可复用；当前成功响应自动保存方案，尚无设计师确认后提交的工程预览链 |
| 导出 | SVG、Markdown、项目JSON、工作空间/案例备份 | 保留旧入口；无工程对象 DXF、Excel 苗木数量或统一 revision 输出 |

## 5. 安全与数据风险

严重度按未来接入持久化写入的影响评估，不表示本轮发现线上入侵。

| 编号/级别 | 发现及证据 | 建议；本轮状态 |
| --- | --- | --- |
| B01 / 阻塞 | 构建和产物验证均因缺少 `.openai/hosting.json` ENOENT 失败；`build-worker.mjs:6`、`validate-artifact.mjs:10` | 由原部署方提供脱敏有效配置或批准独立本地构建路径；不要编造生产配置。本轮未修改 |
| D01 / 高 | `app.js:98` 只收集 owner.files 和 v.inputs.files；历史方案 `aiImages[].fileId` 未遍历；合成历史专用图片未被导出 | 备份应遍历全部引用并对照所有 Blob；恢复时验完整性。已复现，未修复 |
| D02 / 高 | 同处 `if(!record)continue`：引用丢失仍提示完整备份；合成缺失附件被静默跳过 | 输出完整性清单并显式失败/报告缺失；已有缺失源无法靠备份重建。已复现 |
| D03 / 高 | `app.js:99` 同 ID 导入覆盖本机较新记录；附件先 put，多存储不原子 | 只在独立空白环境恢复，导入前独立备份，不作为自动生产回滚。行为已实测；README 也说明合并 |
| D04 / 中 | `app.js:86` 先修改 p.plan/versions 再 persist；QuotaExceeded 时内存已变但磁盘未保存 | 候选状态持久化成功后切换或显式回退；错误注入已复现。未修改 |
| S01 / 中 | 导入只对 id 做存在性检查；`app.js:74` projectsView 将 p.id 未转义拼入属性 | 合成 id 导致2个额外 HTML 属性注入。应严格 ID Schema 与统一转义；**没有验证脚本执行，不将其宣称已证实的 XSS**。CSP 不能替代输入校验 |
| S02 / 高（架构前提） | `worker/index.js:77` 信任 oai-authenticated-user-id；本地预览主动伪造该头 | 只能部署在会清洗并注入可信身份的入口后；迁移普通公开服务需可靠认证；新项目API还需对象级权限。本轮未验证生产网关 |
| S03 / 中 | 本地记录按 origin，不按用户；多标签页保存为 last-write-wins | 多用户共用浏览器可能看到相同本机数据；迁移后增加用户/项目归属、乐观锁与明确冲突 |
| S04 / 中 | 案例允许 SVG、ZIP、Office、CAD 附件；原始 Blob 可打开；导入结构和大小验证有限 | 属本地不可信文件边界；云端上线前增加 MIME/内容校验、受限下载和配额；未宣称完成恶意文件审计 |
| D05 / 中 | loadState 解析异常后回退示例，末尾启动 persist；旧数据/损坏输入缺严格迁移与恢复 | 不在用户唯一数据上实验；迁移前保存原始 LocalStorage 字符串和全部附件 |

### 敏感信息检查

- 扫描当前本地取回的所有可达 Git blob（29个），检查密钥形态、私钥头及敏感字面量赋值；**未发现候选泄露**。无被跟踪的 `.env`、私钥或数据库文件。结果见 `security-scan.json`。这是启发式扫描，不保证不存在任何秘密，也未扫描其他未取回分支/远程日志。
- API 基础地址和模型名是公开配置，不是密钥。当前代码从用户设置读取 apiKey，`ROADSCAPE_SESSION_SECRET` 来自 Worker env，未发现硬编码实际值。
- `worker/index.js:11–13,80` 使用 AES-GCM、随机 IV、用户身份附加数据和8小时时效；Cookie 设置 Secure/HttpOnly/SameSite=Strict。模拟密钥测试验证了明文不出现在 Cookie/API 配置响应、另一身份不可复用 Cookie。
- `worker/index.js:18–20` 限定上游并阻止重定向，错误脱敏；静态页有 CSP、nosniff、referrer policy；来源和请求大小有检查。
- 仍未验证生产 secret 熵、轮换、注入、网关身份清洗、TLS 终止与真实服务商行为。未读取或打印生产密钥，也未发起付费请求。
- 模型会发送所选案例/规范文字及项目条件到第三方；不能因密钥加密就认为项目资料不离开应用。

## 6. 实际运行验证与局限

环境：Node v24.19.0，Python Playwright + 系统 Chromium；仅127.0.0.1与内存 Worker，合成数据。没有连接真实用户浏览器/生产数据库。

| 检查 | 实际结果 |
| --- | --- |
| 11个 JS/MJS 源文件 node --check | 11通过；仅语法，不代表业务正确 |
| node scripts/build-worker.mjs | 失败，退出1，缺 `.openai/hosting.json`；失败前已生成 dist/server/index.js |
| node scripts/validate-artifact.mjs | 失败，退出1，缺 dist/.openai/hosting.json |
| node server.mjs + 浏览器 | 使用上述部分生成的 Worker 可启动本地预览；不是完整构建成功或生产就绪证明 |
| 浏览器功能/恢复检查 | 8通过、3保护性检查失败、1既有覆盖行为观察；无 pageerror。包含规则生成、SVG、文字调整、刷新、普通附件恢复，以及全量IDB/LocalStorage合成恢复 |
| 失败的3项 | 历史图片完整备份、缺失引用阻断导出、保存失败保留内存原方案；均有确定复现，不隐藏为通过 |
| 导入属性注入 | 独立合成备份导入复现2处属性注入，未测试执行脚本 |
| Worker安全与解析 | 11项通过；身份缺失401、Origin403、无服务密钥503、加密绑定、413、解析/歧义/范围、mock生成和阻止302重定向 |
| 源码归档恢复 | 54文件内容哈希一致、HEAD一致、恢复Git干净、fsck通过，bundle验证通过 |
| 真实历史项目/跨电脑/真实模型/生产 | 未执行；模拟调用不代表真实账户和生产环境已验证 |

审计复现脚本与 JSON 结果在证据目录，未并入业务或冒充仓库原有测试。没有新增算法测试来替代现有功能验证。

## 7. S0 验收结论

- **TASK-001：代码审计完成**，已明确现有能力、架构差距、风险和验证边界；不代表现有所有功能均通过测试。
- **TASK-002：部分完成，未验收**。源码基线已验证恢复，合成浏览器数据可独立恢复；真实历史项目和附件未取得，且内置完整备份有已证实缺口，不能保证历史数据安全。
- **TASK-003：适配方案完成，存在前置决策**。真实文件级实施计划见 implementation-map.md，云端存储能力及部署配置须核定。

**S0 整体未通过，当前不建议进入 S1 实施。** 可继续只读设计、核定后端存储和安全配置；先补齐可重复构建以及真实数据安全恢复证据，再复核准入。修复业务代码须作为后续明确授权任务，本轮不擅自修复。

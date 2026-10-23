# 工作台项目数据与版本接入记录

日期：2026-10-23（北京时间）。本轮是用户授权的“项目数据层与 M05 接入口”调整，范围限 S1 基础接入和备份安全；未启动 S2 几何算法或 S7 工程画布。

## 实际结果

在 `feature/m05-workbench-storage` 中合并已验证的 S1 分支，并保留 `e5390fb` 的聊天模型、可编辑基础地址、90天配置和 banana-2.1 效果图功能。冲突仅涉及 Cloudflare imports，两个路由能力均保留。Git 基线 bundle 位于仓库外 `/workspace/ssl-m05-workbench-baseline/before-workbench.bundle`，已校验及记录 SHA256。原 main 与 `/workspace/SSL` 现有改动未覆盖。

项目标题右侧新增“项目数据与版本”入口。可确认图纸单位和本地平面工程坐标后创建独立 M05 工程容器、保存资料新版本、查看版本、恢复为新版本、导出全部版本工程包、导入独立工程副本并切换关联。初始种植区/轴线/植物对象为空，不把原24米概念 SVG 转为工程坐标，不凭空生成施工数量。坐标确认仅是用户声明，未实现 CAD 解析/投影校核。

工程结构使用已有八实体及辅助实体契约；新增 `shared/m05/snapshot-codec.mjs` 共享规范序列化及 SHA256，Worker 与浏览器使用同一算法。构建复制共享 ESM 到 `web/m05/contracts/`（仅生成物，Git忽略），避免维护两份 Schema；本地预览构建补充 mjs MIME。

本机工程库是新建独立 `roadscape-m05-v1` IndexedDB，projects/revisions/links 三个 store。浏览器只在明确创建或导入工程时写入，旧 LocalStorage 与附件库不迁移。保存用单个 readwrite 事务追加新 revision、更新指针与映射；同一旧基线并发保存只有一个成功、另一个409。恢复旧快照形成新版本，导入包建立新工程/版本ID并保留旧工程。SHA256只检测完整性，不是身份签名；导入前校验全部 Schema、校验和与连续版本链。

新增只读 `/api/v1/status` 仅返回 configured/authenticated，不返回身份、密钥或数据库标识。云端 DB、可信账号 service binding 与 M05_ENABLED 仍未配置；业务 API 缺配置拒绝开放。UI明确显示本机模式，**没有声称或实现自动云端同步**。本机 `browser-local` 不是账号权限机制。

## 原工作台的数据保护

- 规则模式及聊天模式改用 `commitProject`：先尝试保存候选数据，成功后才更新当前项目，Quota错误不替换已有方案。
- 原备份按钮接入完整只读收集器，扫描历史 `fileId` 和全附件库，包括未引用 Blob；缺附件即失败，不再跳过后宣称完整。
- 导出仍为兼容 `roadscape-backup-v1` 的记录/附件结构，增加 backup_version=2、Blob SHA256/大小等信息。实际备份范围是工作台与附件，M05 工程数据单独导出。迁移需保留这两份文件；远端效果图原件仍须另存。
- 导入先校验所有记录、引用与 Blob；相同 ID 内容一致时复用，不同内容拒绝。新附件用 add，不覆盖旧 Blob；附件事务成功后写工作空间，LocalStorage失败会补偿删除本次新增附件并保留旧工作空间。跨 IndexedDB/LocalStorage 不是单一原子事务；崩溃中断可能留下未引用的新附件，不能宣称完全解决多标签页或崩溃恢复。
- 支持原案例库接受的常见 CAD/Office/ZIP MIME，保留空 MIME 类型，避免导出后无法按自身 ID 校验重导入。
- 项目卡片 ID 属性转义；导入限制安全记录 ID，阻断审计发现的新增导入属性注入路径。这不是整站安全审计通过声明。
- 图片任务在其他浏览器恢复后可能不能使用原绑定凭据，可在核查服务商后显式清除本机任务记录；不自动取消任务或重新付费创建。

## 新增/修改文件

- 新增：`web/m05/{entry.js,local-store.mjs,workspace-backup.mjs}`、`shared/m05/snapshot-codec.mjs`、`scripts/prepare-m05-web.mjs`、`tests/m05/{fixtures.mjs,workbench.browser.py}`、本文。
- 修改：`web/{app.js,index.html,model-api.js,image-model.js}`、`scripts/{build-cloudflare.mjs,build-worker.mjs}`、`worker/m05/{routes.mjs,repository.mjs}`、`.gitignore`、`tests/m05/persistence.test.mjs`、README/交付记录。
- S1 原分支文件（实体、Schema、类型、D1 迁移、API、源文档和审计报告）经合并保留，不运行远端迁移。

## 已执行验证

- `node scripts/build-cloudflare.mjs`
- `node --test tests/cloudflare-model.test.mjs tests/image-model.test.mjs tests/m05/*.test.mjs`：46项通过。
- `python tests/m05/workbench.browser.py`：完整八实体合成工程保存/包恢复、浏览器真正关闭重开恢复、并发409、IndexedDB失败回滚、旧版恢复成新版本、损坏工程包拒绝、工程副本不覆盖、全部附件导出/哈希恢复、CAD和空MIME恢复、冲突ID/损坏Blob拒绝、LocalStorage失败补偿清理及原方案保持。
- 原 banana 浏览器模拟回归通过：创建、停止/刷新/恢复原任务、成功及失败保留旧方案/图纸/图片，不重复创建任务。
- 本地构建/产物检查、Cloudflare Wrangler dry-run 验证本轮 ESM 打包；结果见交付时实际命令输出。

所有数据为隔离合成样本，模型为模拟上游；未读取真实浏览器历史数据、未使用真实 API 密钥、未调用收费模型或执行生产SQL。真实历史附件恢复、真实账号/D1/R2、云端限额及跨设备登录仍未验收，**S0/S1 严格生产验收未通过**。当前可进入隔离 S2 开发，但不能将其等同于允许生产数据迁移。

## 回滚

回退代码到 `e5390fb` 撤回新入口，保留旧工作台与模型功能。不要清理浏览器网站数据：独立 M05 库会保留，之后恢复兼容代码仍可读取。回退前导出工作台附件和全部工程包；旧版代码不会读取新工程库，不应删除该库“回滚”。本轮不改云端绑定，不执行 DROP、自动迁移或删除历史项目。原旧导入版本会恢复其覆盖行为，回滚后谨慎使用旧备份导入。

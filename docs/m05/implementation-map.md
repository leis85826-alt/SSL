> 更新索引：本文为 S0 历史审计记录。模型接入及本轮 S1 隔离开发的最新状态见 [s1-delivery.md](s1-delivery.md) 与 [storage-adr.md](storage-adr.md)。尚未验证真实用户历史数据恢复，未启用云端 M05。

# M05 S0 架构适配与文件级实施计划

> 后续进展：用户已授权并完成本地构建配置修复，使用`--local`可构建、校验和预览，产物在`dist/local/`，不依赖生产hosting.json。下文关于缺少本地可重复构建路径的前置现已解除；生产平台配置、身份/存储能力及真实数据恢复仍待核定，尚未进入S1。

日期：2026-10-23。对应 TASK-003。依据：四份用户已上传且本轮可读的 M05 V1.0 / 2026-10-22 Markdown 文档；它们尚未入仓库，完整文件名见 current-system-audit.md。本文件是计划，**没有实施 S1—S9**。

## 1. 适配结论与架构边界

当前系统是原生前端+浏览器本机存储+Worker模型代理。不能直接套用服务端数据库已有、CAD解析已有或每株可编辑对象已有的假设；也不需要重写整站为React。

建议保持两条工作流：

```text
保留：旧概念工作台 → buildPlan/AI → 旧plan/versions → 本机保存/SVG/Markdown
新增：M05工程入口 → 已确认CAD单位/坐标/区域/轴线 → 规则/AI意图
      → 确定性几何算法 → 冲突 → 带差异预览 → 设计师确认
      → 业务API权限/Schema/幂等/并发校验 → 事务新revision
      → 同revision的DXF、Excel与云端恢复
```

旧概念图不能自动成为工程坐标；旧plan不丢弃，不把24m示意模块推算成完整施工苗木数量。M09视觉输出只读正式工程数据，不写回坐标。

### 必须先核定的技术决策

1. **部署与存储能力：** 当前仓库没有项目数据库、对象存储绑定或完整hosting配置。先确认原Sites/Worker平台允许的持久化、事务、对象存储和可信身份能力；不足时再设计外部后端。PostGIS仅为候选，不默认安装或迁移平台。
2. **认证：** 验证生产入口清洗/注入身份头；新数据API必须项目归属校验。不能将本地preview的固定身份带入生产。
3. **跨端契约：** 新增独立的共享ESM契约与几何模块；现有浏览器全局脚本通过适配层接入。避免改写整组全局脚本。
4. **构建：** 当前构建只做字符串替换，新增Worker模块imports不会被自动打包；必须随新模块接入扩展构建。选择可靠ESM打包方式后才新增固定版本依赖及锁文件，不能假装现有流水线支持多模块。
5. **数据迁移：** 先取得可靠历史备份；旧工作空间键、附件id、历史plan不覆盖。新云端对象与旧本机项目保留显式映射，不自动清理旧数据。
6. **几何依赖：** 评估Worker兼容的多边形布尔/缓冲/投影库和许可证；不能以简易矩形近似替代真实区域运算。数据库空间扩展是可选优化，不是几何正确性的替代。

这些决策须在实际配置与能力证据支持下完成。不能仅因纯函数和浏览器测试通过就认为S1持久化条件已具备。

## 2. 可复用代码与适配位置

| 现有文件/符号 | 可复用部分 | 不能直接当成M05的部分 | 计划接入 |
| --- | --- | --- | --- |
| `web/app.js` project/current/signature/buildPlan | 项目入口、条件、过期检测、旧流程 | 全量db写入、20版快照、立即生成保存不是revision事务 | 独立M05入口与project-id映射，不替换buildPlan；旧保存保留 |
| `web/case-library.js` addFiles/cover/exportCase | 文件分类、封面、案例选择、缺附件报错思路 | DXF/DWG附件不是解析后的几何 | 保留案例库，资源适配只引用确认的工程资产 |
| `web/plant-design.js` catalogs/enrich | 初选资料与来源、人工适生性提示 | 无完整物种/规格/符号主数据 | 通过受控映射导入候选，不按名字静默创建正式主数据 |
| `web/plant-workspace.js` segments/geometry/diagram | 道路组成编辑、SVG样式与下载按钮 | 没有完整轴线/坐标/单株模型/交互画布 | 保留旧SVG，新增工程画布及显式世界/屏幕变换 |
| `web/project-rules.js` check/preflight/parse/applyEdits | 录入条款来源、数值检查、明确文本修改及pending提示 | 关键词不等于AI精确目标解析；不支持几何冲突 | 规范适配后作为约束来源；M05修改只走预览 |
| `web/model-api.js` api/payload/generate | 同源请求、进度、取消、签名检查、错误保留 | 成功响应自动替换plan且保存 | 保留旧模型路径；新增M05意图适配，不调用旧generate来提交 |
| `worker/index.js` readJSON/seal/session/upstream/parseDesignOutput | 请求限额、会话、上游固定地址、脱敏、解析经验 | 只有模型API；没有项目权限或工程Schema；旧designPrompt格式不同 | 新路由独立处理，复用安全辅助但新增项目授权；保留/api/model行为 |
| `scripts/build-worker.mjs` | 静态资产收集和Worker产物约定 | 缺manifest且不打包imports | 先解决配置来源，再支持新增模块构建和完整产物验证 |

复用结论来自源码检查及报告列明的局部实测，不宣称所有旧功能已回归通过。

## 3. 文件路径约定

以下均为针对**实际SSL仓库**的拟议路径，未创建业务文件。已有文件标为“修改”，新路径标为“新增”。数据库类型/平台未定的迁移文件明确列为条件项；依赖包版本与最终存储provider不得在本轮臆定。

### 进入S1后预计新增

- `shared/m05/entities.js`：八核心实体、支撑实体、模板及版本语义。
- `shared/m05/rule-schemas.js`：六规则、单位、锁模式和数量计算类型。
- `shared/m05/api-schemas.js`：统一请求响应、错误与跨引用契约。
- `worker/m05/project-service.js`：项目和指定revision读取/保存的业务入口。
- `worker/m05/repository.js`：事务/权限所需的数据访问接口；具体adapter在平台决策后新增。
- `worker/m05/authorization.js`：可信身份到项目所有者/权限映射。
- `worker/m05/routes.js`：新 `/api/v1` 路由，不改变旧 `/api/model/*`。
- `worker/m05/legacy-adapter.js`：只读旧项目到新项目的映射、来源记录与兼容性检查；不生成不存在的工程点位。
- `docs/m05/openapi.yaml`、`docs/m05/storage-adr.md`：OpenAPI 3.1、存储/事务/身份/资源决策。
- `tests/m05/contracts.test.mjs`、`persistence.test.mjs`、`migration.test.mjs`：未来正式测试；不能把本轮审计脚本当这些测试已存在。
- 条件项：`migrations/<版本>_m05.<实际后端格式>`、`worker/m05/adapters/<已确认存储>.js`、必要的资源服务；在选型后给出精确名和可逆策略，禁止预造SQL。

### S1预计最小修改

| 文件 | 修改目的及保护边界 |
| --- | --- |
| `worker/index.js` | 在现有静态/API入口接入M05路由与可信身份；保留旧模型接口行为 |
| `scripts/build-worker.mjs` | 支持shared/worker模块打包，维护静态资产和配置复制；实现须完整验证 |
| `scripts/validate-artifact.mjs` | 在保留现有ESM检查基础上验证完整配置和新路由产物 |
| `README.md`、`docs/CODEX-CLOUD.md` | 更新真实运行、配置和存储说明，删除过时的“尚无源码”假设 |
| `.gitignore` | 仅在新工具产生本地输出时添加相应忽略项；不屏蔽应版本化的schema和迁移 |
| package清单/锁文件 | **只有**已确认打包或校验库确需依赖时才新增，固定版本并解释引入原因；当前无这些文件 |

S1优先后端模型/契约，旧前端不必立刻改写。`web/app.js` 的项目保存接入应在兼容方案和安全恢复验证后进行；不能把S1实现等同于允许迁走全部本机数据。

## 4. S1—S9详细执行与验收

每阶段均先检查Git和既有改动；只在独立开发分支按最小差异实施。任务编号和阶段严格对应M05-03。下表中的文件为计划，非完成声明。阶段依赖包含必要的横向条件，不表示所有前一阶段能力天然已完备。

### S1 数据模型（TASK-004—007）

前置：S0通过，历史数据恢复证据、存储ADR、hosting配置与身份能力已核定。

| 任务 | 实现顺序与文件 |
| --- | --- |
| 004 | `entities.js`、`repository.js`：Project/PlantSpecies/PlantSpecification/PlantingArea/PlantingAlignment/PlantingRule/PlantObject/DesignRevision；含group、资源、预览、审计、导出任务与F06模板版本；复用旧项目id须显式映射 |
| 005 | `rule-schemas.js`、`api-schemas.js`、contracts测试：六规则及范围/引用校验，统一`area_id`和示例`target_area_id`，防止名称和ID混淆 |
| 006 | 已选provider的迁移/索引、migration测试：先恢复副本演练，再向后兼容增量迁移；项目/版本/规则/对象关联约束，不删旧数据 |
| 007 | `project-service.js`、`authorization.js`、`routes.js`、OpenAPI与persistence测试：项目及指定版本读写，资源关联与权限；S6再补完整预览提交业务语义 |

验收：不用AI即可保存/恢复完整合成工程项目；历史样本保持；非法引用与跨项目访问拒绝。回滚：可逆迁移需实测；不可逆时保留新数据并回退兼容代码，不执行删表式down。

### S2 几何基础（TASK-008—010）

前置：S1契约；CAD读取方案及可授权测试样本。新增 `shared/m05/geometry/{units,stationing,offset,polygon}.js`、`worker/m05/cad-import.js`、`tests/m05/geometry.test.mjs`；资源上传/读取路由按真实平台补充。

- 008：单位确认、工程平面坐标/投影、显示变换；CAD解析适配M02，只接受实际支持的格式，不把DWG按DXF直接解析。
- 009：清理重复/零长段、累计里程、插值、正左负右偏移；折点、尖角和自交有明确失败或修正策略。
- 010：有效多边形、排除区并集、内缓冲及真实面积；不以屏幕像素计算。

验收：未知单位和未投影经纬度拒绝米制计算；画布缩放坐标不变；折线、排除区、无效区域自动测试。回滚：新增适配层撤回，原CAD附件及概念SVG路径不变。

### S3 乔木算法（TASK-011—014）

前置：S2通过。新增 `shared/m05/algorithms/{equal-spacing,groups,alternating,logical-identity}.js`、`tests/m05/tree-algorithms.test.mjs`。

- 011：等距/固定数量/居中/两端对齐，100m、两端各5m、间距6m → 16株，里程5至95。
- 012：每组跨度 `(K-1)*d`，组首周期 `(K-1)*d+g`；100m、退距各4m、K5/d4/g12 → 3组15株，组首4/32/60m；末组不完整必须显式许可。
- 013：A-A-B九位置 → 6A+3B；按明确模式决定物种。
- 014：group_id、横向错位、稳定logical_key与版本行ID分离、局部重算匹配。

验收：位置和数学距离正确，相同输入/几何/算法版本可复现；无关对象不改变。回滚：撤回新算法入口，不迁改旧plan。

### S4 灌木地被（TASK-015—017）

前置：S2面运算、S1数量模型、S3身份契约。新增 `shared/m05/algorithms/{hedge-rows,groundcover,area-partition}.js`、`shared/m05/quantities.js`、`tests/m05/area-algorithms.test.mjs`。

- 015：单/多行/梅花形，行距/侧退距约束；变宽区逐点裁切。
- 016：有效面积×密度，保存理论未取整值及单区/合并取整规则；逐株数量与区域估算不重复相加。
- 017：3.5m按0.75/2/0.75m分区并与真实多边形裁切；无可靠参照轴线要求人工指定。

验收：面积守恒，胶东卫矛篱和金叶石菖蒲分区无错误重叠；区域可编辑且数量可追溯。回滚：取消未提交预览或读取前版，不删除原区域。

### S5 冲突（TASK-018—020）

前置：S2—S4。新增 `shared/m05/{constraints,conflict-strategies,locks}.js`、`tests/m05/constraints.test.mjs`。

- 018：越界/排除区/重复/最小中心距；返回ID、原因、坐标、受影响对象与严重度，考虑空间索引。
- 019：REPORT/SKIP/REJECT/AUTO_ADJUST；自动调整设置固定搜索顺序、步长、最大偏移和迭代上限。
- 020：UNLOCKED/POSITION_LOCKED/FULLY_LOCKED；锁定对象参与冲突，局部重算不覆盖受保护属性。

验收：无解报告、硬约束不可被确认绕过、锁定对象位置/属性按语义保护。冠幅重叠不是自动工程冲突；未提供数据时不宣称交通视距/地下管线审查通过。回滚：保留原版本，撤回新策略。

### S6 预览版本（TASK-021—023）

前置：S1事务/权限+S3—S5引擎。新增 `worker/m05/{preview-service,commit-service,revision-service}.js`、`shared/m05/diff.js`、`tests/m05/preview-commit.test.mjs`；修改新 `routes.js`。

- 021：创建/查询有时效、归属及不可篡改摘要的预览，正式方案无副作用。
- 022：confirmation、Idempotency-Key、base_revision_id、项目权限、摘要与硬冲突检查；事务创建版本/对象/规则/审计并更新当前revision。同键不同请求不得静默复用，旧基线409。
- 023：新增/删除/移动/更新/未变差异；撤销已提交操作产生新恢复revision，历史不改写。

验收：重复请求不重复增树，失败注入事务回滚，并发冲突、过期/篡改/跨项目预览拒绝，旧版可读。回滚：保留历史，用新恢复版本，不能沿用旧restore-version直接覆盖工程数据。

### S7 可视化（TASK-024—026）

前置：S6及已有画布交互审计完成。新增 `web/m05/{entry,canvas,parameter-panel,editor,preview-panel,api}.js`、`web/m05/styles.css`、`tests/m05/ui.spec.*`（后缀由选定测试工具确定）；最小修改 `web/index.html`、`web/app.js` 的入口与 `web/styles.css` 的隔离容器。旧 `plant-workspace.js` 绘图保留。

- 024：工程坐标植物/区域/图层/冲突的画布，显式变换，不用旧24m示意坐标当工程数据。
- 025：树种规格、株距、组内/组端距离、末端策略；覆盖F06模板保存/版本/跨项目应用和适生性复核。
- 026：单/多选、拖动、替换、分组移动、锁定、取消和局部修改；编辑走预览确认。

验收：拖动正确转换工程位置，未选/锁定对象不误改，取消无正式副作用，旧项目/案例/规范/SVG功能回归。回滚：关闭M05入口/撤回适配，旧工作台不依赖新数据存在。

### S8 AI指令（TASK-027—029）

前置：S6安全业务API+S7选择范围。新增 `worker/m05/{intent-service,target-resolver}.js`、`shared/m05/intent-schema.js`、`web/m05/ai-panel.js`、`tests/m05/intent.test.mjs`。从旧 `worker/index.js` 复用传输/会话能力，**不改旧designPrompt兼容逻辑来伪装新契约**。

- 027：自然语言输出可验证意图和参数，服务端解析真实对象/物种ID，歧义先澄清。
- 028：只调用配置预览；AI不能直接SQL、写正式库或自动确认提交；权限/Schema/限额/冲突不可绕过。
- 029：“只改地被，乔木不变”“只换中间胶东卫矛篱”与跨项目/恶意提示反例；未知目标拒绝或澄清。

验收：正确作用域、无越权、AI失败时手动流程可用。仅在明确允许后测试真实收费上游。回滚：关闭AI新入口，保留确定性配置及旧模型功能。

### S9 集成导出（TASK-030—032）

前置：前述阶段通过、历史数据恢复和原有功能基线可验证。新增 `worker/m05/{dxf-export,statistics,excel-export,export-jobs}.js`、`tests/m05/export.test.mjs`、`tests/m05/e2e.spec.*`、测试道路样本及验收记录；修改M05路由与导出界面。旧SVG/Markdown/JSON导出不删除。

- 030：固定revision输出可编辑DXF，含图层、对象追溯、工程坐标和符号映射；不是把SVG改扩展名。
- 031：同revision Excel苗木表区分实例株数、面积、密度、估算和取整。
- 032：创建→CAD导入→配置→局部修改→校核→提交→DXF+Excel→另设备或独立会话恢复，验证项目权限与资源。

验收：删除5新增3后的两种输出与正式版本一致；真实道路流程和旧工作台回归通过；1000株/3秒（不含AI）在声明的目标环境实测，目标不等于结果。回滚：旧导出入口继续可用；生产发布不在本轮授权范围。

## 5. 统一契约待补齐点

- M05-02 16个主要API之外，版本历史、CAD读取、资源上传和导出任务状态接口需完整OpenAPI；单株PATCH必须符合预览/新版本语义。
- 六规则、quantity_method、geometry类型、lock_mode、logical_key和algorithm_version共享定义；物种与规格引用不能按显示名称隐式匹配。
- 预览摘要/时效、幂等有效期、同键不同请求、并发冲突处理、坐标投影、误差容限、取整策略需明确。
- UI及后端均需要契约校验；仅旧Worker validate(parts)或关键词parse不满足工程Schema。
- API服务端最终鉴权，任何ID引用均核对项目/版本归属；静态公开页面不意味着项目数据公开。

## 6. 测试、交付与准入

S1—S9测试均为未来计划，当前没有实现。按M05-03 §12逐任务记录编号、状态、依赖、实际新改文件、关键实现、运行命令/结果、未验证、风险、回滚、下一步。单元/属性/接口/UI/端到端分别覆盖，不以零测试或语法检查代替业务验证。

本轮实际验证详见current-system-audit.md；审计脚本在仓库外，不改变现有测试或依赖。当前三份报告是唯一新增的仓库文件。

进入S1前须满足：

1. 修复或明确可复现的本地完整构建路径，并取得正确hosting配置来源；不要编造生产secret/配置。
2. 真实历史项目完成安全保全、全部附件引用核对及隔离恢复；针对已复现备份缺口采用验证过的补充保全或另行授权修复。
3. 确认存储/事务/资源/身份能力，完成storage ADR和最小兼容迁移设计。
4. 对照四份正式文档复核S0报告，把它们通过受控方式纳入项目资料，保证后续任务可独立追溯。
5. S0复核通过后，由用户明确开启S1；本轮不自动继续开发。

**结论：S0审计和实施映射已有实际代码依据；恢复和构建前置仍不满足，整体未通过验收，暂不进入S1。**

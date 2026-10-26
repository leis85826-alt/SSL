> 2026-10-26 后续实现：Access JWT、R2资源服务和显式同步见 [cloud-sync-delivery.md](cloud-sync-delivery.md)。本文保留原S1选型及未配置时的边界，真实云端资源仍未启用。

# S1 存储与身份适配决策（2026-10-23）

状态：隔离开发已实施；云端资源未创建，不是生产上线批准。

## 决策与依据

实际工程为原生前端 + Cloudflare Worker；目前无项目库绑定。选择 SQLite 兼容契约、Cloudflare D1 适配器（prepare/bind/first/all/batch），本地 Node 24 内置 SQLite 验证相同迁移及 SQL。无 PostGIS 假设，无新增运行依赖；几何算法在 S2 选择。

八核心实体独立存储：project/revision 表及 species、specifications、areas、alignments、rules、objects 的 revision 范围表。组、资产引用、模板亦按 revision 保存；预览、权限、导出任务及审计表提供支撑结构。catalog 在每版本冻结，以保证历史物种规格可恢复；后续 M04 主库只通过显式映射同步，不按名称静默覆盖。

实体 payload 使用受控 JSON，主键及项目/版本外键在 SQL 约束，实体间业务引用由共享契约在写入前校验。完整副本适合 S1 正确性验证；单次 SQL 数量随实体数增长，不宣称通过千株性能验收。真实 D1 套餐查询数、batch 大小/时限需部署前实测；超过限制必须整批失败，禁止拆分为多次非原子提交。S6 可评估每版本压缩快照或更高容量数据库；不可弱化原子性。

新项目及每次保存以一次 D1 batch 写入版本、实体、当前指针、审计；SQLite 测试以事务模拟 D1 documented batch 原子性。项目+版本号唯一、同一父版本只能有一个子版本，阻止并发分叉及静默覆盖。旧基线 409。触发器拒绝已保存版本与实体 UPDATE/DELETE。恢复历史内容也须创建新版本，不能删除当前版本回退。S1 `/snapshots` 是手动完整快照存储原语，**不是** S6 `/planting/commits`：尚无冲突引擎、预览摘要或提交幂等契约，不能当成已通过工程校核的成果。

工程坐标已归一化为米；source_unit/unit_to_meter 保留原始 CAD 来源。S1 只接受显式 LOCAL_ENGINEERING:<id> 或 UTM EPSG:32601—32660/32701—32760；其他坐标系待 S2 投影适配，不凭任意 CRS 名称承诺米制正确。几何只验证结构、有限坐标、闭合环；面积/长度为输入声明，不证明拓扑有效或面积正确，S2 复算。

资产仅存 storage_key、SHA256、大小与 MIME 元数据；S1 **没有**上传、下载或真实 Blob 存储。R2 为后续候选，未创建绑定。读取完整测试项目恢复的是结构及资产引用，不等于真实附件已跨设备恢复。

## 身份与默认关闭

不复用匿名模型浏览器 cookie 作项目账号。`M05_ENABLED` 缺省关闭，`M05_DB` 缺失或没有可信账号 resolver 均 503，不退化为内存库或公开数据库。现有 wrangler.jsonc 不增加启用变量或数据库绑定。

生产适配预留私有 `M05_AUTH` service binding，调用固定内部 `/session`，仅转发 Cookie/Authorization 供真实登录服务验证；返回 `{authenticated:true,user_id:稳定账号ID}`。普通客户端不能通过 oai-authenticated-user-id 或伪造 user_id 请求获得身份。无登录服务时不开放云端项目。登录服务的会话验证、限流、注销与跨设备稳定账号仍需实现/独立验证；不能仅绑定一个返回固定用户的服务。

拥有者或明确 READER/EDITOR 授权才可读写。API 不开放修改授权功能；M05_AUTH 是信任边界，必须由运营者控制，不得绑定公共回显服务。HTTPS、同源写入、2 MiB 请求限额、no-store、随机 request_id、内部错误脱敏。

## 接入与回滚

生产启用前：真实历史完整备份和隔离恢复核对；资源 Blob 实测；真实账号服务评审；新建专用 D1、在副本演练迁移/并发/故障；明确授权后才配置绑定与启用。不要对原业务库运行迁移，也不要把真实数据上传 Git。

代码回退到模型分支提交 7fc6e3d；先关闭 M05_ENABLED 并保留新数据。迁移只有 additive up；不提供会删除已存数据的 down SQL。空测试库可删除整份隔离文件；有数据的库必须备份且保留，不能 DROP 表回滚。D1 备份/恢复命令须在真实资源建立后确定并演练，当前没有执行远端 SQL。

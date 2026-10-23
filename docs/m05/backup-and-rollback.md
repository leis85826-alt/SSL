> 更新索引：本文为 S0 历史审计记录。模型接入及本轮 S1 隔离开发的最新状态见 [s1-delivery.md](s1-delivery.md) 与 [storage-adr.md](storage-adr.md)。尚未验证真实用户历史数据恢复，未启用云端 M05。

# M05 S0 备份、恢复与回滚

> 后续构建修复记录：用户授权后新增独立本地配置及`--local`路径，未修改业务代码或历史数据。原有备份继续作为修复前基线；回退本次构建修复应只撤回README、三个scripts文件和新增local-build.json的对应差异，保留原有审计报告及用户改动，不能整仓reset。本地构建现已通过，生产hosting配置及真实历史数据恢复仍未验证。

日期：2026-10-23。对应 TASK-002。状态：源码基线恢复通过；合成数据恢复通过；真实历史项目恢复未验证。不得据此称生产可无损回滚。

## 1. 当前 Git 基线和保护措施

仓库 `/workspace/SSL` 从 `leis85826-alt/SSL` main 新克隆，HEAD `429a548f43e5646a4203478af1698f8510658fac`。初始无未提交/未跟踪文件、无 stash，与 origin/main 一致。未覆盖旧 `/workspace/sss` 或此前审计材料。

备份后创建 `audit/m05-s0-20261023` 分支，只新增 `docs/m05/` 三份报告。未改正式源码、未提交、未推送、未打标签、未合并。`dist/` 是本轮构建失败前产生的忽略输出，不是历史业务数据；它不作为源码备份的一部分。

位置：`/workspace/ssl-s0-20261023/backup/`。

| 产物 | 内容 |
| --- | --- |
| SSL-before-S0-docs.tar.gz | 完整checkout及.git，排除本轮生成的dist |
| SSL-all-refs.bundle | 本地已取回的所有refs/对象；不代表未取回的远程分支 |
| git-state.json | 原始HEAD、branch、refs、status、ignored、stash及来源身份 |
| SHA256SUMS | 两份备份的SHA-256 |
| verification.json | 解包后的文件比较、HEAD、状态、fsck及bundle校验结果 |
| verification-restore/SSL | 独立解包的校验副本，不是开发分支 |

实测：54个文件逐个内容哈希一致；恢复HEAD一致、Git干净，`git fsck --full`通过，`git bundle verify`通过。源码构建仍有 hosting manifest 缺失，恢复正确不等于应用完整构建通过。

## 2. 源码恢复演练及未来步骤

本轮已经在独立目录演练。未来需要再次检查时使用新目录，不覆盖现有 checkout：

```bash
set -euo pipefail
cd /workspace/ssl-s0-20261023/backup
sha256sum -c SHA256SUMS
restore_dir=$(mktemp -d /workspace/ssl-restore.XXXXXX)
tar -xzf SSL-before-S0-docs.tar.gz -C "$restore_dir"
git -C "$restore_dir/SSL" rev-parse --verify HEAD
git -C "$restore_dir/SSL" status --porcelain=v2 --branch --untracked-files=all
git -C "$restore_dir/SSL" fsck --full
git -C "$restore_dir/SSL" bundle verify /workspace/ssl-s0-20261023/backup/SSL-all-refs.bundle
```

确认原始HEAD后再讨论切换。现有分支有新工作时先另做快照。禁止把 `reset --hard`、`clean -fd`、强制checkout或直接解包覆盖原目录当作默认回滚方案。归档和bundle保存在同一云机器，尚非异地灾备；应按数据等级另存至安全位置并复核校验值，不能公开上传。

## 3. 真正的数据在哪里

无云端项目数据库、schema或迁移。生产的项目、案例、规范和版本在用户浏览器中：

- LocalStorage：精确键 `roadscape-workspace-v1`。
- IndexedDB：数据库 `roadscape-files`、对象仓库 `files`，值包含 `id` 和 `file`。
- plan / versions 中可能有 `aiImages[].fileId`，也可能有旧服务商图片 URL；URL不是已保存的Blob，可能失效。
- Cookie中的模型密钥会话不属于业务备份，不得导入其他设备；重新登录并配置密钥。

Git备份不覆盖这些数据。域名、协议和端口构成origin，不能把换域名后空工作空间误认为数据已删除，也不能把本机 LocalStorage 当跨设备云存储。不要清理浏览器缓存、重置站点数据或卸载旧浏览器。

## 4. 内置备份的风险和使用限制

`web/app.js:98–99` 的工作空间导出/导入已用合成数据执行。

1. 正常项目、案例、规范、已列出的附件、版本和几何可在独立上下文恢复。
2. 仅出现在历史 `plan.aiImages` 的图片File未被导出；已复现。
3. 附件引用找不到Blob时静默跳过，仍下载备份；已复现。原始Blob已丢失时不能凭空修复。
4. 导入按相同ID覆盖较新数据，无二次冲突确认；先写附件、后合并状态，失败非整体回滚；不可直接对唯一原数据执行。
5. `case-library.js:63` 的独立案例备份在缺失附件时会报错，是可参考的保护，但不能代替全工作空间验证。

因此，**目前不能仅依赖网页“完整备份”按钮作为进入迁移阶段的充分保障**。JSON中的用户资料也可能敏感，需受控存储。

## 5. 全量浏览器数据保全方案

这是审计提出的保全流程，不是已在真实用户电脑执行的备份，也不修改业务代码。

1. 在原电脑、原浏览器配置文件、原站点origin记录备份时间；停止编辑、生成和附件上传，避免多标签页并发写入。
2. 保留正常网页导出的工作空间与各重要案例备份，先不要导入回原浏览器。
3. 由可信维护人员在用户授权的本机环境读取**精确业务键** `roadscape-workspace-v1` 的原始字符串；同时只读遍历 `roadscape-files/files` 的全部记录，保留 id、File名称、MIME、原始字节和校验值。不要导出其他站点存储、Cookie、会话或密钥。
4. 对当前plan、历史versions、项目/案例/规范files、aiImages引用建立清单，对照全量Blob。分开报告“已保存且有引用”“孤立Blob”“引用但缺失”“外部URL”。缺失项必须逐一确认，不能标完整。
5. 本地加密保存并在受控第二位置保留副本；归档清单包括origin、schema版本、时间、项目/版本/文件数与SHA-256。不要把真实项目数据提交Git或上传本对话。
6. 若要制作浏览器配置文件级兜底副本，应关闭浏览器后使用该浏览器/操作系统支持的方式，单独保护其凭证资料；此方式的跨机器可恢复性不能假设。

本轮 `browser-audit.py` 对**合成数据**执行了第3步的精确业务键+全量IDB读取，输出 `synthetic-full-store-backup.json`，在第三个独立浏览器上下文恢复。原始LocalStorage字符串一致、仅历史引用的图片字节一致；这验证了保全方向，未验证实际历史数据或所有浏览器版本。

此全量包不是现有 `roadscape-backup-v1` 格式，**不能直接交给网页导入器**。恢复应在隔离工具中按实际schema写附件、验证字节，再写业务键并重载；本轮脚本已对合成数据演练这一顺序。不能把外部URL当已打包资源。

## 6. 历史项目恢复验收（尚待执行）

在同版本应用的隔离浏览器配置/实例中恢复，严禁先对原始工作空间覆盖：

- 核对项目、案例、规范、版本数量及每个关键字段；确认相同ID不会意外映射到其他项目。
- 对所有Blob逐一校验，核对项目附件、案例封面、规范原件、当前及历史图片。
- 打开代表项目，核对原道路组成/带宽/品种和历史SVG、Markdown、JSON输出；验证20版历史窗口内实际存在的版本。
- 先在隔离副本执行版本恢复、文字调整及保存重开，再比较未操作项目没有改变。
- 缺失外部资源、旧数据兼容问题、部分损坏必须单列。不能以测试项目成功替代真实历史样本。
- 保存恢复证据和备份清单即可，不需把真实数据交给Codex或写进报告。

## 7. M05后续回滚架构

| 对象 | 策略 |
| --- | --- |
| 旧工作台入口 | 保留规则、案例、规范、SVG和本机保存路径；新增M05入口使用独立开关，不替换旧生成函数 |
| 新工程数据 | 使用独立schema/版本和命名空间；原本机业务键保持可读取，不重命名覆盖旧键 |
| 导入旧项目 | 首先只读映射并预览，保留原始JSON和资源校验；概念方案不自动伪造每株真实坐标 |
| 云端存储 | 先核定实际后端能力；一致性事务创建新revision，失败不更新current_revision；新格式不能默认被旧代码读取 |
| 撤销已提交操作 | 创建新的恢复revision，不修改历史；代码回滚不等于数据回滚 |
| 迁移 | 独立评审和演练，可逆时才执行down；否则兼容代码回切，保留新增数据，不删表清库 |
| 生产 | 本轮无部署；未来另行确认平台、可信身份、secret管理、制品、切换和监测。生产恢复需要明确授权 |

未掌握实际数据量与业务容忍度，不承诺RPO/RTO。进入S1前至少要有可靠历史数据副本及隔离恢复证据，补齐hosting配置来源，确定项目存储与身份边界。当前TASK-002未满足完整验收。


## S1 补充：只读完整附件保全工具

`web/m05/legacy-backup.mjs` 不自动加载，不替换旧导入/导出。它扫描整个工作空间（含历史 plan.aiImages.fileId），导出全部 IndexedDB 附件及 SHA256；缺失附件即失败，工作空间有编辑则拒绝完成。执行期间应关闭其他工作台标签页并停止所有编辑。只比较 localStorage 前后值，不能声称多标签页存储是原子快照。

在已备份、可访问此模块的对应浏览器站点上下文中可用 `import('/m05/legacy-backup.mjs').then(m=>m.downloadLegacyBackup())` 手动下载。当前分支未部署，因此不能假定线上已能运行这个命令。工具格式为 `roadscape-full-backup-v2`，**不能直接交给旧 v1 导入按钮**。本轮只提供导出与隔离测试恢复，没有上线 v2 恢复 UI。下载内容属于私有项目数据，应离线保管，禁止上传 GitHub。真实用户工作空间尚未在本工具上验证。

本轮模型完成后基线 7fc6e3d 已打包至仓库目录外 `/workspace/ssl-m05-s1-baseline/before-s1.bundle`，附 SHA256SUMS，并已执行 `git bundle verify`。该备份包含完整 Git 历史，不包含浏览器用户项目、附件或会话密钥。独立恢复检验后可用该基线撤回新增代码；已有 M05 数据库应保留并关闭入口，不能删除迁移表来回滚。

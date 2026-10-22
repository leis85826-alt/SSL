# Codex Cloud 可复用环境设置

## 重要区别

Codex 的已保存/已发布环境配置可以复用，但新任务通常会有独立工作区；它不是持久运行的网站服务器。缓存是否命中及依赖是否重装取决于项目和环境。

## 源代码导入前

仓库当前只有基础管理文件。**请不要盲目填写 `npm install`、`npm ci` 或 Python 安装命令**：尚无明确技术栈或锁文件。

## 导入源码之后

1. 在 Codex Cloud 中选择 GitHub 仓库 `leis85826-alt/SSL`，确认分支。
2. 检查项目依赖文件：例如 `package.json` 与 `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`requirements.txt` 或 `pyproject.toml`。
3. 若使用 npm 且有有效 `package-lock.json`，优先使用 `npm ci`；若使用 pnpm/yarn/Python，则使用对应的锁定安装流程。
4. 在环境配置中设置可重复执行的准备命令，验证构建/测试。
5. 发布/保存环境配置，在新任务中选择该环境并验证是否可以复用。
6. 运行项目需要的密钥应通过安全的环境变量配置，**不提交到 GitHub**。

## Codex 首个源码检查任务

> 请检查此仓库真实技术栈、依赖锁文件、运行/测试脚本与项目结构。给出 Codex Cloud 可复用环境的安装命令和验证命令。仅在证据充分后添加自动化安装脚本；不要改变现有业务功能、线上部署或敏感数据。

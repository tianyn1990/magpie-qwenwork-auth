# Magpie 千问办公独立插件

让 Magpie 使用你自己的千问办公账号与办公积分。供应商标识为 `qwenwork-community`，可以单独安装、升级和卸载。

**当前为 beta。** 已完成协议单元测试、模拟模型与工具调用测试，并用千问办公 1.3.2 的本机组件验证离线签名。尚未用真实账号完成浏览器授权、模型回答及积分扣减验收。请先用新会话测试，再加入日常备用链。

## 下载后使用

需要已经安装 Magpie 和千问办公官方桌面 App。插件自动读取 App 随附的签名组件，**不读取、解密或复制 App 登录令牌**。不包含厂商 WASM；首次使用仍需要为插件单独授权。

1. 在 [Releases](https://github.com/tianyn1990/magpie-qwenwork-auth/releases) 下载最新版本的 `.zip` 并解压。不是 GitHub 自动生成的 Source code 包。
2. macOS 双击 `安装到Magpie.command`；Linux 在该目录运行 `sh install.sh`；Windows 在 PowerShell 中运行 `powershell -ExecutionPolicy Bypass -File .\install.ps1`。
3. 打开 Magpie 的插件列表，找到本插件；在供应商的「来自插件」入口选择「千问办公（社区独立插件）」，点击浏览器登录。
4. 登录自己的账号。首次授权可能唤起千问办公 App；插件使用自己生成的 PKCE、nonce 和设备标识收取本次授权，不读取 App 的已有登录文件。
5. 在新会话选择 `qwork-auto`（基础）或 `qwork-advanced`（高级）。确认模型回答、工具调用和办公积分变化后，再把它加入路由。

安装脚本只注册本插件，不自动登录、选择模型或把它加入任何现有路由。脚本执行时才会安装；下载、解压或阅读本仓库均不会安装。发布版安装到固定用户目录，升级可再次运行同一安装脚本。使用同一目录注册，不会创建多份供应商。

也可以从 GitHub 安装指定版本（不需要自行编译）：

```sh
magpie plugin add github:tianyn1990/magpie-qwenwork-auth#v0.1.0-beta.1
```

GitHub 安装与解压安装二选一，避免同时安装两份提供同一供应商的插件。首次添加插件时 Magpie 可能自动准备它使用的 Bun 运行时；使用者无需安装 Node.js 或开发工具。

## 为什么使用浏览器授权

浏览器为插件建立独立的账号凭据，每个人登录自己的账号并消耗自己的办公积分。插件的令牌由 Magpie 保存在用户配置目录的 `plugin-auth.json`，不在插件包中，也不上传到本项目。

本机 App 只提供静态签名组件，不需要保持运行。采用这种方式避免插件与 App 共用、轮换同一刷新令牌，也便于把插件分享给别人。已经登录 App 不等于已经授权插件；浏览器可能复用你已有的网页登录状态。

## 支持范围

- 独立浏览器授权、插件账号刷新、办公积分查询。
- Chat Completions 流式与非流式响应，由 Magpie 负责与 Codex 等客户端协议转换。
- function 工具定义、工具调用增量、工具结果回传；图片 URL/data URI 保留给上游。
- 在尚未输出模型内容时，把可识别的额度不足错误转换为 HTTP 429，供 Magpie 选择下一路。
- 余额未知总额时只显示剩余积分；不伪造已用百分比。读取余额不会领取每日积分。

本插件提供千问办公模型档位，不提供 GPT 模型。目录采用保守的上下文/输出默认值，模型权限与真实上限以账号和上游返回为准。`qwork-ultimate` 等未验收档位暂不列出。

## 升级、回滚和官方支持

Magpie App 与插件独立升级。解压安装的本地插件不会自动更新；下载新 Release，再运行安装脚本即可。安装器保留一份 `.previous` 文件备份，账号仍由 Magpie 管理。回滚时下载旧 Release 并运行其安装脚本。

通过 GitHub 固定标签安装时，升级请显式添加新的版本标签。不要让他人把包含令牌的 Magpie 配置目录发给你。

未来 Magpie 官方提供千问办公入口时，可停用本插件，给官方入口重新授权，并手动替换路由成员。本插件使用独立供应商 ID，避免主动占用未来官方的 `qwenwork` 标识；不执行自动迁移。

客户端签名组件的接口若变化，插件会明确拒绝不认识的 ABI，并提示更新。服务端的登录、加密和计费协议变化仍可能需要发布新版本，不能保证永久兼容。

## 兼容性与历史会话

已核对 Magpie 0.1.1296 的 OpenCode 插件宿主接口；本机千问办公为 macOS 1.3.2。Windows/Linux 提供安装与组件发现规则，真实客户端兼容性仍待对应平台用户验收。详见 [兼容性与验证](docs/compatibility.md)。

已有 Codex 原生 `cmp_…` 加密摘要绑定来源，插件无法解密。请先用新会话验证。计划在不同供应商间自动切换时，应另行核对 Magpie 的上下文压缩与路由亲和设置，不能把旧会话无损迁移当作插件保证。

## 非标准安装位置与排查

优先使用正常的官方 App 安装位置。非标准目录可在启动 Magpie 的环境中设置 `QWENWORK_APP_PATH`（App 或 resources 目录）或 `QWENWORK_WASM_PATH`（组件文件）。macOS 默认查找 `/Applications/QwenWorkCN.app` 与用户 Applications；Windows 查找 LocalAppData/Program Files；Linux 查找 `/opt` 与用户 share 目录。

开发者可以运行 `npm run diagnose`：仅输出插件版本、签名组件位置、版本和 SHA-256，不读取凭据、不发网络请求、不写客户端配置。使用下载包时，可用 Magpie 的 Bun 执行 `scripts/diagnose.mjs`。未知错误请反馈插件版本、Magpie 版本、App 版本和脱敏报错，**不要提交令牌、Cookie 或完整会话内容**。

## 开发与发布

无运行时 npm 依赖。开发需要 Node.js 22+；Magpie 内使用它自己的 Bun。

```sh
npm test
npm run check
npm run release:pack
```

跨平台模拟测试在 GitHub Actions 中运行；有本机官方 App 时额外运行真实组件的离线签名测试，无 App 的 CI 会明确跳过这一项。隔离 Magpie 宿主验证方法见 [维护文档](docs/maintaining.md)。

版本以 `package.json`、Git 标签和 Release 为准；推送匹配的 `v*` 标签会自动测试、打包并发布 ZIP、npm TGZ、SHA-256 校验文件和发布清单。beta 标签发布为预发行版本。[更新记录](CHANGELOG.md) · [第三方说明](THIRD_PARTY_NOTICES.md)

本项目是独立社区适配，与 Magpie、千问办公官方没有隶属关系。

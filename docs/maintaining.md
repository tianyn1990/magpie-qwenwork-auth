# 维护与发布

## 本地开发

源码为 ESM JavaScript，入口只导出一个插件函数；辅助导出放在 `lib/`。不需要构建或运行安装脚本。`npm test` 不调用真实上游，不刷新用户令牌、不写用户客户端配置。有官方 App 时使用其 WASM 对虚构凭据签名；没有时明确跳过该项。

如需要验证 Magpie 宿主，设置 `MAGPIE_TEST_HOST` 为已核对版本的 `internal/plugin/host.js`，`MAGPIE_TEST_BUN` 为 Bun 可执行文件，再执行 `node --test test/host.test.mjs`。测试只在系统临时目录保存虚构账号和宿主状态；不执行 Magpie 的安装命令。

安装器测试把目标目录和 Magpie 可执行文件全部替换为临时目录/模拟命令；不得把测试变量指向真实配置。签名组件测试只读官方静态资源，不调用 App CLI 或钥匙串。

## 发布新版本

1. 更新 `package.json` 的 SemVer 版本与 `CHANGELOG.md`。
2. 执行 `npm test && npm run check && npm run release:pack`。
3. 检查 `dist/SHA256SUMS` 和 ZIP/TGZ 内容，确保没有 WASM、凭据、缓存或本机路径。
4. 提交并推送；为该提交创建 `v<package.json version>` 标签并推送。
5. Release 工作流检查标签一致性、重新测试并构建。包含连字符的版本自动标为预发行。
6. 确认该提交的 CI 和 Release 工作流均成功、附件可下载后，将远端 `release` 分支快进到这个版本提交。Magpie 的图形安装来源 `github:tianyn1990/qwenwork-magpie#release` 跟踪此分支；不要把它指到未发布或检查失败的提交。

Release 中包含：

- `magpie-qwenwork-auth-<version>.zip`：给使用者解压安装。
- `magpie-qwenwork-auth-<version>.tgz`：标准 npm 包格式，供包管理和归档使用；此项目不自动发布 npm。
- `SHA256SUMS`：上面两个包及发布清单的 SHA-256。
- `release-manifest.json`：版本、供应商标识、运行时依赖与验证范围。

旧版本通过 Git 标签和 Release 保存；可以重新下载旧包回滚，不覆盖已有发布附件。变更签名或授权协议时先发 beta，在独立新会话完成真实验收后再标稳定版本。

## 未来官方支持

独立 ID 为 `qwenwork-community`。不要更名为 `qwenwork`、接管官方供应商或自动改用户路由。未来如有官方实现，保留手动迁移说明：给官方入口重新授权、确认余额和新会话可用、替换路由成员、停用本插件。

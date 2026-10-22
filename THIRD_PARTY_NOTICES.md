# 第三方来源

`lib/wasm.mjs` 的 wasm-bindgen 桥接代码改编自：

- 仓库：https://github.com/XuePengJu/dsh-our-free-model
- 固定提交：`71b55a985aa09940acc2b4f909da5c56f17097a0`
- 文件：`vendor/channel-pack/src/qwenwork-wasm.ts`
- 许可证：MIT，原 channel-pack 版权声明如下。

改动包括运行时发现与 ABI 检查、调用当前组件的身份材料生成器、按组件路径/时间缓存、释放请求结果和字符串，以及移除随包 WASM、钥匙串与登录文件相关依赖。登录与请求协议的研究也参考了同一提交下的 `qwenwork*.ts`，并与本机官方客户端 1.3.2 的公开随包代码作了核对。

本仓库及 Release **不包含**千问办公的 WASM、App 文件、用户凭据或官方程序的其他二进制。运行时只读取用户自己安装的 App 中的静态签名文件；该文件不属于本项目 MIT 许可范围。

```text
MIT License

Copyright (c) 2026 Jet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

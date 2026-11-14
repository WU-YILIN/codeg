# Mantapal 前端集成

基于 `WU-YILIN/codeg` 的 `main`（`3209e500abd50076a84850f74aa7eb1be1585df4` / 0.42.3），开发分支 `mantapal/cn-frontend`。设计基于已确认的 Mantapal v1.5 原型。本次是 React / Next.js 正式组件集成，不是嵌入原型 HTML。

## 运行

```sh
pnpm install --frozen-lockfile
pnpm dev
```

工作台仍需要原项目的 Tauri 或 `codeg-server` 后端。新的 Mantapal 账户服务通过 HTTPS 提供，地址在构建时配置：

```dotenv
NEXT_PUBLIC_MANTAPAL_ACCOUNT_API=https://your-account-service.example/api/mantapal/v1
```

不配置时使用同源 `/api/mantapal/v1`。账户接口未提供时登录页会报告“账户服务尚未接通”，不会模拟成功。Next 静态导出不提供这些服务接口。

开发交互测试：运行 `pnpm dev:mantapal`（跨平台，Windows 也可直接运行）。也可在未提交的 `.env.local` 中设置 `NEXT_PUBLIC_MANTAPAL_DEMO=1` 后启动 `pnpm dev`。测试账号 `Levi`，手机号 `13800138000`，密码 `Mantapal123!`，验证码 `123456`，登录页也提供一键进入。测试适配器只在 **development + 显式开关** 同时满足时导入，状态仅存在页面内存，刷新后重新登录。微信扫码为明确标识的模拟流程，不发送短信、不访问微信、不支付。

`pnpm build` 固定使用正式服务，即使残留演示开关也不启用测试适配器。生产环境不可将演示适配器作为服务故障的降级方案。

演示账户在每个窗口中独立，新打开的设置窗口也需要使用测试入口登录，随后返回原设置页。仅启动 Next 开发服务并不包含 Codeg 执行后端；完整工作台联调沿用原 Tauri 开发流程，并在 `.env.local` 设置上述演示开关。

## 已集成的界面和行为

- 原品牌 Logo 与启动动效；默认浅色、简体中文，保留已有的用户手动外观设置。
- Codeg 原侧栏功能顺序及顶部搜索；仅在左下角保留用户中心与设置入口；右下角状态栏固定快捷操作与用量。
- 最近工作读取原会话数据，点击打开原会话；新任务仍使用原 `AgentSelector`、`ChatInput` 和执行链路。原 Agent、ACP、MCP、终端、Git、文件、任务、自动化、Forge、Canvas、标签页与分屏逻辑保留。
- 随手记按账户 / 远程连接 / 项目隔离存于设备；多标签页同步；存储满时保留内存草稿并提示复制。
- 手机验证码、账号密码、微信扫码、注册、绑定手机号、忘记密码、首次称呼设置；注册 / 微信新用户绑定必须主动同意政策，并提交政策版本。
- 首次引导只有称呼，没有默认 Agent 或自带 API。登录没有权益营销、套餐宣传或“国内版”标签。
- 用户页面整合个人资料、安全、偏好、真实用量、隐私入口，偏好继续打开原设置组件；Free / Pro 来自服务返回，无价格、收款或演示权益。
- 原服务器访问令牌登录移至 `/server-login`，与 Mantapal 用户身份分开；原代理认证与服务端 token 校验保留。
- 静态离线启动路径新增 `/server-login` 与 `/policies`；不缓存账户 API 数据。
- 独立设置窗口同样先检查账户，未完成首次引导时也不挂载设置；登录失效后可回到原设置页继续。
- 同源窗口间只传递会话变更通知，不传递身份或凭据；登录、资料更新与退出后，其他窗口重新读取服务端会话。回到已登录窗口时也会复核；后台短暂断网保留当前工作，明确失效才退出。
- 三种登录方式支持方向键、Home / End 和正确的 Tab 焦点顺序，请求过程中不会切换到另一种方式。

## 账户服务对接合同

类型和响应校验见 `src/features/mantapal/contract.ts`；客户端见 `account-client.ts`。

所有响应为 JSON。账户对象：`{ id, name, phoneMasked, tier: "free" | "pro", firstUse, wechatBound }`。API 负责账户真实性、密码哈希、验证码有效期和次数、扫码 state 绑定、授权票据单次消费、政策版本校验、会话撤销、账户隔离与计费；前端校验不替代服务端校验。

| 方法 / 路径 | 请求 / 响应 |
| --- | --- |
| GET `/session` | `{ account: Account | null, csrfToken }`，匿名会话也需 CSRF token |
| GET `/policies/current` | `{ version, privacy, rights }`，经过业务确认的正式文本；按纯文本渲染 |
| POST `/login/password` | `{ account, password }` → Account |
| POST `/otp` | `{ phone, purpose: "login" | "register" | "reset" | "bind" }` → `{ retryAfter: 1..300 }` |
| POST `/login/phone` | `{ phone, code }` → Account；不存在的账号不可自动创建并绕过政策 |
| POST `/register` | `{ phone, code, password, accepted: true, policyVersion }` → Account |
| POST `/wechat/challenge` | `{}` → `{ id, qrContent, expiresAt: ISO8601 }` |
| GET `/wechat/status?id=…` | `{ status: "waiting" | "expired" }` 或 `{ status: "phone_required", ticket }` 或 `{ status: "authenticated", account }` |
| POST `/wechat/bind-phone` | `{ ticket, phone, code, accepted: true, policyVersion }` → Account |
| POST `/password/verify` | `{ phone, code }` → `{ ticket }` |
| POST `/password/reset` | `{ ticket, password }` → `{ ok: true }`；撤销旧会话，客户端返回登录 |
| POST `/profile` | `{ name }` → Account；首次设置完成后 `firstUse: false` |
| GET `/usage` | `{ used: number >= 0, limit: number > 0 | null, unit, periodLabel, updatedAt: ISO8601 }` |
| POST `/logout` | `{}` → `{ ok: true }`；服务端撤销后前端退出 |

使用 HttpOnly + Secure cookie 会话，所有 POST 带 `X-CSRF-Token`；跨域端点需精确的 Origin 白名单、凭证 CORS 与适合运行平台的 cookie 策略。生产登录后重新读取 `/session`，确保 cookie 已保存并更新 CSRF token，才进入工作台。账号服务域名属于可信构建配置，不接受用户输入的跳转地址或任意请求地址。

响应 400 / 401 / 404 / 429 / 501 / 网络失败呈现相应错误，429 读取 `Retry-After` 秒数；12 秒超时；扫码轮询在切换方式 / 卸载时取消。账号密码、验证码和访问令牌不进入 Mantapal 的浏览器持久存储。Codeg 既有服务器连接令牌机制保持原样。

## 与已有后端工作的关系

公开仓库已有独立草稿 PR #2（`feature/mantapal-free-membership`），账户接口以 email/password/TOTP 为主。它还没有覆盖本次手机验证码、微信扫码、手机号绑定和政策版本合同；本分支没有合并其未完成的 Rust 账户与托管凭证实现。

因此本次交付是可构建、可接服务的前端集成，**不是已经接通短信、微信或商业计费的成品发行包**。以下仍需后端联调后才能上线：

1. 账户 API、正式隐私政策 / 权益文本、短信与微信授权服务。
2. 桌面 WebView 的 cookie / CORS 联调，或由后续账户服务适配器接入安全凭证桥。
3. 托管模型试用额度、账户级凭证隔离、退出时运行中 Agent 的凭证撤销；不得把前端路由门禁当作服务端权限控制。
4. Windows 安装包名称、签名、更新源和 Tauri 发布配置；本次未改动 Rust 或发行签名设置。

## 检查

```sh
pnpm exec tsc -p tsconfig.build.json --noEmit --incremental false
pnpm lint .
pnpm test --maxWorkers=2
pnpm build
```

新增测试覆盖真实客户端错误处理、CSRF 更新、cookie 确认、退出撤销、短信倒计时、未同意政策不能注册、密码错误与找回、微信绑定、最小首次引导、随手记隔离和存储失败。浏览器与最终检查结果见同目录验收记录。

# 玩集 TOYSPACE 前端

玩集 TOYSPACE 的商城前端，基于 Vue 3、TypeScript、Vite、Vue Router 和 Pinia，请求使用原生 Fetch，样式为自定义 CSS。前端单独构建、单独部署，通过接口对接拼团营销服务和支付商城。

## 页面

| 路由 | 内容 |
| --- | --- |
| `/` | 首页：主视觉、分类筛选与本地搜索、正在拼团、玩法说明 |
| `/products/:goodsId` | 商品详情：图集、价格、单独购买、开团、参团、拼团列表、设计介绍、尺寸与材质 |
| `/login` | 登录：演示模式用体验账号，真实模式用微信扫码；登录后回到原页面 |
| `/orders` | 我的订单：分页加载、退单、支付完成、拼团成功、退款处理中等状态 |

六款商品都是原创概念演示款（潮流公仔、动漫手办、机甲模型各两款），不代表任何官方授权产品，页面不展示销量和评价。素材是 `public/art/` 下的 SVG，由 `npm run gen:assets` 生成。

## 快速开始

需要 Node.js 20.19 或更高版本。

```bash
cd frontend
npm install
npm run dev          # 演示模式，打开 http://localhost:5173
```

演示模式不需要后端，可以完整走一遍：浏览筛选 → 登录 → 开团或参团 → 模拟支付 → 查看订单 → 模拟退单。数据保存在浏览器本地存储里（`toyspace.demo.v1`，账号是 `toyspace.demo.session`），刷新后不会丢。页面顶部的紫色条会一直显示“演示模式”，点“重置演示数据”可以恢复初始状态。

内置的演示场景包括：

- 差一人成团的拼团：参团付款后显示“拼团成功”。
- 已满员的拼团（云朵小芽）和已过期的拼团（鸣镝 VX-07）：参团按钮不可点。
- 模拟收银台可以“取消支付”，取消后订单关闭，名额释放。
- 退单后约 8 秒内显示“退款处理中”，之后自动变为“已关闭，已退款”。

## 常用命令

```bash
npm run dev          # 演示模式开发服务器
npm run dev:live     # 真实模式开发服务器（读取 .env.live.local）
npm run typecheck    # TypeScript 检查
npm test             # 单元测试（Vitest）
npm run test:e2e     # 浏览器端到端测试（Playwright，默认使用本机 Edge）
npm run build        # 演示模式生产构建，输出 dist/
npm run build:live   # 真实模式生产构建
npm run gen:assets   # 重新生成商品 SVG 素材
```

端到端测试默认用本机安装的 Microsoft Edge（`channel: msedge`），不需要额外下载浏览器；想用 Chrome 可以设置 `PW_CHANNEL=chrome`。

## 真实模式

把 `.env.live.example` 复制为 `.env.live.local`，按实际环境填写：

| 变量 | 说明 |
| --- | --- |
| `VITE_APP_MODE` | 固定为 `live` |
| `VITE_GBM_API_BASE` | 拼团服务地址，经 Nginx 同源代理时填 `/` |
| `VITE_MALL_API_BASE` | 支付商城地址（微信登录、下单、订单、退单），同源代理时填 `/` |
| `VITE_SOURCE` / `VITE_CHANNEL` | 渠道与来源，需与后端拼团活动配置一致 |
| `VITE_LIVE_SKU_MAP` | 前端商品 ID 到后端真实 SKU 的映射，例如 `{"TS-2001":"1000002"}` |
| `VITE_PAY_ALLOWED_ORIGINS` | 允许提交支付表单的地址，逗号分隔 |
| `VITE_REQUEST_TIMEOUT_MS` | 请求超时，默认 10000 |
| `GBM_PROXY_TARGET` / `MALL_PROXY_TARGET` | 仅本地开发：vite 代理目标，不会打包进前端 |

对接的接口：

| 用途 | 接口 | 服务 |
| --- | --- | --- |
| 拼团价格、队伍与统计 | `POST /api/v1/gbm/index/query_group_buy_market_config` | 拼团服务（本仓库） |
| 微信扫码登录 | `GET /api/v1/login/weixin_qrcode_ticket_scene`、`GET /api/v1/login/check_login_scene` | 支付商城 |
| 创建支付订单 | `POST /api/v1/alipay/create_pay_order` | 支付商城 |
| 订单列表 | `POST /api/v1/alipay/query_user_order_list` | 支付商城 |
| 退单 | `POST /api/v1/alipay/refund_order` | 支付商城 |

真实模式的规则：

- **商品**：名称、图片、介绍来自本地商品配置；价格、活动和队伍状态以接口为准。没有配置 SKU 映射的商品显示“暂不能购买”，不会请求接口。请只映射后端里真正配置好的潮玩 SKU，不要把现有图书 SKU 当作潮玩商品售卖。
- **不降级**：服务地址、SKU 或支付地址没配齐时，页面顶部会提示缺少哪一项。真实模式不会改用演示商品，也不会模拟付款结果。
- **限流**：拼团配置接口按用户限流 1 次/秒，超限会被拉黑。前端对这个接口串行调用、间隔 1.2 秒以上；首页不批量查询价格。
- **支付**：支付商城返回的支付表单用 `DOMParser` 解析，其中的脚本不会执行。只有 `action` 在 `VITE_PAY_ALLOWED_ORIGINS` 列表里的表单才会被重新构建并提交。支付页在新窗口打开；如果弹窗被拦截，就在当前页跳转。付款结果通过订单列表查询确认。
- **错误处理**：超时、网络错误、业务失败码、限流和登录失效（HTTP 401/403）分别给出提示；登录失效会清除会话，并带着回跳地址进入登录页。

## 部署

```bash
cd frontend
cp .env.live.example .env.live.local   # 演示站可跳过这一步
npm ci
npm run build:live                     # 演示站用 npm run build
```

把 `dist/` 拷贝到 Nginx 的站点目录，参考 [`deploy/nginx.conf`](deploy/nginx.conf) 配置：

- `try_files $uri $uri/ /index.html`：SPA 路由回退，`/products/...`、`/orders` 刷新不会 404。
- `/api/v1/gbm/` 代理到拼团服务，`/api/v1/alipay/`、`/api/v1/login/` 代理到支付商城。
- `/assets/` 带哈希的产物长期缓存，`index.html` 不缓存。

upstream 地址请改成你自己的服务，不要照抄示例；仓库里的旧示例服务器地址不会用在本前端里。

## 目录

```
frontend/
  deploy/nginx.conf         Nginx 配置示例
  e2e/                      Playwright 端到端测试
  public/art/               商品 SVG 素材
  scripts/                  素材生成脚本
  src/
    components/             通用组件：商品卡片、拼团条目、价格、弹窗、状态块、提示
    config/env.ts           环境配置解析
    data/products.ts        商品配置与演示数据
    services/demo/          演示模式实现（本地存储）
    services/live/          真实模式实现与支付表单适配器
    services/http.ts        请求封装：超时、错误分类
    views/                  四个页面
  tests/                    Vitest 单元测试
```

# 玩集 TOYSPACE：潮玩拼团营销系统

面向潮流公仔、动漫手办和机甲模型的拼团商城。项目由两部分组成：

- **拼团营销服务**：Spring Boot + DDD 分层的后端，负责拼团活动试算、锁单、结算、退单和回调通知。
- **商城前端**：Vue 3 + TypeScript 的独立前端，覆盖首页、商品详情、登录、订单和购买反馈，适配电脑和手机。

前端自带演示模式，不启动后端也能完整体验“浏览 → 登录 → 开团/参团 → 支付 → 订单 → 退单”的流程。

**在线演示**：http://40.160.139.154:8898 （前端为演示模式，数据只保存在你的浏览器里，不会真实扣款）

**线上接口**：拼团营销服务已部署在同一台服务器，可以直接调用查询接口：

```bash
curl -X POST http://40.160.139.154:8898/api/v1/gbm/index/query_group_buy_market_config \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u001","source":"s01","channel":"c01","goodsId":"9890001"}'
```

## 功能

**用户侧**

- 商品按潮流公仔、动漫手办、机甲模型分类，支持本地搜索和筛选。
- 商品详情提供单独购买、发起拼团、参与拼团三种入口，拼团列表带实时倒计时，过期或满员自动禁止参团。
- 未登录时点击购买会记住购买意图，登录后回到原页面，由用户再次确认下单。
- 订单页分页加载，展示支付完成、拼团成功、退款处理中、已关闭等状态，支持退单。

**营销服务**

- 拼团试算：支持直减、满减、折扣、N 元购四种优惠，按人群标签决定活动是否可见、可参与。
- 锁单：校验活动有效期、用户参与次数上限，使用 Redis 占用组队库存，防止超卖。
- 结算：校验渠道黑名单、外部交易单号和交易时间，凑齐人数后更新成团状态。
- 退单：按“未支付 / 已支付未成团 / 已成团”分别处理，释放名额并通知下游。
- 通知：成团和退单结果通过 RabbitMQ 或 HTTP 回调通知，失败的通知任务由定时任务补偿。
- 运行保障：动态配置中心控制降级和切量，接口按用户限流并支持黑名单。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vite、Vue Router、Pinia、原生 Fetch、自定义 CSS |
| 前端测试 | Vitest、Vue Test Utils、Playwright |
| 后端 | Java 8、Spring Boot 2.7、MyBatis、MySQL 8 |
| 中间件 | Redis（Redisson）、RabbitMQ |
| 设计框架 | xfg-wrench：规则树、责任链、动态配置中心 |
| 运维 | Docker Compose、Nginx、Prometheus、Grafana、ELK |

## 架构

```
┌──────────────────────────────┐
│  商城前端 frontend/           │  Vue 3 · 演示模式 / 真实模式
└──────────────┬───────────────┘
               │ Nginx（SPA 回退 + API 代理）
      ┌────────┴─────────────────────────┐
      ▼                                  ▼
┌──────────────────────┐      ┌────────────────────────┐
│  拼团营销服务          │      │  支付商城（外部服务）     │
│  /api/v1/gbm/*        │◀────▶│  登录、下单、订单、退单   │
└──────────┬───────────┘ 回调 └────────────────────────┘
           │
   MySQL · Redis · RabbitMQ
```

后端按 DDD 分为六个模块：

| 模块 | 职责 |
| --- | --- |
| `group-buy-market-api` | 对外接口定义与 DTO |
| `group-buy-market-app` | 启动入口、配置、MyBatis 映射 |
| `group-buy-market-domain` | 领域层：`activity` 活动试算、`trade` 交易（锁单、结算、退单、通知任务）、`tag` 人群标签 |
| `group-buy-market-infrastructure` | 仓储、DAO、Redis、事件发布、外部网关、动态配置 |
| `group-buy-market-trigger` | HTTP 接口、定时任务、MQ 监听 |
| `group-buy-market-types` | 通用枚举、异常、响应码 |

## 核心设计

- **试算规则树**：`Root → Switch → Market → Tag → End` 逐层处理参数校验、降级切量、优惠计算和人群过滤；商品和活动信息用多线程并行加载。
- **交易责任链**：锁单、结算、退单各自是一条过滤链，每个校验点是一个独立节点，新增规则只需增加节点。
- **退单策略**：三种订单状态对应三种退单策略，由状态直接路由，不写条件分支。
- **库存与幂等**：组队名额在 Redis 中原子占用，外部交易单号保证重复下单返回同一笔订单。
- **可靠通知**：通知任务先落库，再异步发送，失败后由定时任务重试。

## 快速开始

### 只看前端（无需后端）

需要 Node.js 20.19 或更高版本。

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173，页面顶部显示“演示模式”。用体验账号登录后，就可以完整走一遍购买和退单流程，数据保存在浏览器本地。

### 启动后端

1. 启动 MySQL、Redis 和 RabbitMQ，建表脚本在 `docs/dev-ops/mysql/sql`，容器启动时会自动执行：

   ```bash
   cd docs/dev-ops
   docker compose -f docker-compose-environment.yml up -d
   ```

2. 按本地环境修改 `group-buy-market-app/src/main/resources/application-dev.yml` 里的数据库、Redis、RabbitMQ 连接信息。Compose 把 MySQL 映射到宿主机 `13306` 端口，配置文件里默认写的是 `3306`，需要对齐。
3. 构建并启动，服务默认监听 `8091`：

   ```bash
   mvn clean package -DskipTests
   java -jar group-buy-market-app/target/group-buy-market-app.jar
   ```

### 服务器部署

用 Docker Compose 部署后端和中间件、Nginx 托管前端，配置文件和步骤见 [deploy/README.md](deploy/README.md)。

### 前端对接后端

复制 `frontend/.env.live.example` 为 `frontend/.env.live.local`，填写服务地址、渠道和商品 SKU 映射，然后执行 `npm run dev:live`。变量说明、接口列表和 Nginx 部署方式见 [frontend/README.md](frontend/README.md)。

## 测试

```bash
cd frontend
npm run typecheck   # TypeScript 检查
npm test            # 单元测试：请求封装、真实接口适配、演示数据流程、弹窗键盘操作
npm run test:e2e    # 端到端测试：核心购买流程，375 / 768 / 1440 三种宽度
```

## 目录

```
.
├── frontend/                          商城前端
├── group-buy-market-api/              接口定义
├── group-buy-market-app/              启动与配置
├── group-buy-market-domain/           领域层
├── group-buy-market-infrastructure/   基础设施层
├── group-buy-market-trigger/          触发层
├── group-buy-market-types/            通用类型
├── deploy/                            服务器部署：Docker Compose、Nginx
└── docs/
    ├── dev-ops/                       Docker Compose、Nginx、MySQL、监控配置
    └── tag/                           各阶段版本的部署文件
```

## 致谢

后端基于 [小傅哥（bugstack）](https://bugstack.cn) 的 DDD 工程脚手架和拼团营销系统课程搭建，使用了其开源的 xfg-wrench 设计框架。

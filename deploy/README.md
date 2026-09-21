# 服务器部署

线上环境是一台 Ubuntu 24.04 服务器。Nginx 在 `8898` 端口提供商城、演示站、管理台和接口，在 `80` 端口只开放微信回调这一条路径。

| 地址 | 内容 |
| --- | --- |
| http://40.160.139.154:8898/ | 商城（真实模式：微信登录、支付宝付款、真实拼团） |
| http://40.160.139.154:8898/demo/ | 演示站（本地模拟数据，不需要登录和付款） |
| http://40.160.139.154:8898/admin/ | 管理台 |

```
浏览器 ──▶ Nginx :8898
            ├── /  /demo/  /admin/          静态页面（SPA 回退）
            ├── /api/v1/gbm/index/           拼团查询 → 127.0.0.1:18091（仅 POST）
            ├── /api/v1/login/ /api/v1/alipay/  商城服务 → 127.0.0.1:13100
            ├── /api/admin/                  管理接口 → 127.0.0.1:13100
            └── 其余 /api/*                  404
微信服务器 ──▶ Nginx :80  /api/v1/weixin/portal/receive → 商城服务（其余路径断开连接）

Docker Compose（项目名 toyspace，内部网络 backend）
  toyspace-app       拼团营销服务（Java）
  toyspace-mall      商城服务（Node.js）：登录、下单、支付、订单、管理接口
  toyspace-mysql     group_buy_market（拼团库）、toyspace_mall（商城库）
  toyspace-redis     动态配置、活动缓存、组队库存
  toyspace-rabbitmq  退单消息
```

MySQL、Redis 和 RabbitMQ 不映射宿主机端口，只有容器之间能访问。以下接口也不对外开放：

- 拼团服务的 `dcc`、`trade`、`test` 接口和 `actuator`。
- 商城的拼团回调 `group_buy_notify`：拼团服务在内部网络调用它。

## 开通微信登录和支付宝付款

商城服务读取服务器上的 `/opt/toyspace-backend/mall.env`，只有 root 能读写，模板见 [backend/mall.env.example](backend/mall.env.example)。首次部署时，`SESSION_SECRET` 和 `ADMIN_PASSWORD` 已经随机生成。

```bash
ssh ubuntu@40.160.139.154
sudo nano /opt/toyspace-backend/mall.env
cd /opt/toyspace-backend && sudo docker compose up -d mall   # 修改后重启商城服务
```

**微信公众号（开发时可用接口测试号）**

1. 打开 [微信公众平台接口测试号](https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login)，记下 appID 和 appsecret。
2. 在 `mall.env` 里填好 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`。`WECHAT_TOKEN` 自己定一个随机字符串，然后重启商城服务。
3. 在测试号页面的“接口配置信息”里填写：
   - URL：`http://40.160.139.154/api/v1/weixin/portal/receive`
   - Token：与 `WECHAT_TOKEN` 相同

   提交时微信会校验签名，显示“配置成功”即可。
4. 打开商城登录页，用微信扫码（首次需关注测试号），网页会自动登录。

**支付宝（开放平台沙箱）**

1. 登录 [支付宝开放平台](https://open.alipay.com) 控制台，进入“沙箱应用”。
2. 记下 APPID，在“开发信息”里选择“系统默认密钥”，复制应用私钥和支付宝公钥。
3. 填写 `ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`。密钥整段写在一行里，然后重启商城服务。
4. 付款时使用沙箱提供的买家账号。付款结果会通过异步通知回调到 `http://40.160.139.154:8898/api/v1/alipay/alipay_notify_url`；如果通知没有到达，商城每 20 秒也会主动查询一次。

配好后，管理台“概览”里的接入状态会变成“已配置”。

## 管理台

地址：http://40.160.139.154:8898/admin/ ，用户名 `admin`。密码在服务器上查看：

```bash
sudo grep ADMIN_PASSWORD /opt/toyspace-backend/mall.env
```

管理台里可以做这些事：

- 维护商品、拼团活动和优惠规则。保存后会自动清掉拼团服务里对应的 Redis 缓存，改动立即生效。
- 查看拼团队伍和成员、商城订单。
- 调整降级开关、切量比例、渠道黑名单、缓存开关和限流开关。
- 查看回调通知任务，失败的可以重发。

连续输错 5 次密码后，该 IP 锁定 10 分钟。

## 目录

服务器上的 `/opt/toyspace-backend`：

```
docker-compose.yml        本目录 backend/docker-compose.yml
.env                      MySQL 与 RabbitMQ 密码（root 所有，权限 600）
mall.env                  商城服务配置与密钥（root 所有，权限 600）
app/group-buy-market-app.jar
mall/                     商城服务源码（在服务器上构建镜像）
mysql/conf/my.cnf
mysql/sql/2-29-group_buy_market.sql
integration-test.sh       真实链路集成测试
```

静态页面在 `/var/www/toyspace`、`/var/www/toyspace-demo`、`/var/www/toyspace-admin`。Nginx 配置见 [nginx-toyspace.conf](nginx-toyspace.conf) 和 [nginx-toyspace-wechat.conf](nginx-toyspace-wechat.conf)。

## 更新

```bash
# 前端（本地构建后上传解压到对应目录，不需要重启服务）
cd frontend && npm run build:server       # 商城 → /var/www/toyspace
npm run build:demo-sub                    # 演示站 → /var/www/toyspace-demo
cd ../admin && npm run build              # 管理台 → /var/www/toyspace-admin

# 商城服务：上传 mall/ 源码到 /opt/toyspace-backend/mall 后
sudo docker compose build mall && sudo docker compose up -d mall

# 拼团服务（Java，需要 JDK 8 或 17 编译）
mvn clean package -DskipTests
scp group-buy-market-app/target/group-buy-market-app.jar ubuntu@<服务器>:/opt/toyspace-backend/app/
sudo docker compose restart app
```

新增潮玩商品：先在前端 `src/data/products.ts` 里加上图片和介绍，再到管理台“商品”页用同一个商品 ID 创建商品、绑定拼团活动，最后在 `frontend/.env.server` 的 `VITE_LIVE_SKU_MAP` 里加上映射并重新构建前端。

## 检查

```bash
cd /opt/toyspace-backend

# 服务状态与健康检查
sudo docker compose ps
curl http://127.0.0.1:18091/actuator/health
curl http://127.0.0.1:13100/healthz

# 真实链路集成测试：临时起一个“模拟支付 + 测试登录”的商城容器，对真实拼团服务走完
# 开团 → 付款 → 参团 → 付款 → 成团回调 → 满员拦截 → 退单 → 取消，结束后清理测试数据
sudo bash integration-test.sh

# 日志
sudo docker logs -f toyspace-mall
sudo docker logs -f toyspace-app
```

首次部署时，潮玩商品和拼团活动由 [backend/seed-toys.sql](backend/seed-toys.sql) 写入，这个脚本可以重复执行。

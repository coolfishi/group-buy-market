# 服务器部署

线上环境：一台 Ubuntu 24.04 服务器，Nginx 在 `8898` 端口同时提供前端页面和拼团查询接口。

```
浏览器 ──▶ Nginx :8898
            ├── /                      前端静态文件 /var/www/toyspace（SPA 回退）
            ├── /api/v1/gbm/index/     拼团查询接口 → 127.0.0.1:18091（仅 POST）
            └── /api/*                 其余接口一律 404
                          │
               Docker Compose（项目名 toyspace，内部网络）
               ├── toyspace-app        Spring Boot，仅绑定 127.0.0.1:18091
               ├── toyspace-mysql      启动时执行建表脚本，数据存卷 mysql-data
               ├── toyspace-redis
               └── toyspace-rabbitmq
```

MySQL、Redis、RabbitMQ 不映射宿主机端口，只有应用容器能访问。以下接口只能在服务器本机调用，不经 Nginx 对外开放：

- `dcc/update_config`：没有鉴权，可以修改降级和切量开关。
- `trade/*`：由支付商城在服务端调用。
- `test/*`：测试接口。
- `actuator`：暴露全部管理端点。

## 目录

服务器上的 `/opt/toyspace-backend`：

```
docker-compose.yml        本目录 backend/docker-compose.yml
.env                      MySQL 与 RabbitMQ 密码（root 所有，权限 600）
app/group-buy-market-app.jar
mysql/conf/my.cnf         docs/dev-ops/mysql/my.cnf（去掉了日志文件路径）
mysql/sql/2-29-group_buy_market.sql
logs/                     应用日志
```

## 首次部署

```bash
# 本地：构建前端和后端（后端需要 JDK 8 或 17，JDK 21 与项目的 Lombok 版本不兼容）
cd frontend && npm ci && npm run build && cd ..
mvn clean package -DskipTests

# 服务器：准备目录
ssh ubuntu@<服务器> 'sudo mkdir -p /opt/toyspace-backend/{app,mysql/sql,mysql/conf} /var/www/toyspace && sudo chown -R ubuntu:ubuntu /opt/toyspace-backend'

# 上传
scp deploy/backend/docker-compose.yml ubuntu@<服务器>:/opt/toyspace-backend/
scp group-buy-market-app/target/group-buy-market-app.jar ubuntu@<服务器>:/opt/toyspace-backend/app/
scp docs/dev-ops/mysql/sql/2-29-group_buy_market.sql ubuntu@<服务器>:/opt/toyspace-backend/mysql/sql/
scp docs/dev-ops/mysql/my.cnf ubuntu@<服务器>:/opt/toyspace-backend/mysql/conf/
scp deploy/nginx-toyspace.conf ubuntu@<服务器>:/tmp/toyspace

# 服务器：生成密码、启动、配置 Nginx
cd /opt/toyspace-backend
printf "MYSQL_ROOT_PASSWORD=%s\nRABBITMQ_PASSWORD=%s\n" "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" > .env
sudo chown root:root .env && sudo chmod 600 .env
sudo docker compose up -d
sudo mv /tmp/toyspace /etc/nginx/sites-available/toyspace
sudo ln -sf /etc/nginx/sites-available/toyspace /etc/nginx/sites-enabled/toyspace
sudo nginx -t && sudo systemctl reload nginx
```

前端文件解压到 `/var/www/toyspace` 即可，更新前端不需要重启任何服务。

## 更新后端

```bash
scp group-buy-market-app/target/group-buy-market-app.jar ubuntu@<服务器>:/opt/toyspace-backend/app/
ssh ubuntu@<服务器> 'cd /opt/toyspace-backend && sudo docker compose restart app'
```

## 检查

```bash
# 服务器本机：健康检查（数据库、Redis、RabbitMQ 状态）
curl http://127.0.0.1:18091/actuator/health

# 任意位置：查询拼团配置
curl -X POST http://<服务器>:8898/api/v1/gbm/index/query_group_buy_market_config \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u001","source":"s01","channel":"c01","goodsId":"9890001"}'

# 查看日志
sudo docker logs -f toyspace-app
```

查询接口按用户限流，每秒 1 次，超限的用户会被加入黑名单。

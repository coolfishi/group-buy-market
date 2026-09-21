#!/usr/bin/env bash
# 真实链路集成测试：临时启动一个“测试商城”（模拟支付 + 测试登录，独立数据库），
# 对真实拼团服务走完 开团 → 付款 → 参团 → 付款 → 成团回调 → 退单，结束后清理测试数据。
# 用法（服务器上）：sudo bash integration-test.sh
set -euo pipefail
cd /opt/toyspace-backend

NET=toyspace_backend
PORT=13199
MYSQL_PWD_VALUE=$(grep '^MYSQL_ROOT_PASSWORD=' .env | cut -d= -f2)
ADMIN_PW=$(openssl rand -hex 12)
SUFFIX=$(date +%s | tail -c 5)
UA="e2ea${SUFFIX}"
UB="e2eb${SUFFIX}"

sql() { docker exec -e MYSQL_PWD="$MYSQL_PWD_VALUE" toyspace-mysql mysql -uroot -N -e "$1"; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }
fail() { echo "FAIL: $*"; exit 1; }

cleanup() {
  docker rm -f toyspace-mall-test >/dev/null 2>&1 || true
  sql "DELETE FROM group_buy_market.notify_task WHERE team_id IN (SELECT team_id FROM group_buy_market.group_buy_order_list WHERE user_id IN ('$UA','$UB'));" || true
  sql "DELETE FROM group_buy_market.group_buy_order WHERE team_id IN (SELECT team_id FROM (SELECT team_id FROM group_buy_market.group_buy_order_list WHERE user_id IN ('$UA','$UB')) t);" || true
  sql "DELETE FROM group_buy_market.group_buy_order_list WHERE user_id IN ('$UA','$UB');" || true
  sql "DROP DATABASE IF EXISTS toyspace_mall_test;" || true
}
trap cleanup EXIT

docker run -d --name toyspace-mall-test --network "$NET" -p 127.0.0.1:$PORT:3100 \
  -e PORT=3100 -e DB_HOST=mysql -e DB_PASSWORD="$MYSQL_PWD_VALUE" -e MALL_DB_NAME=toyspace_mall_test \
  -e REDIS_HOST=redis -e GBM_BASE_URL=http://app:8091 -e INTERNAL_BASE_URL=http://toyspace-mall-test:3100 \
  -e PUBLIC_BASE_URL=http://127.0.0.1:$PORT -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_PASSWORD="$ADMIN_PW" -e PAY_PROVIDER=mock -e DEV_LOGIN=true -e LOG_LEVEL=warn \
  toyspace-mall:latest >/dev/null
for i in $(seq 1 30); do curl -sf http://127.0.0.1:$PORT/healthz >/dev/null && break; sleep 1; done

B=http://127.0.0.1:$PORT
token() { curl -s "$B/api/v1/login/dev_login?openid=$1" | json "d['data']['token']"; }
post() { curl -s -X POST "$B$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
latest() { post /api/v1/alipay/query_user_order_list "$1" '{"lastId":null,"pageSize":5}'; }

TA=$(token "$UA"); TB=$(token "$UB")
echo "1. 用户 A 发起拼团（星轨旅人，2 人团）"
R=$(post /api/v1/alipay/create_pay_order "$TA" '{"productId":"TS-2001","marketType":1,"activityId":200103}')
[ "$(echo "$R" | json "d['code']")" = "0000" ] || fail "开团下单 $R"
echo "$R" | json "d['data']['form']" | grep -q '<form' || fail "没有返回支付表单"
L=$(latest "$TA"); OA=$(echo "$L" | json "d['data']['orderList'][0]['orderId']"); TEAM=$(echo "$L" | json "d['data']['orderList'][0]['teamId']")
echo "   订单 $OA，队伍 $TEAM，实付 $(echo "$L" | json "d['data']['orderList'][0]['payAmount']")"

echo "2. A 付款 → 拼团结算"
post /api/v1/alipay/mock_paid "$TA" "{\"orderId\":\"$OA\"}" >/dev/null
ST=$(latest "$TA" | json "d['data']['orderList'][0]['status']"); echo "   A 状态：$ST"; [ "$ST" = "PAY_SUCCESS" ] || fail "A 应为 PAY_SUCCESS"
[ "$(sql "SELECT complete_count FROM group_buy_market.group_buy_order WHERE team_id='$TEAM'")" = "1" ] || fail "拼团侧完成数应为 1"

echo "3. 用户 B 参团并付款"
R=$(post /api/v1/alipay/create_pay_order "$TB" "{\"productId\":\"TS-2001\",\"marketType\":1,\"activityId\":200103,\"teamId\":\"$TEAM\"}")
[ "$(echo "$R" | json "d['code']")" = "0000" ] || fail "参团下单 $R"
OB=$(latest "$TB" | json "d['data']['orderList'][0]['orderId']")
post /api/v1/alipay/mock_paid "$TB" "{\"orderId\":\"$OB\"}" >/dev/null
latest "$TB" >/dev/null

echo "4. 等待成团回调"
for i in $(seq 1 20); do
  SA=$(latest "$TA" | json "d['data']['orderList'][0]['status']")
  [ "$SA" = "DEAL_DONE" ] && break; sleep 1
done
SB=$(latest "$TB" | json "d['data']['orderList'][0]['status']")
echo "   A：$SA，B：$SB，队伍状态：$(sql "SELECT status FROM group_buy_market.group_buy_order WHERE team_id='$TEAM'")（1=成团）"
[ "$SA" = "DEAL_DONE" ] && [ "$SB" = "DEAL_DONE" ] || fail "应当两人都拼团成功"
echo "   通知任务：$(sql "SELECT CONCAT(notify_type,' ',notify_status) FROM group_buy_market.notify_task WHERE team_id='$TEAM' AND notify_category='trade_settlement'")（1=送达）"

echo "5. 满员队伍再参团被拒"
R=$(post /api/v1/alipay/create_pay_order "$(token e2ec$SUFFIX)" "{\"productId\":\"TS-2001\",\"marketType\":1,\"activityId\":200103,\"teamId\":\"$TEAM\"}")
echo "   $(echo "$R" | json "d['code'] + ' ' + d['info']")"
[ "$(echo "$R" | json "d['code']")" != "0000" ] || fail "满员队伍不应能参团"

echo "6. A 退单"
R=$(post /api/v1/alipay/refund_order "$TA" "{\"orderId\":\"$OA\"}")
[ "$(echo "$R" | json "d['data']['success']")" = "True" ] || fail "退单 $R"
L=$(latest "$TA"); echo "   A：$(echo "$L" | json "d['data']['orderList'][0]['status'] + ' ' + str(d['data']['orderList'][0]['closeReason'])")"
echo "   拼团侧订单状态：$(sql "SELECT status FROM group_buy_market.group_buy_order_list WHERE out_trade_no='$OA'")（2=已退单）"

echo "7. 单独购买 + 取消未付款订单"
post /api/v1/alipay/create_pay_order "$TA" '{"productId":"TS-1001","marketType":0}' >/dev/null
OS=$(latest "$TA" | json "d['data']['orderList'][0]['orderId']")
R=$(post /api/v1/alipay/refund_order "$TA" "{\"orderId\":\"$OS\"}"); echo "   $(echo "$R" | json "d['data']['message']")"

echo "8. 管理接口"
AT=$(curl -s -X POST $B/api/admin/login -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PW\"}" | json "d['data']['token']")
curl -s $B/api/admin/overview -H "Authorization: Bearer $AT" | json "'活动 %s 个，进行中队伍 %s，DCC %s 项' % (d['data']['activeActivityCount'], d['data']['teams']['ongoing'], len(d['data']['dcc']))"
curl -s "$B/api/admin/teams?keyword=$TEAM" -H "Authorization: Bearer $AT" | json "'队伍查询 %s 条' % d['data']['total']"
curl -s "$B/api/admin/skus" -H "Authorization: Bearer $AT" | json "'商品 %s 件' % len(d['data'])"
[ "$(curl -s -o /dev/null -w '%{http_code}' $B/api/admin/overview)" = "401" ] || fail "管理接口未鉴权"

echo "ALL PASSED"

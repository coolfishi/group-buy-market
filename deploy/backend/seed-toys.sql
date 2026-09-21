-- 玩集 TOYSPACE：《火影忍者》《咒术回战》六款手办及其拼团活动（可重复执行）
-- 商品 ID 与前端 src/data/products.ts 一致；价格为演示价，之后可在管理台修改
USE `group_buy_market`;

INSERT INTO `sku` (`source`, `channel`, `goods_id`, `goods_name`, `original_price`) VALUES
  ('s01', 'c01', 'NR-01', 'POP UP PARADE 漩涡鸣人', 199.00),
  ('s01', 'c01', 'NR-02', 'POP UP PARADE 宇智波佐助', 239.00),
  ('s01', 'c01', 'NR-03', '粘土人 旗木卡卡西', 269.00),
  ('s01', 'c01', 'JJ-01', 'POP UP PARADE 五条悟', 199.00),
  ('s01', 'c01', 'JJ-02', 'POP UP PARADE 虎杖悠仁', 199.00),
  ('s01', 'c01', 'JJ-03', 'POP UP PARADE 伏黑惠', 199.00)
ON DUPLICATE KEY UPDATE `goods_name` = VALUES(`goods_name`);

INSERT INTO `group_buy_discount` (`discount_id`, `discount_name`, `discount_desc`, `discount_type`, `market_plan`, `market_expr`) VALUES
  ('26092211', '鸣人拼团直减', '拼团立减 30 元', 0, 'ZJ', '30'),
  ('26092212', '佐助拼团直减', '拼团立减 30 元', 0, 'ZJ', '30'),
  ('26092213', '卡卡西拼团直减', '拼团立减 40 元', 0, 'ZJ', '40'),
  ('26092214', '五条悟拼团直减', '拼团立减 30 元', 0, 'ZJ', '30'),
  ('26092215', '虎杖悠仁拼团直减', '拼团立减 30 元', 0, 'ZJ', '30'),
  ('26092216', '伏黑惠拼团直减', '拼团立减 30 元', 0, 'ZJ', '30')
ON DUPLICATE KEY UPDATE `discount_name` = VALUES(`discount_name`);

-- 拼团时长 120 分钟；每人每个活动最多参与 5 次
INSERT INTO `group_buy_activity` (`activity_id`, `activity_name`, `discount_id`, `group_type`, `take_limit_count`, `target`, `valid_time`, `status`, `start_time`, `end_time`, `tag_id`, `tag_scope`) VALUES
  (200201, '漩涡鸣人 3 人团', '26092211', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200202, '宇智波佐助 3 人团', '26092212', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200203, '旗木卡卡西 2 人团', '26092213', 0, 5, 2, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200204, '五条悟 2 人团', '26092214', 0, 5, 2, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200205, '虎杖悠仁 3 人团', '26092215', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200206, '伏黑惠 3 人团', '26092216', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL)
ON DUPLICATE KEY UPDATE `activity_name` = VALUES(`activity_name`);

INSERT INTO `sc_sku_activity` (`source`, `channel`, `activity_id`, `goods_id`) VALUES
  ('s01', 'c01', 200201, 'NR-01'),
  ('s01', 'c01', 200202, 'NR-02'),
  ('s01', 'c01', 200203, 'NR-03'),
  ('s01', 'c01', 200204, 'JJ-01'),
  ('s01', 'c01', 200205, 'JJ-02'),
  ('s01', 'c01', 200206, 'JJ-03')
ON DUPLICATE KEY UPDATE `activity_id` = VALUES(`activity_id`);

-- 下架第一版的六款原创概念商品：活动改为废弃并解除绑定；商品记录保留，历史订单不受影响
UPDATE `group_buy_activity` SET `status` = 3 WHERE `activity_id` BETWEEN 200101 AND 200106;
DELETE FROM `sc_sku_activity` WHERE `goods_id` LIKE 'TS-%';

-- 玩集 TOYSPACE：六款潮玩商品及其拼团活动（可重复执行）
-- 商品 ID 与前端 src/data/products.ts 一致；价格、优惠、活动之后可以在管理台修改
USE `group_buy_market`;

INSERT INTO `sku` (`source`, `channel`, `goods_id`, `goods_name`, `original_price`) VALUES
  ('s01', 'c01', 'TS-1001', '云朵小芽', 129.00),
  ('s01', 'c01', 'TS-1002', '夜航猫船长', 169.00),
  ('s01', 'c01', 'TS-2001', '星轨旅人·澪', 699.00),
  ('s01', 'c01', 'TS-2002', '赤焰剑士·焰', 759.00),
  ('s01', 'c01', 'TS-3001', '鸣镝 VX-07 侦察机甲', 259.00),
  ('s01', 'c01', 'TS-3002', '重岳 HG-12 重装机甲', 329.00)
ON DUPLICATE KEY UPDATE `goods_name` = VALUES(`goods_name`);

INSERT INTO `group_buy_discount` (`discount_id`, `discount_name`, `discount_desc`, `discount_type`, `market_plan`, `market_expr`) VALUES
  ('26092201', '云朵小芽拼团直减', '拼团立减 30 元', 0, 'ZJ', '30'),
  ('26092202', '夜航猫船长拼团直减', '拼团立减 30 元', 0, 'ZJ', '30'),
  ('26092203', '星轨旅人拼团直减', '拼团立减 100 元', 0, 'ZJ', '100'),
  ('26092204', '赤焰剑士拼团直减', '拼团立减 110 元', 0, 'ZJ', '110'),
  ('26092205', '侦察机甲拼团直减', '拼团立减 40 元', 0, 'ZJ', '40'),
  ('26092206', '重装机甲拼团直减', '拼团立减 50 元', 0, 'ZJ', '50')
ON DUPLICATE KEY UPDATE `discount_name` = VALUES(`discount_name`);

-- 成团人数：公仔与机甲 3 人，手办 2 人；拼团时长 120 分钟；每人每个活动最多参与 5 次
INSERT INTO `group_buy_activity` (`activity_id`, `activity_name`, `discount_id`, `group_type`, `take_limit_count`, `target`, `valid_time`, `status`, `start_time`, `end_time`, `tag_id`, `tag_scope`) VALUES
  (200101, '云朵小芽 3 人团', '26092201', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200102, '夜航猫船长 3 人团', '26092202', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200103, '星轨旅人 2 人团', '26092203', 0, 5, 2, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200104, '赤焰剑士 2 人团', '26092204', 0, 5, 2, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200105, '侦察机甲 3 人团', '26092205', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL),
  (200106, '重装机甲 3 人团', '26092206', 0, 5, 3, 120, 1, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), NULL, NULL)
ON DUPLICATE KEY UPDATE `activity_name` = VALUES(`activity_name`);

INSERT INTO `sc_sku_activity` (`source`, `channel`, `activity_id`, `goods_id`) VALUES
  ('s01', 'c01', 200101, 'TS-1001'),
  ('s01', 'c01', 200102, 'TS-1002'),
  ('s01', 'c01', 200103, 'TS-2001'),
  ('s01', 'c01', 200104, 'TS-2002'),
  ('s01', 'c01', 200105, 'TS-3001'),
  ('s01', 'c01', 200106, 'TS-3002')
ON DUPLICATE KEY UPDATE `activity_id` = VALUES(`activity_id`);

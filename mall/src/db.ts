import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise'
import type { DbConfig } from './config.js'

export function createPool(c: DbConfig, database = c.database): Pool {
  return mysql.createPool({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database,
    connectionLimit: 8,
    timezone: '+08:00',
    dateStrings: false,
    decimalNumbers: true,
  })
}

/** 商城自有库：用户订单（与拼团库分开，拼团库只通过接口写入） */
const schema = [
  `CREATE TABLE IF NOT EXISTS pay_order (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id VARCHAR(12) NOT NULL COMMENT '订单号，同时作为拼团外部交易单号',
    user_id VARCHAR(64) NOT NULL,
    product_id VARCHAR(16) NOT NULL,
    product_name VARCHAR(128) NOT NULL,
    order_time DATETIME NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL COMMENT '原价',
    pay_amount DECIMAL(10,2) NOT NULL COMMENT '实付',
    market_type TINYINT NOT NULL DEFAULT 0 COMMENT '0 单独购买，1 拼团',
    market_deduction DECIMAL(10,2) NOT NULL DEFAULT 0,
    activity_id BIGINT NULL,
    team_id VARCHAR(8) NULL,
    status VARCHAR(16) NOT NULL COMMENT 'CREATE PAY_WAIT PAY_SUCCESS DEAL_DONE WAIT_REFUND CLOSE',
    pay_form MEDIUMTEXT NULL,
    pay_time DATETIME NULL,
    trade_no VARCHAR(64) NULL COMMENT '支付宝交易号',
    settle_status TINYINT NOT NULL DEFAULT 0 COMMENT '拼团结算：0 未结算、1 已结算、2 被拒',
    close_reason VARCHAR(64) NULL,
    refund_time DATETIME NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_id (order_id),
    KEY idx_user (user_id, id),
    KEY idx_status (status, order_time),
    KEY idx_team (team_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS wx_login_scene (
    scene_str VARCHAR(64) NOT NULL,
    openid VARCHAR(64) NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scene_str)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]

/** 建库建表（幂等），返回指向商城库的连接池 */
export async function openMallDb(c: DbConfig): Promise<Pool> {
  if (!/^[a-z0-9_]+$/i.test(c.database)) throw new Error('非法数据库名')
  const bootstrap = await mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password })
  try {
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${c.database}\` DEFAULT CHARACTER SET utf8mb4`)
  } finally {
    await bootstrap.end()
  }
  const pool = createPool(c)
  for (const sql of schema) await pool.query(sql)
  return pool
}

export type Row = RowDataPacket & Record<string, unknown>

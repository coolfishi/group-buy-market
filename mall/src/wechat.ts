import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import type { Pool } from 'mysql2/promise'
import type { Row } from './db.js'

/** 微信公众号带参二维码登录（与原 s-pay-mall 流程一致） */
export interface WechatConfig {
  appId: string
  appSecret: string
  token: string
}

const API = 'https://api.weixin.qq.com'
const SCENE_TTL_SECONDS = 300

export function checkSignature(token: string, q: { signature?: string; timestamp?: string; nonce?: string }): boolean {
  if (!q.signature || !q.timestamp || !q.nonce) return false
  const digest = createHash('sha1').update([token, q.timestamp, q.nonce].sort().join('')).digest('hex')
  return digest === q.signature
}

export interface WechatEvent {
  openid: string
  officialId: string
  msgType: string
  event?: string
  sceneStr?: string
}

const parser = new XMLParser({ processEntities: false, parseTagValue: false })

export function parseMessage(xml: string): WechatEvent | null {
  let doc: Record<string, Record<string, string>>
  try {
    doc = parser.parse(xml)
  } catch {
    return null
  }
  const m = doc?.xml
  if (!m?.FromUserName || !m?.ToUserName) return null
  const event = m.Event ? String(m.Event).toLowerCase() : undefined
  let sceneStr: string | undefined
  if (event === 'subscribe' && typeof m.EventKey === 'string' && m.EventKey.startsWith('qrscene_')) {
    sceneStr = m.EventKey.slice('qrscene_'.length)
  } else if (event === 'scan' && m.EventKey) {
    sceneStr = String(m.EventKey)
  }
  return { openid: String(m.FromUserName), officialId: String(m.ToUserName), msgType: String(m.MsgType), event, sceneStr }
}

export function textReply(to: string, from: string, content: string, now = Date.now()): string {
  const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
  return `<xml><ToUserName>${cdata(to)}</ToUserName><FromUserName>${cdata(from)}</FromUserName><CreateTime>${Math.floor(now / 1000)}</CreateTime><MsgType>${cdata('text')}</MsgType><Content>${cdata(content)}</Content></xml>`
}

export function createWechatService(config: WechatConfig, db: Pool) {
  let accessToken: { value: string; expiresAt: number } | null = null

  async function getAccessToken(): Promise<string> {
    if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value
    const url = `${API}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(config.appId)}&secret=${encodeURIComponent(config.appSecret)}`
    const res = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()) as {
      access_token?: string
      expires_in?: number
      errcode?: number
      errmsg?: string
    }
    if (!res.access_token) throw new Error(`获取微信 access_token 失败：${res.errcode} ${res.errmsg}`)
    accessToken = { value: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 7200) * 1000 }
    return accessToken.value
  }

  return {
    async createTicket(sceneStr: string): Promise<string> {
      const token = await getAccessToken()
      const res = (await (
        await fetch(`${API}/cgi-bin/qrcode/create?access_token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expire_seconds: SCENE_TTL_SECONDS,
            action_name: 'QR_STR_SCENE',
            action_info: { scene: { scene_str: sceneStr } },
          }),
          signal: AbortSignal.timeout(8000),
        })
      ).json()) as { ticket?: string; errcode?: number; errmsg?: string }
      if (!res.ticket) {
        if (res.errcode === 40001 || res.errcode === 42001) accessToken = null
        throw new Error(`创建微信二维码失败：${res.errcode} ${res.errmsg}`)
      }
      await db.query('REPLACE INTO wx_login_scene (scene_str, openid, create_time) VALUES (?, NULL, NOW())', [sceneStr])
      return res.ticket
    },

    /** 扫码事件：把场景值和 openid 绑定（仅绑定一次、仅限有效期内） */
    async bindScene(sceneStr: string, openid: string): Promise<boolean> {
      const [res] = await db.query(
        `UPDATE wx_login_scene SET openid = ? WHERE scene_str = ? AND openid IS NULL
         AND create_time > DATE_SUB(NOW(), INTERVAL ${SCENE_TTL_SECONDS} SECOND)`,
        [openid, sceneStr],
      )
      return (res as { affectedRows: number }).affectedRows > 0
    },

    async checkScene(sceneStr: string): Promise<string | null> {
      const [rows] = await db.query<Row[]>(
        `SELECT openid FROM wx_login_scene WHERE scene_str = ? AND openid IS NOT NULL
         AND create_time > DATE_SUB(NOW(), INTERVAL ${SCENE_TTL_SECONDS + 60} SECOND)`,
        [sceneStr],
      )
      if (!rows[0]) return null
      // 一个场景值只能换一次登录
      await db.query('DELETE FROM wx_login_scene WHERE scene_str = ?', [sceneStr])
      return String(rows[0].openid)
    },

    async cleanup() {
      await db.query('DELETE FROM wx_login_scene WHERE create_time < DATE_SUB(NOW(), INTERVAL 1 HOUR)')
    },
  }
}

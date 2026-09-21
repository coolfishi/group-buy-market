import type { CategoryId, Product } from '@/types'
import { asset } from '@/utils/asset'

export const categories: { id: CategoryId; name: string }[] = [
  { id: 'naruto', name: '火影忍者' },
  { id: 'jjk', name: '咒术回战' },
]

export function categoryName(id: CategoryId): string {
  return categories.find((c) => c.id === id)?.name ?? ''
}

const labels = ['正面', '侧面', '特写']
const images = (id: string, name: string) =>
  labels.map((label, i) => ({ src: asset(`art/${id}-${i + 1}.jpg`), alt: `${name}${label}图`, label }))

/** 图片与角色版权归原权利人，本站为演示项目，不是官方或授权销售渠道 */
export const copyrightNotice =
  '演示项目，非官方销售渠道。商品图片来自 Good Smile Company 官方产品页；《火影忍者》© 岸本齐史／集英社，《咒术回战》© 芥见下下／集英社。'

// 六款 Good Smile Company 手办，规格按官方产品页整理；售价为演示价
export const products: Product[] = [
  {
    id: 'NR-01',
    name: 'POP UP PARADE 漩涡鸣人',
    category: 'naruto',
    tagline: '双手握苦无、压低重心冲出来的鸣人',
    description: [
      '出自《火影忍者疾风传》。鸣人身体前倾，两手各握一把苦无，是准备突进的一瞬间。',
      'POP UP PARADE 是 Good Smile Company 主打平价、出货快的系列，这款附展示底座。',
    ],
    size: '全高约 140 mm（含底座）',
    material: '塑料，已涂装完成品',
    scale: '无比例',
    maker: 'Good Smile Company',
    line: 'POP UP PARADE',
    officialPriceJpy: 3900,
    sourceUrl: 'https://www.goodsmile.info/en/product/12629/POP+UP+PARADE+Naruto+Uzumaki.html',
    images: images('NR-01', '漩涡鸣人'),
    demoPrice: { original: 199, group: 169 },
    demoTarget: 3,
  },
  {
    id: 'NR-02',
    name: 'POP UP PARADE 宇智波佐助',
    category: 'naruto',
    tagline: '疾风传装束，拉开架势的佐助',
    description: [
      '出自《火影忍者疾风传》，佐助穿着经典的疾风传服装，站姿动感。',
      '原型 REIKO，涂装 Tomofumi（WATANA BOX），附展示底座。',
    ],
    size: '全高约 170 mm（含底座）',
    material: '塑料，已涂装完成品',
    scale: '无比例',
    maker: 'Good Smile Company',
    line: 'POP UP PARADE',
    officialPriceJpy: 4800,
    sourceUrl: 'https://www.goodsmile.info/en/product/13469/POP+UP+PARADE+Sasuke+Uchiha.html',
    images: images('NR-02', '宇智波佐助'),
    demoPrice: { original: 239, group: 209 },
    demoTarget: 3,
  },
  {
    id: 'NR-03',
    name: '粘土人 旗木卡卡西',
    category: 'naruto',
    tagline: '可动 Q 版卡卡西，附雷切特效和《亲热天堂》',
    description: [
      '出自《火影忍者疾风传》的粘土人，关节可动，附三种替换表情和两种护额，可以遮住或露出左眼。',
      '配件有雷切特效件和《亲热天堂》小书，可以摆出战斗和日常两种场景。',
    ],
    size: '全高约 100 mm',
    material: 'ABS、PVC，已涂装可动完成品',
    scale: '无比例（Q 版）',
    maker: 'Good Smile Company',
    line: '粘土人（Nendoroid）',
    officialPriceJpy: 5300,
    sourceUrl: 'https://www.goodsmile.info/en/product/6174/Nendoroid+Kakashi+Hatake.html',
    images: images('NR-03', '旗木卡卡西'),
    demoPrice: { original: 269, group: 229 },
    demoTarget: 2,
  },
  {
    id: 'JJ-01',
    name: 'POP UP PARADE 五条悟',
    category: 'jjk',
    tagline: '蒙眼结印的五条悟，附摘下眼罩的替换头',
    description: [
      '出自《咒术回战》。五条悟双手结印站立，气场十足。',
      '附可替换的头部零件，可以换成不戴眼罩的样子。原型 HIROHITO，附展示底座。',
    ],
    size: '全高约 185 mm（含底座）',
    material: '塑料，已涂装完成品',
    scale: '无比例',
    maker: 'Good Smile Company',
    line: 'POP UP PARADE',
    officialPriceJpy: 3900,
    sourceUrl: 'https://www.goodsmile.info/en/product/12126/POP+UP+PARADE+Satoru+Gojo.html',
    images: images('JJ-01', '五条悟'),
    demoPrice: { original: 199, group: 169 },
    demoTarget: 2,
  },
  {
    id: 'JJ-02',
    name: 'POP UP PARADE 虎杖悠仁',
    category: 'jjk',
    tagline: '稳稳站定的虎杖，附宿傩上身的替换头',
    description: [
      '出自《咒术回战》，虎杖悠仁以有力的站姿登场。',
      '附替换头部零件，可以展示被两面宿傩附身时的样子。原型 HIROHITO，附展示底座。',
    ],
    size: '全高约 175 mm（含底座）',
    material: 'ABS、PVC，已涂装完成品',
    scale: '无比例',
    maker: 'Good Smile Company',
    line: 'POP UP PARADE',
    officialPriceJpy: 3900,
    sourceUrl: 'https://www.goodsmile.info/en/product/11205/POP+UP+PARADE+Yuji+Itadori.html',
    images: images('JJ-02', '虎杖悠仁'),
    demoPrice: { original: 199, group: 169 },
    demoTarget: 3,
  },
  {
    id: 'JJ-03',
    name: 'POP UP PARADE 伏黑惠',
    category: 'jjk',
    tagline: '沉着站立的伏黑惠',
    description: [
      '出自《咒术回战》，伏黑惠以坚定的站姿呈现。',
      '原型 Magical Girl☆Haruyuki，附展示底座。',
    ],
    size: '全高约 175 mm（含底座）',
    material: 'ABS、PVC，已涂装完成品',
    scale: '无比例',
    maker: 'Good Smile Company',
    line: 'POP UP PARADE',
    officialPriceJpy: 3900,
    sourceUrl: 'https://www.goodsmile.info/en/product/11817/POP+UP+PARADE+Megumi+Fushiguro.html',
    images: images('JJ-03', '伏黑惠'),
    demoPrice: { original: 199, group: 169 },
    demoTarget: 3,
  },
]

export function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}

export function filterProducts(list: Product[], query: string, category: CategoryId | 'all'): Product[] {
  const q = query.trim().toLowerCase()
  return list.filter((p) => {
    if (category !== 'all' && p.category !== category) return false
    if (!q) return true
    return [p.name, p.tagline, p.material, p.line, categoryName(p.category)].some((field) =>
      field.toLowerCase().includes(q),
    )
  })
}

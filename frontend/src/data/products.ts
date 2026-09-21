import type { CategoryId, Product } from '@/types'
import { asset } from '@/utils/asset'

export const categories: { id: CategoryId; name: string }[] = [
  { id: 'vinyl', name: '潮流公仔' },
  { id: 'anime', name: '动漫手办' },
  { id: 'mecha', name: '机甲模型' },
]

export function categoryName(id: CategoryId): string {
  return categories.find((c) => c.id === id)?.name ?? ''
}

const images = (id: string, name: string) => [
  { src: asset(`art/${id}-main.svg`), alt: `${name}展台正面图` },
  { src: asset(`art/${id}-detail.svg`), alt: `${name}头部细节图` },
  { src: asset(`art/${id}-box.svg`), alt: `${name}开窗包装图` },
]

// 六款原创概念演示商品，不涉及任何既有作品或官方授权
export const products: Product[] = [
  {
    id: 'TS-1001',
    name: '云朵小芽',
    category: 'vinyl',
    tagline: '头顶一团云，云里冒出一片新芽的软胶公仔',
    description: [
      '圆头短身的软胶比例，云朵帽和嫩芽一体成型，放在显示器边上刚好。',
      '腮红为移印工艺，眼睛高光单独上色，换个角度看也有神。',
    ],
    size: '高 12 cm，宽 9 cm',
    material: '搪胶（软胶），PVC 底座',
    scale: '无比例 Q 版',
    weight: '约 180 g',
    edition: '常规款',
    images: images('TS-1001', '云朵小芽'),
    demoPrice: { original: 129, group: 99 },
    demoTarget: 3,
  },
  {
    id: 'TS-1002',
    name: '夜航猫船长',
    category: 'vinyl',
    tagline: '戴白顶船长帽的黑猫，大衣上四颗金扣',
    description: [
      '猫尾从大衣下摆绕到身侧，正面和侧面都有看点。',
      '金扣与帽徽为电镀件，大衣是哑光漆面，和光面的眼睛形成对比。',
    ],
    size: '高 15 cm，宽 11 cm',
    material: '搪胶（软胶），ABS 帽徽',
    scale: '无比例 Q 版',
    weight: '约 230 g',
    edition: '常规款',
    images: images('TS-1002', '夜航猫船长'),
    demoPrice: { original: 169, group: 139 },
    demoTarget: 3,
  },
  {
    id: 'TS-2001',
    name: '星轨旅人·澪',
    category: 'anime',
    tagline: '握着星杖、披着星图斗篷的原创旅人少女',
    description: [
      '斗篷内侧印星点，外侧是渐变深蓝；站姿微侧，星杖略高于头顶。',
      '头发分三段拆件，接缝藏在发丝走向里，附透明亚克力星星配件。',
    ],
    size: '高 24 cm（含底座），底座直径 12 cm',
    material: 'PVC、ABS，亚克力配件',
    scale: '1/7',
    weight: '约 420 g',
    edition: '常规款',
    images: images('TS-2001', '星轨旅人·澪'),
    demoPrice: { original: 699, group: 599 },
    demoTarget: 2,
  },
  {
    id: 'TS-2002',
    name: '赤焰剑士·焰',
    category: 'anime',
    tagline: '红发黑衣、围巾向后扬起的原创剑士',
    description: [
      '长剑斜贯全身，形成左下到右上的对角动势；围巾为软胶件，可小幅调整角度。',
      '剑身是金属漆加刃口高光，黑色外套保留了布料褶皱。',
    ],
    size: '高 26 cm（含底座），底座直径 13 cm',
    material: 'PVC、ABS，合金剑柄',
    scale: '1/7',
    weight: '约 480 g',
    edition: '常规款',
    images: images('TS-2002', '赤焰剑士·焰'),
    demoPrice: { original: 759, group: 649 },
    demoTarget: 2,
  },
  {
    id: 'TS-3001',
    name: '鸣镝 VX-07 侦察机甲',
    category: 'mecha',
    tagline: '轻装侦察型机体，单角天线配青色护目镜',
    description: [
      '免胶卡扣拼装，肩、肘、膝关节均可活动。',
      '附长管侦察步枪和替换手型；外装甲以白色为主，紫色标识为分色件。',
    ],
    size: '完成后高 18 cm',
    material: 'PS、ABS，聚乙烯关节件',
    scale: '1/100',
    weight: '约 210 g',
    edition: '常规款，需自行拼装',
    images: images('TS-3001', '鸣镝 VX-07 侦察机甲'),
    demoPrice: { original: 259, group: 219 },
    demoTarget: 3,
  },
  {
    id: 'TS-3002',
    name: '重岳 HG-12 重装机甲',
    category: 'mecha',
    tagline: '双肩重炮、宽底盘的重装防御型机体',
    description: [
      '免胶拼装，肩部双管炮可上下俯仰，加宽的腿部让站姿更稳。',
      '暗橄榄绿主色配橙色警示条，附水贴纸，适合练习做旧涂装。',
    ],
    size: '完成后高 20 cm，宽 17 cm',
    material: 'PS、ABS，聚乙烯关节件',
    scale: '1/100',
    weight: '约 320 g',
    edition: '常规款，需自行拼装',
    images: images('TS-3002', '重岳 HG-12 重装机甲'),
    demoPrice: { original: 329, group: 279 },
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
    return [p.name, p.tagline, p.material, categoryName(p.category)].some((field) =>
      field.toLowerCase().includes(q),
    )
  })
}

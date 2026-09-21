// 生成 6 款原创概念演示商品的 SVG 素材（主图 / 细节 / 包装），统一暖白展台背景。
// 运行：npm run gen:assets，输出到 public/art/
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'art')
mkdirSync(outDir, { recursive: true })

const defs = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#FFFDF9"/>
      <stop offset="1" stop-color="#EDE6DB"/>
    </radialGradient>
    <linearGradient id="plinth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E6DED2"/>
      <stop offset="1" stop-color="#D6CCBD"/>
    </linearGradient>
    <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#1D1B1A" stop-opacity=".22"/>
      <stop offset="1" stop-color="#1D1B1A" stop-opacity="0"/>
    </radialGradient>
  </defs>`

const stage = `
  <rect width="800" height="800" fill="url(#bg)"/>
  <rect y="600" width="800" height="200" fill="#E9E1D5"/>
  <path d="M190 660 v42 a210 34 0 0 0 420 0 v-42z" fill="url(#plinth)"/>
  <ellipse cx="400" cy="660" rx="210" ry="34" fill="#FBF8F3"/>
  <ellipse cx="400" cy="660" rx="150" ry="20" fill="url(#shadow)"/>`

// ---------- 六款原创角色 ----------
const figures = {
  'TS-1001': `
    <g>
      <ellipse cx="330" cy="648" rx="46" ry="18" fill="#8B6CF0"/>
      <ellipse cx="470" cy="648" rx="46" ry="18" fill="#8B6CF0"/>
      <rect x="300" y="460" width="200" height="190" rx="90" fill="#B9A3FF"/>
      <ellipse cx="290" cy="530" rx="30" ry="46" fill="#A58CFA" transform="rotate(20 290 530)"/>
      <ellipse cx="510" cy="530" rx="30" ry="46" fill="#A58CFA" transform="rotate(-20 510 530)"/>
      <circle cx="400" cy="360" r="150" fill="#FFF4EA"/>
      <circle cx="310" cy="250" r="62" fill="#FFFFFF"/><circle cx="400" cy="222" r="78" fill="#FFFFFF"/>
      <circle cx="492" cy="252" r="62" fill="#FFFFFF"/><circle cx="250" cy="300" r="42" fill="#FFFFFF"/>
      <circle cx="550" cy="302" r="42" fill="#FFFFFF"/>
      <path d="M252 318 q148 40 296 0" stroke="#E4DAFF" stroke-width="14" fill="none" stroke-linecap="round"/>
      <path d="M400 150 q-4 -46 -40 -64 q36 -8 48 30 q20 -46 64 -40 q-30 30 -60 74z" fill="#5FBF7F"/>
      <ellipse cx="350" cy="385" rx="22" ry="30" fill="#1D1B1A"/><ellipse cx="450" cy="385" rx="22" ry="30" fill="#1D1B1A"/>
      <circle cx="357" cy="374" r="8" fill="#fff"/><circle cx="457" cy="374" r="8" fill="#fff"/>
      <ellipse cx="315" cy="430" rx="22" ry="12" fill="#FFB3C4" opacity=".8"/>
      <ellipse cx="485" cy="430" rx="22" ry="12" fill="#FFB3C4" opacity=".8"/>
      <path d="M385 432 q15 14 30 0" stroke="#1D1B1A" stroke-width="6" fill="none" stroke-linecap="round"/>
    </g>`,
  'TS-1002': `
    <g>
      <path d="M520 600 q110 -20 90 -130 q-10 -40 -40 -30 q30 30 10 90 q-20 50 -80 44z" fill="#2B2D42"/>
      <ellipse cx="345" cy="650" rx="48" ry="18" fill="#1D1B1A"/><ellipse cx="455" cy="650" rx="48" ry="18" fill="#1D1B1A"/>
      <path d="M300 470 h200 l30 180 h-260z" fill="#2B2D42"/>
      <path d="M400 470 v180" stroke="#1E2033" stroke-width="6"/>
      <circle cx="380" cy="520" r="9" fill="#E8B64C"/><circle cx="380" cy="570" r="9" fill="#E8B64C"/>
      <circle cx="420" cy="520" r="9" fill="#E8B64C"/><circle cx="420" cy="570" r="9" fill="#E8B64C"/>
      <path d="M300 480 l-40 110 l36 10 l30 -90z" fill="#2B2D42"/><path d="M500 480 l40 110 l-36 10 l-30 -90z" fill="#2B2D42"/>
      <circle cx="274" cy="598" r="22" fill="#F4F1EC"/><circle cx="526" cy="598" r="22" fill="#F4F1EC"/>
      <path d="M270 300 l20 -110 l70 70z" fill="#3A3D57"/><path d="M530 300 l-20 -110 l-70 70z" fill="#3A3D57"/>
      <path d="M290 280 l12 -62 l38 40z" fill="#F2A7B8"/><path d="M510 280 l-12 -62 l-38 40z" fill="#F2A7B8"/>
      <ellipse cx="400" cy="360" rx="150" ry="130" fill="#3A3D57"/>
      <path d="M300 218 q100 -70 200 0 l-8 40 h-184z" fill="#F7F4EF"/>
      <rect x="276" y="250" width="248" height="30" rx="15" fill="#1D1B1A"/>
      <path d="M400 222 l14 20 h-28z" fill="#E8B64C"/><circle cx="400" cy="232" r="12" fill="#E8B64C"/>
      <ellipse cx="345" cy="360" rx="34" ry="40" fill="#F5D04A"/><ellipse cx="455" cy="360" rx="34" ry="40" fill="#F5D04A"/>
      <ellipse cx="345" cy="364" rx="10" ry="30" fill="#1D1B1A"/><ellipse cx="455" cy="364" rx="10" ry="30" fill="#1D1B1A"/>
      <path d="M390 410 h20 l-10 12z" fill="#F2A7B8"/>
      <path d="M400 422 q-14 18 -30 8 M400 422 q14 18 30 8" stroke="#F7F4EF" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M300 420 l-60 -10 M300 434 l-58 10 M500 420 l60 -10 M500 434 l58 10" stroke="#8C8FA8" stroke-width="4" stroke-linecap="round"/>
    </g>`,
  'TS-2001': `
    <g>
      <path d="M330 190 q-80 120 -60 300 q10 110 -20 170 h300 q-30 -60 -20 -170 q20 -180 -60 -300z" fill="#3B2A6B"/>
      <path d="M312 330 q-70 170 -90 320 l190 10 l-20 -320z" fill="#243B8C"/>
      <path d="M488 330 q70 170 90 320 l-190 10 l20 -320z" fill="#1F3278"/>
      <g fill="#FFE9A8"><circle cx="270" cy="560" r="5"/><circle cx="300" cy="480" r="4"/><circle cx="540" cy="520" r="5"/><circle cx="510" cy="600" r="4"/><circle cx="250" cy="630" r="3"/></g>
      <rect x="372" y="560" width="22" height="80" rx="10" fill="#FCE3D2"/><rect x="406" y="560" width="22" height="80" rx="10" fill="#FCE3D2"/>
      <path d="M364 630 h38 v24 h-46z M398 630 h38 l8 24 h-46z" fill="#3B2A6B"/>
      <path d="M350 330 h100 l40 240 h-180z" fill="#FAF7F2"/>
      <path d="M345 330 h110 l6 40 h-122z" fill="#7C3AED"/>
      <path d="M400 380 l10 20 l22 3 l-16 15 l4 22 l-20 -11 l-20 11 l4 -22 l-16 -15 l22 -3z" fill="#E8B64C"/>
      <path d="M455 350 q40 60 50 140" stroke="#FCE3D2" stroke-width="20" stroke-linecap="round" fill="none"/>
      <path d="M345 350 q-40 50 -40 120" stroke="#FCE3D2" stroke-width="20" stroke-linecap="round" fill="none"/>
      <path d="M520 150 v500" stroke="#C9B8FF" stroke-width="10" stroke-linecap="round"/>
      <path d="M520 110 l14 30 l32 4 l-24 22 l6 32 l-28 -16 l-28 16 l6 -32 l-24 -22 l32 -4z" fill="#FFD66B"/>
      <rect x="386" y="290" width="28" height="44" fill="#FCE3D2"/>
      <ellipse cx="400" cy="235" rx="78" ry="88" fill="#FCE3D2"/>
      <path d="M318 240 q-6 -130 82 -130 q92 0 86 130 q-30 -60 -86 -64 q-50 4 -82 64z" fill="#4A3585"/>
      <path d="M340 180 q30 40 70 20 q30 30 70 10" stroke="#4A3585" stroke-width="30" fill="none" stroke-linecap="round"/>
      <ellipse cx="370" cy="248" rx="14" ry="20" fill="#5B2FCB"/><ellipse cx="430" cy="248" rx="14" ry="20" fill="#5B2FCB"/>
      <circle cx="374" cy="242" r="5" fill="#fff"/><circle cx="434" cy="242" r="5" fill="#fff"/>
      <path d="M392 285 q8 6 16 0" stroke="#C0615E" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M460 150 l30 -18 l-6 26z" fill="#FFD66B"/>
    </g>`,
  'TS-2002': `
    <g>
      <path d="M240 620 L600 170" stroke="#C9CED6" stroke-width="16" stroke-linecap="round"/>
      <path d="M240 620 L600 170" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".7"/>
      <path d="M470 330 l40 30 M456 345 l40 30" stroke="#1D1B1A" stroke-width="10" stroke-linecap="round"/>
      <path d="M346 470 l-10 180 h40 l12 -150 l12 150 h40 l-10 -180z" fill="#26262B"/>
      <path d="M330 646 h52 v18 h-58z M418 646 h52 l6 18 h-58z" fill="#7A2A1E"/>
      <path d="M330 320 h140 l20 160 h-180z" fill="#1F1F24"/>
      <path d="M400 320 l-30 160 M400 320 l30 160" stroke="#34343B" stroke-width="6"/>
      <rect x="330" y="450" width="140" height="22" fill="#C23A22"/>
      <path d="M330 330 q-60 60 -50 140" stroke="#1F1F24" stroke-width="34" stroke-linecap="round" fill="none"/>
      <path d="M470 330 q40 20 20 40" stroke="#1F1F24" stroke-width="34" stroke-linecap="round" fill="none"/>
      <circle cx="486" cy="352" r="20" fill="#F6D9C4"/><circle cx="282" cy="478" r="18" fill="#F6D9C4"/>
      <path d="M350 300 q50 30 100 0 l6 34 q-60 20 -112 0z" fill="#E0442A"/>
      <path d="M440 316 q120 -10 190 60 q-90 -30 -170 10z" fill="#E0442A"/>
      <path d="M460 330 q100 20 150 100 q-80 -60 -150 -70z" fill="#C23A22"/>
      <ellipse cx="400" cy="235" rx="70" ry="78" fill="#F6D9C4"/>
      <path d="M322 230 l-30 -40 l46 6 l-20 -60 l52 34 l10 -66 l34 58 l40 -54 l6 62 l52 -26 l-24 56 l48 4 l-40 36 q-30 -60 -90 -64 q-60 2 -84 54z" fill="#E0442A"/>
      <path d="M362 238 l30 8 M438 238 l-30 8" stroke="#1D1B1A" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="376" cy="256" rx="9" ry="12" fill="#1D1B1A"/><ellipse cx="424" cy="256" rx="9" ry="12" fill="#1D1B1A"/>
      <circle cx="379" cy="252" r="3" fill="#FFB347"/><circle cx="427" cy="252" r="3" fill="#FFB347"/>
      <path d="M388 288 h24" stroke="#8A3A2A" stroke-width="4" stroke-linecap="round"/>
    </g>`,
  'TS-3001': `
    <g>
      <path d="M350 470 l-26 170 h52 l14 -150z M450 470 l26 170 h-52 l-14 -150z" fill="#E7E9EE"/>
      <path d="M318 600 h66 l6 50 h-78z M416 600 h66 l6 50 h-78z" fill="#7C3AED"/>
      <path d="M332 520 h44 M424 520 h44" stroke="#9AA1AE" stroke-width="6"/>
      <path d="M340 440 h120 l-14 50 h-92z" fill="#5A6070"/>
      <path d="M320 300 h160 l-20 150 h-120z" fill="#F4F5F7"/>
      <path d="M360 320 h80 l-10 60 h-60z" fill="#7C3AED"/>
      <rect x="386" y="392" width="28" height="30" fill="#FFCC33"/>
      <path d="M270 290 h64 l-6 70 h-70z M466 290 h64 l12 70 h-70z" fill="#E7E9EE"/>
      <path d="M262 356 l-22 110 h40 l18 -104z M538 356 l22 110 h-40 l-18 -104z" fill="#D5D9E0"/>
      <rect x="226" y="460" width="56" height="40" rx="8" fill="#5A6070"/>
      <path d="M540 470 h150 v26 h-150z" fill="#3B3F4A"/><rect x="600" y="496" width="20" height="40" fill="#3B3F4A"/>
      <path d="M686 474 h40 v18 h-40z" fill="#7C3AED"/>
      <path d="M350 200 h100 l14 80 l-50 20 h-28 l-50 -20z" fill="#F4F5F7"/>
      <path d="M362 238 h76 l-6 22 h-64z" fill="#29D5E6"/>
      <path d="M400 200 l-8 -70 l16 0z" fill="#7C3AED"/>
      <path d="M390 282 h20 v14 h-20z" fill="#C83A3A"/>
    </g>`,
  'TS-3002': `
    <g>
      <path d="M300 480 l-40 170 h110 l10 -170z M500 480 l40 170 h-110 l-10 -170z" fill="#4B5446"/>
      <path d="M250 610 h130 l6 44 h-142z M420 610 h130 l6 44 h-142z" fill="#2D322A"/>
      <rect x="280" y="530" width="90" height="16" fill="#F08A24"/><rect x="430" y="530" width="90" height="16" fill="#F08A24"/>
      <path d="M300 440 h200 l-20 60 h-160z" fill="#2D322A"/>
      <path d="M280 280 h240 l-20 180 h-200z" fill="#5E6857"/>
      <path d="M320 300 h160 v80 h-160z" fill="#4B5446"/>
      <g fill="#F08A24"><rect x="336" y="316" width="30" height="16"/><rect x="386" y="316" width="30" height="16"/><rect x="436" y="316" width="30" height="16"/></g>
      <path d="M180 250 h110 v110 h-110z M510 250 h110 v110 h-110z" fill="#4B5446"/>
      <path d="M190 170 h60 v80 h-60z M550 170 h60 v80 h-60z" fill="#2D322A"/>
      <rect x="205" y="120" width="30" height="60" fill="#3B4237"/><rect x="565" y="120" width="30" height="60" fill="#3B4237"/>
      <circle cx="220" cy="120" r="15" fill="#1D1B1A"/><circle cx="580" cy="120" r="15" fill="#1D1B1A"/>
      <path d="M196 360 h80 l-10 150 h-60z M524 360 h80 l-10 150 h-60z" fill="#5E6857"/>
      <rect x="190" y="500" width="92" height="56" rx="10" fill="#2D322A"/><rect x="518" y="500" width="92" height="56" rx="10" fill="#2D322A"/>
      <path d="M350 200 h100 v70 h-100z" fill="#5E6857"/>
      <rect x="364" y="222" width="72" height="16" fill="#F08A24"/>
      <path d="M340 206 h120 l-10 -16 h-100z" fill="#2D322A"/>
      <text x="400" y="430" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" fill="#E9E1D5" text-anchor="middle">12</text>
    </g>`,
}

const products = [
  { id: 'TS-1001', title: '云朵小芽', en: 'CLOUD SPROUT', accent: '#8B6CF0' },
  { id: 'TS-1002', title: '夜航猫船长', en: 'NIGHT CAPTAIN', accent: '#2B2D42' },
  { id: 'TS-2001', title: '星轨旅人·澪', en: 'STAR TRAVELER MIO', accent: '#3B2A6B' },
  { id: 'TS-2002', title: '赤焰剑士·焰', en: 'EMBER SWORDSMAN', accent: '#C23A22' },
  { id: 'TS-3001', title: '鸣镝 VX-07', en: 'SCOUT FRAME VX-07', accent: '#7C3AED' },
  { id: 'TS-3002', title: '重岳 HG-12', en: 'HEAVY FRAME HG-12', accent: '#4B5446' },
]

const wrap = (viewBox, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="800" height="800" role="img">${defs}${body}</svg>\n`

for (const p of products) {
  const fig = figures[p.id]
  // 主图：展台全景
  writeFileSync(join(outDir, `${p.id}-main.svg`), wrap('0 0 800 800', stage + fig))
  // 细节：放大头部
  writeFileSync(join(outDir, `${p.id}-detail.svg`), wrap('180 80 440 440', stage + fig))
  // 包装：开窗彩盒
  const box = `
  <rect width="800" height="800" fill="url(#bg)"/>
  <rect y="600" width="800" height="200" fill="#E9E1D5"/>
  <ellipse cx="400" cy="704" rx="250" ry="26" fill="url(#shadow)"/>
  <path d="M540 120 l50 -30 v580 l-50 30z" fill="${p.accent}" opacity=".75"/>
  <rect x="210" y="120" width="330" height="580" rx="6" fill="${p.accent}"/>
  <rect x="236" y="190" width="278" height="380" rx="4" fill="#FBF8F3"/>
  <svg x="236" y="190" width="278" height="380" viewBox="140 90 520 700" preserveAspectRatio="xMidYMid slice">${fig}</svg>
  <rect x="236" y="190" width="278" height="380" rx="4" fill="#FFFFFF" opacity=".12"/>
  <text x="375" y="160" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="6" fill="#FFFFFF" text-anchor="middle">TOYSPACE</text>
  <text x="375" y="620" font-family="'PingFang SC','Microsoft YaHei',sans-serif" font-size="34" font-weight="700" fill="#FFFFFF" text-anchor="middle">${p.title}</text>
  <text x="375" y="656" font-family="Arial,Helvetica,sans-serif" font-size="15" letter-spacing="3" fill="#FFFFFF" opacity=".8" text-anchor="middle">${p.en}</text>
  <text x="375" y="684" font-family="'PingFang SC','Microsoft YaHei',sans-serif" font-size="13" fill="#FFFFFF" opacity=".7" text-anchor="middle">原创概念演示 · DEMO</text>`
  writeFileSync(join(outDir, `${p.id}-box.svg`), wrap('0 0 800 800', box))
}

// 首页主视觉：三款并排展台（透明背景，叠放在页面字标之上）
const hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800" role="img">${defs}
  <g transform="translate(-40 60) scale(.8)">${stage.replace('<rect width="800" height="800" fill="url(#bg)"/>', '').replace('<rect y="600" width="800" height="200" fill="#E9E1D5"/>', '')}${figures['TS-3001']}</g>
  <g transform="translate(660 60) scale(.8)">${stage.replace('<rect width="800" height="800" fill="url(#bg)"/>', '').replace('<rect y="600" width="800" height="200" fill="#E9E1D5"/>', '')}${figures['TS-1002']}</g>
  <g transform="translate(250 -20) scale(.95)">${stage.replace('<rect width="800" height="800" fill="url(#bg)"/>', '').replace('<rect y="600" width="800" height="200" fill="#E9E1D5"/>', '')}${figures['TS-2001']}</g>
</svg>\n`
writeFileSync(join(outDir, 'hero.svg'), hero)
console.log(`generated ${products.length * 3 + 1} files in ${outDir}`)

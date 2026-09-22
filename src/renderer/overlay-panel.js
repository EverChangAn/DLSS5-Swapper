'use strict';
// Native <input type=range> dragging relies on OS capture, which an offscreen
// Chromium window does not own. Handle pointer drags in the shared DOM instead.
// A custom theme stores one accent colour. The other three shades the panel
// needs are derived from it here, in one place, so the preview in the app and
// the surface drawn inside the game cannot drift apart.
//   bright  accent lifted toward white, for text on dark
//   soft    accent at low alpha, for selected rows
//   back    a dark tint over the panel's own base, for the gradient
window.overlayThemeVars = accent => {
  const hex = /^#([0-9a-f]{6})$/i.exec(String(accent || ''));
  if (!hex) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
  const pair = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  const mix = (c, target, amount) => pair(c + (target - c) * amount);
  return {
    '--ol-accent': `#${pair(r)}${pair(g)}${pair(b)}`,
    '--ol-bright': `#${mix(r, 255, .47)}${mix(g, 255, .47)}${mix(b, 255, .47)}`,
    '--ol-soft': `#${pair(r)}${pair(g)}${pair(b)}25`,
    '--ol-back': `#${mix(r, 16, .88)}${mix(g, 21, .88)}${mix(b, 25, .88)}`
  };
};

// Point an element at a theme. Built-in themes are pure CSS; a custom one adds
// the derived variables inline, which override the stylesheet's defaults.
window.applyOverlayTheme = (element, prefs) => {
  if (!element || !prefs) return;
  element.dataset.overlayTheme = prefs.theme;
  for (const name of ['--ol-accent', '--ol-bright', '--ol-soft', '--ol-back']) element.style.removeProperty(name);
  if (prefs.theme !== 'custom') return;
  const vars = window.overlayThemeVars(prefs.custom && prefs.custom.accent);
  if (vars) for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
};

window.bindOverlayRanges = root => {
  let active = null;
  const move = event => {
    if (!active) return;
    const r = active.getBoundingClientRect(), thumb = 7.5;
    const min = Number(active.min), max = Number(active.max), step = Number(active.step) || .01;
    const ratio = Math.max(0, Math.min(1, (event.clientX - r.left - thumb) / Math.max(1, r.width - 2 * thumb)));
    active.value = String(Math.max(min, Math.min(max, min + Math.round(ratio * (max - min) / step) * step)));
    active.dispatchEvent(new Event('input', { bubbles: true }));
  };
  root.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.target.matches('input[type=range]:not(:disabled)')) return;
    active = event.target; event.preventDefault(); active.focus();
    active.dataset.dragging = 'true';
    try { active.setPointerCapture(event.pointerId); } catch {}
    move(event);
  });
  root.addEventListener('pointermove', move);
  const finish = () => { if (active) { delete active.dataset.dragging; active.dispatchEvent(new Event('change', { bubbles: true })); } active = null; };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  root.addEventListener('lostpointercapture', finish);
};
// One DOM for the the preview AND the in-game Chromium surface. No native
// reconstruction of controls: their metrics, fonts and behavior stay identical.
window.mountOverlayPanel = (root, footer = 'Design inspired by the NVIDIA reference. Masking, models and DLSS sliders are not connected to the SDK.') => {
  const slider = (id, label, value) => `<label class="ol-slider" for="${id}"><span>${label}</span><input id="${id}" type="range" min="0" max="1" step="0.01" value="${value}"/><output for="${id}">${value.toFixed(2)}</output></label>`;
  root.innerHTML = `<div class="ol-panel" dir="ltr">
    <header><span class="ol-eyebrow">DLSS 5 SWAPPER CONTROLS</span><span class="ol-prototype">PREVIEW</span></header>
    <label class="ol-check ol-master"><input type="checkbox" checked/> DLSS ON <small>Preview only</small></label>
    <label class="ol-check ol-badge"><input type="checkbox"/> ON-SCREEN STATUS <small>Shows DLSS 5 On/Off over the game</small></label>
    <section><h4>GLOBAL CONTROLS</h4>${slider('olStructure', 'Structure Intensity', .38)}${slider('olTone', 'Tone Intensity', .28)}</section>
    <section class="ol-muted"><label class="ol-check"><input type="checkbox" disabled/> MODEL AUTOMASK <small>SDK required</small></label>${slider('olMaskStructure', 'Structure Intensity', 1)}</section>
    <section><label class="ol-check"><input type="checkbox" checked/> DEVELOPER MASKING <small>Demo groups</small></label>
      ${[['Pitcher', .45, .35], ['Grapes', 1, 1], ['Bottles', 1, 1]].map(([label, structure, tone], i) => `<div class="ol-group"><label class="ol-check"><input type="checkbox" checked/> ${label}</label>${slider(`olGroup${i}s`, 'Structure Intensity', structure)}${slider(`olGroup${i}t`, 'Tone Intensity', tone)}</div>`).join('')}
    </section><section><h4>MODELS <small>Preview selection</small></h4><div class="ol-models">${['A', 'B', 'C'].map((m, i) => `<button class="ol-model ${i ? '' : 'selected'}" aria-pressed="${!i}">Model ${m}</button>`).join('')}</div></section>
    <footer></footer></div>`;
  root.querySelector('footer').textContent = footer;
  root.querySelector('#olMaskStructure').disabled = true;
  for (const input of root.querySelectorAll('input[type="range"]')) input.oninput = () => { input.nextElementSibling.textContent = Number(input.value).toFixed(2); };
  for (const model of root.querySelectorAll('.ol-model')) model.onclick = () => {
    for (const item of root.querySelectorAll('.ol-model')) { item.classList.toggle('selected', item === model); item.setAttribute('aria-pressed', String(item === model)); }
  };
  if (!root.dataset.rangeBinding) { window.bindOverlayRanges(root); root.dataset.rangeBinding = 'true'; }
};

/* ==========================================================================
 * 简体中文本地化（汉化补丁追加，不改变原有逻辑）
 * 机制：不改写模板与赋值语句，改为在 DOM 渲染后做一次精确文本映射。
 *       未命中的文本原样保留，因此漏配只会显示英文，不会出错。
 *       英文与阿拉伯语两条既有分支完全不受影响。
 * ========================================================================== */
const OL_ZH = {
  'DLSS 5 SWAPPER CONTROLS': 'DLSS 5 SWAPPER 控制台',
  'PREVIEW': '预览',
  'DLSS ON': 'DLSS 开',
  'Preview only': '仅预览',
  'ON-SCREEN STATUS': '屏幕状态显示',
  'Shows DLSS 5 On/Off over the game': '在游戏画面上显示 DLSS 5 开关状态',
  'SDK required': '需要 SDK',
  'Demo groups': '演示分组',
  'Preview selection': '预览选择',
  'Preview: Feeder + RenoDX': '预览：Feeder + RenoDX',
  'Preview: RenoDX': '预览：RenoDX',
  'MODELS': '模型',
  'MODEL AUTOMASK': '角色遮罩',
  'CHARACTER MASK': '角色遮罩',
  'DEVELOPER MASKING': '开发者遮罩',
  'GLOBAL CONTROLS': '全局控制',
  'MORE RENODX CONTROLS': '更多 RenoDX 控制',
  'FEEDER CONTROLS': 'Feeder 控制',
  'NR STYLE': '神经渲染风格',
  'LIVE RESHADE': 'ReShade 实时',
  'CONNECTED': '已连接',
  'DISCONNECTED': '未连接',
  'NOT CONNECTED': '未连接',
  'DLSS 5 SWAPPER · INJECTED TOOLS': 'DLSS 5 SWAPPER · 注入工具',
  'RenoDX live': 'RenoDX 实时',
  'RenoDX character mask': 'RenoDX 角色遮罩',
  'RenoDX controls unavailable.': 'RenoDX 控制不可用。',
  'Waiting for RenoDX': '正在等待 RenoDX',
  'Waiting for game connection': '正在等待游戏连接',
  'Unavailable': '不可用',
  'On-screen status card': '屏幕状态卡片',
  'ReShade shader effects': 'ReShade 着色器效果',
  'Live tools': '实时工具',
  'DLSS controls': 'DLSS 控制',
  'Show RenoDX extras': '显示 RenoDX 额外项',
  'Show Feeder controls': '显示 Feeder 控制',

  'Structure Intensity': '结构强度',
  'Tone Intensity': '色调强度',
  'Global Tone Intensity': '全局色调强度',
  'Local Tone Intensity': '局部色调强度',
  'Overall Intensity': '总强度',
  'Diffuse White (nits)': '漫反射白点 (nits)',
  'Motion Scale X Multiplier': '运动缩放 X 倍数',
  'Motion Scale Y Multiplier': '运动缩放 Y 倍数',
  'Character/Skin Structure': '角色/皮肤结构',
  'Automatic / Character Mask': '自动 / 角色遮罩',
  'Enable DLSS Neural Rendering': '启用 DLSS 神经渲染',
  'Enable Upscaling (WIP)': '启用超分辨率（开发中）',
  'NR UI Correction': '神经渲染界面修正',
  'NR Preset': '神经渲染预设',
  'NR Style': '神经渲染风格',
  'Depth Convention': '深度约定',
  'Use game NGX flag': '使用游戏 NGX 标志',
  'Force normal depth': '强制正常深度',
  'Force inverted depth': '强制反转深度',

  'Default': '默认',
  'Natural': '自然',
  'Cinematic': '电影感',
  'Preset #1': '预设 #1',
  'Preset #2': '预设 #2',
  'Preset #3': '预设 #3',
  'Model A · Default': '模型 A · 默认',
  'Model B · Natural': '模型 B · 自然',
  'Model C · Cinematic': '模型 C · 电影感',

  'Feeder enabled (original panel)': 'Feeder 已启用（原始面板）',
  'Work resolution (%)': '工作分辨率 (%)',
  'Work sharpness': '工作锐度',
  'Motion scale X': '运动缩放 X',
  'Motion scale Y': '运动缩放 Y',
  'HDR contract': 'HDR 约定',
  'Depth convention': '深度约定',
  'Work upscale': '工作分辨率放大',
  'HDR10 bridge': 'HDR10 桥接',
  'HDR paper white (nits)': 'HDR 纸白 (nits)',
  'Auto': '自动',
  'Force SDR': '强制 SDR',
  'Force HDR': '强制 HDR',
  'Normal': '正常',
  'Inverted': '反转',
  'Bilinear': '双线性',
  'DLSS SR (experimental)': 'DLSS SR（实验性）',
  'Off': '关闭',
  'On': '开启',

  'Design inspired by the NVIDIA reference. Masking, models and DLSS sliders are not connected to the SDK.':
    '设计参考 NVIDIA 方案。遮罩、模型和 DLSS 滑块均未连接 SDK。',
  'Restart DLSS 5 Swapper and connect the updated overlay to load RenoDX controls.':
    '重启 DLSS 5 Swapper 并连接更新后的叠加层，以加载 RenoDX 控制。',
  'Design preview; no game connection.': '设计预览；未连接游戏。',
  'RenoDX v4.7 controls use its original callback. FX controls below are separate. Experimental adapter; original tool windows remain available.':
    'RenoDX v4.7 控制使用其原始回调。下方的 FX 控制是独立的。实验性适配器；原始工具窗口仍可使用。',
  'Waiting for compatible RenoDX. FX controls do not control DLSS.':
    '正在等待兼容的 RenoDX。FX 控制不会控制 DLSS。',
  'No separate .fx shader controls found. RenoDX controls above do not require .fx shaders.':
    '未找到独立的 .fx 着色器控制。上方的 RenoDX 控制不需要 .fx 着色器。',
  'Interactive design preview only. Changes here do not affect a game. The installed overlay connects automatically to the verified RenoDX v4.7 build.':
    '仅为交互式设计预览。此处更改不会影响游戏。已安装的叠加层会自动连接到经过验证的 RenoDX v4.7 版本。',
  'Live RenoDX v4.7 settings. A/B/C select NR Style, not AI models. Scroll More Controls; click a number to type. Home keeps the original tools available.':
    'RenoDX v4.7 实时设置。A/B/C 选择的是神经渲染风格，而非 AI 模型。滚动到「更多控制」；点击数字可直接输入。Home 键保留原始工具。',
  'Waiting for the verified RenoDX v4.7 build. Connection is automatic; unsupported builds are refused. Original tools remain available.':
    '正在等待经过验证的 RenoDX v4.7 版本。连接是自动的；不受支持的版本会被拒绝。原始工具仍可使用。',
  'Design preview only. Feeder cfg controls; work resolution, filter and sharpness require DX11.':
    '仅为设计预览。Feeder 可配置的控制项；工作分辨率、滤镜和锐度需要 DX11。',

  'show/hide': '显示 / 隐藏',
  'Drag header: move': '拖动标题栏移动',
  'close': '关闭',
  'original tools': '原始工具'
};

const olIsZh = () => String(document.documentElement.lang || 'en').toLowerCase().startsWith('zh');

// 含动态值的拼接文本（热键、文件路径等），按固定片段做子串替换
const OL_ZH_PARTS = [
  ['The overlay add-on is missing from this app, so no game can load it:',
    '本程序缺少叠加层插件，任何游戏都无法加载它：'],
  ['Antivirus software removes this file - restore it from your antivirus quarantine and add an exclusion, or reinstall DLSS 5 Swapper.',
    '防病毒软件会删除此文件 —— 请从隔离区恢复并添加排除项，或重新安装 DLSS 5 Swapper。'],
  [': show/hide · Drag header: move · Esc: close · Home: original tools',
    '：显示 / 隐藏 · 拖动标题栏移动 · Esc 关闭 · Home 原始工具'],
  [': show/hide · Drag header to move · Esc: close · Home: original tools',
    '：显示 / 隐藏 · 拖动标题栏移动 · Esc 关闭 · Home 原始工具']
];

// 供 overlay-live.js 处理含动态值的拼接文本
window.overlayZh = (s) => (olIsZh() && OL_ZH[s]) ? OL_ZH[s] : s;

function olLocalize(root) {
  if (!olIsZh() || !root || !root.querySelectorAll) return;
  const walker = document.createTreeWalker(root, 4, null); // 4 = SHOW_TEXT
  const jobs = [];
  let node;
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue;
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const hit = OL_ZH[trimmed];
    if (hit) {
      const next = raw.replace(trimmed, hit);
      if (next !== raw) jobs.push([node, next]);
      continue;
    }
    let patched = raw;
    for (const [from, to] of OL_ZH_PARTS) if (patched.includes(from)) patched = patched.split(from).join(to);
    if (patched !== raw) jobs.push([node, patched]);
  }
  for (const [n, v] of jobs) n.nodeValue = v;
  for (const el of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const val = el.getAttribute(attr);
      const hit = val && OL_ZH[val];
      if (hit && hit !== val) el.setAttribute(attr, hit);
    }
  }
}

let olTimer = 0;
const olSchedule = () => { clearTimeout(olTimer); olTimer = setTimeout(() => olLocalize(document.body), 30); };
// 监听 documentElement（而非 body），以便捕获 lang 属性的变化——
// 游戏内面板是一个独立文档，语言由主进程在窗口加载后注入。
const olObserve = () => {
  olLocalize(document.body);
  new MutationObserver(olSchedule).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['lang']
  });
};
if (document.body) olObserve();
else document.addEventListener('DOMContentLoaded', olObserve);

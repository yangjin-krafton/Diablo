#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Prompt Builder — 조립형 프롬프트 생성기 (베리에이션 모드)   ║
 * ║  (색상 팔레트) × (재질감) × (게임요소 컨셉) → prompt 풀     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 컨셉마다 (팔레트 × 재질) 조합을 결정적으로 N개 뽑아서 풀을 만든다.
 * 1차로 이 풀의 모든 이미지를 뽑고, 사람이 generated-img/ 에서 안 좋은
 * png 만 삭제하면, 2차 GLB 단계는 살아남은 png 만 변환한다.
 *
 *   - PALETTES         : 2-tone 색상 조합 (16) — 캐릭터/오브젝트용
 *   - MATERIALS        : 재질/피니시 (12) — 캐릭터/오브젝트용
 *   - PLANET_PALETTES  : 행성 전용 3-tone (16)
 *   - PLANET_SURFACES  : 행성 전용 표면 (16)
 *
 * ID 형식:
 *   캐릭터/오브젝트: fig_p_knight__obsidian_crimson__brushed_metal
 *   행성 (1:1 매칭): fig_w_mars_dust
 *
 * 실행:
 *   node tools/prompt-builder.mjs                       # 컨셉당 4 베리에이션
 *   node tools/prompt-builder.mjs --variations 8        # 컨셉당 8 베리에이션
 *   node tools/prompt-builder.mjs --full-combo          # 모든 16×12 조합 (≈ 22K)
 *   node tools/prompt-builder.mjs --dry                 # 통계만, 파일 안 씀
 *   node tools/prompt-builder.mjs --sample              # 카테고리별 첫 1개 출력
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUT_PATH = resolve(__dirname, 'product-prompts.json');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const SAMPLE = args.includes('--sample');
const FULL_COMBO = args.includes('--full-combo');
function flagInt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const VARIATIONS = flagInt('variations', 4);

// ─── 1) 색상 팔레트 (16) ─────────────────────────────────────
const PALETTES = {
  obsidian_crimson: 'obsidian black and crimson red',
  cobalt_silver:    'deep cobalt blue and brushed silver',
  emerald_gold:     'emerald green and rich gold',
  violet_cyan:      'royal violet and electric cyan',
  ivory_rose:       'warm ivory and soft rose pink',
  charcoal_amber:   'charcoal grey and glowing amber',
  teal_bronze:      'oxidized teal and antique bronze',
  magenta_chrome:   'hot magenta and polished chrome',
  jade_ivory:       'jade green and pale ivory',
  sunset_navy:      'sunset orange and midnight navy',
  toxic_black:      'toxic neon green and matte black',
  arctic_sapphire:  'arctic white and deep sapphire',
  burgundy_cream:   'rich burgundy and cream white',
  forest_rust:      'forest green and rust orange',
  lavender_silver:  'soft lavender and moonlit silver',
  ashen_ember:      'ashen grey and ember orange',
};

// ─── 2) 재질감 (12) ──────────────────────────────────────────
const MATERIALS = {
  glossy_toy:      'glossy vinyl toy finish with smooth highlights',
  brushed_metal:   'brushed metal with fine directional scratches',
  cel_painted:     'flat cel-shaded painted look with clean line art',
  crystal:         'translucent faceted crystalline surface',
  fabric_leather:  'woven fabric and tooled leather',
  holographic:     'iridescent holographic shimmer',
  ceramic:         'smooth matte ceramic porcelain feel',
  weathered_stone: 'weathered ancient carved stone',
  neon_energy:     'glowing neon energy trim with soft emission',
  bio_organic:     'wet bio-organic tissue with subtle veins',
  chrome_mirror:   'mirror polished chrome with reflections',
  matte_plastic:   'soft matte plastic with rounded bevels',
};

// ─── 2-PLANET) 행성 전용 3-톤 팔레트 (16) ────────────────────
// 행성은 표면 색이 의미적으로 정해지므로 자체 팔레트 셋을 둔다.
const PLANET_PALETTES = {
  mars_dust:        'rust red, ochre tan, and dark crimson',
  arctic_ice:       'pale icy cyan, white, and deep navy',
  molten_core:      'charcoal black, lava orange, and glowing yellow',
  ocean_world:      'deep oceanic blue, teal, and bright white clouds',
  verdant_emerald:  'emerald green, earthy brown, and soft sky blue',
  gas_swirl:        'pale yellow, cream, and soft tan',
  obsidian_crack:   'matte black, magma red, and ash grey',
  crystal_amethyst: 'royal violet, pale white, and soft pink',
  swamp_marsh:      'muddy brown, sickly green, and fog grey',
  lunar_grey:       'ashen grey, pale white, and deep crater black',
  saturn_pastel:    'pale gold, ivory, and soft tan',
  toxic_brew:       'toxic neon green, bruise purple, and sickly yellow',
  iron_industrial:  'gunmetal grey, copper, and rust orange',
  red_savanna:      'warm amber, rust orange, and charcoal',
  cloud_pearl:      'soft pink, lavender, and pearl white',
  void_singularity: 'deep void black, violet glow, and starlight white',
};

// 행성 전용 표면 재질 (16) — 구체 위에 드러나는 지형 패턴
const PLANET_SURFACES = {
  cratered:         'pockmarked cratered surface with impact basins',
  icy_glaciers:     'vast cracked glaciers and frozen seas',
  lava_seams:       'glowing molten lava seams running through dark crust',
  oceanic:          'deep oceans with scattered green land masses and swirling clouds',
  forested:         'lush forested continents and shallow turquoise seas',
  gas_bands:        'horizontal swirling gas giant cloud bands',
  shattered:        'shattered cracked hemisphere with glowing inner core peeking out',
  crystalline:      'protruding crystalline shard formations across the surface',
  swampy_fog:       'mossy swamp continents wreathed in thick low fog',
  pockmarked_dust:  'fine grey dust plains and shallow craters',
  ringed:           'narrow orbital debris ring tilted around the equator',
  toxic_fog:        'thick toxic fog clouds wrapping the surface',
  metallic_plating: 'smooth metallic plating with circuit-like seams',
  windswept_dunes:  'sweeping windswept dune patterns',
  pearl_clouds:     'soft pearlescent cloud cover hiding the surface',
  void_corruption:  'void-corrupted surface with glowing reality cracks',
};

// ─── 3) 공용 suffix (TRELLIS 가 깨끗한 메쉬를 뽑도록) ─────────
// 캐릭터/몬스터용 (전신 프레이밍)
const SUFFIX_FIGURE = 'single subject only, full body visible from head to toe, no cropping, isolated on pure white background, no environment, no floor shadow, centered composition, collectible figure, high quality, 3d render style, studio lighting, product photo';
// 건물/아이템용 (소품 프레이밍)
const SUFFIX_PROP   = 'single object only, entire object fully visible, no cropping, isolated on pure white background, no environment, no floor shadow, centered composition, collectible diorama piece, high quality, 3d render style, studio lighting, product photo';

// ─── 4) 카테고리별 템플릿 ────────────────────────────────────
const TEMPLATES = {
  player:   ({ concept, palette, material }) =>
    `2-head-tall super deformed chibi ${concept}, color scheme of ${palette}, ${material}, dynamic heroic pose, ${SUFFIX_FIGURE}`,
  enemy:    ({ concept, palette, material }) =>
    `super deformed chibi ${concept}, color scheme of ${palette}, ${material}, menacing aggressive pose, ${SUFFIX_FIGURE}`,
  boss:     ({ concept, palette, material }) =>
    `2-head-tall super deformed chibi colossal ${concept} boss monster, imposing color scheme of ${palette}, ${material}, dominating powerful pose, ${SUFFIX_FIGURE}`,
  npc:      ({ concept, palette, material }) =>
    `2-head-tall super deformed chibi friendly ${concept}, color scheme of ${palette}, ${material}, welcoming idle pose, ${SUFFIX_FIGURE}`,
  building: ({ concept, palette, material }) =>
    `small stylized diorama ${concept}, color scheme of ${palette}, ${material}, complete compact structure, ${SUFFIX_PROP}`,
  item:     ({ concept, palette, material }) =>
    `small stylized game prop ${concept}, color scheme of ${palette}, ${material}, simple clean silhouette, centered orientation, ${SUFFIX_PROP}`,
  planet:   ({ concept, palette, surface }) =>
    `perfect spherical miniature ${concept}, complete round orb sphere shape, three-tone color palette of ${palette}, surface detail showing ${surface}, sci-fi collectible desktop planet model, ${SUFFIX_PROP}`,
};

// ─── 5) 게임 요소: 카테고리별 [slug, role, concept] 리스트 ────

// Player — 16 직종
const PLAYERS = [
  ['knight',        'melee_tank',  'noble knight warrior holding a longsword and heater shield in full plate armor'],
  ['berserker',     'melee_dps',   'wild berserker warrior wielding a massive two-handed greataxe, shirtless with battle scars'],
  ['paladin',       'tank_support','holy paladin with a glowing warhammer and tower shield, radiant halo aura'],
  ['monk',          'melee_dps',   'martial monk fighter in loose robes with bare fists wrapped in cloth tape, combat stance'],
  ['ranger',        'ranged',      'nimble forest ranger archer drawing a composite bow with quiver on back and hooded cloak'],
  ['gunner',        'ranged',      'frontier gunner hero holding twin revolvers, wide-brim hat and long coat'],
  ['sniper',        'ranged',      'stealth sniper kneeling with a long-barrel rifle and optical scope, camouflage cloak'],
  ['grenadier',     'ranged_aoe',  'rugged grenadier soldier holding a lit grenade with bandoliers across chest and goggles'],
  ['mage',          'caster',      'elemental mage wielding a flaming spellbook in one hand and a glowing wand, pointed hat'],
  ['necromancer',   'caster',      'sinister necromancer with a skull-topped staff, tattered robes and floating dark orbs'],
  ['druid',         'support',     'nature druid holding a vine-wrapped staff with antler headdress and leafy cloak'],
  ['warlock',       'caster',      'cursed warlock channeling a glowing eldritch sigil in one hand, horned hood over face'],
  ['assassin',      'melee_dps',   'silent assassin rogue crouching with twin daggers, dark hood and face mask'],
  ['ninja',         'melee_dps',   'agile ninja with a short katana and shuriken, masked face and trailing scarf'],
  ['bard',          'support',     'charming bard strumming a wooden lute, feathered hat and colorful traveling coat'],
  ['engineer',      'ranged',      'tinkerer engineer holding a heavy wrench with a hovering spherical repair drone, goggles on forehead'],
];

// Enemy — 20 종
const MONSTERS = [
  ['slime',         'tier1', 'wobbly jelly slime monster with two goofy eyes and a dumb grin'],
  ['goblin',        'tier1', 'scrappy goblin grunt holding a rusty cleaver'],
  ['skeleton',      'tier1', 'undead skeleton warrior rattling with a bone sword'],
  ['zombie',        'tier1', 'decayed shambling zombie in tattered clothes'],
  ['wolf',          'tier1', 'feral wolf beast with bared fangs and raised hackles'],
  ['bat',           'tier1', 'screeching flying bat creature with leathery wings spread'],
  ['imp',           'tier1', 'cackling horned imp with tiny wings and forked tail'],
  ['kobold',        'tier1', 'mischievous kobold scout with oversized crude dagger'],
  ['spider',        'tier2', 'giant fanged spider with eight hairy legs'],
  ['orc',           'tier2', 'hulking orc brute swinging a heavy spiked club'],
  ['harpy',         'tier2', 'feathered harpy with taloned feet and spread wings'],
  ['mummy',         'tier2', 'bandaged undead mummy with dragging linen wraps'],
  ['ghost',         'tier2', 'hollow translucent ghost spirit trailing a misty tail'],
  ['gargoyle',      'tier2', 'stone gargoyle with folded bat wings and curling horns'],
  ['lizardman',     'tier2', 'scaly lizardman warrior holding a barbed spear'],
  ['fungus_beast',  'tier2', 'walking fungus beast with spore caps on its back'],
  ['snake',         'tier3', 'coiled giant fanged snake rearing to strike'],
  ['crab',          'tier3', 'heavily armored giant pincer crab'],
  ['scorpion',      'tier3', 'giant stinger scorpion with raised barbed tail'],
  ['rock_golem',    'tier3', 'small walking rock golem made of jagged stone shards'],
];

// Boss — 10 종
const BOSSES = [
  ['dragon',       'boss', 'majestic winged dragon with vast outstretched wings, long tail and fanged maw'],
  ['lich_king',    'boss', 'skeletal lich king wearing a spiked crown with glowing eyes and floating ragged robes'],
  ['demon_lord',   'boss', 'massive horned demon lord with cloven hooves wielding a cruel jagged greatsword'],
  ['chimera',      'boss', 'three-headed chimera with lion, goat and serpent heads sharing one muscular body'],
  ['cyclops',      'boss', 'one-eyed cyclops giant swinging a huge spiked stone club'],
  ['hydra',        'boss', 'five-headed hydra with serpentine necks each ending in a fanged maw'],
  ['minotaur',     'boss', 'bull-headed minotaur hefting a heavy double-bladed battle axe'],
  ['titan_golem',  'boss', 'colossal stone titan golem with glowing runic cracks running across massive limbs'],
  ['kraken',       'boss', 'tentacled kraken rising from coiled tentacles with huge glowing eyes'],
  ['fallen_angel', 'boss', 'fallen angel warrior with torn black wings wielding a glowing soul blade'],
];

// NPC — 20 종
const NPCS = [
  ['merchant',        'shop',    'traveling merchant character carrying a backpack of goods, friendly smile'],
  ['blacksmith',      'craft',   'burly blacksmith with leather apron and hammer over shoulder'],
  ['alchemist',       'craft',   'eccentric alchemist holding a bubbling potion flask, round goggles'],
  ['priest',          'heal',    'serene priest in clean robes holding a small prayer book'],
  ['innkeeper',       'rest',    'plump innkeeper with apron holding a wooden mug'],
  ['quest_giver',     'quest',   'mysterious quest giver in a hooded cloak holding a rolled scroll'],
  ['elder',           'lore',    'bearded village elder leaning on a wooden cane, wise kind face'],
  ['town_guard',      'guard',   'dutiful town guard in simple chain armor holding a halberd at rest'],
  ['farmer',          'civilian','weathered farmer in straw hat holding a wooden rake'],
  ['hunter_npc',      'civilian','rugged hunter with leather vest and shortbow slung on back'],
  ['scholar',         'lore',    'scholarly librarian with round spectacles carrying a stack of books'],
  ['wandering_bard',  'entertain','cheerful wandering bard with feathered hat plucking a small harp'],
  ['witch_hermit',    'craft',   'old witch hermit with pointed hat stirring a tiny cauldron'],
  ['fisher',          'civilian','tan fisher in wide straw hat holding a fishing rod over shoulder'],
  ['child_villager',  'civilian','small child villager hugging a stuffed toy, cheerful expression'],
  ['traveler',        'info',    'wandering traveler with walking staff and full backpack'],
  ['archmage_npc',    'lore',    'dignified archmage in embroidered robes with floating spellbook beside him'],
  ['knight_captain',  'guard',   'stoic knight captain in ornate plate armor, hand resting on sheathed sword'],
  ['beggar',          'civilian','thin ragged beggar sitting with an empty bowl, humble pose'],
  ['spirit_guide',    'info',    'translucent ethereal spirit guide in flowing robes, serene floating pose'],
];

// Building — 20 종
const BUILDINGS = [
  ['village_house',   'dwelling', 'small cozy village house with pitched thatched roof, wooden door and shuttered window'],
  ['inn',             'rest',     'two-story tavern inn with hanging wooden sign, chimney and porch lantern'],
  ['blacksmith_shop', 'craft',    'open-front blacksmith forge with anvil outside, smoking chimney and tool rack'],
  ['apothecary',      'shop',     'narrow apothecary shop with colorful potion bottles displayed in the window'],
  ['church_chapel',   'holy',     'small stone chapel with pointed belfry, stained-glass round window and cross on top'],
  ['castle_keep',     'fortress', 'compact square castle keep with crenellated battlements and banner on pole'],
  ['watchtower',      'fortress', 'tall circular stone watchtower with wooden roof and arrow slits'],
  ['windmill',        'utility',  'classic windmill with four large wooden sail blades on a stone base'],
  ['market_stall',    'shop',     'wooden market stall with striped canvas awning and crates of goods'],
  ['stone_well',      'utility',  'round stone village well with wooden roof, crank handle and hanging bucket'],
  ['arched_bridge',   'utility',  'short arched stone bridge with low railings and cobbled surface'],
  ['ruined_tower',    'ruin',     'crumbling ruined stone tower with collapsed top, overgrown vines climbing the side'],
  ['dungeon_gate',    'dungeon',  'menacing dungeon entrance gate carved into a rock face with iron bars'],
  ['forest_shrine',   'holy',     'small forest shrine on stone plinth with offering bowl and carved idol'],
  ['campfire_tent',   'camp',     'small camp scene with a single tent, stacked logs and smoldering campfire'],
  ['grain_silo',      'utility',  'tall cylindrical grain silo with conical roof and ladder on the side'],
  ['magic_portal',    'arcane',   'freestanding arcane stone archway portal with swirling glowing energy inside'],
  ['graveyard_plot',  'ruin',     'tiny graveyard diorama with three weathered tombstones and a leaning iron fence'],
  ['town_statue',     'monument', 'pedestal monument with a heroic stone statue of a knight holding a sword aloft'],
  ['wooden_barricade','fortress', 'defensive wooden barricade wall of sharpened logs with a small watch platform'],
];

// Planet — 16 종 (행성 표면 / 게임 terrain 용도)
//   [slug, palette_key, surface_key, concept]
//   행성은 색·표면이 컨셉과 의미적으로 연결되므로 명시적 1:1 매칭.
const PLANETS = [
  ['mars_dust',         'mars_dust',        'cratered',         'red dusty desert planet'],
  ['frozen_world',      'arctic_ice',       'icy_glaciers',     'frozen ice planet'],
  ['molten_forge',      'molten_core',      'lava_seams',       'molten lava planet with cooling crust'],
  ['blue_ocean',        'ocean_world',      'oceanic',          'water-covered ocean planet'],
  ['verdant_garden',    'verdant_emerald',  'forested',         'lush garden planet of green continents'],
  ['gas_giant',         'gas_swirl',        'gas_bands',        'banded gas giant planet'],
  ['shattered_remnant', 'obsidian_crack',   'shattered',        'half-destroyed broken planet sphere'],
  ['crystal_world',     'crystal_amethyst', 'crystalline',      'crystal-encrusted gem planet'],
  ['swamp_bog',         'swamp_marsh',      'swampy_fog',       'fog-shrouded swamp planet'],
  ['lunar_grey',        'lunar_grey',       'pockmarked_dust',  'grey moon-like rocky world'],
  ['ringed_pastel',     'saturn_pastel',    'ringed',           'pastel gas planet with thin orbital ring'],
  ['toxic_haze',        'toxic_brew',       'toxic_fog',        'toxic poisoned planet shrouded in haze'],
  ['iron_industrial',   'iron_industrial',  'metallic_plating', 'industrial mechanical planet wrapped in metal plating'],
  ['savanna_dunes',     'red_savanna',      'windswept_dunes',  'arid savanna planet of dunes and hot winds'],
  ['cloud_veil',        'cloud_pearl',      'pearl_clouds',     'pearlescent cloud-covered planet'],
  ['void_anomaly',      'void_singularity', 'void_corruption',  'void-corrupted singularity planet'],
];

// Item — 30 종 (무기 10 + 방어구/장비 10 + 소비품/유물 10)
const ITEMS = [
  // weapons
  ['sword',        'weapon',      'long straight sword with crossguard and pointed tip, blade catching light'],
  ['greatsword',   'weapon',      'massive two-handed greatsword with wide heavy blade and wrapped hilt'],
  ['battle_axe',   'weapon',      'curved battle axe with wooden haft and metal head'],
  ['flanged_mace', 'weapon',      'flanged spiked mace with short haft and pommel ring'],
  ['recurve_bow',  'weapon',      'elegant recurve bow with taut string and decorated grip'],
  ['crossbow',     'weapon',      'mechanical crossbow with loaded bolt and carved wooden stock'],
  ['dagger',       'weapon',      'short double-edged dagger with jewel set in the pommel'],
  ['war_spear',    'weapon',      'tall war spear with leaf-shaped steel head and wrapped shaft'],
  ['wizard_staff', 'weapon',      'tall wizard staff topped with a glowing gemstone in claw mounting'],
  ['magic_wand',   'weapon',      'short ornate magic wand with a small floating rune at the tip'],
  // armor / gear
  ['knight_helm',  'armor',       'full-face knight helmet with movable visor and small plume'],
  ['chestplate',   'armor',       'ornate metal chestplate armor piece with embossed crest'],
  ['gauntlet',     'armor',       'single armored gauntlet glove with layered segmented plates'],
  ['heavy_boots',  'armor',       'pair of heavy armored boots with reinforced toes and straps'],
  ['heater_shield','armor',       'heater-shaped shield with a bold painted emblem and metal trim'],
  ['hooded_cloak', 'armor',       'flowing hooded cloak held by a round metal clasp'],
  ['amulet',       'accessory',   'ornate amulet with a central gem hanging on a metal chain'],
  ['signet_ring',  'accessory',   'metal signet ring with a single prominent gem inlay'],
  ['utility_belt', 'accessory',   'wide buckled adventurer belt with hanging small pouches'],
  ['pauldrons',    'armor',       'pair of spiked shoulder pauldrons connected by short chains'],
  // consumable / relic
  ['hp_potion',    'consumable',  'red hp potion bottle with cork stopper and small paper label tag'],
  ['mp_potion',    'consumable',  'blue mana potion flask with twisted cork and thin handle'],
  ['spell_scroll', 'consumable',  'rolled parchment spell scroll tied with ribbon and a wax seal'],
  ['cut_gem',      'consumable',  'cut faceted gemstone sitting upright, catching inner light'],
  ['coin_stack',   'consumable',  'small neat stack of ancient round coins'],
  ['skeleton_key', 'consumable',  'ornate skeleton key with intricate bow and long shank'],
  ['skill_tome',   'consumable',  'thick leather-bound skill tome with metal corners and hanging bookmark'],
  ['treasure_map', 'consumable',  'rolled treasure map partly unfurled with red X visible on the edge'],
  ['rune_tablet',  'consumable',  'engraved stone rune tablet with a glowing carved symbol in the center'],
  ['mystic_orb',   'consumable',  'floating mystical orb with inner swirling energy wisps'],
];

// ─── 6) 결정적 해시 기반 pick ────────────────────────────────
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function pick(list, key) {
  return list[hash(key) % list.length];
}

const paletteKeys = Object.keys(PALETTES);
const materialKeys = Object.keys(MATERIALS);

// 컨셉당 베리에이션 (palette, material) 조합을 결정적으로 추출.
// 모든 16×12 조합을 시드 셔플 후 앞에서 N 개만 가져온다 → 같은 N 이면
// 같은 결과, N 늘리면 기존 베리에이션은 유지하고 뒤에 추가됨.
function pickVariations(seedKey, n) {
  const all = [];
  for (const p of paletteKeys) {
    for (const m of materialKeys) {
      all.push([p, m]);
    }
  }
  if (FULL_COMBO) return all;

  // Linear congruential generator with stable seed
  let seed = hash(seedKey) || 1;
  const lcg = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let i = all.length - 1; i > 0; i--) {
    const j = lcg() % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(n, all.length));
}

function buildProductVariations(category, filePrefix, entry) {
  const [slug, role, concept] = entry;
  const baseId = `${filePrefix}_${slug}`;
  const combos = pickVariations(baseId, VARIATIONS);
  return combos.map(([paletteKey, materialKey]) => {
    const id = `${baseId}__${paletteKey}__${materialKey}`;
    const palette = PALETTES[paletteKey];
    const material = MATERIALS[materialKey];
    const prompt = TEMPLATES[category]({ concept, palette, material });
    return {
      id,
      base_id: baseId,
      category,
      role,
      name: `${slug.replace(/_/g, ' ')} · ${paletteKey} · ${materialKey}`,
      color_scheme: paletteKey,
      material: materialKey,
      prompt,
    };
  });
}

// 행성은 별도 — 명시적 팔레트·표면 매칭 + terrain 용 high-poly 플래그
function buildPlanet(entry) {
  const [slug, paletteKey, surfaceKey, concept] = entry;
  const id = `fig_w_${slug}`;
  const palette = PLANET_PALETTES[paletteKey];
  const surface = PLANET_SURFACES[surfaceKey];
  if (!palette) throw new Error(`unknown planet palette: ${paletteKey}`);
  if (!surface) throw new Error(`unknown planet surface: ${surfaceKey}`);
  const prompt = TEMPLATES.planet({ concept, palette, surface });
  return {
    id,
    category: 'planet',
    role: 'terrain',
    name: slug.replace(/_/g, ' '),
    color_scheme: paletteKey,
    surface: surfaceKey,
    // 게임 terrain 으로 사용 → 파이프라인이 이 값을 보고 Low Poly Face Number 를 오버라이드
    target_face_count: 100000,
    prompt,
  };
}

const GROUPS = [
  { category: 'player',   prefix: 'fig_p', list: PLAYERS   },
  { category: 'enemy',    prefix: 'fig_m', list: MONSTERS  },
  { category: 'boss',     prefix: 'fig_b', list: BOSSES    },
  { category: 'npc',      prefix: 'fig_n', list: NPCS      },
  { category: 'building', prefix: 'fig_s', list: BUILDINGS },
  { category: 'item',     prefix: 'fig_i', list: ITEMS     },
];

function buildAll() {
  const products = [];
  for (const { category, prefix, list } of GROUPS) {
    for (const entry of list) {
      products.push(...buildProductVariations(category, prefix, entry));
    }
  }
  // 행성은 컨셉이 색·표면을 의미적으로 함의하므로 베리에이션 X (1:1 매칭)
  for (const entry of PLANETS) {
    products.push(buildPlanet(entry));
  }
  return products;
}

// ─── 7) 실행 ────────────────────────────────────────────────
async function main() {
  const products = buildAll();

  const byCat = products.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Prompt Builder — 조립 결과                ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`   팔레트: ${paletteKeys.length}개 / 재질: ${materialKeys.length}개`);
  console.log(`   베리에이션 모드: ${FULL_COMBO ? `FULL ${paletteKeys.length}×${materialKeys.length}` : `컨셉당 ${VARIATIONS}개`}`);
  console.log(`   총 ${products.length}개 프롬프트 (행성 16 + 베리에이션)`);
  for (const [cat, n] of Object.entries(byCat)) {
    console.log(`     - ${cat}: ${n}`);
  }

  if (SAMPLE) {
    console.log('\n── 카테고리별 샘플 ──────────────────────────');
    const seen = new Set();
    for (const p of products) {
      if (seen.has(p.category)) continue;
      seen.add(p.category);
      console.log(`\n[${p.category}] ${p.id}`);
      console.log(`  color: ${p.color_scheme}  |  ${p.material ? `material: ${p.material}` : `surface: ${p.surface}`}`);
      console.log(`  ${p.prompt}`);
    }
    return;
  }

  if (DRY) {
    console.log('\n── (dry run, 파일 쓰지 않음) ─────────────');
    return;
  }

  await writeFile(OUT_PATH, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`\n✅ ${OUT_PATH} 저장 완료`);
}

main().catch(e => { console.error(e); process.exit(1); });

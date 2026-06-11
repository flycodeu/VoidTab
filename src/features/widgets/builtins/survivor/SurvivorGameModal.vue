<script setup lang="ts">
import {ref, onMounted, onUnmounted, computed} from 'vue';
import {
  PhX,
  PhCrosshair,
  PhShield,
  PhSnowflake,
  PhSword,
  PhRecycle,
  PhPause,
  PhCrown,
  PhSkull
} from '@phosphor-icons/vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

// =====================================================
// 1) 基础配置 & 工具
// =====================================================
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;
const FPS = 60;

const C = {
  BG: '#0b1224',
  PLAYER: '#3b82f6',
  PROJECTILE: '#f472b6',
  TEXT: '#ffffff',

  XP: '#eab308',
  BUFF: '#22d3ee',
  DEBUFF: '#a855f7',
  HEAL: '#22c55e',
  CORE: '#38bdf8',

  E_BASIC: '#ef4444',
  E_FAST: '#f59e0b',
  E_TANK: '#9333ea',
  E_SHOOTER: '#10b981',
  E_ELITE: '#f97316',
  E_BOSS: '#dc2626'
} as const;

type GameMode = 'EASY' | 'NORMAL' | 'HARD' | 'ARCADE';
type EnemyType = 'BASIC' | 'FAST' | 'TANK' | 'SHOOTER' | 'ELITE' | 'BOSS';
type EnemyTier = 1 | 2 | 3;

type PlayerStatus = 'INVULN' | 'INVERT' | 'SLOW' | 'VULN';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
const randPick = <T, >(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number) => Math.random() < p;

function tint(hex: string, amt: number) {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = clamp(Math.round(r + amt), 0, 255);
  g = clamp(Math.round(g + amt), 0, 255);
  b = clamp(Math.round(b + amt), 0, 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// =====================================================
// 2) 经验曲线（关键改动）
//   - 参考幸存者类：前期较快、中期变慢、后期明显吃力
//   - 且每关(Stage)整体抬高门槛，避免“每关节奏一样”
// =====================================================
// 经验门槛曲线：stage 影响 base / slope；level 影响线性+二次项
function calcNextLevelXp(stage: number, level: number, xpNeedMult: number) {
  const lv = Math.max(1, level);
  const s = Math.max(1, stage);

  // Stage 抬升：第 1 关基础较低，之后每关整体抬高
  const stageBase = 80 + (s - 1) * 55;       // S1=80, S2=135, S3=190...
  const stageSlope = 10 + (s - 1) * 2.5;     // S1=10, S2=12.5, S3=15...
  const stageQuad = 0.65 + (s - 1) * 0.08;   // 二次项随关卡微增

  // Level 曲线：线性 + 二次（后期明显变慢）
  const lin = (lv - 1) * stageSlope;
  const quad = (lv - 1) * (lv - 1) * stageQuad;

  // 每 5 级一个“小台阶”（很常见的幸存者节奏）
  const step = Math.floor((lv - 1) / 5) * (18 + (s - 1) * 3);

  const need = (stageBase + lin + quad + step) * xpNeedMult;
  return Math.floor(need);
}

// =====================================================
// 3) 掉落 & 模式规则（策略模式）
// =====================================================
type LootKind = 'XP' | 'ITEM' | 'CORE';

type ItemTag = 'BUFF' | 'DEBUFF';
type ItemDef = {
  id: string;
  name: string;
  tag: ItemTag;
  color: string;
  apply: (g: GameEngine) => void;
};

type Loot = { kind: LootKind; value?: number; itemId?: string };

type ModeRule = {
  label: string;

  enemyHpMult: number;
  enemyDmgMult: number;

  xpRate: number;       // 击杀掉落经验倍率（越高升级越快）
  xpNeedMult: number;   // 升级所需经验倍率（越高升级越慢）

  spawnBase: number;
  spawnStageScale: number;

  eliteChance: number;
  affixChance: number;
  coreDropBase: number;

  rollLoot: (g: GameEngine, e: Enemy) => Loot[];
};

const ITEM_POOL: Record<string, ItemDef> = {
  // BUFF
  HEAL_30: {id: 'HEAL_30', name: '急救包', tag: 'BUFF', color: C.HEAL, apply: (g) => g.player.heal(30)},
  MAXHP_20: {
    id: 'MAXHP_20',
    name: '能量核心',
    tag: 'BUFF',
    color: C.BUFF,
    apply: (g) => {
      g.player.maxHp += 20;
      g.player.hp += 20;
      g.addToast('最大生命 +20', C.BUFF);
    }
  },
  DMG_UP: {
    id: 'DMG_UP',
    name: '火力芯片',
    tag: 'BUFF',
    color: C.BUFF,
    apply: (g) => {
      g.player.baseDamage += 2;
      g.addToast('火力 +2', C.BUFF);
    }
  },
  SPD_UP: {
    id: 'SPD_UP',
    name: '推进剂',
    tag: 'BUFF',
    color: C.BUFF,
    apply: (g) => {
      g.player.speed += 0.25;
      g.addToast('移速 +0.25', C.BUFF);
    }
  },
  PICKUP_UP: {
    id: 'PICKUP_UP',
    name: '磁力线圈',
    tag: 'BUFF',
    color: C.BUFF,
    apply: (g) => {
      g.player.pickupRadius += 10;
      g.addToast('吸取范围 +10', C.BUFF);
    }
  },
  NUKE: {
    id: 'NUKE',
    name: '清场协议',
    tag: 'BUFF',
    color: '#fde047',
    apply: (g) => {
      g.addToast('清场！', '#fde047');
      g.enemies.forEach((e) => g.damageEnemy(e, 999999));
    }
  },

  // DEBUFF
  INVERT: {
    id: 'INVERT',
    name: '醉酒',
    tag: 'DEBUFF',
    color: C.DEBUFF,
    apply: (g) => {
      g.addToast('方向颠倒 5s', C.DEBUFF);
      g.player.addStatus('INVERT', 5 * FPS);
    }
  },
  MAXHP_DOWN: {
    id: 'MAXHP_DOWN',
    name: '熵减失衡',
    tag: 'DEBUFF',
    color: C.DEBUFF,
    apply: (g) => {
      g.player.maxHp = Math.max(50, g.player.maxHp - 15);
      g.player.hp = Math.min(g.player.hp, g.player.maxHp);
      g.addToast('最大生命 -15', C.DEBUFF);
    }
  },
  VULN: {
    id: 'VULN',
    name: '脆弱标记',
    tag: 'DEBUFF',
    color: C.DEBUFF,
    apply: (g) => {
      g.addToast('受伤 +30% 8s', C.DEBUFF);
      g.player.addStatus('VULN', 8 * FPS);
    }
  },
  SLOW: {
    id: 'SLOW',
    name: '负载过高',
    tag: 'DEBUFF',
    color: C.DEBUFF,
    apply: (g) => {
      g.addToast('移速 -25% 6s', C.DEBUFF);
      g.player.addStatus('SLOW', 6 * FPS);
    }
  }
};

//   模式区分度：同时拉开 xpRate + xpNeedMult + 敌人属性 + 刷怪密度
const MODES: Record<GameMode, ModeRule> = {
  EASY: {
    label: '简单',
    enemyHpMult: 0.78,
    enemyDmgMult: 0.72,
    xpRate: 1.18,
    xpNeedMult: 0.92,
    spawnBase: 62,
    spawnStageScale: 2.0,
    eliteChance: 0.05,
    affixChance: 0.08,
    coreDropBase: 0.035,
    rollLoot: (g, e) => {
      const drops: Loot[] = [];
      drops.push({kind: 'XP', value: e.xpValue});

      // CORE：适度（不再刷屏）
      const coreP = g.rule.coreDropBase + (e.tier - 1) * 0.025 + (e.type === 'BOSS' ? 0.18 : 0);
      if (chance(coreP)) drops.push({kind: 'CORE', value: e.type === 'BOSS' ? 2 : (e.tier >= 2 ? 2 : 1)});

      // 轻度回血
      const itemP = e.type === 'BOSS' ? 0.85 : 0.10;
      if (chance(itemP)) drops.push({kind: 'ITEM', itemId: chance(0.7) ? 'HEAL_30' : 'MAXHP_20'});

      return drops;
    }
  },
  NORMAL: {
    label: '普通',
    enemyHpMult: 1.0,
    enemyDmgMult: 1.0,
    xpRate: 1.0,
    xpNeedMult: 1.05,
    spawnBase: 52,
    spawnStageScale: 2.5,
    eliteChance: 0.075,
    affixChance: 0.12,
    coreDropBase: 0.028,
    rollLoot: (g, e) => {
      const drops: Loot[] = [];
      drops.push({kind: 'XP', value: e.xpValue});

      const coreP = g.rule.coreDropBase + (e.tier - 1) * 0.02 + (e.type === 'BOSS' ? 0.14 : 0);
      if (chance(coreP)) drops.push({kind: 'CORE', value: e.type === 'BOSS' ? 2 : (e.tier === 3 ? 2 : 1)});

      const itemP = e.type === 'BOSS' ? 0.75 : 0.08;
      if (chance(itemP)) drops.push({kind: 'ITEM', itemId: 'HEAL_30'});

      if (e.type === 'BOSS') drops.push({
        kind: 'ITEM',
        itemId: randPick(['DMG_UP', 'SPD_UP', 'PICKUP_UP', 'MAXHP_20'])
      });

      return drops;
    }
  },
  HARD: {
    label: '困难',
    enemyHpMult: 1.18,
    enemyDmgMult: 1.18,
    xpRate: 0.92,
    xpNeedMult: 1.18,
    spawnBase: 44,
    spawnStageScale: 3.0,
    eliteChance: 0.11,
    affixChance: 0.20,
    coreDropBase: 0.022,
    rollLoot: (g, e) => {
      const drops: Loot[] = [];
      drops.push({kind: 'XP', value: e.xpValue});

      const coreP = g.rule.coreDropBase + (e.tier - 1) * 0.02 + (e.type === 'BOSS' ? 0.10 : 0);
      if (chance(coreP)) drops.push({kind: 'CORE', value: e.type === 'BOSS' ? 2 : (e.tier >= 2 ? 2 : 1)});

      const itemP = e.type === 'BOSS' ? 0.65 : 0.05;
      if (chance(itemP)) drops.push({kind: 'ITEM', itemId: 'HEAL_30'});

      if (e.type === 'BOSS') {
        drops.push({kind: 'ITEM', itemId: randPick(['DMG_UP', 'SPD_UP', 'PICKUP_UP', 'MAXHP_20'])});
        drops.push({kind: 'ITEM', itemId: randPick(['SLOW', 'VULN'])});
      }
      return drops;
    }
  },
  ARCADE: {
    label: '娱乐',
    enemyHpMult: 0.95,
    enemyDmgMult: 0.95,
    xpRate: 1.25,
    xpNeedMult: 0.9,
    spawnBase: 48,
    spawnStageScale: 2.6,
    eliteChance: 0.09,
    affixChance: 0.22,
    coreDropBase: 0.05,
    rollLoot: (g, e) => {
      const drops: Loot[] = [];
      drops.push({kind: 'XP', value: e.xpValue});

      const coreP = g.rule.coreDropBase + (e.tier - 1) * 0.035 + (e.type === 'BOSS' ? 0.20 : 0);
      if (chance(coreP)) drops.push({kind: 'CORE', value: e.type === 'BOSS' ? 2 : (e.tier >= 2 ? 2 : 1)});

      const base = e.type === 'BOSS' ? 1.0 : (e.tier === 3 ? 0.45 : e.tier === 2 ? 0.30 : 0.18);
      if (chance(base)) {
        const buffIds = ['HEAL_30', 'MAXHP_20', 'DMG_UP', 'SPD_UP', 'PICKUP_UP', 'NUKE'];
        const debuffIds = ['INVERT', 'MAXHP_DOWN', 'VULN', 'SLOW'];
        const isDebuff = e.type !== 'BOSS' ? chance(0.28) : chance(0.35);
        drops.push({kind: 'ITEM', itemId: isDebuff ? randPick(debuffIds) : randPick(buffIds)});
      }

      if (e.type === 'BOSS') {
        drops.push({kind: 'ITEM', itemId: randPick(['DMG_UP', 'SPD_UP', 'MAXHP_20', 'NUKE'])});
        drops.push({kind: 'ITEM', itemId: randPick(['INVERT', 'MAXHP_DOWN', 'VULN', 'SLOW'])});
      }
      return drops;
    }
  }
};

// =====================================================
// 4) 实体系统
// =====================================================
class Entity {
  x: number;
  y: number;
  radius: number;
  color: string;
  markedForDeletion = false;

  constructor(x: number, y: number, r: number, c: string) {
    this.x = x;
    this.y = y;
    this.radius = r;
    this.color = c;
  }

  collidesWith(other: Entity): boolean {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy) < this.radius + other.radius;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Player extends Entity {
  hp = 120;
  maxHp = 120;

  speed = 4.2;
  baseDamage = 12;
  pickupRadius = 80;

  skills: Skill[] = [];
  xp = 0;
  level = 1;
  nextLevelXp = 120; // 由引擎按 stage+mode 重算

  iFrames = 0;
  status: Record<PlayerStatus, number> = {
    INVULN: 0,
    INVERT: 0,
    SLOW: 0,
    VULN: 0
  };

  constructor() {
    super(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 12, C.PLAYER);
  }

  addStatus(s: PlayerStatus, frames: number) {
    this.status[s] = Math.max(this.status[s], frames);
  }

  hasStatus(s: PlayerStatus) {
    return this.status[s] > 0;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  takeDamage(amount: number) {
    if (this.iFrames > 0) return;
    let final = amount;
    if (this.hasStatus('VULN')) final *= 1.3;
    this.hp -= final;

    this.iFrames = 22;
    this.addStatus('INVULN', 22);
  }

  move(dx: number, dy: number) {
    if (this.hasStatus('INVERT')) {
      dx = -dx;
      dy = -dy;
    }
    const slowMult = this.hasStatus('SLOW') ? 0.75 : 1.0;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      this.x += (dx / len) * this.speed * slowMult;
      this.y += (dy / len) * this.speed * slowMult;
    }

    this.x = clamp(this.x, 12, CANVAS_WIDTH - 12);
    this.y = clamp(this.y, 12, CANVAS_HEIGHT - 12);
  }

  gainXp(amount: number) {
    this.xp += amount;
  }

  tick() {
    if (this.iFrames > 0) this.iFrames--;
    (Object.keys(this.status) as PlayerStatus[]).forEach((k) => {
      if (this.status[k] > 0) this.status[k]--;
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.iFrames > 0 && Math.floor(this.iFrames / 4) % 2 === 0) ctx.globalAlpha = 0.35;
    super.draw(ctx);
    ctx.globalAlpha = 1;

    if (this.hasStatus('VULN')) {
      ctx.strokeStyle = C.DEBUFF;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

class Projectile extends Entity {
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  duration: number;
  isEnemy: boolean;
  owner?: Enemy;

  constructor(
      x: number,
      y: number,
      vx: number,
      vy: number,
      dmg: number,
      color: string,
      pierce = 1,
      dur = 120,
      enemy = false,
      owner?: Enemy
  ) {
    super(x, y, enemy ? 5 : 4, color);
    this.vx = vx;
    this.vy = vy;
    this.damage = dmg;
    this.pierce = pierce;
    this.duration = dur;
    this.isEnemy = enemy;
    this.owner = owner;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.duration--;
    if (
        this.duration <= 0 ||
        this.x < -30 ||
        this.x > CANVAS_WIDTH + 30 ||
        this.y < -30 ||
        this.y > CANVAS_HEIGHT + 30
    ) this.markedForDeletion = true;
  }
}

class DropItem extends Entity {
  kind: LootKind;
  value: number;
  itemId?: string;
  tag?: ItemTag;

  constructor(x: number, y: number, kind: LootKind, value = 0, itemId?: string, tag?: ItemTag) {
    const color =
        kind === 'XP' ? C.XP : kind === 'CORE' ? C.CORE : tag === 'DEBUFF' ? C.DEBUFF : C.BUFF;
    super(x, y, 6, color);
    this.kind = kind;
    this.value = value;
    this.itemId = itemId;
    this.tag = tag;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.kind === 'ITEM') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = this.color;
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
      return;
    }
    if (this.kind === 'CORE') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = this.color;
      ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 2;
      ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
      return;
    }
    super.draw(ctx);
  }
}

class TurretEntity extends Entity {
  timer = 0;
  level: number;
  damage: number;
  life = 720;

  constructor(x: number, y: number, lvl: number, dmg: number) {
    super(x, y, 15, '#94a3b8');
    this.level = lvl;
    this.damage = dmg;
  }

  update(game: GameEngine) {
    this.life--;
    if (this.life <= 0) this.markedForDeletion = true;

    this.timer++;
    const rate = Math.max(10, 44 - this.level * 3);
    if (this.timer > rate) {
      this.timer = 0;
      const t = game.getClosestEnemy(this);
      if (t) {
        const a = Math.atan2(t.y - this.y, t.x - this.x);
        game.spawnProjectile(this.x, this.y, Math.cos(a) * 7.2, Math.sin(a) * 7.2, this.damage, '#cbd5e1', 1, 90, false);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    super.draw(ctx);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// =====================================================
// 5) 精英词缀系统（护盾/分裂/吸血）
// =====================================================
type AffixKey = 'SPLIT' | 'VAMPIRIC' | 'SHIELDED';

type Affix = {
  key: AffixKey;
  name: string;
  color: string;
  onSpawn?: (e: Enemy, g: GameEngine) => void;
  onDamage?: (e: Enemy, g: GameEngine, dmg: number) => number;
  onDeath?: (e: Enemy, g: GameEngine) => void;
  onHitPlayer?: (e: Enemy, g: GameEngine, dealt: number) => void;
  drawOverlay?: (e: Enemy, ctx: CanvasRenderingContext2D) => void;
};

const AFFIXES: Record<AffixKey, Affix> = {
  SHIELDED: {
    key: 'SHIELDED',
    name: '护盾',
    color: '#60a5fa',
    onSpawn: (e) => {
      e.shieldHp = Math.max(10, Math.floor(e.maxHp * 0.35));
      e.shieldMax = e.shieldHp;
    },
    onDamage: (e, g, dmg) => {
      if (e.shieldHp > 0) {
        const take = Math.min(e.shieldHp, dmg);
        e.shieldHp -= take;
        g.addVFX('TEXT', e.x, e.y, 0, 0, '#93c5fd', `-${Math.floor(take)}`);
        return dmg - take;
      }
      return dmg;
    },
    drawOverlay: (e, ctx) => {
      if (e.shieldHp <= 0) return;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },
  SPLIT: {
    key: 'SPLIT',
    name: '分裂',
    color: '#fca5a5',
    onDeath: (e, g) => {
      if (e.type === 'BOSS') return;
      const n = 2;
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 / n) * i + Math.random() * 0.2;
        const nx = e.x + Math.cos(ang) * 16;
        const ny = e.y + Math.sin(ang) * 16;
        const child = new Enemy(nx, ny, g.stage, 'BASIC', 1, g.rule, []);
        child.maxHp = Math.max(6, Math.floor(e.maxHp * 0.35));
        child.hp = child.maxHp;
        child.damage = Math.max(2, e.damage * 0.55);
        child.speed = Math.max(1.4, e.speed * 1.1);
        child.xpValue = Math.max(1, Math.floor(e.xpValue * 0.25));
        child.radius = 9;
        g.enemies.push(child);
      }
      g.addVFX('RING', e.x, e.y, 24, 0, '#fca5a5');
    }
  },
  VAMPIRIC: {
    key: 'VAMPIRIC',
    name: '吸血',
    color: '#fb7185',
    onHitPlayer: (e, g, dealt) => {
      const heal = dealt * 0.35;
      e.hp = Math.min(e.maxHp, e.hp + heal);
      g.addVFX('TEXT', e.x, e.y, 0, 0, '#fb7185', `+${Math.floor(heal)}`);
    },
    drawOverlay: (e, ctx) => {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
};

function rollAffixes(rule: ModeRule, eType: EnemyType, tier: EnemyTier, stage: number): AffixKey[] {
  if (eType === 'BOSS') {
    // Boss：从第二关开始至少1个，越后越可能2个
    const keys: AffixKey[] = [];
    if (stage >= 2) keys.push(randPick(['SHIELDED', 'VAMPIRIC', 'SPLIT']));
    if (stage >= 5 && chance(0.35)) keys.push(randPick(['SHIELDED', 'VAMPIRIC']));
    return [...new Set(keys)];
  }

  const base = rule.affixChance + (tier - 1) * 0.12 + stage * 0.01;
  if (!chance(clamp(base, 0, 0.55))) return [];

  const pool: AffixKey[] = ['SHIELDED', 'SPLIT', 'VAMPIRIC'];
  const count = tier >= 3 && stage >= 6 && chance(0.25) ? 2 : 1;
  const picked: AffixKey[] = [];
  for (let i = 0; i < count; i++) picked.push(randPick(pool));
  return [...new Set(picked)];
}

// =====================================================
// 6) 敌人AI
// =====================================================
type EnemyBehavior = { update: (e: Enemy, p: Player, g: GameEngine) => void };

function behaviorChase(): EnemyBehavior {
  return {
    update: (e, p, g) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      e.x += (dx / dist) * e.speed;
      e.y += (dy / dist) * e.speed;
      if (dist < e.radius + p.radius + 5) e.tryMelee(p, g);
    }
  };
}

function behaviorShooter(): EnemyBehavior {
  return {
    update: (e, p, g) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const a = Math.atan2(dy, dx);

      const ideal = 280;
      if (dist > ideal + 70) {
        e.x += Math.cos(a) * e.speed;
        e.y += Math.sin(a) * e.speed;
      } else if (dist < ideal - 70) {
        e.x -= Math.cos(a) * e.speed;
        e.y -= Math.sin(a) * e.speed;
      }

      e.tryShoot(a, g);
    }
  };
}

function behaviorDasher(): EnemyBehavior {
  return {
    update: (e, p, g) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const a = Math.atan2(dy, dx);

      e.dashTimer--;
      if (e.dashTimer <= 0 && dist < 300) {
        e.dashTimer = 220;
        e.dashFrames = 16;
        g.addVFX('RING', e.x, e.y, 22, 0, C.E_FAST);
      }

      if (e.dashFrames > 0) {
        e.dashFrames--;
        const dashSpd = e.speed * 2.6;
        e.x += Math.cos(a) * dashSpd;
        e.y += Math.sin(a) * dashSpd;
      } else {
        e.x += (dx / dist) * e.speed;
        e.y += (dy / dist) * e.speed;
      }

      if (dist < e.radius + p.radius + 6) e.tryMelee(p, g);
    }
  };
}

function behaviorTank(): EnemyBehavior {
  return {
    update: (e, p, g) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const a = Math.atan2(dy, dx);

      e.x += Math.cos(a) * e.speed;
      e.y += Math.sin(a) * e.speed;

      e.slamTimer--;
      if (e.slamTimer <= 0 && dist < 140) {
        e.slamTimer = 260;
        g.addVFX('NOVA', e.x, e.y, 120, 0, tint(C.E_TANK, 30));
        if (dist < 120) {
          const dealt = e.damage * 1.1;
          p.takeDamage(dealt);
          e.onHitPlayer(g, dealt);
        }
      }

      if (dist < e.radius + p.radius + 8) e.tryMelee(p, g);
    }
  };
}

function behaviorBoss(): EnemyBehavior {
  return {
    update: (e, p, g) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const a = Math.atan2(dy, dx);

      const phase2 = e.hp < e.maxHp * 0.5;

      const spd = phase2 ? e.speed * 1.15 : e.speed;
      e.x += Math.cos(a) * spd;
      e.y += Math.sin(a) * spd;

      if (dist < e.radius + p.radius + 10) e.tryMelee(p, g, 1.25);

      // 扇形射击：逐关变多 & 更快
      e.shootTimer--;
      const baseCd = phase2 ? 30 : 42;
      const shootCd = Math.max(16, baseCd - g.stage * 2.2);
      if (e.shootTimer <= 0 && dist < 760) {
        e.shootTimer = shootCd;
        const bullets = g.stage <= 1 ? 2 : g.stage <= 3 ? 3 : g.stage <= 6 ? 4 : 5;
        const spread = 0.14;
        const start = -(bullets - 1) / 2;
        for (let i = 0; i < bullets; i++) {
          const aa = a + (start + i) * spread;
          g.spawnProjectile(e.x, e.y, Math.cos(aa) * 5.0, Math.sin(aa) * 5.0, e.damage * 0.65, '#fb7185', 1, 170, true, e);
        }
      }

      // 弹幕环：第三关开始
      e.barrageTimer--;
      const barrageOk = g.stage >= 3 && phase2;
      if (barrageOk && e.barrageTimer <= 0) {
        e.barrageTimer = Math.max(190, 270 - g.stage * 10);
        g.addVFX('RING', e.x, e.y, 46, 0, '#fb7185');
        const n = 10 + Math.min(8, g.stage);
        for (let i = 0; i < n; i++) {
          const aa = (Math.PI * 2 / n) * i;
          g.spawnProjectile(e.x, e.y, Math.cos(aa) * 4.2, Math.sin(aa) * 4.2, e.damage * 0.5, '#fb7185', 1, 200, true, e);
        }
      }
    }
  };
}

class Enemy extends Entity {
  type: EnemyType;
  tier: EnemyTier;

  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  xpValue: number;

  behavior: EnemyBehavior;

  meleeCd = 0;
  dashTimer = 80;
  dashFrames = 0;
  slamTimer = 160;
  shootTimer = 40;
  barrageTimer = 220;

  affixKeys: AffixKey[] = [];
  shieldHp = 0;
  shieldMax = 0;

  constructor(x: number, y: number, stage: number, type: EnemyType, tier: EnemyTier, mode: ModeRule, affixes: AffixKey[] = []) {
    const baseColor = (() => {
      switch (type) {
        case 'FAST':
          return C.E_FAST;
        case 'TANK':
          return C.E_TANK;
        case 'SHOOTER':
          return C.E_SHOOTER;
        case 'ELITE':
          return C.E_ELITE;
        case 'BOSS':
          return C.E_BOSS;
        default:
          return C.E_BASIC;
      }
    })();
    const r = type === 'TANK' ? 18 : type === 'BOSS' ? 48 : type === 'FAST' ? 10 : 12;
    super(x, y, r, baseColor);

    this.type = type;
    this.tier = tier;

    //   让“每关怪更厉害”更明显：stageScale 逐步上升，并在 5 关后加速
    const stageScale = 1 + (stage - 1) * 0.16 + Math.max(0, stage - 5) * 0.07;
    const tierHp = tier === 1 ? 1 : tier === 2 ? 1.55 : 2.25;
    const tierDmg = tier === 1 ? 1 : tier === 2 ? 1.28 : 1.62;
    const tierXp = tier === 1 ? 1 : tier === 2 ? 1.55 : 2.10;

    let baseHp = 16;
    let baseDmg = 5;
    let baseSpd = 1.95;
    let baseXp = 6;

    switch (type) {
      case 'FAST':
        baseHp = 12;
        baseDmg = 5;
        baseSpd = 2.85;
        baseXp = 9;
        this.behavior = behaviorDasher();
        break;
      case 'TANK':
        baseHp = 58;
        baseDmg = 12;
        baseSpd = 1.0;
        baseXp = 20;
        this.behavior = behaviorTank();
        break;
      case 'SHOOTER':
        baseHp = 18;
        baseDmg = 6;
        baseSpd = 1.6;
        baseXp = 12;
        this.behavior = behaviorShooter();
        break;
      case 'ELITE':
        baseHp = 46;
        baseDmg = 9;
        baseSpd = 2.05;
        baseXp = 26;
        this.behavior = behaviorChase();
        break;
      case 'BOSS': {
        //   Boss 逐关更难（更明显）
        const bossScale = 1 + (stage - 1) * 0.30 + Math.max(0, stage - 5) * 0.10;
        baseHp = 720 * bossScale;
        baseDmg = 16 * (1 + (stage - 1) * 0.20);
        baseSpd = 1.35 * (1 + (stage - 1) * 0.07);
        baseXp = 360 * bossScale;
        this.behavior = behaviorBoss();
        break;
      }
      default:
        this.behavior = behaviorChase();
    }

    this.hp = baseHp * stageScale * tierHp * mode.enemyHpMult;
    this.damage = baseDmg * stageScale * tierDmg * mode.enemyDmgMult;
    this.speed = baseSpd * (1 + (tier - 1) * 0.06);
    this.xpValue = Math.floor(baseXp * stageScale * tierXp);

    this.maxHp = this.hp;

    if (tier === 2) this.color = tint(this.color, 22);
    if (tier === 3) this.color = tint(this.color, 44);

    this.affixKeys = affixes;
  }

  initAffixes(g: GameEngine) {
    this.affixKeys.forEach((k) => AFFIXES[k].onSpawn?.(this, g));
  }

  applyIncomingDamage(g: GameEngine, raw: number) {
    let dmg = raw;
    this.affixKeys.forEach((k) => {
      const fn = AFFIXES[k].onDamage;
      if (fn) dmg = fn(this, g, dmg);
    });
    if (dmg > 0) this.hp -= dmg;
  }

  onDeath(g: GameEngine) {
    this.affixKeys.forEach((k) => AFFIXES[k].onDeath?.(this, g));
  }

  onHitPlayer(g: GameEngine, dealt: number) {
    this.affixKeys.forEach((k) => AFFIXES[k].onHitPlayer?.(this, g, dealt));
  }

  update(p: Player, g: GameEngine) {
    if (this.meleeCd > 0) this.meleeCd--;
    this.behavior.update(this, p, g);
  }

  tryMelee(p: Player, g: GameEngine, mult = 1.0) {
    if (this.meleeCd > 0) return;
    this.meleeCd = this.type === 'BOSS' ? 28 : this.type === 'FAST' ? 34 : 38;

    const dealt = this.damage * mult;
    const before = p.hp;
    p.takeDamage(dealt);
    const realDealt = Math.max(0, before - p.hp);
    if (realDealt > 0) this.onHitPlayer(g, realDealt);

    g.addVFX('HIT', p.x, p.y, 0, 0, '#ffffff');
  }

  tryShoot(angle: number, g: GameEngine) {
    const baseCd = g.stage <= 1 ? 78 : 66;
    const cd = Math.max(20, baseCd - (this.tier - 1) * 10 - Math.floor(g.stage * 1.2));
    this.shootTimer--;
    if (this.shootTimer <= 0) {
      this.shootTimer = cd;
      const spd = 4.1 + (this.tier - 1) * 0.45;
      g.spawnProjectile(this.x, this.y, Math.cos(angle) * spd, Math.sin(angle) * spd, this.damage * 0.7, '#ef4444', 1, 170, true, this);

      if (this.tier >= 3 && chance(0.25)) {
        const off = 0.12;
        g.spawnProjectile(this.x, this.y, Math.cos(angle + off) * spd, Math.sin(angle + off) * spd, this.damage * 0.55, '#ef4444', 1, 170, true, this);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.type === 'BOSS') {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.tier >= 2) {
      ctx.save();
      ctx.strokeStyle = this.tier === 2 ? '#ffffffaa' : '#fde047cc';
      ctx.lineWidth = this.tier === 2 ? 2 : 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    super.draw(ctx);

    this.affixKeys.forEach((k) => AFFIXES[k].drawOverlay?.(this, ctx));

    if (this.type !== 'BOSS' && this.hp < this.maxHp * 0.35) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// =====================================================
// 7) 技能系统（光剑升级=多条）
// =====================================================
abstract class Skill {
  name: string;
  desc: string;
  icon: any;
  level = 1;
  maxLevel = 5;

  cooldown = 60;
  timer = 0;
  baseDmgPercent = 1.0;

  constructor(n: string, d: string, i: any) {
    this.name = n;
    this.desc = d;
    this.icon = i;
  }

  abstract fire(g: GameEngine, p: Player): void;

  abstract applyMechanicUpgrade(): void;

  abstract getUpgradeDesc(nextLevel: number): string;

  update(g: GameEngine, p: Player) {
    if (this.timer > 0) this.timer--;
    else {
      this.fire(g, p);
      this.timer = this.cooldown;
    }
  }

  upgrade() {
    this.level++;
    if (this.level <= this.maxLevel) this.applyMechanicUpgrade();
    else this.baseDmgPercent += 0.2;
  }

  getDamage(p: Player) {
    return p.baseDamage * this.baseDmgPercent;
  }
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * aby) / ab2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

class Arrow extends Skill {
  count = 1;

  constructor() {
    super('量子飞箭', '自动锁定最近敌人发射', PhCrosshair);
    this.cooldown = 34;
  }

  fire(g: GameEngine, p: Player) {
    const t = g.getClosestEnemy(p);
    for (let i = 0; i < this.count; i++) {
      let ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.random() * Math.PI * 2;
      ang += (i - (this.count - 1) / 2) * 0.22;
      g.spawnProjectile(p.x, p.y, Math.cos(ang) * 8.8, Math.sin(ang) * 8.8, this.getDamage(p), C.PROJECTILE, 1 + Math.floor(this.level / 2), 120, false);
    }
  }

  applyMechanicUpgrade() {
    this.count++;
  }

  getUpgradeDesc(next: number) {
    return next <= 5 ? '数量 +1' : '伤害 +20%';
  }
}

class Shield extends Skill {
  orbs = 1;

  constructor() {
    super('轨道护盾', '环绕自身持续刮伤（偏防守）', PhShield);
    this.cooldown = 999999;
  }

  update(g: GameEngine, p: Player) {
    const r = 74;
    for (let i = 0; i < this.orbs; i++) {
      const ang = Date.now() / 1000 * 2.0 + (Math.PI * 2 / this.orbs) * i;
      const x = p.x + Math.cos(ang) * r;
      const y = p.y + Math.sin(ang) * r;

      g.ctx.fillStyle = '#60a5fa';
      g.ctx.beginPath();
      g.ctx.arc(x, y, 8, 0, Math.PI * 2);
      g.ctx.fill();

      g.enemies.forEach((e) => {
        if ((e.x - x) ** 2 + (e.y - y) ** 2 < (e.radius + 8) ** 2) g.damageEnemy(e, this.getDamage(p) * 0.11);
      });
    }
  }

  fire() {
  }

  applyMechanicUpgrade() {
    this.orbs++;
  }

  getUpgradeDesc(next: number) {
    return next <= 5 ? '数量 +1' : '伤害 +20%';
  }
}

class Turret extends Skill {
  constructor() {
    super('自动炮台', '放置炮台自动攻击一段时间', PhRecycle);
    this.cooldown = 260;
  }

  fire(g: GameEngine, p: Player) {
    g.addEntity(new TurretEntity(p.x, p.y, this.level, this.getDamage(p) * 0.9));
  }

  applyMechanicUpgrade() {
    this.cooldown = Math.max(130, this.cooldown - 24);
  }

  getUpgradeDesc(next: number) {
    return next <= 5 ? '冷却更快' : '伤害 +20%';
  }
}

class Laser extends Skill {
  width = 10;
  beams = 1;

  constructor() {
    super('光剑', '朝最近敌人方向挥出光刃（贯穿）', PhSword);
    this.baseDmgPercent = 2.2;
    this.cooldown = 120;
  }

  fire(g: GameEngine, p: Player) {
    const t = g.getClosestEnemy(p);
    if (!t) return;

    const baseA = Math.atan2(t.y - p.y, t.x - p.x);
    const spread = 0.16;
    const dmg = this.getDamage(p) * 1.15;

    for (let i = 0; i < this.beams; i++) {
      const aa = baseA + (i - (this.beams - 1) / 2) * spread;
      const x2 = p.x + Math.cos(aa) * 1200;
      const y2 = p.y + Math.sin(aa) * 1200;
      g.addVFX('LASER', p.x, p.y, x2, y2, '#fb7185');

      g.enemies.forEach((e) => {
        const d = distPointToSegment(e.x, e.y, p.x, p.y, x2, y2);
        if (d < this.width + e.radius) g.damageEnemy(e, dmg);
      });
    }
  }

  applyMechanicUpgrade() {
    if (this.level === 2) this.beams = 2;
    else if (this.level === 3) this.width += 2.0;
    else if (this.level === 4) this.beams = 3;
    else if (this.level === 5) this.cooldown = Math.max(70, this.cooldown - 18);
  }

  getUpgradeDesc(next: number) {
    if (next === 2) return '新增 1 把光剑（共2条）';
    if (next === 3) return '光剑更粗（更容易命中）';
    if (next === 4) return '新增 1 把光剑（共3条）';
    if (next === 5) return '冷却降低';
    return '伤害 +20%';
  }
}

class Frost extends Skill {
  slowMult = 0.3;

  constructor() {
    super('冰霜新星', '范围爆发并大幅减速', PhSnowflake);
    this.cooldown = 150;
  }

  fire(g: GameEngine, p: Player) {
    const radius = 145 + (this.level - 1) * 8;
    g.addVFX('NOVA', p.x, p.y, radius, 0, '#38bdf8');

    g.enemies.forEach((e) => {
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < radius ** 2) {
        g.damageEnemy(e, this.getDamage(p) * 1.0);
        e.speed *= this.slowMult;
      }
    });
  }

  applyMechanicUpgrade() {
    this.baseDmgPercent += 0.28;
    this.slowMult = Math.max(0.14, this.slowMult - 0.04);
  }

  getUpgradeDesc(next: number) {
    return next <= 5 ? '更痛/更冻' : '伤害 +20%';
  }
}

type SkillDef = {
  key: string;
  name: string;
  icon: any;
  desc: string;
  factory: () => Skill;
};

const SKILLS: SkillDef[] = [
  {key: 'ARROW', name: '量子飞箭', icon: PhCrosshair, desc: '自动锁定最近敌人发射', factory: () => new Arrow()},
  {key: 'SHIELD', name: '轨道护盾', icon: PhShield, desc: '环绕自身持续刮伤', factory: () => new Shield()},
  {key: 'TURRET', name: '自动炮台', icon: PhRecycle, desc: '放置炮台自动攻击', factory: () => new Turret()},
  {key: 'LASER', name: '光剑', icon: PhSword, desc: '挥出光刃贯穿前方', factory: () => new Laser()},
  {key: 'FROST', name: '冰霜新星', icon: PhSnowflake, desc: '范围爆发并减速', factory: () => new Frost()}
];

// =====================================================
// 8) VFX
// =====================================================
type VFX =
    | { type: 'TEXT'; x: number; y: number; life: number; color?: string; val?: any }
    | { type: 'LASER'; x: number; y: number; tx: number; ty: number; life: number; color?: string }
    | { type: 'NOVA'; x: number; y: number; tx: number; life: number; color?: string }
    | { type: 'RING'; x: number; y: number; tx: number; life: number; color?: string }
    | { type: 'HIT'; x: number; y: number; life: number; color?: string };

// =====================================================
// 9) 游戏引擎（关键改动：Boss=纯击杀数；经验曲线；模式差异）
// =====================================================
class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  mode: GameMode;
  rule: ModeRule;

  player: Player;

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  drops: DropItem[] = [];
  otherEntities: TurretEntity[] = [];

  frame = 0;
  score = 0;

  stage = 1;
  killedInStage = 0;

  //   Boss门槛：Stage1=100，Stage2=200...
  stageTarget = 100;

  bossActive = false;

  //   bossIncoming：召唤boss前先清场
  bossIncoming = 0;
  bossSpawnedThisStage = false;

  //   “待选择升级次数”（来自经验升级 / CORE资源包）
  pendingDrafts = 0;

  vfx: VFX[] = [];
  toasts: { text: string; life: number; color: string }[] = [];

  isGameOver = false;
  isVictory = false;

  constructor(cvs: HTMLCanvasElement, mode: GameMode) {
    this.canvas = cvs;
    this.ctx = cvs.getContext('2d')!;
    this.mode = mode;
    this.rule = MODES[mode];
    this.player = new Player();

    this.recalcStageParams();
    this.recalcNextXp();

    // 开局给一次升级（降低上手难度）
    this.giveDraft(1, '开局奖励');
  }

  recalcStageParams() {
    this.stageTarget = this.stage * 100;
  }

  recalcNextXp() {
    this.player.nextLevelXp = calcNextLevelXp(this.stage, this.player.level, this.rule.xpNeedMult);
  }

  update() {
    this.frame++;
    this.player.tick();

    // Boss召唤流程：先清场
    if (this.bossIncoming > 0) {
      this.bossIncoming--;
      this.enemies.forEach((e) => (e.markedForDeletion = true));
      this.projectiles.forEach((p) => {
        if (p.isEnemy) p.markedForDeletion = true;
      });
      if (this.bossIncoming === 0) this.spawnBossNow();
    }

    // 刷怪（Boss阶段/召唤阶段不刷）
    if (!this.bossActive && this.bossIncoming === 0) {
      const rate = Math.max(14, Math.floor(this.rule.spawnBase - this.stage * this.rule.spawnStageScale));
      if (this.frame % rate === 0) this.spawnEnemy();
    }

    // 技能
    this.player.skills.forEach((s) => s.update(this, this.player));

    // 子弹
    this.projectiles.forEach((p) => {
      p.update();

      if (p.isEnemy) {
        if (!p.markedForDeletion && p.collidesWith(this.player)) {
          const before = this.player.hp;
          this.player.takeDamage(p.damage);
          const dealt = Math.max(0, before - this.player.hp);
          if (dealt > 0 && p.owner) p.owner.onHitPlayer(this, dealt);

          p.markedForDeletion = true;
          this.addVFX('TEXT', this.player.x, this.player.y, 0, 0, '#fff', `-${Math.floor(p.damage)}`);
        }
      } else {
        this.enemies.forEach((e) => {
          if (!p.markedForDeletion && !e.markedForDeletion && p.collidesWith(e)) {
            this.damageEnemy(e, p.damage);
            p.pierce--;
            if (p.pierce <= 0) p.markedForDeletion = true;
          }
        });
      }
    });

    // 敌人
    this.enemies.forEach((e) => e.update(this.player, this));

    // 炮台等
    this.otherEntities.forEach((t) => t.update(this));

    // 掉落吸附 & 拾取
    this.drops.forEach((d) => {
      const d2 = dist2(d.x, d.y, this.player.x, this.player.y);
      const dist = Math.sqrt(d2);
      if (dist < this.player.pickupRadius) {
        d.x += (this.player.x - d.x) * 0.15;
        d.y += (this.player.y - d.y) * 0.15;
        if (dist < this.player.radius + 10) this.collectDrop(d);
      }
    });

    // 清理
    this.enemies = this.enemies.filter((e) => !e.markedForDeletion);
    this.projectiles = this.projectiles.filter((p) => !p.markedForDeletion);
    this.drops = this.drops.filter((d) => !d.markedForDeletion);
    this.otherEntities = this.otherEntities.filter((e) => !e.markedForDeletion);

    // toast
    this.toasts = this.toasts.filter((t) => t.life > 0);
    this.toasts.forEach((t) => t.life--);

    if (this.player.hp <= 0) this.isGameOver = true;
  }

  // ======= 升级逻辑（关键改动：经验门槛=calcNextLevelXp） =======
  tryConsumeXpLevelUps() {
    while (this.player.xp >= this.player.nextLevelXp) {
      this.player.xp -= this.player.nextLevelXp;
      this.player.level++;
      this.recalcNextXp(); //   每次升级重算（受 stage+mode 影响）
      this.giveDraft(1, '等级提升');
    }
  }

  giveDraft(count: number, reason?: string) {
    this.pendingDrafts += count;
    if (reason) this.addToast(`升级 +${count}（${reason}）`, '#fde047');
  }

  // ======= 刷怪/召唤Boss（关键改动：纯击杀数） =======
  spawnEnemy() {
    let x: number, y: number;
    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? -30 : CANVAS_WIDTH + 30;
      y = Math.random() * CANVAS_HEIGHT;
    } else {
      x = Math.random() * CANVAS_WIDTH;
      y = Math.random() < 0.5 ? -30 : CANVAS_HEIGHT + 30;
    }

    //   怪物池随关卡更明显变化
    // S1：仅 BASIC
    // S2：少量 FAST
    // S3：少量 SHOOTER
    // S4：少量 TANK
    // S5+：可能 ELITE
    let type: EnemyType = 'BASIC';
    const r = Math.random();

    if (this.stage >= 2 && r > 0.86) type = 'FAST';
    if (this.stage >= 3 && r > 0.90) type = 'SHOOTER';
    if (this.stage >= 4 && r > 0.95) type = 'TANK';
    if (this.stage >= 5 && r > 0.93) type = 'ELITE';

    const eliteP = clamp(this.rule.eliteChance + this.stage * 0.01, 0, 0.30);
    const tier: EnemyTier = chance(eliteP) ? (chance(0.25 + this.stage * 0.01) ? 3 : 2) : 1;

    const affixKeys = rollAffixes(this.rule, type, tier, this.stage);

    const e = new Enemy(x, y, this.stage, type, tier, this.rule, affixKeys);
    e.initAffixes(this);
    this.enemies.push(e);
  }

  requestBossIfReady() {
    if (this.bossActive || this.bossIncoming > 0 || this.bossSpawnedThisStage) return;

    //   纯击杀触发：S1=100, S2=200...
    if (this.killedInStage >= this.stageTarget) {
      this.bossIncoming = 45;
      this.addToast('BOSS 即将降临…', '#fb7185');
      this.bossSpawnedThisStage = true;
    }
  }

  spawnBossNow() {
    this.bossActive = true;
    this.enemies = [];
    this.projectiles = this.projectiles.filter((p) => !p.isEnemy);
    this.addToast('☠️ BOSS 来袭！', '#fb7185');

    const affixKeys = rollAffixes(this.rule, 'BOSS', 3, this.stage);
    const boss = new Enemy(CANVAS_WIDTH / 2, -120, this.stage, 'BOSS', 3, this.rule, affixKeys);
    boss.initAffixes(this);
    this.enemies.push(boss);
  }

  // ======= 战斗/伤害 =======
  spawnProjectile(
      x: number,
      y: number,
      vx: number,
      vy: number,
      dmg: number,
      color: string,
      pierce = 1,
      dur = 120,
      enemy = false,
      owner?: Enemy
  ) {
    this.projectiles.push(new Projectile(x, y, vx, vy, dmg, color, pierce, dur, enemy, owner));
  }

  damageEnemy(e: Enemy, rawDmg: number) {
    e.applyIncomingDamage(this, rawDmg);
    this.addVFX('TEXT', e.x, e.y, 0, 0, '#fff', Math.floor(rawDmg));

    if (e.hp <= 0 && !e.markedForDeletion) {
      e.markedForDeletion = true;
      this.score += e.xpValue;

      e.onDeath(this);

      const loots = this.rule.rollLoot(this, e);
      loots.forEach((l) => this.spawnDropFromLoot(e.x, e.y, l));

      if (e.type === 'BOSS') this.handleBossKill(e);
      else {
        this.killedInStage++;
        this.requestBossIfReady();
      }
    }
  }

  handleBossKill(boss: Enemy) {
    this.bossActive = false;

    // Boss保底奖励：经验+资源包
    this.spawnDropFromLoot(boss.x, boss.y, {kind: 'XP', value: Math.floor(boss.xpValue * 0.65)});
    this.spawnDropFromLoot(boss.x, boss.y, {kind: 'CORE', value: 2});

    this.addToast(`STAGE ${this.stage} 通关！`, '#fde047');

    // 下一关
    this.stage++;
    this.killedInStage = 0;
    this.bossSpawnedThisStage = false;
    this.bossIncoming = 0;
    this.bossActive = false;

    this.recalcStageParams();
    this.recalcNextXp(); //   进入新关卡后，升级门槛整体上移

    // 通关奖励给 1 次升级（但不会再挡 Boss）
    this.giveDraft(1, '通关奖励');

    this.player.heal(this.player.maxHp);

    if (this.stage > 10) this.isVictory = true;
  }

  // ======= 掉落生成/拾取 =======
  spawnDropFromLoot(x: number, y: number, loot: Loot) {
    if (loot.kind === 'XP') {
      const v = Math.max(1, Math.floor((loot.value || 1) * this.rule.xpRate));
      const n = v >= 80 ? 6 : v >= 40 ? 4 : v >= 20 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const vv = Math.floor(v / n) + (i === 0 ? v % n : 0);
        const ox = (Math.random() - 0.5) * 28;
        const oy = (Math.random() - 0.5) * 28;
        this.drops.push(new DropItem(x + ox, y + oy, 'XP', vv));
      }
      return;
    }

    if (loot.kind === 'CORE') {
      const val = Math.max(1, loot.value || 1);
      const ox = (Math.random() - 0.5) * 24;
      const oy = (Math.random() - 0.5) * 24;
      this.drops.push(new DropItem(x + ox, y + oy, 'CORE', val));
      return;
    }

    if (loot.kind === 'ITEM' && loot.itemId && ITEM_POOL[loot.itemId]) {
      const item = ITEM_POOL[loot.itemId];
      const ox = (Math.random() - 0.5) * 24;
      const oy = (Math.random() - 0.5) * 24;
      this.drops.push(new DropItem(x + ox, y + oy, 'ITEM', 0, item.id, item.tag));
    }
  }

  collectDrop(d: DropItem) {
    d.markedForDeletion = true;

    if (d.kind === 'XP') {
      this.player.gainXp(d.value);
      return;
    }

    if (d.kind === 'CORE') {
      this.giveDraft(d.value, '资源包');
      return;
    }

    if (d.kind === 'ITEM' && d.itemId && ITEM_POOL[d.itemId]) {
      const item = ITEM_POOL[d.itemId];
      item.apply(this);
      this.addToast(`${item.tag === 'DEBUFF' ? '☠️' : '✨'} ${item.name}`, item.color);
    }
  }

  addEntity(e: TurretEntity) {
    this.otherEntities.push(e);
  }

  getClosestEnemy(source: { x: number; y: number }): Enemy | null {
    let t: Enemy | null = null;
    let min = Infinity;
    this.enemies.forEach((e) => {
      if (e.markedForDeletion) return;
      const d = dist2(e.x, e.y, source.x, source.y);
      if (d < min) {
        min = d;
        t = e;
      }
    });
    return t;
  }

  // ======= VFX / UI =======
  addToast(text: string, color = '#fff') {
    this.toasts.unshift({text, life: 110, color});
    if (this.toasts.length > 5) this.toasts.pop();
  }

  addVFX(type: VFX['type'], x: number, y: number, tx = 0, ty = 0, c = '#fff', val: any = 0) {
    if (type === 'TEXT') this.vfx.push({type, x, y, life: 22, color: c, val});
    else if (type === 'LASER') this.vfx.push({type, x, y, tx, ty, life: 18, color: c});
    else if (type === 'NOVA') this.vfx.push({type, x, y, tx, life: 20, color: c});
    else if (type === 'RING') this.vfx.push({type, x, y, tx, life: 26, color: c});
    else if (type === 'HIT') this.vfx.push({type, x, y, life: 14, color: c});
  }

  drawVFX() {
    this.ctx.save();
    this.vfx = this.vfx.filter((v) => v.life > 0);

    this.vfx.forEach((v) => {
      v.life--;

      if (v.type === 'TEXT') {
        this.ctx.fillStyle = v.color || '#fff';
        this.ctx.font = '12px bold ui-sans-serif';
        this.ctx.fillText(String(v.val), v.x, v.y - (22 - v.life));
        return;
      }

      if (v.type === 'LASER') {
        this.ctx.strokeStyle = v.color || '#fff';
        this.ctx.lineWidth = Math.max(1, v.life / 3);
        this.ctx.beginPath();
        this.ctx.moveTo(v.x, v.y);
        this.ctx.lineTo(v.tx, v.ty);
        this.ctx.stroke();
        return;
      }

      if (v.type === 'NOVA') {
        this.ctx.strokeStyle = v.color || '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        const r = v.tx * (1 - v.life / 20);
        this.ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
        this.ctx.stroke();
        return;
      }

      if (v.type === 'RING') {
        this.ctx.strokeStyle = v.color || '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.globalAlpha = 0.65;
        const r = v.tx + (26 - v.life) * 2.1;
        this.ctx.beginPath();
        this.ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;
        return;
      }

      if (v.type === 'HIT') {
        this.ctx.globalAlpha = 0.7;
        this.ctx.fillStyle = v.color || '#fff';
        this.ctx.beginPath();
        this.ctx.arc(v.x, v.y, 6 + (14 - v.life) * 1.0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
        return;
      }
    });

    this.ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 轻网格
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#94a3b8';
    for (let x = 0; x < CANVAS_WIDTH; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    this.drops.forEach((d) => d.draw(ctx));
    this.otherEntities.forEach((t) => t.draw(ctx));
    this.enemies.forEach((e) => e.draw(ctx));
    this.projectiles.forEach((p) => p.draw(ctx));
    this.player.draw(ctx);

    this.drawVFX();

    if (this.toasts.length) {
      ctx.save();
      ctx.font = '12px ui-monospace';
      this.toasts.forEach((t, i) => {
        ctx.globalAlpha = clamp(t.life / 110, 0.2, 1);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, 14, CANVAS_HEIGHT - 18 - i * 16);
      });
      ctx.restore();
    }
  }
}

// =====================================================
// 10) Vue 逻辑 & UI（含状态倒计时）
// =====================================================
const canvasRef = ref<HTMLCanvasElement | null>(null);
let game: GameEngine | null = null;
let animId = 0;

const gameState = ref<'MENU' | 'DRAFT' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('MENU');

const hud = ref({
  hp: 120,
  maxHp: 120,
  xp: 0,
  nextXp: 120,
  lvl: 1,
  stage: 1,
  boss: false,
  bossHp: 0,
  bossMax: 1,
  score: 0,
  pendingDrafts: 0,
  kills: 0,
  killTarget: 100
});

const draftCards = ref<SkillDef[]>([]);
const rerolls = ref(3);

const keys = {w: false, a: false, s: false, d: false};

const handleKey = (e: KeyboardEvent, isDown: boolean) => {
  if (!props.show) return;

  const k = e.key.toLowerCase();
  if (k in keys) {
    e.preventDefault();
    keys[k as keyof typeof keys] = isDown;
  }

  if (isDown && e.key === 'Escape') {
    e.preventDefault();
    handleEsc();
  }
};

const handleEsc = () => {
  if (gameState.value === 'PLAYING') gameState.value = 'PAUSED';
  else if (gameState.value === 'PAUSED') gameState.value = 'MENU';
  else if (gameState.value === 'MENU') emit('close');
};

const bossBarWidth = computed(() => {
  const w = hud.value.bossMax <= 0 ? 0 : (hud.value.bossHp / hud.value.bossMax) * 100;
  return clamp(w, 0, 100);
});

const statusBadges = computed(() => {
  if (!game) return [];
  const s = game.player.status;

  const mk = (key: PlayerStatus, label: string, color: string) => {
    const frames = s[key];
    if (!frames || frames <= 0) return null;
    return {key, label, seconds: (frames / FPS).toFixed(1), color};
  };

  return [
    mk('INVERT', 'INVERT', C.DEBUFF),
    mk('SLOW', 'SLOW', C.DEBUFF),
    mk('VULN', 'VULN', C.DEBUFF)
  ].filter(Boolean) as { key: string; label: string; seconds: string; color: string }[];
});

const loop = () => {
  if (!game) return;

  if (gameState.value === 'PLAYING') {
    let dx = 0, dy = 0;
    if (keys.w) dy -= 1;
    if (keys.s) dy += 1;
    if (keys.a) dx -= 1;
    if (keys.d) dx += 1;
    game.player.move(dx, dy);

    game.update();

    //   经验升级 -> 触发升级卡（可能多次）
    game.tryConsumeXpLevelUps();

    //   若有待选择升级，自动进入DRAFT（不会漏）
    if (game.pendingDrafts > 0) triggerDraft();

    const boss = game.enemies.find((e) => e.type === 'BOSS');
    hud.value = {
      hp: Math.floor(game.player.hp),
      maxHp: game.player.maxHp,
      xp: Math.floor(game.player.xp),
      nextXp: game.player.nextLevelXp,
      lvl: game.player.level,
      stage: game.stage,
      boss: !!boss,
      bossHp: boss ? boss.hp : 0,
      bossMax: boss ? boss.maxHp : 1,
      score: game.score,
      pendingDrafts: game.pendingDrafts,
      kills: game.killedInStage,
      killTarget: game.stageTarget
    };

    if (game.isGameOver || game.isVictory) gameState.value = 'GAMEOVER';
  }

  game.draw(game.ctx);
  animId = requestAnimationFrame(loop);
};

const startGame = (mode: GameMode) => {
  if (!canvasRef.value) return;
  game = new GameEngine(canvasRef.value, mode);
  gameState.value = 'DRAFT';
  rerolls.value = 3;
  generateDraft();
  loop();
};

const triggerDraft = () => {
  if (!game) return;
  generateDraft();
  gameState.value = 'DRAFT';
};

const generateDraft = () => {
  const pool = [...SKILLS].sort(() => 0.5 - Math.random());
  draftCards.value = pool.slice(0, 3);
};

const selectSkill = (def: SkillDef) => {
  if (!game) return;

  const existing = game.player.skills.find((s) => s.name === def.name);
  if (existing) existing.upgrade();
  else game.player.skills.push(def.factory());

  game.pendingDrafts = Math.max(0, game.pendingDrafts - 1);

  if (game.pendingDrafts > 0) {
    generateDraft();
    gameState.value = 'DRAFT';
  } else {
    gameState.value = 'PLAYING';
  }
};

const reroll = () => {
  if (rerolls.value > 0) {
    rerolls.value--;
    generateDraft();
  }
};

const closeGame = () => {
  cancelAnimationFrame(animId);
  game = null;
  emit('close');
};

const handleKeyDown = (e: KeyboardEvent) => handleKey(e, true);
const handleKeyUp = (e: KeyboardEvent) => handleKey(e, false);

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  cancelAnimationFrame(animId);
});
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm">
    <div
        class="relative w-[1000px] h-[600px] bg-slate-950 rounded-2xl overflow-hidden border-4 border-slate-800 shadow-2xl">
      <canvas ref="canvasRef" width="1000" height="600" class="block"></canvas>

      <!-- HUD -->
      <div v-if="gameState === 'PLAYING' || gameState === 'PAUSED'" class="absolute inset-0 pointer-events-none p-4">
        <!-- Boss Bar -->
        <div v-if="hud.boss" class="absolute top-16 left-1/2 -translate-x-1/2 w-1/2">
          <div class="text-red-400 font-black text-center text-xl mb-1 animate-pulse">☠️ BOSS ☠️</div>
          <div class="h-6 w-full bg-slate-900 border-2 border-red-600 rounded-full overflow-hidden">
            <div class="h-full bg-red-600 transition-all" :style="{ width: bossBarWidth + '%' }"></div>
          </div>
        </div>

        <div class="flex gap-4">
          <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-700 w-72">
            <div class="flex justify-between text-xs text-slate-400 mb-1">
              <span>生命</span>
              <span>{{ hud.hp }}/{{ hud.maxHp }}</span>
            </div>
            <div class="h-3 bg-slate-800 rounded-full overflow-hidden mb-2">
              <div class="h-full bg-green-500 transition-all" :style="{ width: (hud.hp/hud.maxHp*100)+'%' }"></div>
            </div>

            <div class="flex justify-between text-xs text-slate-400 mb-1">
              <span>经验 (Lv.{{ hud.lvl }})</span>
              <span>{{ hud.xp }}/{{ hud.nextXp }}</span>
            </div>
            <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full bg-yellow-400 transition-all" :style="{ width: (hud.xp/hud.nextXp*100)+'%' }"></div>
            </div>

            <div class="mt-2 text-xs text-slate-500 font-mono flex justify-between">
              <span>分数</span>
              <span class="text-slate-200">{{ hud.score }}</span>
            </div>

            <div class="mt-1 text-xs text-slate-500 font-mono flex justify-between">
              <span>击杀</span>
              <span class="text-slate-200">{{ hud.kills }}/{{ hud.killTarget }}</span>
            </div>

            <div class="mt-1 text-xs text-slate-500 font-mono flex justify-between">
              <span>可升级</span>
              <span class="text-yellow-300">x{{ hud.pendingDrafts }}</span>
            </div>

            <div v-if="statusBadges.length" class="mt-2 flex flex-wrap gap-1">
              <div
                  v-for="b in statusBadges"
                  :key="b.key"
                  class="px-2 py-0.5 rounded-full text-[10px] font-mono border"
                  :style="{ color: b.color, borderColor: b.color }"
              >
                {{ b.label }} {{ b.seconds }}s
              </div>
            </div>
          </div>
        </div>

        <div class="absolute top-4 right-4 text-right">
          <div class="text-3xl font-black text-slate-200">STAGE {{ hud.stage }}</div>
          <div class="text-slate-500 text-sm font-mono">击杀达标召唤BOSS：{{ hud.killTarget }}</div>
        </div>
      </div>

      <!-- MENU -->
      <div v-if="gameState === 'MENU'"
           class="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center z-50">
        <h1 class="text-6xl font-black text-white mb-8 tracking-tighter">
          虚空幸存者 <span class="text-blue-500 text-2xl">v5.0</span>
        </h1>

        <div class="grid grid-cols-2 gap-4 w-[640px]">
          <button
              v-for="(m, k) in MODES"
              :key="k"
              @click="startGame(k as any)"
              class="p-6 border-2 border-slate-700 bg-slate-900 hover:border-blue-500 hover:bg-slate-800 rounded-xl transition-all group text-left"
          >
            <div class="text-xl font-bold text-white group-hover:text-blue-400 mb-1">{{ m.label }}</div>
            <div class="text-xs text-slate-500">
              敌血 x{{ m.enemyHpMult }} | 敌伤 x{{ m.enemyDmgMult }} | 掉落经验 x{{ m.xpRate }} | 升级门槛
              x{{ m.xpNeedMult }}
              <span v-if="(k as any) === 'ARCADE'" class="text-yellow-400"> | 物品雨(含debuff)</span>
            </div>
          </button>
        </div>

        <div class="mt-6 text-slate-500 text-xs font-mono">WASD移动 / ESC暂停或退出</div>
      </div>

      <!-- DRAFT -->
      <div v-if="gameState === 'DRAFT'"
           class="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-50">
        <h2 class="text-4xl font-black text-yellow-400 mb-2 animate-bounce">升级选择</h2>
        <div class="text-sm text-slate-400 font-mono mb-8">
          还可升级：x{{ game?.pendingDrafts || 0 }}
        </div>

        <div class="flex gap-6 mb-8">
          <div
              v-for="s in draftCards"
              :key="s.key"
              @click="selectSkill(s)"
              class="w-56 h-72 bg-slate-900 border-2 border-slate-700 hover:border-yellow-400 hover:-translate-y-2 cursor-pointer rounded-xl p-6 flex flex-col items-center justify-between transition-all group"
          >
            <component :is="s.icon" :size="64" weight="duotone"
                       class="text-blue-500 group-hover:text-yellow-400 transition-colors"/>

            <div class="text-center">
              <div class="font-bold text-lg text-white mb-2">{{ s.name }}</div>
              <div class="text-xs text-slate-400 bg-slate-800 p-2 rounded">
                {{
                  (() => {
                    const ex = game?.player.skills.find(sk => sk.name === s.name);
                    if (!ex) return s.desc;
                    const nextLv = ex.level + 1;
                    const tmp = s.factory();
                    return `升级收益：${tmp.getUpgradeDesc(nextLv)}`;
                  })()
                }}
              </div>
            </div>

            <div class="text-xs font-mono text-slate-600">
              {{
                game?.player.skills.find(sk => sk.name === s.name)
                    ? `当前等级: ${game?.player.skills.find(sk => sk.name === s.name)?.level}`
                    : '新技能'
              }}
            </div>
          </div>
        </div>

        <button @click="reroll" :disabled="rerolls<=0"
                class="px-6 py-2 bg-slate-800 text-white rounded-full hover:bg-slate-700 disabled:opacity-50">
          刷新列表 (剩余: {{ rerolls }})
        </button>
      </div>

      <!-- PAUSED -->
      <div v-if="gameState === 'PAUSED'"
           class="absolute inset-0 bg-black/60 backdrop-blur flex flex-col items-center justify-center z-50">
        <PhPause :size="64" class="text-white mb-4"/>
        <div class="text-2xl font-bold text-white mb-8">已暂停</div>
        <div class="text-slate-400 text-sm">按 ESC 返回菜单</div>
      </div>

      <!-- GAMEOVER -->
      <div v-if="gameState === 'GAMEOVER'"
           class="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
        <component :is="game?.isVictory ? PhCrown : PhSkull" :size="80"
                   :class="game?.isVictory?'text-yellow-400':'text-red-500'" class="mb-4"/>
        <h2 class="text-5xl font-black text-white mb-4">{{ game?.isVictory ? '通关胜利!' : '你牺牲了' }}</h2>
        <div class="text-xl text-slate-400 mb-2 font-mono">最终关卡: STAGE {{ game?.stage }}</div>
        <div class="text-slate-500 text-sm font-mono mb-8">SCORE: {{ game?.score }}</div>

        <div class="flex gap-3">
          <button @click="gameState='MENU'"
                  class="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition">
            返回主菜单
          </button>
          <button @click="closeGame"
                  class="px-8 py-3 bg-red-500/20 text-white font-bold rounded-full hover:bg-red-500/30 transition">
            关闭
          </button>
        </div>
      </div>

      <!-- Close Button -->
      <button @click="closeGame"
              class="absolute top-4 right-4 z-[100] p-2 bg-red-500/20 hover:bg-red-500 rounded-full text-white transition">
        <PhX size="20"/>
      </button>
    </div>
  </div>
</template>

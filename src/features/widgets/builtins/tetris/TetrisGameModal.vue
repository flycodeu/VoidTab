<script setup lang="ts">
import {ref, onUnmounted, nextTick, watch, onMounted} from 'vue';
import {
  PhX, PhTrophy, PhLightning, PhSkull, PhArrowUUpLeft,
  PhPause, PhStack, PhTarget
} from '@phosphor-icons/vue';

// === Props & Emits ===
const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

// ==========================================
// 1. 系统配置
// ==========================================
const CELL_SIZE = 24;
const GRID_W = 10; // 240px
const GRID_H = 20; // 480px

// --- 游戏模式 ---
const MODES = {
  EASY: {
    id: 'EASY', label: '简单', speed: 700, color: '#10b981', tailwind: 'emerald',
    desc: '下落缓慢，轻松堆叠'
  },
  NORMAL: {
    id: 'NORMAL', label: '普通', speed: 500, color: '#06b6d4', tailwind: 'cyan',
    desc: '经典速度，考验布局'
  },
  HARD: {
    id: 'HARD', label: '困难', speed: 300, color: '#ef4444', tailwind: 'red',
    desc: '极速下落，手速极限'
  }
};
type ModeKey = keyof typeof MODES;

// --- 方块定义 (Tetromino) ---
// 每个形状用 4x4 旋转状态的坐标点表示
interface PieceDef {
  color: string;
  // 各旋转状态下相对坐标 [x, y]
  rotations: number[][][];
}

const PIECES: Record<string, PieceDef> = {
  I: {
    color: '#06b6d4',
    rotations: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]]
    ]
  },
  O: {
    color: '#f59e0b',
    rotations: [
      [[1, 0], [2, 0], [1, 1], [2, 1]]
    ]
  },
  T: {
    color: '#d946ef',
    rotations: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]]
    ]
  },
  S: {
    color: '#10b981',
    rotations: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]]
    ]
  },
  Z: {
    color: '#ef4444',
    rotations: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]]
    ]
  },
  J: {
    color: '#3b82f6',
    rotations: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]]
    ]
  },
  L: {
    color: '#f97316',
    rotations: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]]
    ]
  }
};
type PieceKey = keyof typeof PIECES;
const PIECE_KEYS = Object.keys(PIECES) as PieceKey[];

const COLORS = {
  BG: '#000000',
  GRID: '#1f1f22',
};

interface ActivePiece {
  key: PieceKey;
  rotation: number;
  x: number;
  y: number;
}

// ==========================================
// 2. Game Core Engine
// ==========================================
class TetrisGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  nextCanvas: HTMLCanvasElement | null = null;

  // 棋盘：每格存颜色字符串或 null
  board: (string | null)[][] = [];
  current: ActivePiece | null = null;
  nextKey: PieceKey = 'I';

  score: number = 0;
  lines: number = 0;
  level: number = 1;
  highScore: number = parseInt(localStorage.getItem('tetris_highscore') || '0');
  state: 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' = 'MENU';

  currentMode: ModeKey = 'NORMAL';
  baseSpeed: number = 500;

  timer: number = 0;
  lastTime: number = 0;
  animationFrameId: number = 0;
  isRunning = false;

  constructor(canvas: HTMLCanvasElement, nextCanvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.nextCanvas = nextCanvas;
    this.reset();
    this.state = 'MENU';
    this.draw();
  }

  reset() {
    this.board = Array.from({length: GRID_H}, () => Array(GRID_W).fill(null));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.timer = 0;
    this.baseSpeed = MODES[this.currentMode].speed;
    this.nextKey = this.randomPiece();
    this.spawnPiece();
  }

  randomPiece(): PieceKey {
    return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
  }

  spawnPiece() {
    const key = this.nextKey;
    this.nextKey = this.randomPiece();
    this.current = {
      key,
      rotation: 0,
      x: Math.floor(GRID_W / 2) - 2,
      y: -1
    };
    // 若新块立即碰撞 -> 游戏结束
    if (this.collides(this.current)) {
      this.gameOver();
    }
  }

  cells(piece: ActivePiece): number[][] {
    const def = PIECES[piece.key];
    const rot = def.rotations[piece.rotation % def.rotations.length];
    return rot.map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
  }

  collides(piece: ActivePiece): boolean {
    for (const [x, y] of this.cells(piece)) {
      if (x < 0 || x >= GRID_W || y >= GRID_H) return true;
      if (y >= 0 && this.board[y][x]) return true;
    }
    return false;
  }

  move(dx: number, dy: number): boolean {
    if (!this.current) return false;
    const next = {...this.current, x: this.current.x + dx, y: this.current.y + dy};
    if (!this.collides(next)) {
      this.current = next;
      return true;
    }
    return false;
  }

  rotate() {
    if (!this.current) return;
    const def = PIECES[this.current.key];
    const nextRot = (this.current.rotation + 1) % def.rotations.length;
    // 墙踢：尝试不偏移、左、右、再远
    for (const kick of [0, -1, 1, -2, 2]) {
      const next = {...this.current, rotation: nextRot, x: this.current.x + kick};
      if (!this.collides(next)) {
        this.current = next;
        return;
      }
    }
  }

  hardDrop() {
    if (!this.current) return;
    while (this.move(0, 1)) { /* 持续下落 */
    }
    this.lock();
  }

  softDropTick() {
    if (!this.move(0, 1)) {
      this.lock();
    }
  }

  lock() {
    if (!this.current) return;
    for (const [x, y] of this.cells(this.current)) {
      if (y >= 0 && y < GRID_H && x >= 0 && x < GRID_W) {
        this.board[y][x] = PIECES[this.current.key].color;
      }
    }
    this.clearLines();
    this.spawnPiece();
  }

  clearLines() {
    let cleared = 0;
    for (let y = GRID_H - 1; y >= 0; y--) {
      if (this.board[y].every(c => c !== null)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(GRID_W).fill(null));
        cleared++;
        y++; // 重新检查同一行
      }
    }
    if (cleared > 0) {
      // 标准消行得分
      const lineScores = [0, 100, 300, 500, 800];
      this.score += lineScores[cleared] * this.level;
      this.lines += cleared;
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
        this.baseSpeed = Math.max(80, MODES[this.currentMode].speed - (this.level - 1) * 40);
      }
    }
  }

  update(deltaTime: number) {
    if (this.state !== 'PLAYING') return;
    this.timer += deltaTime;
    if (this.timer >= this.baseSpeed) {
      this.timer = 0;
      this.softDropTick();
    }
  }

  drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = CELL_SIZE) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    ctx.shadowBlur = 0;
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Grid
    ctx.strokeStyle = COLORS.GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= GRID_W; x++) ctx.moveTo(x * CELL_SIZE, 0), ctx.lineTo(x * CELL_SIZE, GRID_H * CELL_SIZE);
    for (let y = 0; y <= GRID_H; y++) ctx.moveTo(0, y * CELL_SIZE), ctx.lineTo(GRID_W * CELL_SIZE, y * CELL_SIZE);
    ctx.stroke();

    // Board
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const c = this.board[y][x];
        if (c) this.drawCell(ctx, x, y, c);
      }
    }

    // Ghost piece (落点预览)
    if (this.current && this.state === 'PLAYING') {
      const ghost = {...this.current};
      while (!this.collides({...ghost, y: ghost.y + 1})) ghost.y++;
      const color = PIECES[this.current.key].color;
      for (const [x, y] of this.cells(ghost)) {
        if (y >= 0) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 2;
          ctx.strokeRect(x * CELL_SIZE + 2, y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Current piece
    if (this.current) {
      const color = PIECES[this.current.key].color;
      for (const [x, y] of this.cells(this.current)) {
        if (y >= 0) this.drawCell(ctx, x, y, color);
      }
    }

    this.drawNext();
  }

  drawNext() {
    if (!this.nextCanvas) return;
    const nctx = this.nextCanvas.getContext('2d')!;
    nctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    const def = PIECES[this.nextKey];
    const cells = def.rotations[0];
    const size = 20;
    // 居中
    const xs = cells.map(c => c[0]);
    const ys = cells.map(c => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const offX = (this.nextCanvas.width - (maxX - minX + 1) * size) / 2 - minX * size;
    const offY = (this.nextCanvas.height - (maxY - minY + 1) * size) / 2 - minY * size;
    for (const [x, y] of cells) {
      nctx.fillStyle = def.color;
      nctx.shadowBlur = 6;
      nctx.shadowColor = def.color;
      nctx.fillRect(offX + x * size + 1, offY + y * size + 1, size - 2, size - 2);
      nctx.shadowBlur = 0;
      nctx.fillStyle = 'rgba(255,255,255,0.25)';
      nctx.fillRect(offX + x * size + 2, offY + y * size + 2, size - 4, 2);
    }
  }

  handleInput(key: string) {
    if (this.state !== 'PLAYING') return;
    if (['ArrowLeft', 'a', 'A'].includes(key)) this.move(-1, 0);
    else if (['ArrowRight', 'd', 'D'].includes(key)) this.move(1, 0);
    else if (['ArrowDown', 's', 'S'].includes(key)) {
      if (this.move(0, 1)) {
        this.score += 1;
        this.timer = 0;
      } else {
        this.lock();
      }
    } else if (['ArrowUp', 'w', 'W'].includes(key)) this.rotate();
  }

  loop = (timestamp: number) => {
    if (!this.isRunning) return;
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;
    if (this.state === 'PLAYING') this.update(deltaTime);
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  start(mode: ModeKey) {
    this.currentMode = mode;
    this.reset();
    this.state = 'PLAYING';
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.lastTime = performance.now();
    }
  }

  backToMenu() {
    this.state = 'MENU';
    this.draw();
  }

  gameOver() {
    this.state = 'GAMEOVER';
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('tetris_highscore', this.score.toString());
    }
  }

  stop() {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);
  }
}

// ==========================================
// 3. Vue Integration
// ==========================================
const canvasRef = ref<HTMLCanvasElement | null>(null);
const nextCanvasRef = ref<HTMLCanvasElement | null>(null);
let game: TetrisGame | null = null;

const currentScore = ref(0);
const currentLines = ref(0);
const currentLevel = ref(1);
const currentHighScore = ref(0);
const currentState = ref('MENU');
const lastMode = ref<ModeKey>('NORMAL');
const currentModeKey = ref<ModeKey>('NORMAL');

const syncState = () => {
  if (game) {
    currentScore.value = game.score;
    currentLines.value = game.lines;
    currentLevel.value = game.level;
    currentHighScore.value = game.highScore;
    currentState.value = game.state;
    currentModeKey.value = game.currentMode;
    requestAnimationFrame(syncState);
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.show) return;

  // ESC: 游戏中 -> 暂停 -> 菜单 -> 关闭
  if (e.key === 'Escape') {
    e.preventDefault();
    if (!game) return;
    if (game.state === 'PLAYING') game.togglePause();
    else if (game.state === 'PAUSED') game.backToMenu();
    else emit('close');
    return;
  }

  // 空格: 游戏中硬降，菜单/结束开始
  if (e.key === ' ') {
    e.preventDefault();
    if (!game) return;
    if (game.state === 'PLAYING') game.hardDrop();
    else if (game.state === 'PAUSED') game.togglePause();
    else handleStartGame(lastMode.value);
    return;
  }

  // P: 暂停
  if ((e.key === 'p' || e.key === 'P') && game?.state !== 'MENU' && game?.state !== 'GAMEOVER') {
    e.preventDefault();
    game?.togglePause();
    return;
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();

  if (!game) return;
  if (game.state === 'PLAYING') {
    game.handleInput(e.key);
  } else if (e.key === 'Enter') {
    if (game.state === 'MENU' || game.state === 'GAMEOVER') handleStartGame(lastMode.value);
  }
};

const handleStartGame = (mode: ModeKey) => {
  if (game) {
    lastMode.value = mode;
    game.start(mode);
    currentState.value = game.state;
  }
};

const handleBackToMenu = () => game?.backToMenu();
const handleResume = () => game?.togglePause();

const initGame = async () => {
  await nextTick();
  if (canvasRef.value) {
    if (game) game.stop();
    game = new TetrisGame(canvasRef.value, nextCanvasRef.value);
    syncState();
    window.addEventListener('keydown', handleKeyDown);
  }
};

watch(() => props.show, (val) => {
  if (val) initGame();
  else {
    game?.stop();
    game = null;
    window.removeEventListener('keydown', handleKeyDown);
  }
});

onMounted(() => {
  if (props.show) initGame();
});
onUnmounted(() => {
  game?.stop();
  window.removeEventListener('keydown', handleKeyDown);
});

const canvasWidth = GRID_W * CELL_SIZE;
const canvasHeight = GRID_H * CELL_SIZE;
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
       @click="emit('close')">

    <div class="flex gap-6 items-start" @click.stop>

      <!-- 左侧信息面板 -->
      <div
          class="w-64 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-left duration-500 h-[520px]">

        <div class="flex items-center justify-between border-b border-zinc-700 pb-2 mb-1">
          <div class="text-xs font-bold uppercase tracking-widest text-zinc-400">游戏信息</div>
          <PhStack class="text-cyan-500"/>
        </div>

        <!-- 下一个方块 -->
        <div class="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
          <div class="text-xs text-zinc-500 mb-2 uppercase tracking-wider">下一个</div>
          <div class="flex justify-center">
            <canvas ref="nextCanvasRef" width="100" height="80" class="block"></canvas>
          </div>
        </div>

        <!-- 数据 -->
        <div class="grid grid-cols-3 gap-2">
          <div class="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50 text-center">
            <div class="text-[10px] text-zinc-500 uppercase">消行</div>
            <div class="text-lg font-bold font-mono text-cyan-400">{{ currentLines }}</div>
          </div>
          <div class="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50 text-center">
            <div class="text-[10px] text-zinc-500 uppercase">等级</div>
            <div class="text-lg font-bold font-mono text-fuchsia-400">{{ currentLevel }}</div>
          </div>
          <div class="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50 text-center">
            <div class="text-[10px] text-zinc-500 uppercase">模式</div>
            <div class="text-lg font-bold font-mono" :class="`text-${MODES[currentModeKey].tailwind}-400`">
              {{ MODES[currentModeKey].label }}
            </div>
          </div>
        </div>

        <div class="flex-1 flex flex-col justify-center items-center text-zinc-600 gap-2 opacity-50">
          <PhTarget size="48" weight="duotone"/>
          <div class="text-xs text-center">填满整行即可消除<br>别让方块堆到顶部</div>
        </div>
      </div>

      <!-- 右侧游戏区 -->
      <div class="relative bg-zinc-900 p-4 rounded-2xl shadow-2xl border border-zinc-700">

        <div class="relative rounded-lg overflow-hidden border-8 border-black bg-black shadow-inner"
             :style="{ width: canvasWidth + 16 + 'px', height: canvasHeight + 16 + 'px' }">

          <canvas ref="canvasRef" :width="canvasWidth" :height="canvasHeight" class="block"></canvas>

          <!-- MENU -->
          <div v-if="currentState === 'MENU'"
               class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-10">
            <h1 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 mb-2 tracking-tighter title-font text-center">
              俄罗斯方块</h1>
            <div class="flex items-center gap-2 text-yellow-400 font-mono text-base mb-8">
              <PhTrophy weight="fill"/>
              <span>最高分: {{ currentHighScore }}</span>
            </div>
            <div class="flex flex-col gap-3 w-44">
              <button v-for="mode in MODES" :key="mode.id" @click.stop="handleStartGame(mode.id as ModeKey)"
                      class="group relative px-5 py-3 font-bold rounded-xl transition-all active:scale-95 border-b-4 active:border-b-0 active:translate-y-1 bg-zinc-800 border-zinc-950 text-zinc-400 hover:text-white"
                      :class="[
                  mode.id === 'EASY' ? 'hover:bg-emerald-600 hover:border-emerald-800' : '',
                  mode.id === 'NORMAL' ? 'hover:bg-cyan-600 hover:border-cyan-800' : '',
                  mode.id === 'HARD' ? 'hover:bg-red-600 hover:border-red-800' : ''
                ]">
                <span class="text-sm">{{ mode.label }}</span>
              </button>
            </div>
          </div>

          <!-- GAME OVER -->
          <div v-if="currentState === 'GAMEOVER'"
               class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
            <PhSkull size="64" class="text-zinc-600 mb-4" weight="duotone"/>
            <h2 class="text-4xl font-bold text-white mb-2 font-mono">GAME OVER</h2>
            <div class="text-zinc-400 font-mono text-lg mb-8 flex items-center gap-2">
              得分: <span :class="`text-${MODES[lastMode].tailwind}-400`" class="font-bold text-2xl">{{
                currentScore
              }}</span>
            </div>
            <div class="flex gap-3">
              <button @click.stop="handleBackToMenu"
                      class="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-lg transition-colors flex items-center gap-2">
                <PhArrowUUpLeft weight="bold"/>
                菜单
              </button>
              <button @click.stop="handleStartGame(lastMode)"
                      class="px-6 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2">
                <PhLightning weight="fill" class="text-yellow-600"/>
                重来
              </button>
            </div>
          </div>

          <!-- PAUSED -->
          <div v-if="currentState === 'PAUSED'"
               class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] z-10">
            <PhPause size="64" class="text-white mb-4 animate-pulse" weight="duotone"/>
            <h2 class="text-3xl font-bold text-white mb-8 tracking-widest uppercase">已暂停</h2>
            <div class="flex gap-3">
              <button @click.stop="handleBackToMenu"
                      class="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-lg transition-colors border border-zinc-600">
                退出游戏
              </button>
              <button @click.stop="handleResume"
                      class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-colors shadow-lg">
                继续
              </button>
            </div>
          </div>

          <!-- HUD -->
          <div v-if="currentState === 'PLAYING' || currentState === 'PAUSED'"
               class="absolute top-3 left-3 right-3 flex justify-between font-mono text-lg font-bold pointer-events-none select-none">
            <div class="flex items-center gap-2" :class="`text-${MODES[lastMode].tailwind}-500`">
              <div class="w-2 h-2 rounded-full animate-pulse bg-current"></div>
              {{ currentScore }}
            </div>
          </div>
        </div>

        <div class="flex justify-between items-center px-2 mt-2 text-zinc-500 font-mono text-xs select-none">
          <div class="flex gap-3">
            <span>[←→] 移动</span>
            <span>[↑] 旋转</span>
            <span>[空格] 速降</span>
            <span v-if="currentState === 'PLAYING' || currentState === 'PAUSED'"
                  class="text-yellow-600 font-bold">[ESC] 菜单</span>
            <span v-else class="text-red-600 font-bold hover:text-red-500 cursor-pointer"
                  @click="emit('close')">[ESC] 关闭</span>
          </div>
          <div>VOIDTAB ARCADE</div>
        </div>

        <button @click="emit('close')"
                class="absolute -top-3 -right-3 p-1.5 bg-zinc-800 hover:bg-red-600 border border-zinc-600 hover:border-red-500 rounded-full text-zinc-400 hover:text-white shadow-xl transition-all z-50">
          <PhX size="16" weight="bold"/>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-font {
  font-family: 'Arial Black', Impact, sans-serif;
  text-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);
}
</style>

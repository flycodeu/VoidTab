<script setup lang="ts">
import {computed, ref, onBeforeUnmount} from 'vue';
import {Solar, SolarUtil, HolidayUtil} from 'lunar-typescript';
import {PhX, PhCaretLeft, PhCaretRight, PhArrowsOut, PhArrowsIn} from '@phosphor-icons/vue';

defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

const selectedDate = ref(new Date());
const panelDate = ref(new Date());

const transitionName = ref('slide-up');
const lastWheelTime = ref(0);
const weeks = ['一', '二', '三', '四', '五', '六', '日'];

// ===== 全屏（可选）=====
const modalRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);

const toggleFullscreen = async () => {
  const el = modalRef.value;
  if (!el) return;

  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      isFullscreen.value = true;
    } else {
      await document.exitFullscreen?.();
      isFullscreen.value = false;
    }
  } catch (_) {
    // ignore
  }
};

const onFsChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};

document.addEventListener?.('fullscreenchange', onFsChange);
onBeforeUnmount(() => document.removeEventListener?.('fullscreenchange', onFsChange));

// ===== 辅助函数 =====
const getDayOfYear = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const getWeekOfYear = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

// 星座（防止库方法不存在，手算更稳）
const getConstellation = (month: number, day: number) => {
  // month: 1-12
  const z = [
    ['摩羯座', 1, 20],
    ['水瓶座', 2, 19],
    ['双鱼座', 3, 21],
    ['白羊座', 4, 20],
    ['金牛座', 5, 21],
    ['双子座', 6, 22],
    ['巨蟹座', 7, 23],
    ['狮子座', 8, 23],
    ['处女座', 9, 23],
    ['天秤座', 10, 24],
    ['天蝎座', 11, 23],
    ['射手座', 12, 22],
    ['摩羯座', 12, 32], // 兜底
  ] as const;

  // 规则：如果 day < 当前星座起始日，则属于上一个星座
  const idx = month - 1;
  const [name, startDay] = z[idx];
  if (day < startDay) return z[idx - 1 < 0 ? 11 : idx - 1][0];
  return name;
};

// ===== 日历格子数据 =====
const calendarDays = computed(() => {
  const year = panelDate.value.getFullYear();
  const month = panelDate.value.getMonth() + 1;

  const firstDay = Solar.fromYmd(year, month, 1);
  const week = firstDay.getWeek();
  const preDays = week === 0 ? 6 : week - 1;

  const daysArr: any[] = [];
  const daysInPreMonth = SolarUtil.getDaysOfMonth(
      month === 1 ? year - 1 : year,
      month === 1 ? 12 : month - 1
  );

  for (let i = 0; i < preDays; i++) {
    const d = daysInPreMonth - preDays + i + 1;
    daysArr.push({
      day: d,
      type: 'prev',
      date: new Date(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2, d),
    });
  }

  const daysInMonth = SolarUtil.getDaysOfMonth(year, month);
  for (let i = 1; i <= daysInMonth; i++) {
    daysArr.push({day: i, type: 'current', date: new Date(year, month - 1, i)});
  }

  const remaining = 42 - daysArr.length;
  for (let i = 1; i <= remaining; i++) {
    daysArr.push({
      day: i,
      type: 'next',
      date: new Date(month === 12 ? year + 1 : year, month === 12 ? 0 : month, i),
    });
  }

  const todayYmd = Solar.fromDate(new Date()).toYmd();
  const selectedYmd = Solar.fromDate(selectedDate.value).toYmd();

  return daysArr.map((item) => {
    const solar = Solar.fromDate(item.date);
    const lunar = solar.getLunar();

    const holiday = HolidayUtil.getHoliday(
        item.date.getFullYear(),
        item.date.getMonth() + 1,
        item.date.getDate()
    );

    let isRest = false;
    let isWork = false;
    if (holiday) {
      isWork = holiday.isWork();
      isRest = !isWork;
    }

    // subText 优先级：节气 > 数九 > 农历节日 > 公历节日 > 初一显示月 > 否则农历日
    let subText = '';
    let isFestival = false;

    const jieQi = lunar.getJieQi?.();
    const shuJiu = lunar.getShuJiu?.(); // "二九" 这种
    const lunarFestivals = lunar.getFestivals?.() || [];
    const solarFestivals = solar.getFestivals?.() || [];

    if (jieQi) {
      subText = jieQi;
      isFestival = true;
    } else if (shuJiu) {
      subText = shuJiu.getName?.() || '数九';
      isFestival = true;
    } else if (lunarFestivals.length > 0) {
      subText = lunarFestivals[0];
      isFestival = true;
    } else if (solarFestivals.length > 0) {
      subText = solarFestivals[0];
      isFestival = true;
    } else {
      subText = item.day === 1 ? lunar.getMonthInChinese() + '月' : lunar.getDayInChinese();
    }

    return {
      ...item,
      solar,
      lunar,
      subText,
      isRest,
      isWork,
      isFestival,
      isToday: solar.toYmd() === todayYmd,
      isSelected: solar.toYmd() === selectedYmd,
    };
  });
});

// ===== 右侧详情（列表信息）=====
const detail = computed(() => {
  const solar = Solar.fromDate(selectedDate.value);
  const lunar = solar.getLunar();
  const jsDate = selectedDate.value;

  const y = solar.getYear();
  const m = solar.getMonth();
  const d = solar.getDay();

  // 节日展示：节气/数九/节日/假日名称
  const jieQi = lunar.getJieQi?.();
  const shuJiu = lunar.getShuJiu?.();
  const lunarFestivals = lunar.getFestivals?.() || [];
  const solarFestivals = solar.getFestivals?.() || [];

  const holiday = HolidayUtil.getHoliday(y, m, d);
  const holidayName = holiday?.getName?.();

  const festival =
      jieQi ||
      (shuJiu ? (shuJiu.getName?.() || '数九') : '') ||
      lunarFestivals[0] ||
      solarFestivals[0] ||
      holidayName ||
      '';

  const shengXiao = lunar.getYearShengXiao?.() || '';
  const xingZuo = getConstellation(m, d);

  return {
    year: y,
    month: m,
    day: d,
    week: solar.getWeekInChinese(),
    ymd: solar.toYmd(),
    lunarTop: `${lunar.getYearInChinese?.() || ''}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    lunarYear: `${lunar.getYearInGanZhi()}(${shengXiao})年`,
    shengXiao,
    xingZuo,
    festival,
    weekOfYear: getWeekOfYear(jsDate),
    dayOfYear: getDayOfYear(jsDate),
    yi: lunar.getDayYi?.() || [],
    ji: lunar.getDayJi?.() || [],
    xiang: lunar.getYueXiang?.() || '',
    wuhou: lunar.getWuHou?.() || '',
    // 更像图1：右侧中间还会显示一些方位信息（可选）
    // 如果你不需要可以删掉下面这几个
    caiShen: lunar.getDayPositionCai?.() || '',
    fuShen: lunar.getDayPositionFu?.() || '',
    xiShen: lunar.getDayPositionXi?.() || '',
    yangGui: lunar.getDayPositionYangGui?.() || '',
    yinGui: lunar.getDayPositionYinGui?.() || '',
  };
});

// ===== 交互 =====
const changeMonth = (delta: number) => {
  transitionName.value = delta > 0 ? 'slide-up' : 'slide-down';
  const d = new Date(panelDate.value);
  d.setMonth(d.getMonth() + delta);
  panelDate.value = d;
};

const selectDay = (item: any) => {
  selectedDate.value = item.date;
  if (item.type === 'prev') changeMonth(-1);
  if (item.type === 'next') changeMonth(1);
};

const handleWheel = (e: WheelEvent) => {
  const now = Date.now();
  if (now - lastWheelTime.value < 250) return;
  if (e.deltaY === 0) return;

  lastWheelTime.value = now;
  changeMonth(e.deltaY > 0 ? 1 : -1);
};
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div class="cal-overlay absolute inset-0 cursor-default" @click="emit('close')"></div>

      <div
          ref="modalRef"
          class="cal-modal relative rounded-2xl flex overflow-hidden
         w-[92vw] h-[88vh]
         max-w-[1180px] max-h-[760px]
         min-w-[980px] min-h-[640px]"
          @wheel.prevent.stop="handleWheel"
      >

        <!-- 右上角按钮：全屏 + 关闭 -->
        <div class="absolute top-4 right-4 z-50 flex items-center gap-2">
          <button class="cal-roundbtn" @click="toggleFullscreen" title="全屏/退出全屏">
            <component :is="isFullscreen ? PhArrowsIn : PhArrowsOut" size="18"/>
          </button>
          <button class="cal-roundbtn" @click="emit('close')" title="关闭">
            <PhX size="18"/>
          </button>
        </div>

        <!-- 左侧：日历 -->
        <div class="cal-left flex-1 p-8 flex flex-col relative h-full">
          <div class="flex items-center gap-4 mb-6 relative z-10">
            <div class="cal-monthbar flex items-center rounded-lg p-1">
              <button class="cal-iconbtn p-1 rounded active:scale-95" @click="changeMonth(-1)">
                <PhCaretLeft/>
              </button>

              <span class="px-4 font-bold text-lg select-none w-36 text-center">
                {{ panelDate.getFullYear() }}年 {{ panelDate.getMonth() + 1 }}月
              </span>

              <button class="cal-iconbtn p-1 rounded active:scale-95" @click="changeMonth(1)">
                <PhCaretRight/>
              </button>
            </div>

            <button
                class="cal-todaybtn text-xs px-3 py-1.5 rounded-full transition"
                @click="panelDate = new Date(); selectedDate = new Date()"
            >
              回到今天
            </button>
          </div>

          <div class="grid grid-cols-7 mb-2 relative z-10">
            <div v-for="w in weeks" :key="w" class="text-center text-sm font-medium cal-week py-2">
              {{ w }}
            </div>
          </div>

          <div class="flex-1 relative overflow-hidden">
            <Transition :name="transitionName">
              <div :key="panelDate.toISOString()" class="grid grid-cols-7 gap-2 absolute inset-0 w-full h-full">
                <div
                    v-for="item in calendarDays"
                    :key="item.solar.toYmd()"
                    class="cal-day"
                    :class="{
                    'is-selected': item.isSelected,
                    'is-muted': item.type !== 'current',
                    'is-today': item.isToday
                  }"
                    @click="selectDay(item)"
                >
                  <div v-if="item.isToday" class="today-badge">今</div>
                  <div v-if="item.isToday" class="today-dot"></div>

                  <div class="cal-day-num text-lg font-bold">{{ item.day }}</div>

                  <div
                      class="cal-day-sub text-[10px]"
                      :class="{
                      'is-festival': item.isFestival || item.isRest,
                      'is-work': item.isWork
                    }"
                  >
                    {{ item.subText }}
                  </div>

                  <div v-if="item.isRest" class="cal-badge rest">休</div>
                  <div v-if="item.isWork" class="cal-badge work">班</div>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- 右侧：图1那种“信息列表” -->
        <div class="cal-right w-[320px] p-6 flex flex-col relative">
          <!-- 顶部日期 + 小方块 -->
          <div class="text-center pt-10 pb-4">
            <div class="text-sm cal-right-top mb-3">
              {{ detail.ymd }} {{ detail.week }}
            </div>

            <!--   小尺寸日期方块（不再巨大占满） -->
            <div class="mini-day-wrap">
              <div class="mini-day">
                <div class="mini-dot left"></div>
                <div class="mini-dot right"></div>
                <div class="mini-num">{{ detail.day }}</div>
              </div>
            </div>

            <div class="mt-3 cal-right-text font-medium">
              {{ detail.lunarTop }}
            </div>
            <div class="cal-right-sub mt-1">
              {{ detail.lunarYear }}
            </div>
            <div class="cal-right-sub mt-1">
              本年第{{ detail.weekOfYear }}周，第{{ detail.dayOfYear }}天
            </div>
          </div>

          <div class="divider"></div>

          <!-- 信息列表（和图1一致的“条目”结构） -->
          <div class="info-list">
            <div class="info-row">
              <div class="tag tag-red">生肖</div>
              <div class="info-val">{{ detail.shengXiao || '-' }}</div>
            </div>

            <div class="info-row">
              <div class="tag tag-pink">星座</div>
              <div class="info-val">
                {{ detail.xingZuo || '-' }}
                <span class="cap-pill" v-if="detail.xingZuo">♑</span>
              </div>
            </div>

            <div class="info-row">
              <div class="tag tag-blue">节日</div>
              <div class="info-val">{{ detail.festival || '-' }}</div>
            </div>

            <!--   宜：不省略，默认多行 + 可滚动 -->
            <div class="info-row align-start">
              <div class="tag tag-green">宜</div>
              <div class="info-val long-text">
                {{ (detail.yi || []).join('，') || '-' }}
              </div>
            </div>

            <!--   忌 -->
            <div class="info-row align-start">
              <div class="tag tag-orange">忌</div>
              <div class="info-val long-text">
                {{ (detail.ji || []).join('，') || '-' }}
              </div>
            </div>

            <div class="info-row">
              <div class="tag tag-gray">月相</div>
              <div class="info-val">{{ detail.xiang || '-' }}</div>
              <div class="tag tag-gray ml-auto">物候</div>
              <div class="info-val">{{ detail.wuhou || '-' }}</div>
            </div>

            <!-- 可选：你如果不想显示方位信息，删掉下面这段 -->
            <div class="info-row muted small">
              喜神方位：{{ detail.xiShen || '-' }}
            </div>
            <div class="info-row muted small">
              财神方位：{{ detail.caiShen || '-' }}
            </div>
            <div class="info-row muted small">
              福神方位：{{ detail.fuShen || '-' }}
            </div>
            <div class="info-row muted small">
              阳贵神方位：{{ detail.yangGui || '-' }}
            </div>
            <div class="info-row muted small">
              阴贵神方位：{{ detail.yinGui || '-' }}
            </div>
          </div>

          <div class="mt-auto"></div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ===== Overlay / Modal ===== */
.cal-overlay {
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
}

:global(html.dark) .cal-overlay {
  background: rgba(0, 0, 0, 0.62);
}

.cal-modal {
  background: var(--settings-surface);
  border: 1px solid var(--settings-border);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(50px) saturate(130%);
  -webkit-backdrop-filter: blur(50px) saturate(130%);
  color: var(--settings-text);
}

:global(html.dark) .cal-modal {
  background: rgba(18, 18, 20, 0.88);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.55);
}

.cal-roundbtn {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  background: rgba(255, 255, 255, 0.65);
  color: rgba(60, 60, 60, 0.9);
}

.cal-roundbtn:hover {
  background: rgba(255, 255, 255, 0.85);
}

:global(html.dark) .cal-roundbtn {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
}

:global(html.dark) .cal-roundbtn:hover {
  background: rgba(255, 255, 255, 0.14);
}

/* Panels */
.cal-left {
  border-right: 1px solid var(--settings-border);
}

.cal-right {
  background: var(--settings-panel);
}

/* Month bar / Buttons */
.cal-monthbar {
  background: rgba(0, 0, 0, 0.04);
}

:global(html.dark) .cal-monthbar {
  background: rgba(255, 255, 255, 0.06);
}

.cal-iconbtn:hover {
  background: rgba(255, 255, 255, 0.65);
}

:global(html.dark) .cal-iconbtn:hover {
  background: rgba(255, 255, 255, 0.10);
}

.cal-todaybtn {
  background: rgba(0, 0, 0, 0.04);
  color: var(--settings-text);
}

.cal-todaybtn:hover {
  background: rgba(0, 0, 0, 0.07);
}

:global(html.dark) .cal-todaybtn {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.dark) .cal-todaybtn:hover {
  background: rgba(255, 255, 255, 0.10);
}

.cal-week {
  color: var(--settings-text-secondary);
}

/* ===== Day cell（含今天标记）===== */
.cal-day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  background: rgba(0, 0, 0, 0.03);
}

.cal-day:hover {
  background: rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

:global(html.dark) .cal-day {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.dark) .cal-day:hover {
  background: rgba(255, 255, 255, 0.10);
}

.cal-day.is-muted {
  opacity: 0.35;
  filter: grayscale(1);
}

.cal-day.is-selected {
  border-color: rgba(var(--accent-color-rgb), 0.75);
  background: rgba(var(--accent-color-rgb), 0.14);
}

:global(html.dark) .cal-day.is-selected {
  border-color: rgba(var(--accent-color-rgb), 0.85);
  background: rgba(var(--accent-color-rgb), 0.20);
}

.cal-day.is-today {
  border-color: rgba(var(--accent-color-rgb), 0.35);
  box-shadow: 0 0 0 2px rgba(var(--accent-color-rgb), 0.08) inset;
}

:global(html.dark) .cal-day.is-today {
  border-color: rgba(var(--accent-color-rgb), 0.45);
  box-shadow: 0 0 0 2px rgba(var(--accent-color-rgb), 0.12) inset;
}

.today-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(var(--accent-color-rgb), 0.16);
  color: rgba(var(--accent-color-rgb), 1);
}

.today-dot {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(var(--accent-color-rgb), 0.9);
  box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.12);
}

.cal-day-num {
  color: var(--settings-text);
}

.cal-day-sub {
  color: var(--settings-text-secondary);
}

.cal-day-sub.is-festival {
  color: #ff4d4f;
  font-weight: 700;
}

.cal-day-sub.is-work {
  color: rgba(120, 120, 120, 0.9);
}

.cal-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  transform: scale(0.9);
  font-weight: 800;
}

.cal-badge.rest {
  background: rgba(255, 77, 79, 0.18);
  color: #ff4d4f;
}

.cal-badge.work {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(70, 70, 70, 0.9);
}

:global(html.dark) .cal-badge.work {
  background: rgba(255, 255, 255, 0.10);
  color: rgba(220, 220, 220, 0.85);
}

/* ===== Right side (图1风格) ===== */
.cal-right-top {
  color: var(--settings-text-secondary);
}

.cal-right-text {
  color: var(--settings-text);
}

.cal-right-sub {
  color: var(--settings-text-secondary);
  font-size: 12px;
}

.divider {
  height: 1px;
  background: var(--settings-border);
  margin: 8px 0 10px;
}

.mini-day-wrap {
  display: flex;
  justify-content: center;
}

.mini-day {
  position: relative;
  width: 86px;
  height: 86px;
  border-radius: 16px;
  background: rgba(var(--accent-color-rgb), 0.95);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
}

:global(html.dark) .mini-day {
  box-shadow: 0 22px 55px rgba(0, 0, 0, 0.45);
}

.mini-num {
  font-size: 56px;
  font-weight: 900;
  line-height: 1;
}

.mini-dot {
  position: absolute;
  top: 12px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
}

.mini-dot.left {
  left: 18px;
}

.mini-dot.right {
  right: 18px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--settings-text);
  font-size: 14px;
}

.info-row.align-start {
  align-items: flex-start;
}

.info-row.muted {
  color: var(--settings-text-secondary);
}

.info-row.small {
  font-size: 12px;
  gap: 8px;
}

.tag {
  font-size: 12px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 10px;
  color: #fff;
  flex: 0 0 auto;
}

.tag-red {
  background: rgba(255, 77, 79, 0.9);
}

.tag-pink {
  background: rgba(236, 72, 153, 0.9);
}

.tag-blue {
  background: rgba(59, 130, 246, 0.9);
}

.tag-green {
  background: rgba(34, 197, 94, 0.9);
}

.tag-orange {
  background: rgba(249, 115, 22, 0.9);
}

.tag-gray {
  background: rgba(107, 114, 128, 0.9);
}

.info-val {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--settings-text);
}

.cap-pill {
  display: inline-flex;
  margin-left: 8px;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(107, 114, 128, 0.18);
  color: var(--settings-text);
}

/*   宜/忌长文：不省略，改为可滚动区域 */
.long-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--settings-text);
  word-break: break-word;
  white-space: normal;

  max-height: 88px; /* 你想更长就调大 */
  overflow: auto;
  padding-right: 6px;
}

.long-text::-webkit-scrollbar {
  width: 4px;
}

.long-text::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.25);
  border-radius: 999px;
}

.long-text::-webkit-scrollbar-track {
  background: transparent;
}

/* ===== Transitions ===== */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.slide-up-enter-active,
.slide-up-leave-active,
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1);
}

.slide-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(-30%);
  opacity: 0;
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateY(30%);
  opacity: 0;
}
</style>

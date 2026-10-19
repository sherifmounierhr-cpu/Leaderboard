<script setup lang="ts">
import { computed } from 'vue'
import type { AnnouncementLogo } from '@/lib/types'

/**
 * دخلة سينمائية قبل لحظة مهمة على الشاشة (كلمة صاحب العمل، ترحيب بالضيوف):
 * تصاعد 1.7ث — خطوط نور بتتجمع في النص ونقط بتتشد للمركز — ثم ضربة: فلاش
 * وموجة صدمة وشرار، والعنوان بيطلع من قلب النور. التوقيت والصوت في
 * useCinematicIntro؛ هنا الشكل بس. كل الحركة transform/opacity.
 */
const props = defineProps<{
  show: boolean
  runKey?: string | number
  kicker: string
  headline: string
  subtitle?: string | null
  logos?: AnnouncementLogo[]
}>()

const sizeClass = computed(() => {
  const n = props.headline.length
  return n > 40 ? 'is-xlong' : n > 20 ? 'is-long' : ''
})

/* نقط نور بتتشد للنص قبل الضربة، وشرار بيطير منه بعدها — أماكن ثابتة */
const seeded = (i: number, n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
const MOTES = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2 + seeded(i, 1) * 0.3
  const r = 38 + seeded(i, 2) * 26
  const dur = 1.0 + seeded(i, 3) * 0.55
  return { '--x': `${Math.cos(a) * r}vmin`, '--y': `${Math.sin(a) * r}vmin`, animationDuration: `${dur}s`, animationDelay: `${1.66 - dur}s` }
})
const SPARKS = Array.from({ length: 24 }, (_, i) => ({
  '--a': `${(i / 24) * 360 + seeded(i, 4) * 12}deg`,
  '--d': `${26 + seeded(i, 5) * 34}vmin`,
  animationDuration: `${0.9 + seeded(i, 6) * 0.6}s`,
}))
</script>

<template>
  <Transition name="oi">
    <div v-if="show" :key="runKey" class="oi">
      <div class="oi-fx" aria-hidden="true">
        <span class="oi-rays" />
        <span class="oi-streak oi-streak-l" />
        <span class="oi-streak oi-streak-r" />
        <span v-for="(st, i) in MOTES" :key="'m' + i" class="oi-mote" :style="st" />
        <span class="oi-core" />
        <span class="oi-flash" />
        <span class="oi-shock" />
        <span class="oi-shock oi-shock-2" />
        <span v-for="(st, i) in SPARKS" :key="'s' + i" class="oi-spark" :style="st" />
      </div>
      <div class="oi-stage">
        <p class="oi-kicker">{{ kicker }}</p>
        <div class="oi-name-row">
          <span class="oi-rule" aria-hidden="true" />
          <p dir="auto" class="oi-name" :class="sizeClass">{{ headline }}</p>
          <span class="oi-rule oi-rule-end" aria-hidden="true" />
        </div>
        <div v-if="subtitle || logos?.length" class="oi-below">
          <p v-if="subtitle" dir="auto" class="oi-title">{{ subtitle }}</p>
          <div v-if="logos?.length" class="oi-logos">
            <span v-for="(logo, i) in logos" :key="logo.url" class="oi-logo" :style="{ animationDelay: `${2.35 + i * 0.12}s` }">
              <img :src="logo.url" :alt="logo.name || ''" referrerpolicy="no-referrer" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ------------------------------------------------------------ الدخلة
   كل التوقيتات من لحظة ظهور الدخلة؛ الضربة (صوت + فلاش + اسم) عند 1.7ث.
   الحركة كلها transform/opacity — الفلاش والأشعة بيترسموا مرة واحدة. */
.oi {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(70% 60% at 50% 50%, #0b2d2c 0%, #030c0d 75%);
}
.oi-fx { position: absolute; inset: 0; }
.oi-fx > * {
  position: absolute;
  inset: 0;
  margin: auto;
  pointer-events: none;
}
.oi-rays {
  /* أكبر من الشاشة: margin:auto ما بيوسّطوش، فالتوسيط بإزاحة سالبة ثابتة */
  inset: auto;
  left: 50%;
  top: 50%;
  margin: -85vmax 0 0 -85vmax;
  width: 170vmax;
  height: 170vmax;
  -webkit-mask: radial-gradient(closest-side, #000 8%, transparent 72%);
  mask: radial-gradient(closest-side, #000 8%, transparent 72%);
  animation: oi-rays-in 1300ms cubic-bezier(0.16, 1, 0.3, 1) 1.7s both;
}
.oi-rays::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: repeating-conic-gradient(from 0deg, #f0d38a2e 0deg 3.5deg, transparent 3.5deg 11deg);
  animation: oi-spin 80s linear infinite;
}
.oi-streak {
  top: 50%;
  bottom: auto;
  width: 50vw;
  height: 3px;
  margin: -1.5px 0 0;
  border-radius: 999px;
  box-shadow: 0 0 18px 2px #f0d38a80;
  animation: oi-streak 1650ms cubic-bezier(0.55, 0, 0.9, 0.45) 50ms both, oi-out 260ms ease-out 1.7s forwards;
}
.oi-streak-l { left: 0; right: auto; transform-origin: left center; background: linear-gradient(90deg, transparent, #f0d38a 70%, #fffbe8); }
.oi-streak-r { right: 0; left: auto; transform-origin: right center; background: linear-gradient(270deg, transparent, #f0d38a 70%, #fffbe8); }
.oi-mote {
  width: 0.8vmin;
  height: 0.8vmin;
  border-radius: 999px;
  background: #fff4cf;
  box-shadow: 0 0 1.4vmin #f0d38a;
  animation-name: oi-mote;
  animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  animation-fill-mode: both;
}
.oi-core {
  width: 9vmin;
  height: 9vmin;
  border-radius: 999px;
  background: radial-gradient(closest-side, #fffbe8 0%, #f0d38a 35%, #f0d38a00 100%);
  animation: oi-core 1700ms cubic-bezier(0.6, 0, 1, 0.6) both, oi-burst 380ms ease-out 1.7s forwards;
}
.oi-flash {
  width: 100%;
  height: 100%;
  z-index: 3;
  background: radial-gradient(circle at 50% 50%, #fffbe8 0%, #f6e3a8e6 18%, #f0d38a66 40%, #0f7e7622 62%, transparent 80%);
  animation: oi-flash 1000ms ease-out 1.66s both;
}
.oi-shock {
  width: 30vmin;
  height: 30vmin;
  border-radius: 999px;
  border: 0.45vmin solid #f6e3a8;
  box-shadow: 0 0 3vmin #f0d38a99, inset 0 0 3vmin #f0d38a66;
  animation: oi-shock 1250ms cubic-bezier(0.1, 0.65, 0.3, 1) 1.7s both;
}
.oi-shock-2 { border-width: 0.25vmin; animation-delay: 1.84s; animation-duration: 1500ms; }
.oi-spark {
  width: 2.2vmin;
  height: 0.35vmin;
  border-radius: 999px;
  background: linear-gradient(90deg, #f0d38a00, #fff4cf);
  animation-name: oi-spark;
  animation-timing-function: cubic-bezier(0.1, 0.7, 0.3, 1);
  animation-delay: 1.7s;
  animation-fill-mode: both;
}
.oi-stage {
  /* الاسم نفسه في نص الشاشة بالظبط — مكان الضربة؛ الجملة فوقه والمنصب تحته */
  position: relative;
  z-index: 4;
  padding-inline: 6vw;
  text-align: center;
  animation: oi-push 2900ms linear 1.7s both;
}
.oi-kicker,
.oi-below {
  position: absolute;
  inset-inline: 0;
}
.oi-kicker { bottom: calc(100% + clamp(10px, 2.4vh, 30px)); }
.oi-below {
  top: calc(100% + clamp(8px, 2vh, 26px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(12px, 2.6vh, 34px);
}
.oi-kicker {
  margin: 0;
  font-weight: 700;
  color: #f0d38ad9;
  font-size: clamp(18px, min(3.8vh, 2.3vw), 48px);
  animation: oi-kicker 900ms var(--ease-out) 350ms both;
}
.oi-name-row {
  /* الخط الأول دايماً شمال الاسم والتاني يمينه — الاسم نفسه dir=auto */
  direction: ltr;
  display: flex;
  align-items: center;
  gap: clamp(12px, 2vw, 40px);
}
.oi-name {
  margin: 0;
  font-weight: 800;
  line-height: 1.15;
  font-size: clamp(44px, min(12.5vh, 8vw), 176px);
  max-width: 16ch;
  text-wrap: balance;
  background: linear-gradient(100deg, #fff6da 0%, #f0d38a 30%, #fffbe8 50%, #d9ad55 70%, #fff3cf 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: oi-name 900ms cubic-bezier(0.16, 1, 0.3, 1) 1.7s both, oi-shimmer 3.2s ease-in-out 2.4s infinite;
}
.oi-rule {
  flex: none;
  width: clamp(36px, 9vw, 190px);
  height: 2px;
  background: linear-gradient(90deg, transparent, #f0d38a);
  transform-origin: right center;
  animation: oi-rule 800ms var(--ease-out) 2s both;
}
.oi-rule-end { background: linear-gradient(270deg, transparent, #f0d38a); transform-origin: left center; }
.oi-title {
  margin: 0;
  font-weight: 700;
  color: #f0d38a;
  font-size: clamp(16px, min(3.2vh, 1.9vw), 40px);
  animation: oi-kicker 800ms var(--ease-out) 2.15s both;
}
.oi-leave-active { transition: opacity 650ms ease, transform 650ms cubic-bezier(0.4, 0, 0.2, 1); }
.oi-leave-to { opacity: 0; transform: scale(1.08); }

@keyframes oi-streak {
  from { opacity: 0; transform: scaleX(0); }
  30% { opacity: 1; }
  to { opacity: 1; transform: scaleX(1); }
}
@keyframes oi-out { to { opacity: 0; } }
@keyframes oi-mote {
  from { opacity: 0; transform: translate(var(--x), var(--y)) scale(0.5); }
  25% { opacity: 1; }
  92% { opacity: 1; transform: translate(0, 0) scale(1.3); }
  to { opacity: 0; transform: translate(0, 0) scale(0.4); }
}
@keyframes oi-core {
  from { opacity: 0; transform: scale(0.1); }
  to { opacity: 1; transform: scale(1.5); }
}
@keyframes oi-burst {
  from { opacity: 1; transform: scale(1.5); }
  to { opacity: 0; transform: scale(5); }
}
@keyframes oi-flash {
  0% { opacity: 0; }
  7% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes oi-shock {
  from { opacity: 1; transform: scale(0.15); }
  to { opacity: 0; transform: scale(5.5); }
}
@keyframes oi-spark {
  from { opacity: 1; transform: rotate(var(--a)) translateX(3vmin) scaleX(0.4); }
  to { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scaleX(1.6); }
}
@keyframes oi-rays-in {
  from { opacity: 0; transform: scale(0.35); }
  to { opacity: 1; transform: none; }
}
@keyframes oi-push {
  from { transform: none; }
  to { transform: scale(1.045); }
}
@keyframes oi-kicker {
  from { opacity: 0; transform: translateY(1.6vh); }
  to { opacity: 1; transform: none; }
}
@keyframes oi-name {
  from { opacity: 0; transform: scale(1.45); }
  to { opacity: 1; transform: none; }
}
@keyframes oi-rule {
  from { opacity: 0; transform: scaleX(0); }
  to { opacity: 1; transform: none; }
}
/* عنوان أطول (ترحيب بجملة) بخط أصغر — عشان يفضل سطر أو اتنين */
.oi-name.is-long { font-size: clamp(34px, min(8.6vh, 5.6vw), 120px); max-width: 20ch; }
.oi-name.is-xlong { font-size: clamp(28px, min(6.6vh, 4.3vw), 92px); max-width: 26ch; }
/* شعارات الضيوف: لوحات فاتحة بتطلع واحدة ورا التانية بعد الضربة */
.oi-logos {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(10px, 1.8vw, 30px);
}
.oi-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: clamp(54px, 10vh, 124px);
  aspect-ratio: 1.7;
  border-radius: clamp(10px, 1.4vh, 18px);
  background: linear-gradient(160deg, #fffdf6, #f1e6cc);
  box-shadow: 0 0 0 1px #f0d38a99, 0 18px 40px -18px #000;
  animation: oi-logo 800ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.oi-logo img { max-width: 78%; max-height: 66%; object-fit: contain; }
@keyframes oi-logo {
  from { opacity: 0; transform: translateY(3vh) scale(0.85); }
  to { opacity: 1; transform: none; }
}
/* موبايل بالطول: عنوان وشعارات أصغر — تلات شعارات في الصف ومفيش حاجة تقع برّه */
@media (orientation: portrait) {
  .oi-name, .oi-name.is-long { font-size: clamp(30px, 9.5vw, 80px); }
  .oi-name.is-xlong { font-size: clamp(24px, 7vw, 64px); }
  .oi-logo { height: clamp(44px, 7.4vh, 100px); }
}
@keyframes oi-spin { to { transform: rotate(1turn); } }
@keyframes oi-shimmer {
  0% { background-position: 100% 0; }
  45%, 100% { background-position: 0% 0; }
}
@keyframes oi-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  /* من غير خطوط بتجري ولا فلاش ولا موجة — الاسم بيظهر مع الضربة بس */
  .oi-streak, .oi-mote, .oi-core, .oi-flash, .oi-shock, .oi-spark { display: none; }
  .oi-rays { animation: oi-fade 200ms ease 1.7s both; }
  .oi-rays::before, .oi-stage { animation: none; }
  .oi-kicker { animation: oi-fade 200ms ease 350ms both; }
  .oi-name { animation: oi-fade 200ms ease 1.7s both; }
  .oi-rule { animation: oi-fade 200ms ease 2s both; }
  .oi-title { animation: oi-fade 200ms ease 2.15s both; }
  .oi-leave-active { transition: opacity 200ms ease; }
  .oi-leave-to { transform: none; }
  .oi-logo { animation-name: oi-fade; animation-duration: 200ms; }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { cleanCutout, isolate, type RawCutout } from '@/lib/cutout'
import {
  BACKDROPS, DEFAULT_OPTIONS, LOOKS, TOUCHES, TOUCH_COLORS,
  applyLook, compose, encode, hasTransparency, keyOutBackground, loadSource, pixelsOf, shrink, toCanvas,
  type BackgroundMode, type Pixels, type StudioOptions, type TouchColor,
} from '@/lib/imageStudio'

/**
 * استوديو الصورة: بيفتح بعد اختيار أي صورة في الإدارة (أو من زرار «تعديل»
 * على صورة موجودة). عزل خلفية (ذكي للأشخاص، أو لون ثابت للشعارات)، فلتر
 * لون، هالة أو ظل، وخلفية بألوان الهوية — والناتج صورة جاهزة بتترفع.
 */
const props = withDefaults(defineProps<{
  source: Blob | string
  name?: string
  /** بيحدّد البداية: شخص ← العزل الذكي مقترح، شعار ← إزالة اللون. */
  purpose?: 'person' | 'logo' | 'photo'
  /** صور المديرين المعزولة: لازم الناتج يفضل شفاف. */
  requireCutout?: boolean
  /** أطول ضلع للناتج. */
  maxEdge?: number
}>(), { name: '', purpose: 'photo', requireCutout: false, maxEdge: 1400 })

const emit = defineEmits<{ confirm: [Blob]; cancel: [] }>()
const { t } = useI18n()

const options = ref<StudioOptions>({
  ...DEFAULT_OPTIONS,
  background: props.requireCutout ? 'person' : props.purpose === 'logo' ? 'color' : 'keep',
})

const source = shallowRef<HTMLCanvasElement | null>(null)
const raw = shallowRef<RawCutout | null>(null)
const base = shallowRef<Pixels | null>(null)
const result = shallowRef<HTMLCanvasElement | null>(null)
const preview = ref<string | null>(null)
const originalUrl = ref<string | null>(null)
const thumbs = ref<Record<string, string>>({})

const loading = ref(true)
/** العزل الذكي أول مرة بيحمّل موديل ~25 ميجا — رسالة مختلفة عن المعالجة العادية. */
const isolating = ref(false)
const working = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const comparing = ref(false)
const stage = ref<'dark' | 'light' | 'checker'>('checker')
const dialog = ref<HTMLElement | null>(null)

const transparent = computed(() => (base.value ? hasTransparency(base.value) : false))
const backgrounds = computed<BackgroundMode[]>(() => (props.requireCutout ? ['person', 'color'] : ['keep', 'person', 'color']))

const BG_ICON: Record<BackgroundMode, string> = {
  keep: 'mdi:image-outline',
  person: 'mdi:account-star-outline',
  color: 'mdi:format-color-fill',
}
const LOOK_ICON: Record<string, string> = {
  none: 'mdi:circle-off-outline',
  bright: 'mdi:white-balance-sunny',
  warm: 'mdi:fire',
  gold: 'mdi:star-four-points-outline',
  cinema: 'mdi:movie-open-outline',
  mono: 'mdi:contrast-box',
}
const TOUCH_ICON: Record<string, string> = { none: 'mdi:circle-off-outline', glow: 'mdi:shimmer', shadow: 'mdi:box-shadow' }
const BACKDROP_SWATCH: Record<string, string> = {
  clear: 'studio-checker',
  teal: 'bg-[radial-gradient(circle_at_50%_30%,#2aa79b,#0f7e76_45%,#0a3f3b)]',
  gold: 'bg-[radial-gradient(circle_at_50%_30%,#fbe7b2,#d9ad55_45%,#7a5a1c)]',
  night: 'bg-[radial-gradient(circle_at_50%_30%,#1d4d4a,#0b2627_45%,#040f10)]',
}
const STAGES = {
  dark: 'bg-[radial-gradient(120%_90%_at_50%_0%,#1f5f5a,#0b1f20_70%)]',
  light: 'bg-[#f4f6f6]',
  checker: 'studio-checker',
} as const

function setPreview(url: string | null) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = url
}

/** الخطوة التقيلة (الخلفية) بتتحسب لما الخلفية تتغيّر بس؛ الباقي سريع. */
async function computeBase() {
  const src = source.value
  if (!src) return
  const o = options.value
  error.value = null
  try {
    if (o.background === 'person') {
      if (!raw.value) {
        isolating.value = true
        raw.value = await isolate(src)
      }
      base.value = cleanCutout(raw.value, o.edge)
    } else if (o.background === 'color') {
      base.value = keyOutBackground(pixelsOf(src), o.tolerance)
    } else {
      base.value = pixelsOf(src)
    }
  } catch (err) {
    error.value = t('studio.failed', { reason: err instanceof Error ? err.message : String(err) })
    base.value = pixelsOf(src)
  } finally {
    isolating.value = false
  }
  renderThumbs()
  await renderResult()
}

async function renderResult() {
  const b = base.value
  if (!b) return
  working.value = true
  const o = options.value
  // لمسة الهالة والخلفية الجديدة ليهم معنى مع الشفافية بس
  const looked = applyLook(b, o.look, o.amount)
  const canvas = compose(looked, {
    touch: transparent.value ? o.touch : 'none',
    touchColor: o.touchColor,
    backdrop: transparent.value && !props.requireCutout ? o.backdrop : 'clear',
  })
  result.value = canvas
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  setPreview(blob ? URL.createObjectURL(blob) : null)
  working.value = false
}

/** معاينة صغيرة لكل فلتر على الصورة الحالية — بتتحسب على نسخة 140px فلحظية. */
function renderThumbs() {
  const b = base.value
  if (!b) return
  const small = pixelsOf(shrink(toCanvas(b), 140))
  const next: Record<string, string> = {}
  for (const look of LOOKS) next[look] = toCanvas(applyLook(small, look, 0.9)).toDataURL()
  thumbs.value = next
}

let timer: ReturnType<typeof setTimeout> | null = null
function schedule(fn: () => void | Promise<void>, ms = 90) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void fn(), ms)
}

watch(() => [options.value.background, options.value.edge, options.value.tolerance], () => schedule(computeBase, 120))
watch(
  () => [options.value.look, options.value.amount, options.value.touch, options.value.touchColor, options.value.backdrop],
  () => schedule(renderResult),
)

async function useResult() {
  if (!result.value) return
  saving.value = true
  try {
    emit('confirm', await encode(result.value, props.maxEdge))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    saving.value = false
  }
}

/** «بدون تعديل»: الأصل بعد التصغير بس — نفس حدود الحجم، من غير أي لمسة. */
async function useOriginal() {
  if (!source.value) return
  saving.value = true
  emit('confirm', await encode(source.value, props.maxEdge))
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
}

onMounted(async () => {
  document.addEventListener('keydown', onKey)
  if (typeof props.source !== 'string') originalUrl.value = URL.createObjectURL(props.source)
  else originalUrl.value = props.source
  try {
    source.value = await loadSource(props.source)
    // شعار شفاف أصلاً ما يحتاجش إزالة لون
    if (options.value.background === 'color' && hasTransparency(pixelsOf(source.value))) options.value.background = 'keep'
    await computeBase()
  } catch (err) {
    error.value = t('studio.loadFailed', { reason: err instanceof Error ? err.message : String(err) })
  } finally {
    loading.value = false
  }
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  if (timer) clearTimeout(timer)
  setPreview(null)
  if (originalUrl.value && typeof props.source !== 'string') URL.revokeObjectURL(originalUrl.value)
})

const busyText = computed(() => {
  if (loading.value && !source.value) return t('studio.loading')
  if (isolating.value) return t('studio.isolating')
  return null
})

const TILE = 'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-caption font-semibold transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.97]'
const tileState = (on: boolean) => on
  ? 'border-accent bg-accent/10 text-accent-text shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]'
  : 'border-card-border text-mute hover:border-accent/40 hover:text-strong'
</script>

<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-[#041011]/70 p-3 sm:p-6" @click.self="emit('cancel')">
    <div
      ref="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('studio.title')"
      class="studio-in flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card shadow-2xl"
    >
      <!-- رأس بهوية الشركة -->
      <header class="relative flex items-center gap-3 overflow-hidden bg-[linear-gradient(100deg,var(--color-header),var(--color-header-2))] px-5 py-4 text-white">
        <span class="peaks !opacity-[0.07]" aria-hidden="true" />
        <span class="studio-spark relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/12 text-xl text-[#f0d38a]" aria-hidden="true">
          <iconify-icon icon="mdi:auto-fix" />
        </span>
        <div class="relative min-w-0 flex-1">
          <h2 class="m-0 truncate text-lg font-extrabold">{{ t('studio.title') }}<template v-if="name"> · <bdi>{{ name }}</bdi></template></h2>
          <p class="m-0 truncate text-caption text-white/70">{{ t('studio.subtitle') }}</p>
        </div>
        <button
          type="button"
          class="relative inline-flex size-11 items-center justify-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          :aria-label="t('admin.cancel')"
          @click="emit('cancel')"
        >
          <iconify-icon icon="mdi:close" aria-hidden="true" class="text-xl" />
        </button>
      </header>

      <div class="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
        <!-- المسرح -->
        <div class="flex flex-col gap-3 p-4 lg:min-h-0 lg:p-5">
          <div class="relative flex h-[min(18rem,42vh)] shrink-0 items-center lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink justify-center overflow-hidden rounded-xl lg:min-h-0" :class="STAGES[stage]">
            <img
              v-if="comparing && originalUrl"
              :src="originalUrl"
              alt=""
              class="max-h-full max-w-full object-contain"
            />
            <img
              v-else-if="preview"
              :src="preview"
              :alt="t('studio.result')"
              class="studio-pop max-h-full max-w-full object-contain"
              :key="preview"
            />
            <div
              v-if="busyText"
              class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#041011]/55 px-6 text-center text-sm font-semibold text-white"
              role="status"
            >
              <span class="studio-orbit" aria-hidden="true" />
              {{ busyText }}
            </div>
            <span v-else-if="working" class="absolute top-3 end-3 inline-flex size-8 items-center justify-center rounded-full bg-black/40 text-white" aria-hidden="true">
              <iconify-icon icon="mdi:loading" class="animate-spin" />
            </span>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-card-border px-3 text-caption font-semibold text-mute transition-colors hover:text-strong select-none"
              :aria-pressed="comparing"
              @pointerdown="comparing = true"
              @pointerup="comparing = false"
              @pointerleave="comparing = false"
              @keydown.space.prevent="comparing = true"
              @keyup.space.prevent="comparing = false"
            >
              <iconify-icon icon="mdi:compare-horizontal" aria-hidden="true" class="text-lg" />
              {{ t('studio.holdToCompare') }}
            </button>
            <div class="flex gap-1" role="group" :aria-label="t('studio.stage')">
              <button
                v-for="s in (['checker', 'dark', 'light'] as const)"
                :key="s"
                type="button"
                class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-caption font-semibold transition-colors"
                :class="stage === s ? 'border-accent text-accent-text' : 'border-card-border text-mute hover:text-strong'"
                :aria-pressed="stage === s"
                @click="stage = s"
              >
                <span class="size-3.5 rounded-full ring-1 ring-black/15" :class="STAGES[s]" aria-hidden="true" />
                {{ t(`studio.stage_${s}`) }}
              </button>
            </div>
          </div>
        </div>

        <!-- الأدوات -->
        <div class="flex flex-col gap-5 border-t border-card-border p-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-s lg:p-5">
          <fieldset class="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend class="mb-2 flex items-center gap-1.5 text-sm font-bold text-strong">
              <span class="studio-step" aria-hidden="true">1</span>{{ t('studio.background') }}
            </legend>
            <div class="grid gap-2" :class="backgrounds.length === 3 ? 'grid-cols-3' : 'grid-cols-2'">
              <button
                v-for="(mode, i) in backgrounds"
                :key="mode"
                type="button"
                :class="[TILE, tileState(options.background === mode)]"
                :aria-pressed="options.background === mode"
                :data-autofocus="i === 0 ? '' : undefined"
                @click="options.background = mode"
              >
                <iconify-icon :icon="BG_ICON[mode]" aria-hidden="true" class="text-2xl" />
                {{ t(`studio.bg_${mode}`) }}
              </button>
            </div>
            <label v-if="options.background === 'person'" class="flex flex-col gap-1.5">
              <span class="flex justify-between text-caption font-semibold text-mute">
                <span>{{ t('admin.cutoutEdge') }}</span>
                <b class="text-strong">{{ t(`admin.cutoutEdgeLevel.${options.edge}`) }}</b>
              </span>
              <input v-model.number="options.edge" type="range" min="1" max="4" step="1" class="accent-[var(--color-accent)]" />
            </label>
            <label v-if="options.background === 'color'" class="flex flex-col gap-1.5">
              <span class="flex justify-between text-caption font-semibold text-mute">
                <span>{{ t('studio.tolerance') }}</span>
                <b class="tabular-nums text-strong">{{ options.tolerance }}</b>
              </span>
              <input v-model.number="options.tolerance" type="range" min="5" max="60" step="1" class="accent-[var(--color-accent)]" />
            </label>
            <p class="m-0 text-caption text-dim">{{ t(`studio.bgHint_${options.background}`) }}</p>
          </fieldset>

          <fieldset class="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend class="mb-2 flex items-center gap-1.5 text-sm font-bold text-strong">
              <span class="studio-step" aria-hidden="true">2</span>{{ t('studio.look') }}
            </legend>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="look in LOOKS"
                :key="look"
                type="button"
                class="group flex flex-col items-stretch gap-1 rounded-xl border p-1.5 text-caption font-semibold transition-[border-color,color,transform] duration-200 active:scale-[0.97]"
                :class="options.look === look ? 'border-accent text-accent-text' : 'border-card-border text-mute hover:border-accent/40 hover:text-strong'"
                :aria-pressed="options.look === look"
                @click="options.look = look"
              >
                <span class="studio-checker relative flex aspect-square items-center justify-center overflow-hidden rounded-lg">
                  <img v-if="thumbs[look]" :src="thumbs[look]" alt="" class="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" />
                  <iconify-icon v-else :icon="LOOK_ICON[look]" aria-hidden="true" class="text-xl" />
                </span>
                {{ t(`studio.look_${look}`) }}
              </button>
            </div>
            <label v-if="options.look !== 'none'" class="flex flex-col gap-1.5">
              <span class="flex justify-between text-caption font-semibold text-mute">
                <span>{{ t('studio.amount') }}</span>
                <b class="tabular-nums text-strong">{{ Math.round(options.amount * 100) }}%</b>
              </span>
              <input v-model.number="options.amount" type="range" min="0.1" max="1" step="0.05" class="accent-[var(--color-accent)]" />
            </label>
          </fieldset>

          <fieldset v-if="transparent" class="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend class="mb-2 flex items-center gap-1.5 text-sm font-bold text-strong">
              <span class="studio-step" aria-hidden="true">3</span>{{ t('studio.touch') }}
            </legend>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="touch in TOUCHES"
                :key="touch"
                type="button"
                :class="[TILE, tileState(options.touch === touch)]"
                :aria-pressed="options.touch === touch"
                @click="options.touch = touch"
              >
                <iconify-icon :icon="TOUCH_ICON[touch]" aria-hidden="true" class="text-2xl" />
                {{ t(`studio.touch_${touch}`) }}
              </button>
            </div>
            <div v-if="options.touch === 'glow'" class="flex items-center gap-2" role="group" :aria-label="t('studio.touchColor')">
              <span class="text-caption font-semibold text-mute">{{ t('studio.touchColor') }}</span>
              <button
                v-for="(hex, c) in TOUCH_COLORS"
                :key="c"
                type="button"
                class="inline-flex size-11 items-center justify-center rounded-full"
                :aria-label="t(`studio.color_${c}`)"
                :aria-pressed="options.touchColor === c"
                @click="options.touchColor = c as TouchColor"
              >
                <span
                  class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-card)] transition-[box-shadow]"
                  :class="options.touchColor === c ? 'ring-accent' : 'ring-black/10'"
                  :style="{ background: hex }"
                />
              </button>
            </div>

            <template v-if="!requireCutout">
              <span class="mt-1 text-caption font-semibold text-mute">{{ t('studio.backdrop') }}</span>
              <div class="grid grid-cols-4 gap-2">
                <button
                  v-for="b in BACKDROPS"
                  :key="b"
                  type="button"
                  class="flex flex-col items-center gap-1 rounded-xl border p-1.5 text-caption font-semibold transition-colors"
                  :class="options.backdrop === b ? 'border-accent text-accent-text' : 'border-card-border text-mute hover:text-strong'"
                  :aria-pressed="options.backdrop === b"
                  @click="options.backdrop = b"
                >
                  <span class="aspect-square w-full rounded-lg" :class="BACKDROP_SWATCH[b]" aria-hidden="true" />
                  {{ t(`studio.backdrop_${b}`) }}
                </button>
              </div>
            </template>
          </fieldset>
        </div>
      </div>

      <footer class="flex flex-wrap items-center gap-2 border-t border-card-border px-4 py-3 lg:px-5">
        <p v-if="error" role="alert" class="m-0 w-full text-caption text-down">{{ error }}</p>
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-bold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="!result || saving || working || !!busyText || (requireCutout && !transparent)"
          @click="useResult"
        >
          <iconify-icon :icon="saving ? 'mdi:loading' : 'mdi:check-bold'" aria-hidden="true" :class="saving ? 'animate-spin' : ''" />
          {{ t('studio.use') }}
        </button>
        <button
          v-if="!requireCutout"
          type="button"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-card-border px-4 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
          :disabled="!source || saving"
          @click="useOriginal"
        >{{ t('studio.useOriginal') }}</button>
        <button type="button" class="min-h-11 rounded-lg px-4 text-sm font-semibold text-mute hover:text-strong" @click="emit('cancel')">
          {{ t('admin.cancel') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.studio-checker {
  background-color: #fff;
  background-image: conic-gradient(#e3e7ea 25%, transparent 0 50%, #e3e7ea 0 75%, transparent 0);
  background-size: 14px 14px;
}
.studio-step {
  display: inline-flex;
  width: 1.4rem;
  height: 1.4rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--color-accent);
  color: #fff;
  font-size: 0.75rem;
  margin-inline-end: 0.15rem;
}
.studio-in { animation: studio-in 320ms var(--ease-out) both; }
.studio-pop { animation: studio-pop 260ms var(--ease-out) both; }
/* بريق بيلف حوالين أيقونة العصا — لمسة بهجة، مرة كل كام ثانية */
.studio-spark::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  background: conic-gradient(from 0deg, transparent 0 80%, #f0d38a 90%, transparent);
  opacity: 0.8;
  animation: studio-spin 3.2s linear infinite;
  -webkit-mask: radial-gradient(closest-side, transparent 78%, #000 80%);
  mask: radial-gradient(closest-side, transparent 78%, #000 80%);
}
.studio-orbit {
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  border: 3px solid #ffffff33;
  border-top-color: #f0d38a;
  border-inline-end-color: #5ccfc3;
  animation: studio-spin 0.9s linear infinite;
}
@keyframes studio-in {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
@keyframes studio-pop {
  from { opacity: 0.4; transform: scale(0.985); }
  to { opacity: 1; transform: none; }
}
@keyframes studio-spin { to { transform: rotate(1turn); } }
@media (prefers-reduced-motion: reduce) {
  .studio-in, .studio-pop { animation: none; }
  .studio-spark::after { animation: none; }
  .studio-orbit { animation-duration: 2.4s; }
}
</style>

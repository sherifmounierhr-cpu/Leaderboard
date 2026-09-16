<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoardEntity } from '@/composables/useBoardData'

const props = withDefaults(
  defineProps<{ entity: BoardEntity; kind?: 'agent' | 'team' }>(),
  { kind: 'agent' },
)

const { t, locale } = useI18n()

/**
 * الأحرف الأولى مرسومة دائماً تحت الصورة — فإن سقطت الصورة (شبكة، أو كتمها
 * التصدير تفادياً لتلويث الـ canvas) يبقى شيء مقروء مكانها.
 */
const initials = computed(() =>
  props.entity.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase(),
)

/**
 * شعار مولَّد من ui-avatars (حروف لاتينية على لون) مش شعار حقيقي: نرسم بداله
 * شارة بحرف الاسم المعروض على نفس اللون، فتبقى عربية في الواجهة العربية.
 * أي شعار حقيقي مرفوع يظهر كما هو.
 */
const generated = computed(() => {
  // بالإنجليزي الشعار المولَّد نفسه (CAP/CST/CAI) أوضح: الحرف الأول يتكرر (New Capital, New Cairo, North Coast)
  if (props.kind !== 'team' || locale.value !== 'ar' || !props.entity.photo.includes('ui-avatars.com')) return null
  let color = '157a4a'
  try {
    color = new URL(props.entity.photo).searchParams.get('background')?.replace(/[^0-9a-f]/gi, '') || color
  } catch { /* رابط غير صالح — اللون الافتراضي */ }
  return { color: `#${color}`, letter: monogram(props.entity.name) }
})

/** «العاصمة الإدارية» ← «ع»؛ اسم لاتيني قصير مثل F1 يبقى كما هو. */
function monogram(name: string) {
  const clean = name.trim()
  if (/^[A-Za-z0-9]{1,3}$/.test(clean)) return clean.toUpperCase()
  const first = clean.split(/\s+/)[0] ?? ''
  const word = /^ال./.test(first) ? first.slice(2) : first
  // الألف منفردة (إ/أ/ا) تشبه «!» أو «l» على الشاشة — نضيف الحرف التالي: «إس»
  return (/^[اأإآ]/.test(word) ? word.slice(0, 2) : (word[0] ?? '')).toUpperCase()
}

const label = computed(() =>
  props.kind === 'team' ? t('a11y.logo', { name: props.entity.name }) : props.entity.name,
)
</script>

<template>
  <div
    class="relative overflow-hidden shrink-0 select-none bg-avatar outline outline-1 -outline-offset-1 outline-strong/10 flex items-center justify-center"
    role="img"
    :aria-label="label"
  >
    <template v-if="generated">
      <span
        aria-hidden="true"
        class="absolute inset-0"
        :style="{ background: `linear-gradient(145deg, color-mix(in oklab, ${generated.color} 78%, white), ${generated.color} 55%, color-mix(in oklab, ${generated.color} 70%, black))` }"
      />
      <span
        aria-hidden="true"
        class="relative font-extrabold text-white leading-none text-[1.35em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
      >{{ generated.letter }}</span>
    </template>

    <template v-else>
      <span
        aria-hidden="true"
        class="font-bold text-avatar-text tracking-tight text-[0.9em] leading-none"
      >{{ initials }}</span>

      <span
        v-if="entity.photo"
        aria-hidden="true"
        data-avatar-photo
        class="absolute inset-0 bg-cover bg-center"
        :style="{ backgroundImage: `url('${entity.photo}')` }"
      />
    </template>
  </div>
</template>

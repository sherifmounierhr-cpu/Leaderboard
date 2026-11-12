<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

/**
 * قائمة اختيار بالكتابة: اكتب جزءاً من الاسم (عربي أو إنجليزي) والقائمة تتفلتر.
 * الأسهم والـ Enter للاختيار، Escape للإغلاق.
 */
export interface SearchOption {
  id: string
  label: string
  /** سطر صغير بجانب الاسم (الفريق مثلاً). */
  hint?: string
  /** نص إضافي يدخل في البحث ولا يظهر (الاسم باللغة الأخرى). */
  keywords?: string
}

const props = defineProps<{
  modelValue: string
  options: SearchOption[]
  placeholder?: string
  emptyText?: string
  required?: boolean
  inputClass?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()

const uid = `search-select-${Math.random().toString(36).slice(2, 8)}`
const query = ref('')
const open = ref(false)
const active = ref(0)
const listEl = ref<HTMLElement | null>(null)

const selected = computed(() => props.options.find((o) => o.id === props.modelValue) ?? null)

// الخانة تعرض الاسم المختار؛ وهي مفتوحة تعرض ما يكتبه المستخدم
watch(selected, (o) => { if (!open.value) query.value = o?.label ?? '' }, { immediate: true })

/** توحيد أشكال الألف والياء والتاء المربوطة: «احمد» تلاقي «أحمد». */
const fold = (text: string) =>
  text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')

const filtered = computed(() => {
  const q = fold(query.value.trim())
  // لسه ما كتبش حاجة بعد الفتح: القائمة كلها
  if (!q || (selected.value && query.value === selected.value.label)) return props.options
  const words = q.split(/\s+/)
  return props.options.filter((o) => {
    const text = fold(`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`)
    return words.every((w) => text.includes(w))
  })
})

watch(filtered, () => { active.value = 0 })

function show() {
  if (open.value) return
  open.value = true
  active.value = Math.max(0, filtered.value.findIndex((o) => o.id === props.modelValue))
  void nextTick(scrollToActive)
}

function close() {
  open.value = false
  query.value = selected.value?.label ?? ''
}

function pick(option: SearchOption) {
  emit('update:modelValue', option.id)
  query.value = option.label
  open.value = false
}

function onInput() {
  open.value = true
  // مسح الخانة = إلغاء الاختيار
  if (!query.value.trim() && props.modelValue) emit('update:modelValue', '')
}

function onFocus(event: FocusEvent) {
  (event.target as HTMLInputElement).select()
  show()
}

function move(step: number) {
  if (!open.value) { show(); return }
  const count = filtered.value.length
  if (!count) return
  active.value = (active.value + step + count) % count
  void nextTick(scrollToActive)
}

function scrollToActive() {
  listEl.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

function onEnter(event: KeyboardEvent) {
  if (!open.value) return
  const option = filtered.value[active.value]
  if (!option) return
  // الاختيار من القائمة لا يرسل النموذج
  event.preventDefault()
  pick(option)
}
</script>

<template>
  <div class="relative">
    <input
      v-model="query"
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="`${uid}-list`"
      :aria-activedescendant="open && filtered[active] ? `${uid}-${active}` : undefined"
      :placeholder="placeholder"
      :required="required && !modelValue"
      :class="[inputClass, 'pe-9']"
      @input="onInput"
      @focus="onFocus"
      @click="show"
      @blur="close"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter="onEnter"
      @keydown.esc="close"
    />
    <iconify-icon
      icon="mdi:magnify"
      aria-hidden="true"
      class="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-dim text-lg"
    />

    <ul
      v-show="open"
      :id="`${uid}-list`"
      ref="listEl"
      role="listbox"
      class="absolute inset-x-0 top-full z-30 m-0 mt-1 max-h-72 list-none overflow-y-auto rounded-lg border border-card-border bg-card p-1 shadow-[var(--shadow-panel)]"
    >
      <li
        v-for="(o, i) in filtered"
        :id="`${uid}-${i}`"
        :key="o.id"
        role="option"
        :aria-selected="i === active"
        class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
        :class="i === active ? 'bg-accent/12 text-strong' : 'text-strong'"
        @mousedown.prevent="pick(o)"
        @mousemove="active = i"
      >
        <span class="flex min-w-0 items-center gap-2">
          <iconify-icon
            v-if="o.id === modelValue"
            icon="mdi:check"
            aria-hidden="true"
            class="shrink-0 text-accent-text"
          />
          <span class="truncate font-medium">{{ o.label }}</span>
        </span>
        <span v-if="o.hint" class="shrink-0 text-caption text-mute">{{ o.hint }}</span>
      </li>
      <li v-if="!filtered.length" class="px-3 py-2 text-sm text-mute">{{ emptyText }}</li>
    </ul>
  </div>
</template>

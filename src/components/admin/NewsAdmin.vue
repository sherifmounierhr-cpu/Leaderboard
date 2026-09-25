<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { relativeTime } from '@/lib/format'
import { useAuth } from '@/composables/useAuth'
import { useNews } from '@/composables/useNews'
import { useNewsControls } from '@/composables/useNewsControls'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { chime } from '@/composables/useChime'

/**
 * شاشة الأخبار من ناحية الإدارة: حالة المصدر، الأخبار اللي الشاشات شايفاها
 * دلوقتي، والتحكم في المدة والإعادات وصوت التنبيه.
 *
 * القائمة هي نفسها اللي الشاشات بتقراها (نفس `/api/news`)، فاللي إنت شايفه
 * هنا هو اللي عليها بالظبط — مش نسخة تانية ممكن تختلف.
 */

const CLOCK_MS = 30_000

const { t, locale } = useI18n()
const { isDemo } = useAuth()
const { items, fetchedAt, stale, lastError, refresh } = useNews()
const { hiddenIds, hide, show, cast, loaded: controlsLoaded } = useNewsControls()
const { settings, songs, clips, urlOf, reload: reloadMedia } = useBoardMedia()
const { play, stop } = useAudioPlayer()

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, CLOCK_MS) })
onBeforeUnmount(() => { if (clock) clearInterval(clock); stop() })

const busy = ref<string | null>(null)
const notice = ref<{ ok: boolean; text: string } | null>(null)

// ------------------------------------------------------------------ الحالة
function cairoDay(at: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(at)
}

const rows = computed(() => {
  void locale.value
  const today = cairoDay(new Date())
  return items.value.map((item) => {
    const date = new Date(item.date)
    const valid = !Number.isNaN(date.getTime())
    return {
      item,
      isToday: valid && cairoDay(date) === today,
      when: valid ? relativeTime(date, new Date(now.value)) : '',
      hidden: hiddenIds.value.has(item.id),
    }
  })
})

const airing = computed(() => {
  const visible = rows.value.filter((r) => !r.hidden)
  const today = visible.filter((r) => r.isToday)
  return today.length ? today : visible.slice(0, 3)
})

const slotSeconds = computed(() => airing.value.length * (settings.value.news_slide_s ?? 9))

const updated = computed(() => {
  void locale.value
  return fetchedAt.value ? relativeTime(fetchedAt.value, new Date(now.value)) : ''
})

// ------------------------------------------------------------- الإعدادات
const form = ref({
  enabled: true, slide: 9, repeats: 3, gap: 5, chimeOn: true, volume: 70, soundId: '' as string,
})

let filled = false
watch(
  settings,
  (value) => {
    if (filled || value.news_slide_s === undefined) return
    filled = true
    form.value = {
      enabled: value.news_enabled !== false,
      slide: value.news_slide_s ?? 9,
      repeats: value.news_repeats ?? 3,
      gap: value.news_gap_min ?? 5,
      chimeOn: value.news_chime !== false,
      volume: value.news_volume ?? 70,
      soundId: value.news_sound_id ?? '',
    }
  },
  { immediate: true, deep: true },
)

/** كل الصوتيات المرفوعة صالحة كتنبيه — المكتبة واحدة. */
const sounds = computed(() => [...clips.value, ...songs.value])

async function saveSettings() {
  busy.value = 'settings'
  notice.value = null
  try {
    const { error } = await supabase.rpc('lb_admin_save_news_settings', {
      p_enabled: form.value.enabled,
      p_slide_s: form.value.slide,
      p_repeats: form.value.repeats,
      p_gap_min: form.value.gap,
      p_chime: form.value.chimeOn,
      p_volume: form.value.volume,
      p_sound_id: form.value.soundId || null,
    })
    if (error) throw new Error(error.message)
    await reloadMedia()
    notice.value = { ok: true, text: t('newsAdmin.saved') }
  } catch (err) {
    notice.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    busy.value = null
  }
}

/** تجربة على الجهاز ده فقط: الملف المختار، أو النغمة المدمجة. */
function testSound() {
  const url = urlOf(form.value.soundId || null)
  if (url) void play(url, form.value.volume, 8)
  else chime()
}

// ------------------------------------------------------------- كل خبر
async function run(key: string, action: () => Promise<void>, ok: string) {
  busy.value = key
  notice.value = null
  try {
    await action()
    notice.value = { ok: true, text: ok }
  } catch (err) {
    notice.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <!-- ------------------------------------------------------------ الحالة -->
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('newsAdmin.title') }}</h2>
        <p class="m-0 mt-1 text-caption text-mute">{{ t('newsAdmin.hint') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong"
        @click="refresh()"
      >
        <iconify-icon icon="mdi:refresh" aria-hidden="true" />
        {{ t('admin.storage.refresh') }}
      </button>
    </header>

    <div class="grid gap-3 sm:grid-cols-4">
      <div class="rounded-xl border border-card-border bg-card px-4 py-3">
        <p class="m-0 text-caption text-mute">{{ t('newsAdmin.source') }}</p>
        <p class="m-0 font-semibold" :class="stale ? 'text-gold' : 'text-accent-text'">
          {{ stale ? t('newsAdmin.sourceStale') : t('newsAdmin.sourceOk') }}
        </p>
        <p v-if="updated" class="m-0 text-caption text-dim">{{ t('news.updated', { when: updated }) }}</p>
        <p v-if="lastError" dir="ltr" class="m-0 truncate text-caption text-down" :title="lastError">{{ lastError }}</p>
      </div>
      <div class="rounded-xl border border-card-border bg-card px-4 py-3">
        <p class="m-0 text-caption text-mute">{{ t('newsAdmin.fetched') }}</p>
        <p class="m-0 font-semibold text-strong text-lg tabular-nums">{{ items.length }}</p>
      </div>
      <div class="rounded-xl border border-card-border bg-card px-4 py-3">
        <p class="m-0 text-caption text-mute">{{ t('newsAdmin.airing') }}</p>
        <p class="m-0 font-semibold text-strong text-lg tabular-nums">{{ airing.length }}</p>
      </div>
      <div class="rounded-xl border border-card-border bg-card px-4 py-3">
        <p class="m-0 text-caption text-mute">{{ t('newsAdmin.slot') }}</p>
        <p class="m-0 font-semibold text-strong text-lg tabular-nums">
          {{ t('newsAdmin.seconds', { n: slotSeconds }) }}
        </p>
      </div>
    </div>

    <p
      v-if="notice"
      :role="notice.ok ? 'status' : 'alert'"
      class="m-0 rounded-lg px-4 py-2.5 text-sm font-medium"
      :class="notice.ok ? 'bg-accent/[0.08] text-accent-text' : 'bg-down/10 text-down'"
    >{{ notice.text }}</p>

    <!-- ---------------------------------------------------------- التحكم -->
    <form class="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-5" @submit.prevent="saveSettings">
      <h3 class="m-0 font-semibold text-strong">{{ t('newsAdmin.controls') }}</h3>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="flex items-center justify-between gap-3 text-sm font-semibold text-strong">
          <span>{{ t('newsAdmin.enabled') }}</span>
          <input v-model="form.enabled" type="checkbox" class="size-5 accent-[var(--color-accent)]" />
        </label>
        <label class="flex items-center justify-between gap-3 text-sm font-semibold text-strong">
          <span>{{ t('newsAdmin.chime') }}</span>
          <input v-model="form.chimeOn" type="checkbox" class="size-5 accent-[var(--color-accent)]" />
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">
            {{ t('newsAdmin.slide') }} · <span class="tabular-nums text-strong">{{ form.slide }}{{ t('newsAdmin.s') }}</span>
          </span>
          <input v-model.number="form.slide" type="range" min="4" max="30" step="1" class="accent-[var(--color-accent)]" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">
            {{ t('newsAdmin.repeats') }} · <span class="tabular-nums text-strong">{{ form.repeats }}</span>
          </span>
          <input v-model.number="form.repeats" type="range" min="1" max="6" step="1" class="accent-[var(--color-accent)]" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">
            {{ t('newsAdmin.gap') }} · <span class="tabular-nums text-strong">{{ form.gap }}{{ t('newsAdmin.min') }}</span>
          </span>
          <input v-model.number="form.gap" type="range" min="1" max="30" step="1" class="accent-[var(--color-accent)]" />
        </label>
      </div>

      <div class="grid items-end gap-4 md:grid-cols-3">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('newsAdmin.sound') }}</span>
          <select
            v-model="form.soundId"
            class="w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong"
          >
            <option value="">{{ t('newsAdmin.builtIn') }}</option>
            <option v-for="s in sounds" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">
            {{ t('newsAdmin.volume') }} · <span class="tabular-nums text-strong">{{ form.volume }}%</span>
          </span>
          <input v-model.number="form.volume" type="range" min="0" max="100" step="5" class="accent-[var(--color-accent)]" />
        </label>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-card-border px-3 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-strong"
          @click="testSound"
        >
          <iconify-icon icon="mdi:play-circle-outline" aria-hidden="true" />
          {{ t('newsAdmin.test') }}
        </button>
      </div>

      <p class="m-0 text-caption text-dim">{{ t('newsAdmin.soundHint') }}</p>

      <div>
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="busy === 'settings' || isDemo"
        >{{ busy === 'settings' ? t('admin.saving') : t('admin.save') }}</button>
      </div>
    </form>

    <!-- ------------------------------------------------------ قائمة الأخبار -->
    <div class="flex flex-col gap-2">
      <h3 class="m-0 font-semibold text-strong">{{ t('newsAdmin.list') }}</h3>
      <p v-if="!items.length" class="m-0 rounded-xl border border-dashed border-card-border px-4 py-8 text-center text-mute">
        {{ t('news.empty') }}
      </p>

      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        <li
          v-for="row in rows"
          :key="row.item.id"
          class="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
          :class="row.hidden ? 'border-down/40 opacity-60' : row.isToday ? 'border-accent/40' : 'border-card-border'"
        >
          <img
            v-if="row.item.thumb || row.item.image"
            :src="row.item.thumb || row.item.image || ''"
            alt=""
            referrerpolicy="no-referrer"
            class="size-12 shrink-0 rounded-lg object-cover bg-avatar"
          />
          <span v-else class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-avatar text-dim">
            <iconify-icon icon="mdi:image-outline" aria-hidden="true" />
          </span>

          <div class="flex min-w-0 flex-1 flex-col">
            <a
              :href="row.item.url"
              target="_blank"
              rel="noopener"
              class="truncate font-semibold text-strong text-sm no-underline hover:underline"
            >{{ row.item.title }}</a>
            <p class="m-0 flex items-center gap-2 text-caption text-mute">
              <span
                v-if="row.isToday && !row.hidden"
                class="rounded-full bg-accent/12 px-2 py-0.5 font-semibold text-accent-text"
              >{{ t('newsAdmin.today') }}</span>
              <span v-if="row.hidden" class="rounded-full bg-down/10 px-2 py-0.5 font-semibold text-down">
                {{ t('newsAdmin.hidden') }}
              </span>
              {{ row.when }}
            </p>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-accent-text disabled:opacity-50"
              :disabled="isDemo || busy !== null || !controlsLoaded"
              @click="run('cast' + row.item.id, () => cast(row.item), t('newsAdmin.casted'))"
            >
              <iconify-icon icon="mdi:bullhorn-variant-outline" aria-hidden="true" />
              {{ t('newsAdmin.castNow') }}
            </button>
            <button
              v-if="!row.hidden"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-down/50 px-3 py-1.5 text-caption font-semibold text-down transition-colors hover:bg-down/10 disabled:opacity-50"
              :disabled="isDemo || busy !== null"
              @click="run('hide' + row.item.id, () => hide(row.item.id, row.item.title), t('newsAdmin.hiddenOk'))"
            >
              <iconify-icon icon="mdi:eye-off-outline" aria-hidden="true" />
              {{ t('newsAdmin.hide') }}
            </button>
            <button
              v-else
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
              :disabled="isDemo || busy !== null"
              @click="run('show' + row.item.id, () => show(row.item.id), t('newsAdmin.shownOk'))"
            >
              <iconify-icon icon="mdi:eye-outline" aria-hidden="true" />
              {{ t('newsAdmin.show') }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

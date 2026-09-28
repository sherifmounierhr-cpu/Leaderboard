import { computed, getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * مين يملك الشاشة دلوقتي.
 *
 * فيه خمس شاشات بتغطّي اللوحة بالكامل، وكل واحدة بتظهر لما يحصل حاجة خاصة
 * بيها. قبل كده كل واحدة كانت بتسأل عن **بعض** التانيين بالاسم — تنبيه السوق
 * بيستنى الاحتفال والخبر العاجل، والبثّ بيستنى الاحتفال وبس. يعني الرسائل
 * والبثّ والخبر العاجل كانوا يقدروا يشتغلوا في نفس اللحظة، وترتيب z-index هو
 * اللي بيقرر مين فوق — مش منطق. وكل واحدة بتشغّل مؤقتها وصوتها على حدة، فيطلع
 * رنّتين مع بعض وشاشة محجوبة بشاشة تانية.
 *
 * دلوقتي الترتيب مكتوب في مكان واحد. كل شاشة بتقول «أنا عايزة أظهر»، وواحدة
 * بس بتاخد الدور: الأعلى في `OVERLAY_ORDER`. اللي تحتها بتفضل «عايزة» من غير
 * ما تظهر، فلما اللي فوقها تخلص بتكمّل دورها بدل ما تضيع.
 */

/** من الأعلى أولوية للأدنى. الاحتفال بصفقة فوق كل حاجة — هو الحدث الوحيد عن شخص. */
export const OVERLAY_ORDER = ['celebration', 'announcement', 'cast', 'breaking', 'market'] as const

export type OverlayLayer = (typeof OVERLAY_ORDER)[number]

type Claims = Record<OverlayLayer, boolean>

function emptyClaims(): Claims {
  return Object.fromEntries(OVERLAY_ORDER.map((l) => [l, false])) as Claims
}

const claims = ref<Claims>(emptyClaims())

/** الشاشة صاحبة الدور دلوقتي، أو null لو مفيش ولا واحدة طالبة. */
export const activeOverlay = computed<OverlayLayer | null>(
  () => OVERLAY_ORDER.find((layer) => claims.value[layer]) ?? null,
)

/**
 * تسجّل طلب الشاشة وترجّع هل الدور ليها.
 *
 * `wants` بيبقى true طول ما عندها حاجة تعرضها — حتى وهي مستنية. الفرق بين
 * «عايزة» و«ظاهرة» هو اللي بيخلّي الشاشة المؤجَّلة تكمّل بعدين.
 */
export function useOverlayLayer(layer: OverlayLayer, wants: Ref<boolean>) {
  watch(wants, (value) => { claims.value[layer] = value }, { immediate: true })

  // مكوّن اتشال وهو طالب الشاشة ما يقفلهاش على اللي بعده
  if (getCurrentInstance()) {
    onBeforeUnmount(() => { claims.value[layer] = false })
  }

  return computed(() => activeOverlay.value === layer)
}

/** للاختبارات فقط: يرجّع الطابور لحالته الأولى بين حالة وحالة. */
export function resetOverlayQueue() {
  claims.value = emptyClaims()
}

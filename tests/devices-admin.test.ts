import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

/**
 * تبويب الأجهزة: علامة المتابعة وإعدادات إيميل التنبيه.
 *
 * دي حتة مالهاش اختبار غير كده — محتاجة حساب مسؤول مسجَّل عشان تتفتح بالإيد،
 * والغلط فيها ما بيبانش: زرار بيبعت `p_watch` غلط بيخلّي شاشة تفضل غير
 * متابَعة وإنت فاكرها متابَعة، لحد أول ليلة تقع فيها من غير إيميل.
 */

// ------------------------------------------------------------ البدائل
type RpcResult = { data: unknown; error: { message: string } | null }
const rpc = vi.fn<(...args: unknown[]) => Promise<RpcResult>>(async () => ({ data: null, error: null }))
const devicesData = ref<unknown[]>([])

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...(args as [])),
    from: () => ({
      select: () => ({
        order: async () => ({ data: devicesData.value, error: null }),
      }),
    }),
  },
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ isDemo: ref(false) }),
}))

const boardSettings = ref({ alerts_enabled: true, alert_email: 'ops@everest.test', alert_after_min: 20 })
vi.mock('@/composables/useBoardMedia', () => ({
  useBoardMedia: () => ({ settings: boardSettings }),
}))

const device = (over: Record<string, unknown> = {}) => ({
  id: 'dev-1',
  label: 'شاشة الاستقبال',
  user_email: 'screen@everest.test',
  user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140',
  screen: '1920x1080',
  view: 'teams',
  kiosk: true,
  first_seen: new Date().toISOString(),
  last_seen: new Date().toISOString(),
  revoked_at: null,
  watch: false,
  alerted_at: null,
  ...over,
})

async function render() {
  const { i18n } = await import('@/i18n')
  // اللوحة عربية أولاً، لكن اللغة الافتراضية بتتقرا من الرابط — وهو فاضي هنا
  i18n.global.locale.value = 'ar'
  const { default: DevicesAdmin } = await import('@/components/admin/DevicesAdmin.vue')
  const wrapper = mount(DevicesAdmin, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  rpc.mockClear()
  rpc.mockResolvedValue({ data: null, error: null })
  devicesData.value = [device()]
  boardSettings.value = { alerts_enabled: true, alert_email: 'ops@everest.test', alert_after_min: 20 }
})

// ------------------------------------------------------------ الاختبارات
describe('علامة المتابعة', () => {
  it('الضغط على شاشة غير متابَعة بيشغّل المتابعة', async () => {
    const w = await render()
    await w.find('button[aria-pressed]').trigger('click')
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith('lb_admin_set_device_watch', { p_id: 'dev-1', p_watch: true })
  })

  it('الضغط على شاشة متابَعة بيشيل المتابعة', async () => {
    devicesData.value = [device({ watch: true })]
    const w = await render()
    await w.find('button[aria-pressed]').trigger('click')
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith('lb_admin_set_device_watch', { p_id: 'dev-1', p_watch: false })
  })

  it('الزرار بيقول حالته لقارئ الشاشة', async () => {
    devicesData.value = [device({ watch: true })]
    const w = await render()
    expect(w.find('button[aria-pressed]').attributes('aria-pressed')).toBe('true')
  })

  it('شاشة مقطوعة ما تتابَعش', async () => {
    devicesData.value = [device({ revoked_at: new Date().toISOString() })]
    const w = await render()
    expect(w.find('button[aria-pressed]').attributes('disabled')).toBeDefined()
  })
})

describe('شارة الحالة', () => {
  it('«تحت المتابعة» بتظهر للشاشة المتابَعة الساكنة', async () => {
    devicesData.value = [device({ watch: true })]
    const w = await render()
    expect(w.text()).toContain('تحت المتابعة')
    expect(w.text()).not.toContain('اتبعت تنبيه')
  })

  it('«اتبعت تنبيه» بتظهر لما يكون التنبيه اتبعت فعلاً', async () => {
    devicesData.value = [device({ watch: true, alerted_at: new Date().toISOString() })]
    const w = await render()
    expect(w.text()).toContain('اتبعت تنبيه')
  })

  it('مفيش شارة لشاشة مش متابَعة', async () => {
    const w = await render()
    // الفحص على أيقونة الشارة نفسها: نص العدّاد فيه نفس الكلمات
    expect(w.find('iconify-icon[icon="mdi:bell-ring-outline"]').exists()).toBe(false)
    expect(w.find('iconify-icon[icon="mdi:bell-alert"]').exists()).toBe(false)
  })

  it('العدّاد بيحسب الشاشات المتابَعة غير المقطوعة', async () => {
    devicesData.value = [
      device({ id: 'a', watch: true }),
      device({ id: 'b', watch: true, revoked_at: new Date().toISOString() }),
      device({ id: 'c', watch: false }),
    ]
    const w = await render()
    expect(w.text()).toContain('تحت المتابعة: 1')
  })
})

describe('إعدادات الإيميل', () => {
  it('النموذج بيتملّي من الإعدادات المحفوظة', async () => {
    const w = await render()
    expect((w.find('input[type=email]').element as HTMLInputElement).value).toBe('ops@everest.test')
    expect((w.find('input[type=number]').element as HTMLInputElement).value).toBe('20')
    expect((w.find('input[type=checkbox]').element as HTMLInputElement).checked).toBe(true)
  })

  it('الحفظ بيبعت القيم زي ما هي', async () => {
    const w = await render()
    await w.find('input[type=email]').setValue('  sherif@everest.test  ')
    await w.find('input[type=number]').setValue('45')
    await w.find('form').trigger('submit')
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith('lb_admin_save_alert_settings', {
      p_enabled: true,
      // المسافات بتتشال قبل الإرسال
      p_email: 'sherif@everest.test',
      p_after_min: 45,
    })
  })

  it('بريد فاضي بيتبعت null مش نص فاضي', async () => {
    const w = await render()
    await w.find('input[type=email]').setValue('   ')
    await w.find('form').trigger('submit')
    await flushPromises()

    expect(rpc).toHaveBeenCalledWith(
      'lb_admin_save_alert_settings',
      expect.objectContaining({ p_email: null }),
    )
  })

  it('رفض الخادم بيتعرض للمستخدم مش بيتبلع', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'اكتب بريد المتابعة قبل تشغيل التنبيه' } })
    const w = await render()
    await w.find('form').trigger('submit')
    await flushPromises()

    expect(w.text()).toContain('اكتب بريد المتابعة قبل تشغيل التنبيه')
  })
})

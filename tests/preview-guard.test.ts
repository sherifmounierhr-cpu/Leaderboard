import { afterEach, describe, expect, it } from 'vitest'
import { setPreviewReadOnly, supabase } from '../src/lib/supabase'

/** «شوف شاشته»: أي كتابة بتتحجب محلياً من غير ما توصل للشبكة. */
describe('read-only preview guard', () => {
  afterEach(() => setPreviewReadOnly(false))

  it('blocks admin writes, edge functions and uploads while previewing', async () => {
    setPreviewReadOnly(true)
    const rpc = (await supabase.rpc('lb_admin_save_agent', { p_name: 'x' })) as { error: { message: string; code: string } | null }
    expect(rpc.error?.code).toBe('42501')

    const fn = await supabase.functions.invoke('admin-users', { body: { action: 'delete' } })
    expect(fn.error).toBeTruthy()

    const upload = await supabase.storage.from('avatars').upload('users/x.png', new Blob(['x']))
    expect(upload.error).toBeTruthy()
    const remove = await supabase.storage.from('avatars').remove(['users/x.png'])
    expect(remove.error).toBeTruthy()
  })
})

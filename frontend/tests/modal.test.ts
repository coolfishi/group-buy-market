import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import BaseModal from '@/components/BaseModal.vue'

const Host = defineComponent({
  components: { BaseModal },
  setup() {
    const open = ref(false)
    return { open }
  },
  template: `
    <button id="trigger" @click="open = true">打开</button>
    <BaseModal :open="open" title="测试弹窗" @close="open = false">
      <p>内容</p>
      <template #actions>
        <button id="first">取消</button>
        <button id="last" data-autofocus>确认</button>
      </template>
    </BaseModal>`,
})

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('BaseModal', () => {
  it('打开时聚焦、Tab 循环、Esc 关闭并恢复焦点', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const trigger = document.getElementById('trigger') as HTMLButtonElement
    trigger.focus()
    await wrapper.find('#trigger').trigger('click')
    await flush()

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement?.id).toBe('last')

    // Tab 从最后一个回到第一个（关闭按钮）
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭')
    // Shift+Tab 从第一个回到最后一个
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement?.id).toBe('last')

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })

  it('locked 时 Esc 不关闭', async () => {
    const wrapper = mount(BaseModal, { props: { open: true, title: 'x', locked: true }, attachTo: document.body })
    await flush()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})

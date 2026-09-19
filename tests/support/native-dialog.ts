import { afterAll, beforeAll } from 'vitest'

// jsdom has no top layer; browser smoke tests cover native focus trapping.
const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute('open', '') },
  })
})
afterAll(() => {
  if (original) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original)
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal
})

import type { Dispatch, SetStateAction } from 'react'
import type { AiCloudAccountView, AiCloudCheckoutView, AiCloudOrderView } from './AiCloudAccountButton.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export type AccountTab = 'overview' | 'billing' | 'models'
export interface AccountData {
  authenticationOpen: boolean
  account: AiCloudAccountView | undefined
  checkout: AiCloudCheckoutView | undefined
  orders: AiCloudOrderView[]
  activeOrder: AiCloudOrderView | undefined
}
export interface AccountSurfaceSnapshot extends AccountData { target: HTMLElement | null; request: number; tab: AccountTab }

/** Plugin-owned presentation state. Authentication secrets never enter this store. */
export class AccountSurface {
  private value: AccountSurfaceSnapshot = { target: null, request: 0, tab: 'overview', authenticationOpen: false, account: undefined, checkout: undefined, orders: [], activeOrder: undefined }
  private readonly listeners = new Set<() => void>()
  readonly getSnapshot = () => this.value
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(value: AccountSurfaceSnapshot): void {
    this.value = value
    for (const listener of this.listeners) listener()
  }
  update<K extends keyof AccountData>(key: K, update: SetStateAction<AccountData[K]>): void {
    const value = typeof update === 'function' ? (update as (previous: AccountData[K]) => AccountData[K])(this.value[key]) : update
    this.set({ ...this.value, [key]: value })
  }
  open(tab: AccountTab = 'overview'): void { this.set({ ...this.value, request: this.value.request + 1, tab }) }
  attach(target: HTMLElement): () => void {
    this.set({ ...this.value, target })
    return () => { if (this.value.target === target) this.set({ ...this.value, target: null }) }
  }
  dispose(): void { this.listeners.clear(); this.value = { target: null, request: 0, tab: 'overview', authenticationOpen: false, account: undefined, checkout: undefined, orders: [], activeOrder: undefined } }
}

/** Serialize automatic sign-in with the settings shell's other first-run steps. */
export function AccountOnboarding({ surface, useSurface, complete }: PropsRuntime<'settings.onboarding'> & InjectFace<{
  surface: AccountSurface; hooks: { surface: AccountSurface }
}>) {
  const state = useSurface(value => value)
  const entered = useRef(false)
  const shown = useRef(false)
  useEffect(() => {
    if (state.account?.status === 'signedIn') { complete(); return }
    if (!entered.current) { entered.current = true; surface.open(); return }
    if (state.authenticationOpen) shown.current = true
    else if (shown.current) complete()
  }, [state.account?.status, state.authenticationOpen, complete, surface])
  return null
}

/** Settings owns the viewport; the plugin-lifetime controller owns its contents. */
export function AccountSection({ surface }: { surface: AccountSurface }) {
  const cleanup = useRef<(() => void) | undefined>()
  const attach = useCallback((node: HTMLDivElement | null) => {
    cleanup.current?.()
    cleanup.current = node === null ? undefined : surface.attach(node)
  }, [surface])
  return <div ref={attach} style={{ height: '100%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }} />
}

/** React fallback supports standalone embeddings; production state belongs to the plugin instance. */
export function useAccountData<K extends keyof AccountData>(surface: AccountSurface | undefined, snapshot: AccountSurfaceSnapshot | undefined, key: K, initial: AccountData[K]): [AccountData[K], Dispatch<SetStateAction<AccountData[K]>>] {
  const [local, setLocal] = useState(initial)
  const set = useCallback<Dispatch<SetStateAction<AccountData[K]>>>(update => {
    if (surface === undefined) setLocal(update)
    else surface.update(key, update)
  }, [surface, key])
  return [snapshot === undefined ? local : snapshot[key], set]
}

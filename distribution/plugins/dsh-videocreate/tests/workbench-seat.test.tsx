// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorkbenchSeat } from '../src/client/workbench-seat.js'

it('binds the main Session explicitly and releases each reference on switch, clear and unmount', () => {
  let state: any = { byId: { side: { id: 'side', retainedBy: { sidebar: 1 } } } }
  const listeners = new Set<() => void>()
  const releases = new Map<string, ReturnType<typeof vi.fn>>()
  const controller = { retain: vi.fn((id: string, options: any) => {
    expect(options.source).toBe('ohStoryWorkbench')
    const release = vi.fn(); releases.set(id, release)
    return { sessionId: id, release }
  }) }
  const useSessions = (select: any) => select(useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state))
  const Provider = ({ session, empty, children }: any) => session ? <div data-testid="bound" data-session={session.sessionId}>{children}</div> : empty()
  const mounted = render(<WorkbenchSeat {...({ SessionProvider: Provider, renderSlot: () => <span>workspace</span>, useSessions, sessionController: controller, empty: () => <span>empty</span> } as any)} />)
  expect(screen.getByText('empty')).toBeTruthy();expect(controller.retain).not.toHaveBeenCalled()
  const select = (id?: string) => act(() => { state = { byId: { side: { id: 'side', retainedBy: { sidebar: 1 } }, ...(id ? { [id]: { id, retainedBy: { mainView: 1 } } } : {}) } };for (const listener of listeners) listener() })
  select('first');expect(screen.getByTestId('bound').getAttribute('data-session')).toBe('first')
  select('second');expect(releases.get('first')).toHaveBeenCalledOnce();expect(screen.getByTestId('bound').getAttribute('data-session')).toBe('second')
  select();expect(releases.get('second')).toHaveBeenCalledOnce();expect(screen.getByText('empty')).toBeTruthy()
  select('third');mounted.unmount();expect(releases.get('third')).toHaveBeenCalledOnce()
  expect(controller.retain.mock.calls.map(([id]) => id)).toEqual(['first', 'second', 'third'])
})

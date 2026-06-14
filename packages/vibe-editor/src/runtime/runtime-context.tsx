// Provides a single Runtime instance to the component tree and tracks its running
// state so controls can re-render. The instance is also exposed on `window` for
// manual debugging and for integration tests that drive ticks directly.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Runtime } from './runtime'

interface RuntimeContextValue {
  runtime: Runtime
  running: boolean
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null)

declare global {
  var __vibeRuntime: Runtime | undefined
}

export const RuntimeProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  // Lazy state init keeps a single Runtime for the provider's lifetime without
  // mutating a ref during render.
  const [runtime] = useState(() => new Runtime())
  const [running, setRunning] = useState(runtime.running)

  useEffect(() => runtime.onRunningChange(setRunning), [runtime])

  // Expose for debugging / tests, and clean up on unmount.
  useEffect(() => {
    globalThis.__vibeRuntime = runtime
    return () => {
      if (globalThis.__vibeRuntime === runtime) globalThis.__vibeRuntime = undefined
    }
  }, [runtime])

  return <RuntimeContext.Provider value={{ runtime, running }}>{children}</RuntimeContext.Provider>
}

export const useRuntime = (): RuntimeContextValue => {
  const value = useContext(RuntimeContext)
  if (!value) throw new Error('useRuntime must be used within a RuntimeProvider')
  return value
}

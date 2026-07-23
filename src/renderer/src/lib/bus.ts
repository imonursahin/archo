type Handler<T = any> = (payload: T) => void

const listeners = new Map<string, Set<Handler>>()

export const bus = {
  on<T = any>(event: string, handler: Handler<T>): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(handler as Handler)
    return () => listeners.get(event)?.delete(handler as Handler)
  },
  emit<T = any>(event: string, payload: T): void {
    listeners.get(event)?.forEach((h) => h(payload))
  }
}

export interface OpenTermRequest {
  name: string
  cwd: string
  command: string
}

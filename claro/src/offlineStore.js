import { useState, useEffect, useCallback } from 'react'

// ── Storage keys ───────────────────────────────────────────────────────────────
const DOCS_KEY  = 'claro_docs_v1'
const QUEUE_KEY = 'claro_queue_v1'

// ── Document persistence ───────────────────────────────────────────────────────
export function loadDocs(fallback) {
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function saveDocs(docs) {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs))
  } catch {
    // Quota exceeded — silently continue; in-memory state is still correct
  }
}

// ── Action queue ───────────────────────────────────────────────────────────────
// Each entry: { _id, _ts, type, payload }
// Types: SAVE_DOC | DELETE_DOC | TOGGLE_STEP | MARK_DONE

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function enqueue(type, payload) {
  try {
    const q = readQueue()
    // Deduplicate TOGGLE_STEP by docId+stepId — only keep the latest intent
    const filtered = type === 'TOGGLE_STEP'
      ? q.filter(a => !(a.type === 'TOGGLE_STEP' && a.payload.docId === payload.docId && a.payload.stepId === payload.stepId))
      : q
    filtered.push({
      _id:  `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      _ts:  Date.now(),
      type,
      payload,
    })
    localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered))
  } catch {}
}

function clearQueue() {
  localStorage.removeItem(QUEUE_KEY)
}

// ── Connectivity hook ──────────────────────────────────────────────────────────
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up   = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online',  up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

// ── Sync engine ────────────────────────────────────────────────────────────────
// Returns { online, syncing, queueLen, lastSynced, bumpQueue }
// bumpQueue() must be called after every enqueue() so the engine notices.
//
// Production upgrade path: replace the setTimeout inside the flush effect with
// real fetch() calls keyed on action.type. The rest of the contract stays the same.

export function useSyncEngine() {
  const online              = useOnlineStatus()
  const [syncing,  setSyncing]  = useState(false)
  const [queueLen, setQueueLen] = useState(() => readQueue().length)
  const [lastSynced, setLastSynced] = useState(null)

  // Call after every enqueue() to trigger a re-check
  const bumpQueue = useCallback(() => setQueueLen(readQueue().length), [])

  useEffect(() => {
    if (!online || queueLen === 0 || syncing) return

    setSyncing(true)

    // ── Replace this block with real API calls in production ──────────────────
    const queue = readQueue()
    const simulatedNetworkMs = Math.min(600 + queue.length * 150, 2000)
    const timer = setTimeout(() => {
      clearQueue()
      setQueueLen(0)
      setSyncing(false)
      setLastSynced(Date.now())
    }, simulatedNetworkMs)
    // ─────────────────────────────────────────────────────────────────────────

    return () => clearTimeout(timer)
  }, [online, queueLen, syncing])

  return { online, syncing, queueLen, lastSynced, bumpQueue }
}

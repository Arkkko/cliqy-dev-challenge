'use client'

import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { QueueItem, MessageStatus, MessageCategory } from '@/types'

const SEED_ITEMS: QueueItem[] = [
  {
    id: '1',
    message: 'Dzień dobry, chciałbym zamówić 50 sztuk produktu X. Czy możliwy jest rabat przy takiej ilości?',
    company: 'Sklep meblowy Premium',
    category: 'zamówienie',
    priority: 'high',
    draft_reply:
      'Dzień dobry! Dziękujemy za zainteresowanie naszą ofertą. Przy zamówieniu 50 sztuk produktu X przysługuje rabat 15%. Czy mogę poprosić o dane do wyceny?',
    confidence: 0.94,
    status: 'pending',
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    message: 'Kiedy przyjedzie moja paczka? Zamówiłam tydzień temu i nic.',
    company: 'Sklep meblowy Premium',
    category: 'reklamacja',
    priority: 'high',
    draft_reply:
      'Przepraszamy za niedogodności. Proszę o numer zamówienia — sprawdzimy status wysyłki i wrócimy do Pani w ciągu 2 godzin.',
    confidence: 0.91,
    status: 'pending',
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: '3',
    message: 'Jakie są godziny otwarcia w weekend?',
    company: 'Sklep meblowy Premium',
    category: 'pytanie',
    priority: 'low',
    draft_reply: 'Jesteśmy otwarci w soboty w godz. 10:00–18:00. W niedziele sklep jest nieczynny.',
    confidence: 0.98,
    status: 'pending',
    created_at: new Date(Date.now() - 300_000).toISOString(),
  },
]

const CATEGORY_STYLES: Record<MessageCategory, string> = {
  zamówienie: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40',
  pytanie: 'bg-blue-900/40 text-blue-400 border border-blue-700/40',
  reklamacja: 'bg-red-900/40 text-red-400 border border-red-700/40',
  spam: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-zinc-500',
}

type CategoryFilter = MessageCategory | 'all'

const FILTERS: readonly CategoryFilter[] = ['all', 'zamówienie', 'pytanie', 'reklamacja', 'spam']

interface QueueStats {
  pending: number
  approved: number
  rejected: number
}

interface StatTile {
  status: MessageStatus
  label: string
  value: number
  accent: string
}

/**
 * Aggregates queue items into per-status counters.
 *
 * @param items - The queue items to summarise.
 * @returns A {@link QueueStats} object with counts for every status.
 */
const computeStats = (items: QueueItem[]): QueueStats =>
  items.reduce<QueueStats>(
    (acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }),
    { pending: 0, approved: 0, rejected: 0 },
  )

/**
 * Live statistics panel rendering one tile per message status.
 *
 * @param props - Component props.
 * @param props.stats - The current queue statistics to display.
 * @returns A row of tiles showing pending, approved, and rejected counts.
 */
function StatsPanel({ stats }: { stats: QueueStats }) {
  const tiles: readonly StatTile[] = [
    { status: 'pending', label: 'Oczekujące', value: stats.pending, accent: 'text-amber-400' },
    { status: 'approved', label: 'Zatwierdzone', value: stats.approved, accent: 'text-emerald-400' },
    { status: 'rejected', label: 'Odrzucone', value: stats.rejected, accent: 'text-red-400' },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {tiles.map((tile) => (
        <div
          key={tile.status}
          className="rounded-xl border p-4 flex flex-col gap-1"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <span className="text-xs uppercase tracking-wider text-zinc-500">{tile.label}</span>
          <span className={`text-2xl font-bold tabular-nums ${tile.accent}`}>{tile.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Verification queue page.
 *
 * Renders the list of AI-classified customer messages and lets a human
 * reviewer approve, reject, or edit each generated draft before approval.
 * All state is held locally with React hooks; there are no external
 * dependencies. The visible list is derived from the selected category
 * filter and recomputed only when its inputs change.
 *
 * @returns The interactive verification queue UI.
 */
export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>(SEED_ITEMS)
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<string>('')

  const visible = useMemo<QueueItem[]>(
    () => (filter === 'all' ? items : items.filter((item) => item.category === filter)),
    [items, filter],
  )

  const stats = useMemo<QueueStats>(() => computeStats(items), [items])

  /**
   * Sets the status of a single queue item without mutating existing state.
   *
   * @param id - Identifier of the item to update.
   * @param status - The new status to apply.
   */
  const handleAction = (id: string, status: MessageStatus): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  /**
   * Replaces the draft reply of a single queue item.
   *
   * @param id - Identifier of the item to update.
   * @param newReply - The new draft reply text.
   */
  const handleEditReply = (id: string, newReply: string): void => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, draft_reply: newReply } : item)),
    )
  }

  /**
   * Enters edit mode for an item, seeding the editor with its current draft.
   *
   * @param item - The item whose draft will be edited.
   */
  const startEditing = (item: QueueItem): void => {
    setEditingId(item.id)
    setEditDraft(item.draft_reply)
  }

  /**
   * Leaves edit mode and discards any uncommitted draft changes.
   */
  const cancelEditing = (): void => {
    setEditingId(null)
    setEditDraft('')
  }

  /**
   * Commits the edited draft for the given item and leaves edit mode.
   *
   * @param id - Identifier of the item being edited.
   */
  const saveEditing = (id: string): void => {
    handleEditReply(id, editDraft)
    setEditingId(null)
    setEditDraft('')
  }

  /**
   * Syncs the controlled draft editor with the textarea value.
   *
   * @param event - Change event emitted by the draft textarea.
   */
  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setEditDraft(event.target.value)
  }

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Cliqy Studio</p>
        <h1 className="text-2xl font-bold text-zinc-100">Panel weryfikacji</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          {stats.pending} oczekujących · {items.length} łącznie
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === cat ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {cat === 'all' ? 'Wszystkie' : cat}
          </button>
        ))}
      </div>

      <StatsPanel stats={stats} />

      <div className="flex flex-col gap-4">
        {visible.length === 0 && (
          <p className="text-zinc-500 text-sm py-12 text-center">Brak elementów w tej kategorii.</p>
        )}

        {visible.map((item) => (
          <article
            key={item.id}
            className={`rounded-xl border p-5 transition-opacity ${
              item.status !== 'pending' ? 'opacity-50' : ''
            }`}
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_STYLES[item.category]}`}
                >
                  {item.category}
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[item.priority]}`} />
                  {item.priority}
                </span>
                <span className="text-xs text-zinc-600">{item.company}</span>
              </div>
              <span className="text-xs text-zinc-600 shrink-0" suppressHydrationWarning>
                {new Date(item.created_at).toLocaleTimeString('pl-PL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className="mb-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Wiadomość</p>
              <p className="text-sm text-zinc-200">{item.message}</p>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                Draft AI · {Math.round(item.confidence * 100)}% pewności
              </p>
              {editingId === item.id ? (
                <textarea
                  value={editDraft}
                  onChange={handleDraftChange}
                  rows={4}
                  className="w-full rounded-md bg-zinc-950/60 border border-zinc-700 p-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 resize-y"
                />
              ) : (
                <p className="text-sm text-zinc-300">{item.draft_reply}</p>
              )}
            </div>

            {item.status === 'pending' && editingId === item.id && (
              <div className="flex gap-2">
                <button
                  onClick={() => saveEditing(item.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-800/50 transition-colors"
                >
                  💾 Zapisz
                </button>
                <button
                  onClick={cancelEditing}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
                >
                  ↩️ Anuluj
                </button>
              </div>
            )}

            {item.status === 'pending' && editingId !== item.id && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(item.id, 'approved')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-800/50 transition-colors"
                >
                  ✅ Zatwierdź
                </button>
                <button
                  onClick={() => startEditing(item)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
                >
                  ✏️ Edytuj
                </button>
                <button
                  onClick={() => handleAction(item.id, 'rejected')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/40 text-red-400 border border-red-700/40 hover:bg-red-800/50 transition-colors"
                >
                  ❌ Odrzuć
                </button>
              </div>
            )}

            {item.status !== 'pending' && (
              <p className="text-xs text-zinc-600 italic">
                {item.status === 'approved' ? '✅ Zatwierdzone' : '❌ Odrzucone'}
              </p>
            )}
          </article>
        ))}
      </div>
    </main>
  )
}

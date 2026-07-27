import type { BoardReaders } from './ports.js'

export type BoardCard = {
  id: string
  title: string
  labels: string[]
}

export type Board = {
  cards: BoardCard[]
  unlabeledCount: number
}

export async function loadBoard(tenantId: string, readers: BoardReaders): Promise<Board> {
  const [workItems, labels] = await Promise.all([
    readers.workItems.list(tenantId),
    readers.labels.list(tenantId),
  ])
  const labelNames = new Map(labels.map((label) => [label.id, label.name]))
  const cards = workItems.map((item) => ({
    id: item.id,
    title: item.title,
    labels: item.labelIds.flatMap((id) => {
      const name = labelNames.get(id)
      return name ? [name] : []
    }),
  }))

  return {
    cards,
    unlabeledCount: cards.filter((card) => card.labels.length === 0).length,
  }
}

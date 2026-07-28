export type BoardWorkItem = {
  id: string
  title: string
  labelIds: string[]
}

export type BoardLabel = {
  id: string
  name: string
}

export type BoardReaders = {
  workItems: {
    list(tenantId: string): Promise<BoardWorkItem[]>
  }
  labels: {
    list(tenantId: string): Promise<BoardLabel[]>
  }
}

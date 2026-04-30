import { createContext, useContext, useMemo, useState } from 'react'

type ToastItem = { id: number; title: string }
type ToastContextValue = { toast: (input: { title: string }) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const value = useMemo(
    () => ({
      toast: ({ title }: { title: string }) => {
        const id = Date.now()
        setItems((prev) => [...prev, { id, title }])
        window.setTimeout(() => {
          setItems((prev) => prev.filter((item) => item.id !== id))
        }, 1800)
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-[60] grid gap-2 max-[800px]:left-4 max-[800px]:right-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
            {item.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

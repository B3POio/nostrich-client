/** The app's loading ring, with a name for screen readers. */
export function Spinner({ label, className = '' }: { label: string; className?: string }): React.ReactNode {
  return (
    <div className={`flex justify-center text-text ${className}`} role="status" aria-label={label}>
      <span aria-hidden="true" className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
    </div>
  )
}

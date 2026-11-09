/** "just now", "5m ago", "3h ago", "2d ago" */
export function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export const fileCount = (n) => `${n} file${n === 1 ? '' : 's'}`

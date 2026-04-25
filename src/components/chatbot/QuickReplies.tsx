interface QuickRepliesProps {
  replies: Array<{ label: string; value: string }>
  onSelect: (value: string) => void
}

export default function QuickReplies({ replies, onSelect }: QuickRepliesProps) {
  return (
    <div className="grid grid-cols-1 gap-2 w-full">
      {replies.map((reply) => (
        <button
          key={reply.value}
          onClick={() => onSelect(reply.value)}
          className="btn-secondary text-xs py-2 px-3 text-left"
        >
          {reply.label}
        </button>
      ))}
    </div>
  )
}

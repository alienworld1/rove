export function CorridorErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="py-20 text-center">
      <p role="alert" className="text-sm text-critical">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-11 rounded-sm border border-line-strong px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info"
      >
        Try again
      </button>
    </div>
  );
}

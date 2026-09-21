export function ProviderIcon({ id, name }: { id: string; name: string }) {
  const kind = id.startsWith("opencode")
    ? "opencode"
    : id.startsWith("command")
      ? "command"
      : id.startsWith("muse")
        ? "muse"
        : "generic";
  return (
    <span className="pm-icon" aria-hidden="true" title={name}>
      <svg viewBox="0 0 24 24">
        {kind === "opencode" && (
          <>
            <circle
              cx="12"
              cy="12"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </>
        )}
        {kind === "command" && (
          <>
            <rect
              x="3"
              y="5"
              width="18"
              height="14"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M7 10l3 2-3 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 14h5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        )}
        {kind === "muse" && (
          <path
            d="M5 18V6l7 8 7-8v12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        )}
        {kind === "generic" && (
          <>
            <circle
              cx="8"
              cy="12"
              r="3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="16"
              cy="12"
              r="3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path d="M11 12h2" stroke="currentColor" strokeWidth="2" />
          </>
        )}
      </svg>
    </span>
  );
}

import type { CSSProperties } from "react";

export function Icon({ name, size = 22, style }: { name: string; size?: number; style?: CSSProperties }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    volume: <><path d="m11 5-6 4H2v6h3l6 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    muted: <><path d="m11 5-6 4H2v6h3l6 4ZM16 9l6 6m0-6-6 6" /></>,
    replay: <><path d="M4 9a8 8 0 1 1 0 7M4 3v6h6" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4" /></>,
    kindness: <path d="M12 20S2 14 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 7-10 13-10 13Z" />,
    empathy: <><path d="M7 15a7 7 0 1 1 7 4H8l-5 3 1-7" /><path d="M8 10h.01M16 10h.01M9 14q3 3 6 0" /></>,
    sharing: <><path d="M12 8v13M3 8h18v5H3ZM5 13v8h14v-8M12 8C3 8 5 0 9 3l3 5Zm0 0c9 0 7-8 3-5l-3 5Z" /></>,
    honesty: <><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z" /><path d="m8 12 3 3 5-6" /></>,
    patience: <><path d="M7 2h10M7 22h10M8 2v5l8 10v5M16 2v5L8 17v5M9 6h6M9 18h6" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
    check: <path d="m5 12 4 4L20 5" />,
    book: <><path d="M12 5C8 2 3 3 2 4v15c3-2 7-1 10 1 3-2 7-3 10-1V4c-3-2-7-2-10 1Zm0 0v15" /></>,
    leaf: <><path d="M4 20C-1 7 9 2 21 3c0 12-5 19-17 17Zm0 0L16 8" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" /><circle cx="16" cy="17" r="3" fill="currentColor" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name] ?? paths.spark}</svg>;
}

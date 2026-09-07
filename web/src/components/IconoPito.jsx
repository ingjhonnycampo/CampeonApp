// Silueta simple de un pito de árbitro, dibujada a mano (no depende de que el
// emoji de "silbato" exista o se vea igual en cada dispositivo).
export default function IconoPito({ size = 20, className }) {
  return (
    <svg viewBox="0 0 32 20" width={size} height={size * (20 / 32)} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 10c0-3 2.5-5 5.5-5h9c1 0 2 .4 2.7 1.1l2 2c.5.5 1.3.5 1.8 0l1.6-1.6a1 1 0 0 1 1.7.7v5.6a1 1 0 0 1-1.7.7l-1.6-1.6c-.5-.5-1.3-.5-1.8 0l-2 2c-.7.7-1.7 1.1-2.7 1.1h-9C4.5 15 2 13 2 10Z" fill="currentColor" />
      <circle cx="8.5" cy="10" r="3.1" fill="none" stroke="var(--surface, #fff)" strokeWidth="1.4" />
      <rect x="7.8" y="6.6" width="1.4" height="2.4" rx="0.5" fill="var(--surface, #fff)" />
    </svg>
  );
}

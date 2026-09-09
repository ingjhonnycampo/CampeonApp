// Ícono de sustitución: dos flechas circulares (una verde, una roja), como el
// clásico "intercambio" — el jugador que sale (rojo) y el que entra (verde).
export default function IconoCambio({ size = 22, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 9a8 8 0 0 1 13.86-5.4L20 5.5" stroke="#1fa64a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 2v4h-4" stroke="#1fa64a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15a8 8 0 0 1-13.86 5.4L4 18.5" stroke="#e0342c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 22v-4h4" stroke="#e0342c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

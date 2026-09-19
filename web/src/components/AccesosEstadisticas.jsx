import { Link } from 'react-router-dom';

// Atajos a las pestañas de un campeonato en la vista pública (ver PartidosPublico,
// que lee ?ver= para abrir directo en esa pestaña).
const ACCESOS = [
  { ver: 'posiciones', texto: 'Posiciones' },
  { ver: 'goleadores', texto: 'Goleadores' },
  { ver: 'sanciones', texto: 'Sanciones' }
];

export default function AccesosEstadisticas({ slug }) {
  if (!slug) return null;
  return (
    <div className="publico-accesos">
      {ACCESOS.map((a) => (
        <Link key={a.ver} to={`/en-vivo/${slug}?ver=${a.ver}`} className="publico-acceso">{a.texto}</Link>
      ))}
    </div>
  );
}

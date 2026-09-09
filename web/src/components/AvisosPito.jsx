import IconoPito from './IconoPito';
import IconoCambio from './IconoCambio';

// Franja de avisos flotantes: aparece cuando arranca o termina un tiempo, hay un
// gol, una tarjeta o un cambio, al mismo tiempo que suena el pitido, para que
// quede claro en pantalla qué fue lo que pasó y en qué partido. Un cambio de
// jugador usa un ícono propio (flechas verde/roja) en vez del pito, para
// distinguirlo de un vistazo del resto de los avisos.
export default function AvisosPito({ avisos }) {
  if (avisos.length === 0) return null;
  return (
    <div className="publico-pitido-lista">
      {avisos.map((a) => (
        <div key={a.id} className="publico-pitido-aviso">
          {a.tipo === 'cambio'
            ? <IconoCambio size={18} className="publico-pitido-icono publico-pitido-icono--cambio" />
            : <IconoPito size={22} className="publico-pitido-icono" />}
          <span>
            <strong>{a.texto}</strong>
            <small>{a.equipos}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

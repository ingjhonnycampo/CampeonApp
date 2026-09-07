import IconoPito from './IconoPito';

// Franja de avisos flotantes con el icono del pito: aparece cuando arranca o
// termina un tiempo (o el partido), al mismo tiempo que suena el pitido, para que
// quede claro en pantalla qué fue lo que sonó y en qué partido.
export default function AvisosPito({ avisos }) {
  if (avisos.length === 0) return null;
  return (
    <div className="publico-pitido-lista">
      {avisos.map((a) => (
        <div key={a.id} className="publico-pitido-aviso">
          <IconoPito size={22} className="publico-pitido-icono" />
          <span>
            <strong>{a.texto}</strong>
            <small>{a.equipos}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

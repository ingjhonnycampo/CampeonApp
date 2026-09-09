// Arma el enlace de wa.me a partir de un teléfono guardado en cualquier formato
// (con espacios, guiones, +57, etc.) — si el número quedó en formato local de
// 10 dígitos se le antepone el indicativo de Colombia.
export function enlaceWhatsapp(telefono) {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, '');
  if (!digitos) return null;
  const conIndicativo = digitos.length === 10 ? '57' + digitos : digitos;
  return `https://wa.me/${conIndicativo}`;
}

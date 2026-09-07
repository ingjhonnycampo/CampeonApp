// Convierte un enlace normal de YouTube o Facebook (el que el árbitro/organizador
// pega tal cual desde "Compartir") en la URL que sí se puede meter en un <iframe>.
// Si no reconoce el formato, devuelve null y quien llama puede mostrar un enlace
// normal en vez de intentar embeber cualquier cosa.
export function urlEmbebible(url) {
  if (!url) return null;
  const limpio = url.trim();

  const youtube = limpio.match(
    /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/
  );
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}?autoplay=1&mute=1`;

  if (/facebook\.com|fb\.watch/.test(limpio)) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(limpio)}&autoplay=true`;
  }

  return null;
}

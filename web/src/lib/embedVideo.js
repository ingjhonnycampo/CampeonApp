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

  // Twitch: a diferencia de YouTube/Facebook, el enlace del canal es siempre el
  // mismo (twitch.tv/usuario) — no hace falta generar uno nuevo por partido, solo
  // reusar el del canal. Requiere el parámetro "parent" con el dominio real desde
  // donde se embebe (exigencia de Twitch, no es opcional) — se toma solo.
  const twitchVideo = limpio.match(/twitch\.tv\/videos\/(\d+)/);
  if (twitchVideo) {
    return `https://player.twitch.tv/?video=${twitchVideo[1]}&parent=${window.location.hostname}&autoplay=true&muted=true`;
  }
  const twitchCanal = limpio.match(/twitch\.tv\/([a-zA-Z0-9_]{3,25})(?:$|[/?])/);
  if (twitchCanal && !['videos', 'clip', 'directory', 'settings'].includes(twitchCanal[1])) {
    return `https://player.twitch.tv/?channel=${twitchCanal[1]}&parent=${window.location.hostname}&autoplay=true&muted=true`;
  }

  return null;
}

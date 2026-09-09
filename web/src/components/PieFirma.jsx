import IconoWhatsapp from './IconoWhatsapp';

export default function PieFirma() {
  return (
    <footer className="pie-firma">
      <div>
        ¿Dudas? Escríbenos al{' '}
        <a href="https://wa.me/573169136206" target="_blank" rel="noreferrer" className="pie-firma-whatsapp">
          <IconoWhatsapp className="pie-firma-whatsapp-icono" /> 316 913 6206
        </a>
      </div>
      <div>Designed by Ing. Jhonny Campo Herrera</div>
    </footer>
  );
}

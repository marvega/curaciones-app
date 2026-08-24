import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Info, User, LifeBuoy } from 'lucide-react';

const SECTIONS: { id: string; n: string; label: string }[] = [
  { id: 'intro', n: '·', label: 'Introducción' },
  { id: 'ingresar', n: '1', label: 'Ingresar al sistema' },
  { id: 'panel', n: '2', label: 'El Panel principal' },
  { id: 'pacientes', n: '3', label: 'Pacientes' },
  { id: 'curacion', n: '4', label: 'Registrar una curación' },
  { id: 'citas', n: '5', label: 'Citas y Agenda' },
  { id: 'reportes', n: '6', label: 'Reportes' },
  { id: 'inventario', n: '7', label: 'Inventario de insumos' },
  { id: 'cuenta', n: '8', label: 'Mi cuenta y seguridad' },
  { id: 'faq', n: '?', label: 'Preguntas frecuentes' },
];

const IMG = '/manual';

function Frame({ src, alt, url, caption }: { src: string; alt: string; url: string; caption: React.ReactNode }) {
  return (
    <figure className="m-fig">
      <div className="m-frame">
        <div className="m-bar">
          <i style={{ background: '#f87171' }} />
          <i style={{ background: '#fbbf24' }} />
          <i style={{ background: '#34d399' }} />
          <span className="m-u">{url}</span>
        </div>
        <img src={`${IMG}/${src}`} alt={alt} loading="lazy" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default function HelpPage() {
  const [active, setActive] = useState('intro');

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!('IntersectionObserver' in window) || els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="cur-manual">
      <style>{manualCss}</style>

      <div className="m-shell">
        <article className="m-main">
          {/* Cover */}
          <header className="m-cover">
            <span className="m-kicker">Guía práctica · Personal clínico</span>
            <h1 className="m-title">Cómo usar Curaciones en el día a día</h1>
            <p className="m-lede">
              Todo lo que necesitas para atender pacientes, registrar curaciones, agendar citas y
              controlar el inventario de insumos — paso a paso y con imágenes de la aplicación.
            </p>
            <dl className="m-meta">
              <div><dt>Dirigido a</dt><dd>Enfermería y personal clínico</dd></div>
              <div><dt>Dónde se usa</dt><dd>Esta misma aplicación</dd></div>
              <div><dt>Requisitos</dt><dd>Tu usuario y contraseña</dd></div>
              <div><dt>Tiempo de lectura</dt><dd>~15 minutos</dd></div>
            </dl>
          </header>

          {/* 0. Intro */}
          <section id="intro" className="m-sec">
            <div className="m-head"><h2>Introducción</h2></div>
            <p className="m-intro">
              Curaciones es la herramienta con la que el equipo lleva el registro clínico de cada
              paciente en tratamiento de heridas: sus datos, el historial de curaciones, las citas, la
              evolución de sus heridas y el stock de insumos del box.
            </p>
            <p>
              No necesitas instalar nada: funciona en el navegador de cualquier computador, tablet o
              teléfono. Ingresas con el usuario y contraseña que te entregó la administración.
            </p>

            <div className="m-cards">
              <div className="m-card"><h4><span className="m-dot" style={{ background: 'var(--m-accent)' }} />Pacientes y curaciones</h4><p>Ficha completa de cada paciente y el registro de cada atención realizada.</p></div>
              <div className="m-card"><h4><span className="m-dot" style={{ background: 'var(--m-ok)' }} />Agenda</h4><p>Citas del día y de la semana, con horarios de atención definidos.</p></div>
              <div className="m-card"><h4><span className="m-dot" style={{ background: 'var(--m-warn)' }} />Inventario</h4><p>Control de lotes, vencimientos, recepción y conteo de insumos.</p></div>
              <div className="m-card"><h4><span className="m-dot" style={{ background: 'var(--m-danger)' }} />Reportes</h4><p>Resúmenes mensuales y trimestrales, descargables en Excel.</p></div>
            </div>

            <div className="m-call tip">
              <span className="m-ic"><Check size={15} /></span>
              <p><strong>Sobre las imágenes de esta guía.</strong> Las pantallas usan un paciente de ejemplo ficticio (<span className="m-ui">Juan Demostración</span>). Los datos de pacientes reales aparecen difuminados a propósito para proteger su privacidad; en la aplicación tú los verás con total nitidez.</p>
            </div>
          </section>

          {/* 1. Ingresar */}
          <section id="ingresar" className="m-sec">
            <div className="m-head"><span className="m-num">1</span><h2>Ingresar al sistema</h2></div>
            <p className="m-intro">El primer paso de cada jornada: identificarte para que el sistema sepa quién realiza cada registro.</p>
            <ol className="m-steps">
              <li>Abre la aplicación en tu navegador.</li>
              <li>Escribe tu <b>Usuario</b> y tu <b>Contraseña</b>.</li>
              <li>Presiona <span className="m-btn">Iniciar sesión</span>. Entrarás directo al Panel principal.</li>
            </ol>
            <Frame src="02-login-filled.jpg" url="curaciones · Iniciar sesión" alt="Pantalla de inicio de sesión con usuario y contraseña"
              caption={<><b>Pantalla de ingreso.</b> Usuario y contraseña; luego “Iniciar sesión”.</>} />
            <div className="m-call warn">
              <span className="m-ic"><AlertTriangle size={15} /></span>
              <p><strong>Tu usuario es personal.</strong> Cada curación, cita o cambio queda registrado a nombre de quien inició sesión. No compartas tu contraseña ni dejes tu sesión abierta en un equipo compartido. Si es tu primer ingreso, cambia la contraseña que te entregaron (ver <a className="m-a" href="#cuenta">Mi cuenta y seguridad</a>).</p>
            </div>
            <div className="m-call tip">
              <span className="m-ic"><Info size={15} /></span>
              <p><strong>¿Olvidaste tu contraseña?</strong> En la pantalla de ingreso usa <span className="m-ui">¿Olvidó su contraseña?</span> para recibir un correo y restablecerla, o pide a la administración que la reinicie.</p>
            </div>
          </section>

          {/* 2. Panel */}
          <section id="panel" className="m-sec">
            <div className="m-head"><span className="m-num">2</span><h2>El Panel principal</h2></div>
            <p className="m-intro">Es lo primero que ves al entrar. Resume el estado del día y te avisa qué pacientes necesitan atención.</p>
            <Frame src="03-dashboard.jpg" url="curaciones · Dashboard" alt="Panel principal con tarjetas de resumen, próximas citas y pacientes pendientes"
              caption={<><b>Panel principal (Dashboard).</b> Resumen del día, próximas citas y alertas de pacientes pendientes.</>} />
            <h3>Qué encontrarás</h3>
            <ul className="m-plain">
              <li><b>Tarjetas de resumen</b> — total de pacientes, cuántas citas próximas hay y a qué hora es la siguiente.</li>
              <li><b>Buscar Paciente</b> — escribe el RUT para saltar directo a su ficha.</li>
              <li><b>Próximas Citas</b> y <b>Citas de hoy</b> — la lista de atenciones agendadas, con su hora y tipo.</li>
              <li><b>Pacientes sin cita agendada</b> — quiénes no tienen próxima atención programada, con los días transcurridos.</li>
              <li><b>Sin atención reciente</b> — pacientes que llevan varios días sin ser atendidos (umbral configurable, por defecto 14 días).</li>
            </ul>
            <div className="m-call tip">
              <span className="m-ic"><Info size={15} /></span>
              <p><strong>La franja amarilla de arriba</strong> resume cuántos pacientes están pendientes. Es tu recordatorio para agendar o retomar tratamientos. Puedes cerrarla con la <span className="m-ui">×</span>; volverá a aparecer mientras haya pendientes.</p>
            </div>
          </section>

          {/* 3. Pacientes */}
          <section id="pacientes" className="m-sec">
            <div className="m-head"><span className="m-num">3</span><h2>Pacientes</h2></div>
            <p className="m-intro">El corazón del sistema. Aquí buscas personas, registras a alguien nuevo y abres su ficha clínica.</p>
            <h3>Ver y buscar pacientes</h3>
            <p>Entra a <b>Pacientes</b> en el menú. Verás la lista completa con RUT, nombre, edad, género y teléfono. Usa el buscador para filtrar por <b>RUT, nombre o teléfono</b>, o el botón <span className="m-btn ghost">Filtros</span> para acotar por estado, género, tipo de curación, rango de fechas o edad.</p>
            <Frame src="04-pacientes-lista.jpg" url="curaciones · Pacientes" alt="Lista de pacientes con RUT, nombre, edad, género y teléfono"
              caption={<><b>Listado de pacientes.</b> Buscador arriba, filtros avanzados y botón “Ver” en cada fila.</>} />
            <Frame src="06-pacientes-filtros.jpg" url="curaciones · Pacientes" alt="Panel de filtros avanzados de pacientes"
              caption={<><b>Filtros avanzados.</b> Combina estado, género, tipo de curación, fechas y edad para encontrar grupos de pacientes.</>} />

            <h3>Registrar un paciente nuevo</h3>
            <div className="m-role"><User size={13} /> Cualquier funcionario con sesión iniciada</div>
            <ol className="m-steps">
              <li>En la lista de Pacientes, presiona <span className="m-btn">Nuevo Paciente</span> (arriba a la derecha).</li>
              <li>Completa los campos obligatorios, marcados con <b>*</b>: <span className="m-ui">RUT</span>, <span className="m-ui">Nombre</span>, <span className="m-ui">Apellido</span>, <span className="m-ui">Fecha de Nacimiento</span> y <span className="m-ui">Género</span>.</li>
              <li>Agrega <span className="m-ui">Teléfono</span> y <span className="m-ui">Dirección</span> si los tienes (opcionales, pero ayudan al contacto).</li>
              <li>Presiona <span className="m-btn">Guardar Paciente</span>. Quedará disponible de inmediato en la lista.</li>
            </ol>
            <Frame src="07-nuevo-paciente.jpg" url="curaciones · Nuevo Paciente" alt="Formulario de nuevo paciente"
              caption={<><b>Formulario de nuevo paciente.</b> Los campos con asterisco son obligatorios.</>} />
            <div className="m-call warn">
              <span className="m-ic"><AlertTriangle size={15} /></span>
              <p><strong>Un RUT, un paciente.</strong> El sistema no permite dos pacientes con el mismo RUT. Si al guardar te avisa que ya existe, búscalo en la lista en lugar de crearlo de nuevo.</p>
            </div>

            <h3>La ficha del paciente</h3>
            <p>Presiona <span className="m-btn ghost">Ver</span> en cualquier paciente para abrir su ficha. Es el centro de operaciones de esa persona: sus datos, sus citas, la evolución de la herida, las fotos, los consentimientos y todo su historial de curaciones.</p>
            <Frame src="08-paciente-detalle.jpg" url="curaciones · Ficha Paciente" alt="Ficha de paciente con datos, citas, evolución de herida e historial de curaciones"
              caption={<><b>Ficha del paciente.</b> Desde aquí registras curaciones, agendas citas y das de alta.</>} />
            <div className="m-cards">
              <div className="m-card"><h4>Datos y acciones</h4><p>Arriba: RUT, edad, contacto y estado (Activo / Alta). Los íconos permiten editar, descargar la ficha en PDF, ver el código QR y eliminar.</p></div>
              <div className="m-card"><h4>Evolución de Herida</h4><p>Un gráfico de la cicatrización. Necesita al menos 2 notas de evolución con medidas para dibujarse.</p></div>
              <div className="m-card"><h4>Registro Fotográfico</h4><p>Fotos de la herida en el tiempo, para comparar avances.</p></div>
              <div className="m-card"><h4>Historial de Curaciones</h4><p>Cada atención registrada, con fecha, tipo y observaciones.</p></div>
            </div>
          </section>

          {/* 4. Curación */}
          <section id="curacion" className="m-sec">
            <div className="m-head"><span className="m-num">4</span><h2>Registrar una curación</h2></div>
            <p className="m-intro">La tarea más frecuente. Cada vez que atiendes a un paciente, dejas registro de la curación realizada.</p>
            <div className="m-role"><User size={13} /> Cualquier funcionario con sesión iniciada</div>
            <ol className="m-steps">
              <li>Abre la ficha del paciente y presiona <span className="m-btn">+ Nueva Curación</span>.</li>
              <li>Elige el <b>Tipo de Curación</b>: <span className="m-ui">Avanzada</span>, <span className="m-ui">Pie Diabético</span> o <span className="m-ui">Úlcera Venosa</span>.</li>
              <li>Confirma la <b>Fecha de Curación</b> (viene con la fecha de hoy) y la <b>Cantidad</b>.</li>
              <li>Si corresponde, agenda la <b>Próxima Cita</b> indicando fecha y hora en el mismo paso.</li>
              <li>Escribe las <b>Observaciones</b> clínicas: estado de la herida, procedimiento y materiales.</li>
              <li>Si el paciente termina su tratamiento, activa <span className="m-ui">Dar de alta al paciente</span>.</li>
              <li>Presiona <span className="m-btn">Registrar Curación</span>. Aparecerá en el historial al instante.</li>
            </ol>
            <Frame src="08b-nueva-curacion.jpg" url="curaciones · Ficha Paciente" alt="Formulario de registrar curación"
              caption={<><b>Registrar curación.</b> Tipo, fecha, cantidad, próxima cita, observaciones y alta en una sola pantalla.</>} />
            <div className="m-call tip">
              <span className="m-ic"><Check size={15} /></span>
              <p><strong>En curaciones de Pie Diabético</strong> puedes registrar si se entregó la <strong>bota de descarga</strong>. Ese dato alimenta luego el reporte trimestral de ayudas técnicas entregadas.</p>
            </div>
            <div className="m-call imp">
              <span className="m-ic"><AlertTriangle size={15} /></span>
              <p><strong>Anota siempre las observaciones.</strong> Son la memoria clínica del paciente: lo que registres hoy es lo que el próximo funcionario leerá para dar continuidad al tratamiento. Sé claro y específico.</p>
            </div>
          </section>

          {/* 5. Citas */}
          <section id="citas" className="m-sec">
            <div className="m-head"><span className="m-num">5</span><h2>Citas y Agenda</h2></div>
            <p className="m-intro">Programa la próxima atención de cada paciente y revisa la carga del día o de la semana.</p>
            <h3>Agendar una cita</h3>
            <ol className="m-steps">
              <li>En la ficha del paciente, presiona <span className="m-btn">Agendar Cita</span>.</li>
              <li>Elige la <b>Fecha</b> y selecciona una <b>Hora</b> entre los horarios disponibles de ese día.</li>
              <li>Presiona <span className="m-btn">Agendar Cita</span>. La cita aparecerá en “Citas Agendadas” y en la Agenda general.</li>
            </ol>
            <Frame src="08c-agendar-cita.jpg" url="curaciones · Ficha Paciente" alt="Formulario para agendar cita con fecha y hora"
              caption={<><b>Agendar cita.</b> Solo se ofrecen horas válidas según el día seleccionado.</>} />
            <div className="m-call warn">
              <span className="m-ic"><AlertTriangle size={15} /></span>
              <p><strong>Cada horario admite un paciente.</strong> Si eliges una hora ya ocupada, el sistema te lo indicará y te mostrará los horarios libres de ese día. Elige otro y vuelve a intentar.</p>
            </div>
            <h3>Revisar la Agenda</h3>
            <p>Entra a <b>Agenda</b> en el menú. Puedes ver las citas por <span className="m-ui">Día</span>, <span className="m-ui">Semana</span> o <span className="m-ui">Mensual</span>, moverte con las flechas o el selector de fecha, y volver al presente con <span className="m-ui">Hoy</span>. Cada cita muestra hora, paciente, RUT y el tipo de atención.</p>
            <Frame src="09-agenda.jpg" url="curaciones · Agenda" alt="Agenda de citas del día con horas, pacientes y tipo de atención"
              caption={<><b>Agenda de citas.</b> Vista por día con todas las atenciones programadas.</>} />
          </section>

          {/* 6. Reportes */}
          <section id="reportes" className="m-sec">
            <div className="m-head"><span className="m-num">6</span><h2>Reportes</h2></div>
            <p className="m-intro">Resúmenes automáticos para rendir cuentas de la producción del box. Se generan en pantalla y se descargan en Excel.</p>
            <h3>Reporte Mensual</h3>
            <ol className="m-steps">
              <li>Entra a <b>Reporte Mensual</b> y elige <b>Año</b> y <b>Mes</b>.</li>
              <li>Presiona <span className="m-btn">Generar Reporte</span>.</li>
              <li>Revisa los totales por tipo de curación y el gráfico. Usa <span className="m-btn ok">Descargar Excel</span> si necesitas la planilla.</li>
            </ol>
            <Frame src="10-reporte-mensual.jpg" url="curaciones · Reporte Mensual" alt="Reporte mensual con totales por tipo de curación y gráfico"
              caption={<><b>Reporte Mensual.</b> Curaciones del mes por tipo, con total general y gráfico.</>} />
            <h3>Reporte de Pie Diabético</h3>
            <p>Un reporte trimestral orientado al programa de pie diabético. Filtra por <b>Año</b>, <b>Trimestre</b>, <b>Género</b> y <b>Grupo Etáreo</b>, y muestra los pacientes únicos atendidos, las botas de descarga entregadas y la distribución por género.</p>
            <Frame src="11-reporte-pie-diabetico.jpg" url="curaciones · Reporte Pie Diabético" alt="Reporte trimestral de pie diabético con pacientes únicos, botas entregadas y gráfico por género"
              caption={<><b>Reporte de Pie Diabético.</b> Pacientes únicos, ayudas técnicas entregadas y desglose por género.</>} />
          </section>

          {/* 7. Inventario */}
          <section id="inventario" className="m-sec">
            <div className="m-head"><span className="m-num">7</span><h2>Inventario de insumos</h2></div>
            <p className="m-intro">Controla el stock del box por lotes: qué hay, cuánto queda y qué está por vencer.</p>
            <h3>Ver el inventario</h3>
            <p>Entra a <b>Inventario</b>. Verás cada lote con su producto, código de lote, fecha de vencimiento y stock. Los lotes vencidos se marcan con una etiqueta <span className="m-btn danger">Vencido</span>. Usa el buscador para encontrar un producto puntual.</p>
            <Frame src="12-inventario.jpg" url="curaciones · Inventario" alt="Listado de inventario con producto, lote, vencimiento y stock"
              caption={<><b>Inventario.</b> Lotes activos ordenados por vencimiento; los vencidos quedan marcados.</>} />
            <h3>Recepción de lotes</h3>
            <p>Cuando llegan insumos nuevos, regístralos para que sumen al stock.</p>
            <ol className="m-steps">
              <li>Entra a <b>Recepción</b> (o presiona <span className="m-btn">+ Recepción</span> desde el inventario).</li>
              <li>Busca el <b>Producto</b> por nombre o código AVIS.</li>
              <li>Ingresa el <b>Código de lote</b>, la fecha en que <b>Vence</b>, la fecha de <b>Recibido</b> y la <b>Cantidad</b>.</li>
              <li>Agrega <b>Notas</b> si hace falta y presiona <span className="m-btn">Registrar lote</span>.</li>
            </ol>
            <Frame src="13-recepcion.jpg" url="curaciones · Recepción" alt="Formulario de recepción de lotes de insumos"
              caption={<><b>Recepción de lotes.</b> Registra la entrada de productos con su lote y vencimiento.</>} />
            <h3>Conteo semanal</h3>
            <p>Sirve para cuadrar el stock del sistema con lo que hay físicamente en el box.</p>
            <ol className="m-steps">
              <li>Entra a <b>Conteo</b>. Se abre un conteo en estado <span className="m-ui">Borrador</span> con todos los lotes.</li>
              <li>Recorre la lista y, en <b>Cantidad observada</b>, anota lo que cuentas físicamente de cada lote.</li>
              <li>Al terminar, presiona <span className="m-btn ghost">Cerrar conteo</span> para dejarlo registrado.</li>
            </ol>
            <Frame src="14-conteo.jpg" url="curaciones · Conteo" alt="Pantalla de conteo semanal con stock derivado y cantidad observada por lote"
              caption={<><b>Conteo semanal.</b> Compara el “stock derivado” del sistema con tu conteo físico.</>} />
            <div className="m-call tip">
              <span className="m-ic"><Check size={15} /></span>
              <p><strong>Revisa los vencimientos al hacer el conteo.</strong> Es el mejor momento para retirar del box lo que ya está vencido y avisar de lo que está por vencer.</p>
            </div>
          </section>

          {/* 8. Cuenta */}
          <section id="cuenta" className="m-sec">
            <div className="m-head"><span className="m-num">8</span><h2>Mi cuenta y seguridad</h2></div>
            <p className="m-intro">Desde <b>Mi cuenta</b> gestionas tus sesiones y tu contraseña.</p>
            <h3>Cambiar tu contraseña</h3>
            <ol className="m-steps">
              <li>Entra a <b>Mi cuenta</b> y luego a <b>Cambiar contraseña</b>.</li>
              <li>Escribe tu contraseña actual y la nueva (mínimo 6 caracteres) dos veces.</li>
              <li>Guarda. Por seguridad, se cerrarán tus otras sesiones abiertas.</li>
            </ol>
            <Frame src="16-cambiar-contrasena.jpg" url="curaciones · Cambiar contraseña" alt="Formulario para cambiar la contraseña"
              caption={<><b>Cambiar contraseña.</b> Hazlo en tu primer ingreso y cada vez que sospeches que alguien la conoce.</>} />
            <h3>Tus sesiones activas</h3>
            <p>En <b>Sesiones</b> ves los dispositivos donde tu cuenta está conectada. Si reconoces una sesión que no es tuya, ciérrala desde ahí.</p>
            <Frame src="15-mi-cuenta-sesiones.jpg" url="curaciones · Sesiones" alt="Listado de sesiones activas de la cuenta"
              caption={<><b>Sesiones activas.</b> Controla dónde está conectada tu cuenta y cierra las que no reconozcas.</>} />
            <div className="m-call imp">
              <span className="m-ic"><AlertTriangle size={15} /></span>
              <p><strong>Datos sensibles.</strong> El sistema contiene información clínica protegida. Cierra tu sesión (<span className="m-ui">Cerrar sesión</span>, al final del menú) cuando dejes un computador compartido, y nunca compartas capturas con datos de pacientes reales fuera del equipo.</p>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="m-sec">
            <div className="m-head"><span className="m-num">?</span><h2>Preguntas frecuentes</h2></div>
            <details className="m-faq"><summary>No aparece un paciente que sé que existe</summary><div className="m-faq-b"><p>Prueba a buscarlo por RUT en lugar del nombre (o al revés). Revisa que no esté <b>Dado de Alta</b>: en Pacientes, abre <span className="m-ui">Filtros</span> y en Estado elige “Dado de Alta” o “Todos”.</p></div></details>
            <details className="m-faq"><summary>Me equivoqué al registrar una curación</summary><div className="m-faq-b"><p>Abre la ficha del paciente y revisa el <b>Historial de Curaciones</b>. Desde ahí puedes editar el registro. El sistema guarda el historial de cambios, así que corregir es preferible a dejar un dato erróneo.</p></div></details>
            <details className="m-faq"><summary>No me deja agendar en la hora que quiero</summary><div className="m-faq-b"><p>Esa hora ya está ocupada o no es un horario de atención habilitado para ese día. El sistema te muestra los horarios disponibles: elige uno de esos.</p></div></details>
            <details className="m-faq"><summary>El gráfico de evolución de la herida no aparece</summary><div className="m-faq-b"><p>Necesita al menos <b>dos notas de evolución con medidas</b> para dibujar la tendencia. Registra las medidas en las siguientes curaciones y el gráfico se generará solo.</p></div></details>
            <details className="m-faq"><summary>¿Puedo usar la aplicación desde el teléfono?</summary><div className="m-faq-b"><p>Sí. Funciona en el navegador del teléfono o la tablet. El menú lateral se adapta a la pantalla; búscalo con el botón de menú.</p></div></details>
            <details className="m-faq"><summary>¿Dónde cambio la contraseña que me entregaron?</summary><div className="m-faq-b"><p>En <b>Mi cuenta → Cambiar contraseña</b>. Hazlo en tu primer ingreso. Ver la sección <a className="m-a" href="#cuenta">Mi cuenta y seguridad</a>.</p></div></details>
          </section>
        </article>

        {/* Right-rail TOC */}
        <aside className="m-toc" aria-label="En esta guía">
          <div className="m-toc-inner">
            <div className="m-toc-brand"><LifeBuoy size={14} /> En esta guía</div>
            <nav>
              {SECTIONS.map((s) => (
                <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'active' : ''}>
                  <span className="n">{s.n}</span>{s.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}

const manualCss = `
.cur-manual { --m-ink:#0e1729; --m-ink-soft:#33415a; --m-muted:#64748b; --m-line:#e2e8f0; --m-line-2:#cbd5e1;
  --m-panel:#ffffff; --m-panel-2:#f1f5f9; --m-ground:transparent; --m-accent:#2563eb; --m-accent-strong:#1e40af;
  --m-accent-soft:#e8f0fe; --m-ok:#0d9488; --m-ok-soft:#e2f5f1; --m-warn:#b45309; --m-warn-soft:#fdf2e2;
  --m-danger:#be123c; --m-danger-soft:#fdeaef; --m-mono: ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;
  color: var(--m-ink); }
.dark .cur-manual { --m-ink:#e8eefb; --m-ink-soft:#b7c4dc; --m-muted:#8595b0; --m-line:#22304b; --m-line-2:#2c3d5c;
  --m-panel:#0f1a2e; --m-panel-2:#16233d; --m-accent:#60a5fa; --m-accent-strong:#93c5fd; --m-accent-soft:#14233d;
  --m-ok:#2dd4bf; --m-ok-soft:#10241f; --m-warn:#f0a350; --m-warn-soft:#2a1d0c; --m-danger:#fb7185; --m-danger-soft:#2a1019; }

.cur-manual * { box-sizing: border-box; }
.m-shell { display:grid; grid-template-columns: minmax(0,1fr) 244px; gap: 40px; align-items:start; max-width: 1180px; margin: 0 auto; }
.m-main { min-width:0; max-width: 820px; font-size: 16px; line-height: 1.65; }
.m-main p { margin: 12px 0; color: var(--m-ink); }

.m-cover { padding-bottom: 8px; }
.m-kicker { display:inline-flex; align-items:center; font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--m-accent-strong); background:var(--m-accent-soft); padding:6px 12px; border-radius:999px; }
.m-title { font-size: clamp(28px,4vw,40px); line-height:1.08; letter-spacing:-.02em; margin:18px 0 0; font-weight:800; text-wrap:balance; color:var(--m-ink); }
.m-lede { font-size:18px; color:var(--m-ink-soft); margin:14px 0 0; max-width:60ch; }
.m-meta { display:flex; flex-wrap:wrap; gap:12px 26px; margin:24px 0 0; padding-top:20px; border-top:1px solid var(--m-line); }
.m-meta div { display:flex; flex-direction:column; gap:2px; }
.m-meta dt { font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:var(--m-muted); font-weight:700; }
.m-meta dd { margin:0; font-size:14.5px; font-weight:600; color:var(--m-ink); }

.m-sec { scroll-margin-top: 76px; padding-top: 30px; margin-top: 30px; border-top: 1px solid var(--m-line); }
.m-sec:first-of-type { border-top: 0; }
.m-head { display:flex; align-items:center; gap:13px; margin-bottom:2px; }
.m-num { font-family:var(--m-mono); font-size:14px; font-weight:700; color:#fff; background:var(--m-accent); width:30px; height:30px; border-radius:9px; display:grid; place-items:center; flex:none; }
.m-main h2 { font-size:25px; letter-spacing:-.02em; margin:0; font-weight:800; line-height:1.15; color:var(--m-ink); }
.m-main h3 { font-size:18px; letter-spacing:-.01em; margin:30px 0 6px; font-weight:700; color:var(--m-ink); }
.m-intro { color:var(--m-ink-soft); font-size:17px; margin-top:10px; }
.m-a { color:var(--m-accent-strong); text-decoration:none; border-bottom:1px solid var(--m-line-2); }
.m-a:hover { border-color:var(--m-accent); }

.m-fig { margin: 24px 0; }
.m-frame { border-radius:14px; overflow:hidden; border:1px solid var(--m-line); background:var(--m-panel); box-shadow: 0 1px 2px rgba(15,23,42,.06), 0 10px 26px -14px rgba(15,23,42,.22); }
.dark .m-frame { box-shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 30px -16px rgba(0,0,0,.6); }
.m-bar { display:flex; align-items:center; gap:7px; padding:10px 13px; background:var(--m-panel-2); border-bottom:1px solid var(--m-line); }
.m-bar i { width:11px; height:11px; border-radius:50%; display:block; flex:none; }
.m-bar .m-u { margin-left:8px; font-family:var(--m-mono); font-size:12px; color:var(--m-muted); background:var(--m-panel); padding:4px 12px; border-radius:6px; border:1px solid var(--m-line); flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.m-frame img { display:block; width:100%; height:auto; }
.m-fig figcaption { margin-top:10px; font-size:13.5px; color:var(--m-muted); }
.m-fig figcaption b { color:var(--m-ink-soft); font-weight:700; }

.m-steps { list-style:none; counter-reset:s; padding:0; margin:18px 0; display:flex; flex-direction:column; gap:13px; }
.m-steps > li { counter-increment:s; position:relative; padding:3px 0 3px 44px; color:var(--m-ink); }
.m-steps > li::before { content:counter(s); position:absolute; left:0; top:0; width:29px; height:29px; border-radius:9px; background:var(--m-accent-soft); color:var(--m-accent-strong); display:grid; place-items:center; font-weight:800; font-size:14px; font-family:var(--m-mono); }

.m-plain { margin:14px 0; padding-left:0; list-style:none; display:flex; flex-direction:column; gap:9px; }
.m-plain li { position:relative; padding-left:24px; color:var(--m-ink); }
.m-plain li::before { content:""; position:absolute; left:5px; top:11px; width:7px; height:7px; border-radius:50%; background:var(--m-accent); }

.m-ui { font-family:var(--m-mono); font-size:.84em; background:var(--m-panel-2); color:var(--m-ink); padding:2px 7px; border-radius:6px; border:1px solid var(--m-line); white-space:nowrap; }
.m-btn { font-size:.8em; font-weight:700; background:var(--m-accent); color:#fff; padding:3px 10px; border-radius:7px; white-space:nowrap; }
.m-btn.ghost { background:transparent; color:var(--m-accent-strong); border:1px solid var(--m-line-2); }
.m-btn.ok { background:var(--m-ok); }
.m-btn.danger { background:var(--m-danger); }

.m-call { display:grid; grid-template-columns:auto 1fr; gap:13px; align-items:start; border-radius:12px; padding:14px 16px; margin:18px 0; border:1px solid var(--m-line); background:var(--m-panel); font-size:15px; }
.m-call p { margin:0; color:var(--m-ink); }
.m-call strong { font-weight:700; }
.m-ic { width:26px; height:26px; border-radius:8px; display:grid; place-items:center; flex:none; color:#fff; }
.m-call.tip { background:var(--m-ok-soft); border-color:color-mix(in srgb, var(--m-ok) 30%, transparent); }
.m-call.tip .m-ic { background:var(--m-ok); } .m-call.tip strong { color:var(--m-ok); }
.m-call.warn { background:var(--m-warn-soft); border-color:color-mix(in srgb, var(--m-warn) 32%, transparent); }
.m-call.warn .m-ic { background:var(--m-warn); } .m-call.warn strong { color:var(--m-warn); }
.m-call.imp { background:var(--m-danger-soft); border-color:color-mix(in srgb, var(--m-danger) 32%, transparent); }
.m-call.imp .m-ic { background:var(--m-danger); } .m-call.imp strong { color:var(--m-danger); }

.m-role { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; color:var(--m-muted); background:var(--m-panel-2); border:1px solid var(--m-line); padding:4px 11px; border-radius:999px; margin:6px 0 0; }

.m-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:13px; margin:18px 0; }
.m-card { background:var(--m-panel); border:1px solid var(--m-line); border-radius:12px; padding:15px 16px; }
.m-card h4 { margin:0 0 6px; font-size:15px; font-weight:700; display:flex; align-items:center; gap:9px; color:var(--m-ink); }
.m-card p { margin:0; font-size:14px; color:var(--m-ink-soft); }
.m-dot { width:9px; height:9px; border-radius:50%; flex:none; display:inline-block; }

.m-faq { border:1px solid var(--m-line); border-radius:11px; background:var(--m-panel); margin:10px 0; overflow:hidden; }
.m-faq summary { cursor:pointer; padding:13px 16px; font-weight:700; font-size:15.5px; list-style:none; display:flex; justify-content:space-between; align-items:center; gap:12px; color:var(--m-ink); }
.m-faq summary::-webkit-details-marker { display:none; }
.m-faq summary::after { content:"+"; color:var(--m-accent); font-size:21px; font-weight:400; line-height:1; }
.m-faq[open] summary::after { content:"\\2212"; }
.m-faq-b { padding:0 16px 15px; color:var(--m-ink-soft); font-size:15px; }
.m-faq-b p { margin:0; }

.m-toc { position:sticky; top:66px; align-self:start; }
.m-toc-inner { border:1px solid var(--m-line); border-radius:14px; background:var(--m-panel); padding:14px 12px; }
.m-toc-brand { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--m-muted); padding:2px 8px 12px; }
.m-toc nav { display:flex; flex-direction:column; gap:1px; }
.m-toc a { display:flex; align-items:center; gap:10px; padding:7px 9px; border-radius:8px; color:var(--m-ink-soft); text-decoration:none; font-size:13.5px; font-weight:500; transition:background .15s,color .15s; }
.m-toc a .n { flex:none; width:22px; height:22px; border-radius:6px; display:grid; place-items:center; background:var(--m-panel-2); color:var(--m-muted); font-size:11px; font-weight:700; font-family:var(--m-mono); }
.m-toc a:hover { background:var(--m-panel-2); color:var(--m-ink); }
.m-toc a.active { background:var(--m-accent-soft); color:var(--m-accent-strong); }
.m-toc a.active .n { background:var(--m-accent); color:#fff; }

@media (max-width: 1024px) { .m-toc { display:none; } .m-shell { grid-template-columns: 1fr; } .m-main { max-width:none; } }
@media (prefers-reduced-motion: reduce) { .m-toc a { transition:none; } }
`;

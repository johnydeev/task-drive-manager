import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Configuracion, EdificioFicha } from "@/types";
import { APP_NAME } from "@/lib/app-name";
import { tituloMembrete } from "@/lib/membrete-titulo";
import { BIG_JOHN, registrarFuentes } from "@/lib/pdf-fonts";
import { BLOQUES_VISITA } from "@/lib/visitas-items";

const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  head: "#d9d9d9",
  link: "#1155cc",
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: colors.text, fontFamily: "Helvetica" },
  membrete: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  logo: { width: 64, height: 64, marginRight: 14 },
  nombre: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "center" },
  // Big John dibuja más ancho y con caja más alta que Helvetica al mismo tamaño.
  nombreBigJohn: { fontSize: 17, fontFamily: BIG_JOHN, textAlign: "center" },
  contactoFila: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  email: { fontSize: 8, color: colors.link, fontFamily: "Helvetica-Bold" },
  direccion: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  separador: { borderBottom: `2pt solid ${colors.text}`, marginBottom: 6 },
  titulo: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    backgroundColor: colors.head,
    paddingVertical: 3,
    marginBottom: 8,
  },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  metaTexto: { fontSize: 10, fontFamily: "Helvetica-BoldOblique" },
  fichaFila: { flexDirection: "row", marginBottom: 3 },
  fichaLabel: { width: 150, color: colors.muted },
  fichaValor: { flex: 1, borderBottom: `0.5pt solid ${colors.border}` },
  // Los dos bloques de control van uno al lado del otro: cada tabla es angosta (una X
  // por fila) y a lo ancho desperdiciaban media hoja que ahora usa el informe.
  bloques: { flexDirection: "row", gap: 10, marginTop: 8 },
  bloqueCol: { flex: 1 },
  bloqueTitulo: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    backgroundColor: colors.head,
    textAlign: "center",
    paddingVertical: 2,
  },
  filaItem: { flexDirection: "row", borderBottom: `0.5pt solid ${colors.border}` },
  celdaItem: { padding: 2.5, fontSize: 8 },
  celdaCheck: { padding: 2.5, fontSize: 8, textAlign: "center" },
  encabezado: { backgroundColor: "#f1f5f9", fontFamily: "Helvetica-Bold", fontSize: 6.5 },
  seccion: { marginTop: 12 },
  seccionTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  // Caja generosa: es el espacio que se ganó al poner los bloques de control lado a lado
  // y mandar las fotos a hoja aparte. Crece si el texto es más largo.
  informe: {
    lineHeight: 1.4,
    minHeight: 170,
    border: `0.5pt solid ${colors.border}`,
    padding: 6,
  },
  // Grilla de fotos: 2 por fila, 3 filas = 6 por hoja.
  filaFotos: { flexDirection: "row", gap: 9, marginBottom: 9 },
  foto: { width: 260, height: 232, objectFit: "contain" },
  firmaBloque: { marginTop: 20, alignItems: "flex-end" },
  firmaImg: { width: 120, height: 50, objectFit: "contain" },
  firmaLinea: { width: 160, borderTop: `0.5pt solid ${colors.text}`, marginTop: 2, paddingTop: 2 },
  firmaTexto: { fontSize: 8, textAlign: "center" },
});

// Una vez por proceso, no por render.
const HAY_BIG_JOHN = registrarFuentes();

const ANCHOS = { item: "52%", si: "24%", no: "24%" };

// Marca de check en las columnas Realizada / No realizada.
function marca(valor: string | undefined, esperado: string): string {
  return valor === esperado ? "X" : "";
}

// Parte una lista en grupos de n (filas de fotos y páginas de fotos).
function enGrupos<T>(items: T[], n: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += n) grupos.push(items.slice(i, i + n));
  return grupos;
}

const FOTOS_POR_FILA = 2;
const FOTOS_POR_PAGINA = 6;

interface Props {
  edificio: string;
  fecha: string; // ISO date
  ficha: EdificioFicha;
  controles: Record<string, string>;
  informeGeneral?: string;
  fotos: string[];
  supervisorNombre: string;
  firmaUrl?: string;
  config: Configuracion;
}

export function VisitaPdf({
  edificio,
  fecha,
  ficha,
  controles,
  informeGeneral,
  fotos,
  supervisorNombre,
  firmaUrl,
  config,
}: Props) {
  const [y, m, d] = fecha.slice(0, 10).split("-");
  const fechaAr = `${d}/${m}/${y}`;
  // Big John no tiene acentos: el título va normalizado, y si aun así queda algún carácter
  // fuera de su cobertura se dibuja entero en Helvetica antes que con un hueco.
  const titulo = tituloMembrete(config.membreteNombre || APP_NAME);
  const estiloNombre =
    HAY_BIG_JOHN && titulo.usaBigJohn ? styles.nombreBigJohn : styles.nombre;

  const filasFicha: Array<[string, string]> = [
    ["Seguro - Póliza", ficha.seguroPoliza],
    ["Ascensores", ficha.ascensores],
    ["Fumigación", ficha.fumigacion],
    ["Empresa Matafuego. Venc.", ficha.empresaMatafuegoVenc],
    ["Encargado", ficha.encargado],
    ["Caldera o Termotanque", ficha.calderaTermotanque],
    ["Emp. de Limpieza", ficha.empresaLimpieza],
    ["Horario de trab.", ficha.horarioTrabajo],
    ["Encargado o limpieza y hs de trab.", ficha.encargadoLimpiezaHs],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.membrete}>
          {config.membreteLogoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={config.membreteLogoUrl} style={styles.logo} />
          ) : null}
          <Text style={estiloNombre}>{titulo.texto}</Text>
        </View>
        <View style={styles.contactoFila}>
          <Text style={styles.email}>{config.membreteEmail}</Text>
          <Text style={styles.direccion}>
            {[config.membreteDireccion, config.membreteTelefono].filter(Boolean).join(" ")}
          </Text>
        </View>
        <View style={styles.separador} />

        <Text style={styles.titulo}>VISITA / CONTROL</Text>

        <View style={styles.meta}>
          <Text style={styles.metaTexto}>Consorcio: {edificio}</Text>
          <Text style={styles.metaTexto}>Fecha: {fechaAr}</Text>
        </View>

        {filasFicha.map(([label, valor]) => (
          <View key={label} style={styles.fichaFila}>
            <Text style={styles.fichaLabel}>{label}:</Text>
            <Text style={styles.fichaValor}>{valor || " "}</Text>
          </View>
        ))}

        <View style={styles.bloques}>
          {BLOQUES_VISITA.map((bloque) => (
            <View key={bloque.titulo} style={styles.bloqueCol}>
              <Text style={styles.bloqueTitulo}>{bloque.titulo}</Text>
              <View style={[styles.filaItem, styles.encabezado]}>
                <Text style={[styles.celdaItem, styles.encabezado, { width: ANCHOS.item }]}>
                  Sector
                </Text>
                <Text style={[styles.celdaCheck, styles.encabezado, { width: ANCHOS.si }]}>
                  Realizada
                </Text>
                <Text style={[styles.celdaCheck, styles.encabezado, { width: ANCHOS.no }]}>
                  No realizada
                </Text>
              </View>
              {bloque.items.map((item) => (
                <View key={item.clave} style={styles.filaItem} wrap={false}>
                  <Text style={[styles.celdaItem, { width: ANCHOS.item }]}>{item.label}</Text>
                  <Text style={[styles.celdaCheck, { width: ANCHOS.si }]}>
                    {marca(controles[item.clave], "Realizada")}
                  </Text>
                  <Text style={[styles.celdaCheck, { width: ANCHOS.no }]}>
                    {marca(controles[item.clave], "No realizada")}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>INFORME GENERAL:</Text>
          <Text style={styles.informe}>{informeGeneral || " "}</Text>
        </View>

        {/* La firma cierra la PRIMERA hoja, antes de las fotos: el parte queda completo
            y firmado en una sola página, y las fotos son el anexo. */}
        <View style={styles.firmaBloque}>
          {firmaUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={firmaUrl} style={styles.firmaImg} />
          ) : null}
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaTexto}>{supervisorNombre}</Text>
            <Text style={[styles.firmaTexto, { color: colors.muted }]}>Supervisor</Text>
          </View>
        </View>

        {/* Las fotos SIEMPRE arrancan en hoja nueva (`break`), sobre todo si sobra lugar
            en la primera: así el informe general se queda con todo el espacio libre.
            Van de a 6 por hoja, en filas de 2. */}
        {enGrupos(fotos, FOTOS_POR_PAGINA).map((pagina, i) => (
          <View key={`pagina-fotos-${i}`} break>
            <Text style={styles.seccionTitulo}>
              {i === 0 ? `Fotos (${fotos.length})` : "Fotos (continuación)"}
            </Text>
            {enGrupos(pagina, FOTOS_POR_FILA).map((fila, j) => (
              <View key={`fila-${i}-${j}`} style={styles.filaFotos} wrap={false}>
                {fila.map((url) => (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image key={url} src={url} style={styles.foto} />
                ))}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

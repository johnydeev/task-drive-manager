import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Configuracion, EdificioFicha } from "@/types";
import { APP_NAME } from "@/lib/app-name";
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
  bloqueTitulo: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    backgroundColor: colors.head,
    textAlign: "center",
    paddingVertical: 2,
    marginTop: 10,
  },
  filaItem: { flexDirection: "row", borderBottom: `0.5pt solid ${colors.border}` },
  celdaItem: { padding: 3 },
  encabezado: { backgroundColor: "#f1f5f9", fontFamily: "Helvetica-Bold" },
  seccion: { marginTop: 12 },
  seccionTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  informe: { lineHeight: 1.4, minHeight: 40 },
  fotos: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  foto: { width: 120, height: 120, marginRight: 4, marginBottom: 4 },
  firmaBloque: { marginTop: 20, alignItems: "flex-end" },
  firmaImg: { width: 120, height: 50, objectFit: "contain" },
  firmaLinea: { width: 160, borderTop: `0.5pt solid ${colors.text}`, marginTop: 2, paddingTop: 2 },
  firmaTexto: { fontSize: 8, textAlign: "center" },
});

const ANCHOS = { item: "60%", si: "20%", no: "20%" };

// Marca de check en las columnas Realizada / No realizada.
function marca(valor: string | undefined, esperado: string): string {
  return valor === esperado ? "X" : "";
}

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
          <Text style={styles.nombre}>{(config.membreteNombre || APP_NAME).toUpperCase()}</Text>
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

        {BLOQUES_VISITA.map((bloque) => (
          <View key={bloque.titulo}>
            <Text style={styles.bloqueTitulo}>{bloque.titulo}</Text>
            <View style={[styles.filaItem, styles.encabezado]}>
              <Text style={[styles.celdaItem, { width: ANCHOS.item }]}>Sector</Text>
              <Text style={[styles.celdaItem, { width: ANCHOS.si, textAlign: "center" }]}>
                Realizada
              </Text>
              <Text style={[styles.celdaItem, { width: ANCHOS.no, textAlign: "center" }]}>
                No realizada
              </Text>
            </View>
            {bloque.items.map((item) => (
              <View key={item.clave} style={styles.filaItem} wrap={false}>
                <Text style={[styles.celdaItem, { width: ANCHOS.item }]}>{item.label}</Text>
                <Text style={[styles.celdaItem, { width: ANCHOS.si, textAlign: "center" }]}>
                  {marca(controles[item.clave], "Realizada")}
                </Text>
                <Text style={[styles.celdaItem, { width: ANCHOS.no, textAlign: "center" }]}>
                  {marca(controles[item.clave], "No realizada")}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>INFORME GENERAL:</Text>
          <Text style={styles.informe}>{informeGeneral || " "}</Text>
        </View>

        {fotos.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Fotos ({fotos.length})</Text>
            <View style={styles.fotos}>
              {fotos.slice(0, 9).map((url) => (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image key={url} src={url} style={styles.foto} />
              ))}
            </View>
          </View>
        )}

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
      </Page>
    </Document>
  );
}

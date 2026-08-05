import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Configuracion } from "@/types";
import { APP_NAME } from "@/lib/app-name";
import {
  comentarioMasReciente,
  ETIQUETA_COMENTARIO,
  type GrupoInforme,
  type GrupoTareas,
} from "@/lib/informes";

const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  accent: "#7c92aa",
  head: "#d9d9d9",
  link: "#1155cc",
};

// Fondo por grupo, siguiendo la planilla que la administración usaba a mano.
const FONDO_GRUPO: Record<GrupoInforme, string> = {
  Pendientes: "#fde2e2",
  "En Proceso": "#fdf6c3",
  Realizadas: "#dcfce7",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: colors.text, fontFamily: "Helvetica" },
  // Membrete calcado de la planilla que la administración usaba a mano: logo y nombre
  // centrados arriba, contacto repartido a los costados y una regla gruesa debajo.
  membrete: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  logo: { width: 72, height: 72, marginRight: 16 },
  nombre: { fontSize: 24, fontFamily: "Helvetica-Bold", textAlign: "center" },
  contactoFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
    marginBottom: 4,
  },
  email: { fontSize: 9, color: colors.link, fontFamily: "Helvetica-Bold" },
  direccion: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  separador: { borderBottom: `2pt solid ${colors.text}`, marginBottom: 8 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  metaTexto: { fontSize: 10, fontFamily: "Helvetica-BoldOblique" },
  grupoTitulo: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    backgroundColor: colors.head,
    borderTop: `1pt solid ${colors.border}`,
    borderLeft: `1pt solid ${colors.border}`,
    borderRight: `1pt solid ${colors.border}`,
    paddingVertical: 3,
    marginTop: 12,
  },
  fila: { flexDirection: "row", borderBottom: `1pt solid ${colors.border}` },
  celda: { padding: 4 },
  encabezado: { backgroundColor: colors.head, fontFamily: "Helvetica-Bold" },
  vacio: { fontSize: 9, color: colors.muted, marginBottom: 4 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    fontSize: 8,
    color: colors.muted,
    textAlign: "center",
  },
});

// Anchos de columna (suman 100).
const ANCHOS = { dpto: "14%", prioridad: "10%", informe: "34%", comentario: "26%", estado: "16%" };

interface Props {
  edificio: string;
  desde?: string;
  hasta?: string;
  grupos: GrupoTareas[];
  config: Configuracion;
  generatedAt: string;
}

export function InformeEdificioPdf({ edificio, desde, hasta, grupos, config, generatedAt }: Props) {
  const rango = [desde, hasta].filter(Boolean).join(" al ");
  const conFilas = grupos.filter((g) => g.tareas.length > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.membrete}>
          {config.membreteLogoUrl ? (
            // El <Image> de @react-pdf/renderer no soporta `alt` (no es next/image).
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={config.membreteLogoUrl} style={styles.logo} />
          ) : null}
          <Text style={styles.nombre}>
            {(config.membreteNombre || APP_NAME).toUpperCase()}
          </Text>
        </View>

        <View style={styles.contactoFila}>
          <Text style={styles.email}>{config.membreteEmail}</Text>
          <Text style={styles.direccion}>
            {[config.membreteDireccion, config.membreteTelefono].filter(Boolean).join(" ")}
          </Text>
        </View>
        <View style={styles.separador} />

        <View style={styles.meta}>
          <Text style={styles.metaTexto}>Consorcio: {edificio}</Text>
          {rango ? <Text style={styles.metaTexto}>Período: {rango}</Text> : null}
        </View>

        {conFilas.length === 0 && (
          <Text style={styles.vacio}>No hay tareas registradas para este período.</Text>
        )}

        {conFilas.map(({ grupo, tareas }) => (
          <View key={grupo}>
            <Text style={styles.grupoTitulo}>
              {grupo} ({tareas.length})
            </Text>
            <View style={[styles.fila, styles.encabezado]}>
              <Text style={[styles.celda, { width: ANCHOS.dpto }]}>Dpto</Text>
              <Text style={[styles.celda, { width: ANCHOS.prioridad }]}>Prioridad</Text>
              <Text style={[styles.celda, { width: ANCHOS.informe }]}>Informe</Text>
              <Text style={[styles.celda, { width: ANCHOS.comentario }]}>Comentario</Text>
              <Text style={[styles.celda, { width: ANCHOS.estado }]}>Estado</Text>
            </View>
            {tareas.map((t) => {
              const comentario = comentarioMasReciente(t);
              return (
                <View
                  key={t.rowId}
                  style={[styles.fila, { backgroundColor: FONDO_GRUPO[grupo] }]}
                  wrap={false}
                >
                  <Text style={[styles.celda, { width: ANCHOS.dpto }]}>{t.dpto || "—"}</Text>
                  <Text style={[styles.celda, { width: ANCHOS.prioridad }]}>{t.prioridad}</Text>
                  <Text style={[styles.celda, { width: ANCHOS.informe }]}>{t.informe || "—"}</Text>
                  <Text style={[styles.celda, { width: ANCHOS.comentario }]}>
                    {comentario.origen
                      ? `${ETIQUETA_COMENTARIO[comentario.origen]}: ${comentario.texto}`
                      : "—"}
                  </Text>
                  <Text style={[styles.celda, { width: ANCHOS.estado }]}>{t.estado}</Text>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Generado el {generatedAt} · {config.membreteNombre || APP_NAME}
        </Text>
      </Page>
    </Document>
  );
}

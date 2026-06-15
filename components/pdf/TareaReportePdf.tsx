import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Tarea } from "@/types";

const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  accent: "#7c92aa",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: colors.text, fontFamily: "Helvetica" },
  header: { borderBottom: `2pt solid ${colors.accent}`, paddingBottom: 8, marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: colors.muted, marginTop: 2 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 4, color: colors.accent },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: colors.muted },
  value: { flex: 1 },
  text: { lineHeight: 1.4 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap" },
  thumb: { width: 120, height: 120, marginRight: 4, marginBottom: 4 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: colors.muted,
    textAlign: "center",
  },
});

function thumbFromDriveUrl(url: string): string {
  const m = url.match(/\/file\/d\/([^/]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
}

interface Props {
  tarea: Tarea;
  generatedAt: string;
}

export function TareaReportePdf({ tarea, generatedAt }: Props) {
  const fmtCurrency = (n?: number) => (n != null ? `$${n.toLocaleString("es-AR")}` : "—");
  const fmtDate = (s?: string) => (s ? s.slice(0, 10) : "—");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Tarea</Text>
          <Text style={styles.subtitle}>
            Administración Morinigo · {tarea.edificio}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Objetivo:</Text>
            <Text style={styles.value}>{tarea.objetivo}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Dpto:</Text>
            <Text style={styles.value}>{tarea.parteComun ? "Parte Común" : tarea.dpto}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Estado:</Text>
            <Text style={styles.value}>{tarea.estado}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Prioridad:</Text>
            <Text style={styles.value}>{tarea.prioridad}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Fecha inicio:</Text>
            <Text style={styles.value}>{fmtDate(tarea.fechaInicio)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Fecha estimada:</Text>
            <Text style={styles.value}>{fmtDate(tarea.fechaEstimada)}</Text>
          </View>
          {tarea.fechaRealizado && (
            <View style={styles.row}>
              <Text style={styles.label}>Realizado:</Text>
              <Text style={styles.value}>{fmtDate(tarea.fechaRealizado)}</Text>
            </View>
          )}
          {tarea.proveedor && (
            <View style={styles.row}>
              <Text style={styles.label}>Proveedor:</Text>
              <Text style={styles.value}>{tarea.proveedor}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Presupuesto:</Text>
            <Text style={styles.value}>{fmtCurrency(tarea.presupuesto)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Supervisor:</Text>
            <Text style={styles.value}>{tarea.supervisor}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informe</Text>
          <Text style={styles.text}>{tarea.informe || "—"}</Text>
        </View>

        {(tarea.comentarioEnProceso || tarea.comentarioRealizado) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comentarios</Text>
            {tarea.comentarioEnProceso && (
              <View>
                <Text style={styles.label}>En proceso:</Text>
                <Text style={styles.text}>{tarea.comentarioEnProceso}</Text>
              </View>
            )}
            {tarea.comentarioRealizado && (
              <View style={{ marginTop: 6 }}>
                <Text style={styles.label}>Realizado:</Text>
                <Text style={styles.text}>{tarea.comentarioRealizado}</Text>
              </View>
            )}
          </View>
        )}

        {tarea.imagenes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Imágenes ({tarea.imagenes.length})</Text>
            <View style={styles.imageGrid}>
              {tarea.imagenes.slice(0, 9).map((url) => (
                <Image key={url} src={thumbFromDriveUrl(url)} style={styles.thumb} />
              ))}
            </View>
          </View>
        )}

        {tarea.videos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Videos ({tarea.videos.length})</Text>
            {tarea.videos.map((url) => (
              <Link key={url} src={url}>
                <Text style={{ color: colors.accent }}>{url}</Text>
              </Link>
            ))}
          </View>
        )}

        {tarea.documentos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Documentos adjuntos ({tarea.documentos.length})
            </Text>
            {tarea.documentos.map((url) => (
              <Link key={url} src={url}>
                <Text style={{ color: colors.accent }}>{url}</Text>
              </Link>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          Generado el {generatedAt} · Administración Morinigo
        </Text>
      </Page>
    </Document>
  );
}

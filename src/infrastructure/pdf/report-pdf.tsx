import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/*
 * Document PDF générique, lisible par une personne : titre, puis des sections faites de paires
 * « libellé : valeur », de tableaux, de paragraphes et d'images. Sert au récapitulatif des données
 * d'un compte (droit d'accès) ; le contenu est préparé par la couche application.
 */

export type ReportBlock =
  | { kind: "rows"; rows: [string, string][] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "text"; text: string }
  | { kind: "image"; label: string; src: string };

export interface ReportSection {
  heading: string;
  blocks: ReportBlock[];
}

export interface Report {
  title: string;
  subtitle: string;
  sections: ReportSection[];
}

const mm = (v: number) => (v * 72) / 25.4;

const s = StyleSheet.create({
  page: { paddingTop: mm(18), paddingBottom: mm(20), paddingHorizontal: mm(18), fontFamily: "Helvetica", fontSize: 9.5, lineHeight: 1.4, color: "#111" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, marginBottom: 2 },
  subtitle: { color: "#555", marginBottom: mm(6) },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: mm(5), marginBottom: mm(2), paddingBottom: 2, borderBottomWidth: 0.6, borderBottomColor: "#999" },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: mm(55), color: "#555" },
  value: { flex: 1 },
  text: { marginBottom: 4 },
  table: { marginBottom: mm(3) },
  tr: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#ccc", paddingVertical: 2 },
  th: { flex: 1, fontFamily: "Helvetica-Bold", paddingRight: 4 },
  td: { flex: 1, paddingRight: 4 },
  imageBox: { marginBottom: mm(3) },
  image: { height: mm(16), width: mm(60), objectFit: "contain", objectPosition: "left" },
  footer: { position: "absolute", bottom: mm(10), left: mm(18), right: mm(18), fontSize: 7.5, color: "#777", flexDirection: "row", justifyContent: "space-between" },
});

function Block({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case "rows":
      return (
        <View>
          {block.rows.map(([label, value], i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.value}>{value}</Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View style={s.table}>
          <View style={s.tr} fixed>
            {block.head.map((h, i) => (
              <Text key={i} style={s.th}>
                {h}
              </Text>
            ))}
          </View>
          {block.rows.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              {r.map((c, j) => (
                <Text key={j} style={s.td}>
                  {c}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "text":
      return <Text style={s.text}>{block.text}</Text>;
    case "image":
      return (
        <View style={s.imageBox} wrap={false}>
          <Text style={s.label}>{block.label}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, pas une balise HTML. */}
          <Image src={block.src} style={s.image} />
        </View>
      );
  }
}

export function ReportDocument({ report }: { report: Report }) {
  return (
    <Document title={report.title} language="fr-CH">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{report.title}</Text>
        <Text style={s.subtitle}>{report.subtitle}</Text>
        {report.sections.map((section, i) => (
          <View key={i}>
            <Text style={s.heading} minPresenceAhead={mm(15)}>
              {section.heading}
            </Text>
            {section.blocks.map((b, j) => (
              <Block key={j} block={b} />
            ))}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>{report.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** PDF du récapitulatif (export des données d'un compte). */
export async function renderReportPdf(report: Report): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} />);
}

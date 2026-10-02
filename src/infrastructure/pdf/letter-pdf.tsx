import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { LetterContent } from "@/domain/termination-letter";

const mm = (v: number) => (v * 72) / 25.4;

/**
 * Lettre au format suisse (A4, fenêtre d'enveloppe à droite, SN 010130) :
 * adresse du destinataire à 118 mm du bord gauche et 52 mm du haut.
 */
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.4,
    paddingTop: mm(18),
    paddingBottom: mm(20),
    paddingLeft: mm(25),
    paddingRight: mm(20),
    color: "#111111",
  },
  sender: { fontSize: 9.5, color: "#333333", width: mm(80) },
  window: { position: "absolute", top: mm(48), left: mm(118), width: mm(75) },
  registered: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginBottom: mm(2), textDecoration: "underline" },
  recipientLine: { fontSize: 10.5 },
  placeDate: { marginTop: mm(62), marginBottom: mm(8) },
  subject: { fontFamily: "Helvetica-Bold", marginBottom: mm(6) },
  paragraph: { marginBottom: mm(3.5), textAlign: "justify" },
  table: { marginTop: mm(1), marginBottom: mm(5), borderTop: "0.6pt solid #999999" },
  row: { flexDirection: "row", borderBottom: "0.6pt solid #999999", paddingVertical: mm(1.2) },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  cellName: { width: "45%" },
  cellBirth: { width: "22%" },
  cellPolicy: { width: "33%" },
  signatures: { flexDirection: "row", flexWrap: "wrap", marginTop: mm(18) },
  signature: { width: "50%", paddingRight: mm(6), marginBottom: mm(14) },
  signatureLine: { borderTop: "0.6pt solid #333333", paddingTop: mm(1), fontSize: 9.5 },
  footer: { position: "absolute", bottom: mm(12), left: mm(25), right: mm(20), fontSize: 8, color: "#555555" },
});

export function TerminationLetterDocument({ content }: { content: LetterContent }) {
  const several = content.personsTable.length > 1;
  return (
    <Document title={content.subject} author={content.senderBlock[0]} subject="Résiliation LAMal" creator="LAMal Tracker" language="fr-CH">
      <Page size="A4" style={styles.page}>
        <View style={styles.sender}>
          {content.senderBlock.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>
        <View style={styles.window}>
          <Text style={styles.registered}>{content.mentionRegistered}</Text>
          {content.recipientBlock.map((line, i) => (
            <Text key={i} style={styles.recipientLine}>
              {line}
            </Text>
          ))}
        </View>
        <Text style={styles.placeDate}>{content.placeDate}</Text>
        <Text style={styles.subject}>{content.subject}</Text>
        <Text style={styles.paragraph}>{content.salutation}</Text>
        <Text style={styles.paragraph}>{content.paragraphs[0]}</Text>
        {several && (
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.th, styles.cellName]}>Personne assurée</Text>
              <Text style={[styles.th, styles.cellBirth]}>Date de naissance</Text>
              <Text style={[styles.th, styles.cellPolicy]}>N° de police</Text>
            </View>
            {content.personsTable.map((p) => (
              <View key={p.policyNumber} style={styles.row}>
                <Text style={styles.cellName}>{p.name}</Text>
                <Text style={styles.cellBirth}>{p.birthDate}</Text>
                <Text style={styles.cellPolicy}>{p.policyNumber}</Text>
              </View>
            ))}
          </View>
        )}
        {!several && (
          <Text style={styles.paragraph}>
            Personne assurée : {content.personsTable[0]!.name} (date de naissance : {content.personsTable[0]!.birthDate}), police n°{" "}
            {content.personsTable[0]!.policyNumber}.
          </Text>
        )}
        {content.paragraphs.slice(1).map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
        <Text style={styles.paragraph}>{content.closing}</Text>
        <View style={styles.signatures}>
          {content.signatures.map((name) => (
            <View key={name} style={styles.signature}>
              <Text style={styles.signatureLine}>{name}</Text>
            </View>
          ))}
        </View>
        {content.footerNote ? <Text style={styles.footer}>{content.footerNote}</Text> : null}
      </Page>
    </Document>
  );
}

export async function renderLetterPdf(content: LetterContent): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<TerminationLetterDocument content={content} />);
  return new Uint8Array(buffer);
}

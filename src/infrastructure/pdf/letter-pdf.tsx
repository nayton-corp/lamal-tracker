import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { LetterContent } from "@/domain/letter";

// A4 ; destinataire placé pour une enveloppe C5/C4 à fenêtre à droite (norme suisse).
const mm = (v: number) => (v * 72) / 25.4;

const s = StyleSheet.create({
  page: { paddingTop: mm(20), paddingBottom: mm(20), paddingLeft: mm(22), paddingRight: mm(20), fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.45, color: "#111" },
  sender: { fontSize: 9.5, color: "#333" },
  recipient: { position: "absolute", top: mm(52), left: mm(118), width: mm(80), fontSize: 11 },
  recommended: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4, letterSpacing: 0.5 },
  body: { marginTop: mm(62) },
  date: { marginBottom: mm(10), textAlign: "right" },
  subject: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: mm(7) },
  para: { marginBottom: 8 },
  persons: { marginLeft: 12, marginBottom: 8 },
  person: { marginBottom: 3 },
  lca: { marginBottom: 8, padding: 6, borderLeftWidth: 2, borderLeftColor: "#111" },
  signatures: { flexDirection: "row", flexWrap: "wrap", marginTop: mm(12) },
  signature: { width: mm(72), marginRight: mm(8), marginBottom: mm(6) },
  line: { borderTopWidth: 0.6, borderTopColor: "#555", marginTop: mm(14), paddingTop: 3, fontSize: 9.5 },
  footer: { position: "absolute", bottom: mm(12), left: mm(22), right: mm(20), fontSize: 8, color: "#666" },
});

export function LetterDocument({ content }: { content: LetterContent }) {
  return (
    <Document title={content.subject} author={content.senderLines[0]} language="fr-CH">
      <Page size="A4" style={s.page}>
        <View style={s.sender}>
          {content.senderLines.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
        </View>
        <View style={s.recipient}>
          {content.mailing !== null && <Text style={s.recommended}>{content.mailing ?? "RECOMMANDÉ"}</Text>}
          {content.insurerLines.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
        </View>
        <View style={s.body}>
          <Text style={s.date}>{content.placeAndDate}</Text>
          <Text style={s.subject}>{content.subject}</Text>
          <Text style={s.para}>{content.salutation}</Text>
          {content.paragraphs.map((p, i) =>
            p === "__PERSONS__" ? (
              <View key={i} style={s.persons}>
                {content.personRows.map((r) => (
                  <Text key={r} style={s.person}>
                    • {r}
                  </Text>
                ))}
              </View>
            ) : p === "__EXTRA__" ? (
              <View key={i} style={s.persons}>
                {(content.extraRows ?? []).map((r) => (
                  <Text key={r} style={s.person}>
                    • {r}
                  </Text>
                ))}
              </View>
            ) : (
              <Text key={i} style={s.para}>
                {p}
              </Text>
            ),
          )}
          {content.lcaClause && <Text style={s.lca}>{content.lcaClause}</Text>}
          <Text style={s.para}>{content.closing}</Text>
          <View style={s.signatures} wrap={false}>
            {content.signatures.map((name) => (
              <View key={name} style={s.signature}>
                <Text style={s.line}>{name}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={s.footer} fixed>
          {content.footer}
        </Text>
      </Page>
    </Document>
  );
}

export function renderLetterPdf(content: LetterContent): Promise<Buffer> {
  return renderToBuffer(<LetterDocument content={content} />);
}

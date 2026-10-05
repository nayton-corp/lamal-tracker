import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { EXTRA_ROWS_PLACEHOLDER, PERSONS_PLACEHOLDER, type LetterContent } from "@/domain/letter";

/*
 * Rendu PDF d'un courrier (lettre ou demande d'offre) à partir de son contenu figé, avec les
 * signatures dessinées apposées si elles sont fournies.
 */

// A4 ; destinataire placé pour une enveloppe C5/C4 à fenêtre à droite (norme suisse).
// Mise en page « pingen » : adresse dans la zone lue par Pingen (118 × 60 mm, 85,5 × 25,5 mm),
// zone d'affranchissement vide (116 × 40 mm, 89,5 × 47,5 mm) et coin inférieur gauche libre.
// La mention du recommandé passe alors au-dessus de l'objet : la Poste appose l'étiquette.
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
  signed: { height: mm(14), marginBottom: -mm(14), objectFit: "contain", objectPosition: "left bottom" },
  footer: { position: "absolute", bottom: mm(12), left: mm(22), right: mm(20), fontSize: 8, color: "#666" },
  pingenRecipient: { position: "absolute", top: mm(60.5), left: mm(119), width: mm(82), fontSize: 10, lineHeight: 1.15 },
  pingenMailing: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4, letterSpacing: 0.5 },
  pingenFooter: { bottom: mm(18) },
});

export type LetterLayout = "print" | "pingen";

/** `signed` : signatures dessinées à l'écran, par nom complet (apposées au-dessus de la ligne). */
export function LetterDocument({ content, signed = {}, layout = "print" }: { content: LetterContent; signed?: Record<string, string>; layout?: LetterLayout }) {
  const pingen = layout === "pingen";
  const mailing = content.mailing === null ? null : (content.mailing ?? "RECOMMANDÉ");
  return (
    <Document title={content.subject} author={content.senderLines[0]} language="fr-CH">
      <Page size="A4" style={s.page}>
        <View style={s.sender}>
          {content.senderLines.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
        </View>
        <View style={pingen ? s.pingenRecipient : s.recipient}>
          {!pingen && mailing && <Text style={s.recommended}>{mailing}</Text>}
          {content.insurerLines.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
        </View>
        <View style={s.body}>
          <Text style={s.date}>{content.placeAndDate}</Text>
          {pingen && mailing && <Text style={s.pingenMailing}>{mailing}</Text>}
          <Text style={s.subject}>{content.subject}</Text>
          <Text style={s.para}>{content.salutation}</Text>
          {content.paragraphs.map((p, i) =>
            p === PERSONS_PLACEHOLDER ? (
              <View key={i} style={s.persons}>
                {content.personRows.map((r) => (
                  <Text key={r} style={s.person}>
                    • {r}
                  </Text>
                ))}
              </View>
            ) : p === EXTRA_ROWS_PLACEHOLDER ? (
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
                {/* eslint-disable-next-line jsx-a11y/alt-text -- image PDF, pas de texte alternatif */}
                {signed[name] && <Image src={signed[name]} style={s.signed} />}
                <Text style={s.line}>{name}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={pingen ? [s.footer, s.pingenFooter] : s.footer} fixed>
          {content.footer}
        </Text>
      </Page>
    </Document>
  );
}

/** `signed` : signatures (data URL) par nom complet ; `layout` « pingen » pour l'envoi par Pingen, « print » sinon. */
export function renderLetterPdf(content: LetterContent, signed?: Record<string, string>, layout: LetterLayout = "print"): Promise<Buffer> {
  return renderToBuffer(<LetterDocument content={content} signed={signed} layout={layout} />);
}

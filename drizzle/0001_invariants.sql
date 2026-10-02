-- Invariant : pas de lettre de résiliation sans décision SWITCH ni garde-fou LCA validé.
CREATE TRIGGER termination_letter_line_guard
BEFORE INSERT ON termination_letter_line
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM review_line
  WHERE id = NEW.review_line_id AND decision = 'SWITCH' AND lca_ack_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_LETTER: decision SWITCH et garde-fou LCA requis');
END;
--> statement-breakpoint
-- Une ligne liée à une lettre ne peut plus quitter l'état « changement validé » : supprimer la lettre d'abord.
CREATE TRIGGER review_line_letter_lock
BEFORE UPDATE OF decision, lca_ack_at, chosen_tariff_id ON review_line
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM termination_letter_line WHERE review_line_id = OLD.id)
  AND (NEW.decision IS NOT 'SWITCH' OR NEW.lca_ack_at IS NULL OR NEW.chosen_tariff_id IS NOT OLD.chosen_tariff_id)
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_LETTER_LOCK: supprimer la lettre avant de modifier la décision');
END;
--> statement-breakpoint
-- Un jeu de tarifs actif par année au plus.
CREATE UNIQUE INDEX tariff_dataset_one_active_per_year ON tariff_dataset(year) WHERE status = 'ACTIVE';

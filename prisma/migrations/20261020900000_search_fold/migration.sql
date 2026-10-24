-- SKO-401: one text folding rule for record search, shared by every query. Lower-cases, unifies Arabic letter
-- variants (alef forms, alef maqsura and Arabic yeh to Urdu yeh, Arabic kaf to Urdu kaf, teh marbuta and heh forms to heh) and removes Arabic diacritics and
-- tatweel, so "أحمد", "احمد" and "اَحمد" match. Identifiers are matched separately and never folded this way.
CREATE OR REPLACE FUNCTION search_fold(value text) RETURNS text AS $$
  SELECT regexp_replace(
           translate(lower(coalesce(value, '')), 'أإآٱىيكةۀہھ', 'ااااییکهههه'),
           '[ًٌٍَُِّْٰـ]', '', 'g')
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- SKAI-1730: scope role setup responses to the actor's campus. Additive for data: no rows are changed or removed;
-- existing rows keep their campus_id, and a transferred user gets a new row for the new campus.
CREATE UNIQUE INDEX "ai_setup_responses_school_id_user_id_questionnaire_key_camp_key" ON "ai_setup_responses"("school_id", "user_id", "questionnaire_key", "campus_id");
DROP INDEX "ai_setup_responses_school_id_user_id_questionnaire_key_key";

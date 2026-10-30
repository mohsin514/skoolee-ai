#!/bin/sh
set -eu
# Uses only the private local cluster; never accepts a DATABASE_URL.
PG=/opt/homebrew/opt/postgresql@16/bin
export PGHOST=127.0.0.1 PGPORT=55417
"$PG/createdb" sko217_rehearsal
for migration in prisma/migrations/*/migration.sql; do
 case "$migration" in *student_enrollment*|*identity_alias_guard*) continue;; esac
 "$PG/psql" -X -v ON_ERROR_STOP=1 -d sko217_rehearsal -f "$migration" >/dev/null
done
"$PG/psql" -X -v ON_ERROR_STOP=1 -d sko217_rehearsal <<'SQL' >/dev/null
INSERT INTO schools(id,name,slug,city,reg_id,contact_email) VALUES ('legacy-school','Synthetic legacy','legacy-school','Test','legacy-school','legacy@example.invalid');
INSERT INTO campuses(id,school_id,name,city,reg_id) VALUES ('legacy-campus','legacy-school','Original campus','Test','legacy-campus');
INSERT INTO classes(id,school_id,campus_id,name,academic_year) VALUES ('legacy-class','legacy-school','legacy-campus','Original class',2026);
INSERT INTO students(id,school_id,campus_id,class_id,full_name,roll_no,gender,enrollment_date) VALUES ('legacy-pupil','legacy-school','legacy-campus','legacy-class','Same Name','ORIGINAL-ROLL','MALE','2026-01-01');
INSERT INTO attendance(id,school_id,campus_id,class_id,student_id,date,status) VALUES ('legacy-att','legacy-school','legacy-campus','legacy-class','legacy-pupil','2026-08-01','PRESENT');
INSERT INTO exams(id,school_id,campus_id,class_id,title,term,academic_year) VALUES ('legacy-exam','legacy-school','legacy-campus','legacy-class','Original report','1',2026);
INSERT INTO report_cards(id,school_id,campus_id,student_id,exam_id,status) VALUES ('legacy-report','legacy-school','legacy-campus','legacy-pupil','legacy-exam','PUBLISHED');
INSERT INTO invoices(id,school_id,campus_id,student_id,invoice_date,due_date,monthly_fee,subtotal,total_amount,balance_due,currency) VALUES ('legacy-invoice','legacy-school','legacy-campus','legacy-pupil','2026-08-01','2026-09-01',123456,123456,123456,123456,'KWD');
SQL
"$PG/pg_dump" -Fc -d sko217_rehearsal -f /tmp/sko217-pre-migration.dump
for migration in prisma/migrations/*student_enrollment*/migration.sql prisma/migrations/*identity_alias_guard*/migration.sql; do "$PG/psql" -X -v ON_ERROR_STOP=1 -d sko217_rehearsal -f "$migration" >/dev/null; done
"$PG/psql" -X -v ON_ERROR_STOP=1 -d sko217_rehearsal <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM student_enrollments WHERE student_id='legacy-pupil')<>4 THEN RAISE EXCEPTION 'Missing legacy source contexts'; END IF;
 IF (SELECT currency||':'||balance_due FROM invoices WHERE id='legacy-invoice')<>'KWD:123456' THEN RAISE EXCEPTION 'Currency mutated'; END IF;
 IF (SELECT class_name FROM student_enrollments WHERE id=(SELECT enrollment_id FROM report_cards WHERE id='legacy-report'))<>'Original class' THEN RAISE EXCEPTION 'Report context mutated'; END IF;
 IF (SELECT origin FROM student_enrollments WHERE id=(SELECT enrollment_id FROM invoices WHERE id='legacy-invoice'))<>'LEGACY_INFERRED_CLASS' THEN RAISE EXCEPTION 'Inferred context not identified'; END IF;
END $$;
SQL
"$PG/pg_dump" -Fc -d sko217_rehearsal -f /tmp/sko217-after-migration.dump
"$PG/createdb" sko217_restore
"$PG/pg_restore" --exit-on-error -d sko217_restore /tmp/sko217-after-migration.dump
"$PG/psql" -X -At -d sko217_rehearsal -c 'SELECT row_to_json(e)::text FROM student_enrollments e ORDER BY id' >/tmp/sko217-before-restore.txt
"$PG/psql" -X -At -d sko217_restore -c 'SELECT row_to_json(e)::text FROM student_enrollments e ORDER BY id' >/tmp/sko217-after-restore.txt
cmp /tmp/sko217-before-restore.txt /tmp/sko217-after-restore.txt
"$PG/createdb" sko217_rollback
"$PG/pg_restore" --exit-on-error -d sko217_rollback /tmp/sko217-pre-migration.dump
[ "$("$PG/psql" -X -At -d sko217_rollback -c "SELECT currency||':'||balance_due FROM invoices WHERE id='legacy-invoice'")" = 'KWD:123456' ]
printf 'Legacy migration, post-migration restore and pre-migration rollback: PASS\n'

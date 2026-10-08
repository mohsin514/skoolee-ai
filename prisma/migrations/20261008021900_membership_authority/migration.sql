ALTER TABLE schools ADD COLUMN registration_kind TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE users ADD COLUMN is_institution_owner BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN can_purchase_subscription BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN can_manage_memberships BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN access_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_invitations ADD COLUMN can_purchase_subscription BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN can_manage_memberships BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN invited_by TEXT;
-- Historical creators are verified by the registration contact, never campus count or display label.
UPDATE users u SET is_institution_owner = true, can_purchase_subscription = true, can_manage_memberships = true
 FROM schools s WHERE u.school_id = s.id AND lower(u.email) = lower(s.contact_email)
 AND u.role IN ('ADMIN', 'SUPER_ADMIN');
UPDATE schools s SET registration_kind = CASE WHEN u.role = 'SUPER_ADMIN' THEN 'GROUP' ELSE 'STANDALONE' END
 FROM users u WHERE u.school_id = s.id AND u.is_institution_owner;

-- #205: rename the `presupposes` decomposition relation to `assumes`.
-- relation_type is a plain text column (no PG enum / no CHECK), so the rename is
-- a value update over the existing rows. The (parent, child, relation_type)
-- uniqueness constraint cannot be violated: no `assumes` edges exist yet.
UPDATE "claim_relationships" SET "relation_type" = 'assumes' WHERE "relation_type" = 'presupposes';

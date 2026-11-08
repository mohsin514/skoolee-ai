# Archived, non-executable migration history

These files preserve the pre-SKO-212 history byte for byte. The first file is CLI
output, not SQL; later files assume schema-push state and cannot be certified as
an executable chain. Prisma does not discover this directory.

The active history starts at `20261008000000_verified_baseline`. That baseline
was generated from the application schema at dev commit `9c5193d`. Review and
adoption are described in [the recovery runbook](../../docs/recovery/RUNBOOK.md).
Never overwrite an existing database or mark an unverified schema as applied.

# Architecture maintenance

Whenever adding or changing data concepts in this Lab, update schema.mjs in the same change: entities, fields and relations for all foreign keys. Architecture ERD and data dictionary render automatically from this file. Do not maintain a separate hand-drawn schema.

When actual database migrations are introduced, keep schema.mjs synchronized with migrations or generate it from migrations. Do not claim live database introspection until implemented. Current schema is proposed; frontends keep ephemeral simulation state. Preserve System Architecture navigation on all Lab pages. Run node --test *.test.mjs after changes.

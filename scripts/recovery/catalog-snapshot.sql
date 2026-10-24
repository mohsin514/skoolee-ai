-- Stable database definitions: names/definitions only, never OIDs or role secrets.
-- Pretty expression deparsing normalizes harmless parser parentheses after restore.
WITH objects AS (
  SELECT jsonb_build_object('kind','relation','name',c.relname,'type',c.relkind,
    'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) AS value
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
  UNION ALL
  SELECT jsonb_build_object('kind','column','table',c.relname,'position',a.attnum,'name',a.attname,
    'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
    'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid,true))
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT jsonb_build_object('kind','constraint','table',c.relname,'name',k.conname,
    'definition',pg_get_constraintdef(k.oid,true),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred)
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  UNION ALL
  SELECT jsonb_build_object('kind','index','table',tablename,'name',indexname,'definition',indexdef)
  FROM pg_indexes WHERE schemaname='public'
  UNION ALL
  SELECT jsonb_build_object('kind','policy','table',c.relname,'name',p.polname,'permissive',p.polpermissive,
    'command',p.polcmd,'roles',(SELECT jsonb_agg(CASE WHEN roleid=0 THEN 'public' ELSE pg_get_userbyid(roleid) END ORDER BY roleid) FROM unnest(p.polroles) roleid),
    'using',pg_get_expr(p.polqual,p.polrelid,true),'check',pg_get_expr(p.polwithcheck,p.polrelid,true))
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  UNION ALL
  SELECT jsonb_build_object('kind','trigger','table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
  UNION ALL
  SELECT jsonb_build_object('kind','function','name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
  UNION ALL
  SELECT jsonb_build_object('kind','enum','name',t.typname,'label',e.enumlabel,'order',e.enumsortorder)
  FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
  UNION ALL
  SELECT jsonb_build_object('kind','view','name',viewname,'definition',definition) FROM pg_views WHERE schemaname='public'
  UNION ALL
  SELECT jsonb_build_object('kind','extension','name',extname,'version',extversion) FROM pg_extension
  UNION ALL
  SELECT jsonb_build_object('kind','grant','table',table_name,'grantor',grantor,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable)
  FROM information_schema.table_privileges WHERE table_schema='public'
  UNION ALL
  SELECT jsonb_build_object('kind','sequence','name',sequencename,'type',data_type,'start',start_value,'minimum',min_value,
    'maximum',max_value,'increment',increment_by,'cycle',cycle,'cache',cache_size,'lastValue',last_value)
  FROM pg_sequences WHERE schemaname='public'
)
SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb)::text FROM objects;

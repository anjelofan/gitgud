SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT table_schema, table_name, pg_size_pretty(pg_total_relation_size(format('%I.%I', table_schema, table_name))) AS total_size
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(format('%I.%I', table_schema, table_name)) DESC;

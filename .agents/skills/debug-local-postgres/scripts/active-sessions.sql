SELECT pid, usename, application_name, client_addr, state, query_start, query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start DESC;

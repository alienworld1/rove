# Supabase database certificate

`supabase-prod-ca-2021.crt` is Supabase's public database root CA, downloaded from:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

It contains no private key or project credentials. The engine image and local
`pnpm deploy:*` commands add it to Node's trusted roots using
`NODE_EXTRA_CA_CERTS`. Keep `sslmode=verify-full` in `DATABASE_URL`: trusting the
CA enables verification rather than disabling it.

See [Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement).
If Supabase rotates its CA, replace this file with the certificate supplied in
the project's Database Settings and rebuild the engine image.

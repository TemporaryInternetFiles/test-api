test-api

## KV namespace

This worker persists its request counter in a KV namespace bound as
`COUNTER`. Before deploying, create the namespace and update
`wrangler.jsonc` with its identifier:

```bash
wrangler kv namespace create counter
```

Take the `id` from the command output and place it under
`kv_namespaces` in `wrangler.jsonc`:

```json
{
  "kv_namespaces": [
    { "binding": "COUNTER", "id": "<YOUR_NAMESPACE_ID>" }
  ]
}
```

Without a valid namespace ID the worker cannot store the counter and
deployment will fail.

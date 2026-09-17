# Stock Flow backend bridge

This folder contains the server-side bridge for IDX data. It is intentionally separate from the PWA so browser clients do not call IDX directly.

## Endpoints

- `GET /health` — service status
- `GET /market?date=YYYYMMDD` — normalized daily stock summary for all listed stocks
- `GET /broker?date=YYYYMMDD` — broker activity summary for the selected trading date

The bridge initializes an IDX web session and calls the IDX endpoints used by the open-source NeaByteLab IDX-API project. The upstream project documents stock summaries, trading snapshots, and broker summaries. This is a provider bridge, not a claim that the underlying IDX data is freely redistributable.

## Run locally

```bash
deno task start
```

Then open `/health`.

## Production

Deploy this folder to a server/serverless runtime that supports Deno. Keep any provider credentials or future secrets server-side; never put them in the PWA bundle.

# Linear Room Dashboard

This is a simple monitor-friendly dashboard for a Linear workspace. It reads data from the Linear GraphQL API, builds a few workspace-level summaries, and serves a live page that can stay open all day on a TV or monitor.

## What it does

- Pulls teams, projects, and issues from Linear.
- Scopes dashboard data to a single initiative, defaulting to `Allevo`.
- Re-syncs every 5 minutes by default.
- Supports an optional Linear webhook endpoint for near-real-time refreshes.
- Streams updates to the browser with Server-Sent Events, so the dashboard refreshes itself without a page reload.
- Runs with plain Node.js and no external runtime dependencies.

## Why this is Node instead of Laravel

You asked for a Laravel-based backend if possible. In this environment, `php`, `composer`, and Docker are not installed, so I could not generate or run a real Laravel app here. I chose a dependency-free Node backend because it is the only way to leave you with something runnable right now on this machine.

The backend shape is intentionally simple:

- `GET /api/dashboard`
- `GET /api/events`
- `POST /webhooks/linear`

Those same endpoints can be moved into Laravel later with very little redesign.
See `docs/laravel-port.md` for the suggested Laravel file layout.

## Setup

1. Copy `.env.example` to `.env`.
2. Create a Linear personal API key.
3. Set `LINEAR_API_KEY` in `.env`.
4. Start the app:

```bash
npm start
```

5. Open `http://localhost:3000`.

## Ngrok

To expose the dashboard:

```bash
ngrok http 3000
```

Use the generated `https://...ngrok-free.app` URL on the monitor.

If you want webhook-triggered refreshes as well:

1. Add the public ngrok HTTPS URL plus `/webhooks/linear` in Linear's webhook settings.
2. Copy the webhook signing secret into `LINEAR_WEBHOOK_SECRET`.

Without a webhook configured, the dashboard still refreshes every 5 minutes.

## Environment variables

- `LINEAR_API_KEY`: required
- `LINEAR_INITIATIVE_NAME`: optional, defaults to `Allevo`
- `LINEAR_WEBHOOK_SECRET`: optional but recommended for webhook verification
- `PORT`: defaults to `3000`
- `SYNC_INTERVAL_MS`: defaults to `300000`

## Roadmap manual

The `Roadmap` panel is driven by the local `roadmap.txt` file.

- Use `project: Project name`
- Use `milestone: Project name > Milestone name`
- Optionally append `| inicio=dd/mm/aaaa` or `| inicio=aaaa-mm-dd` to override the start date manually
- Blank lines and lines starting with `#` are ignored

## Notes

- The app uses Linear's GraphQL endpoint at `https://api.linear.app/graphql`.
- Personal API keys are passed with the `Authorization` header, following Linear's developer docs.
- Linear webhook requests are signed with `Linear-Signature`. This app verifies the raw request body when a webhook secret is configured.

## References

- Linear GraphQL getting started: https://linear.app/developers/graphql
- Linear webhooks: https://linear.app/developers/webhooks
- Laravel 12 installation docs: https://laravel.com/docs/12.x/installation

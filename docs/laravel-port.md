# Laravel Port Notes

This repo ships a Node runtime because the current machine does not have PHP, Composer, or Docker installed. If you want to move it into Laravel later, keep the same contract:

## Routes

- `GET /api/dashboard`
- `GET /api/events`
- `POST /webhooks/linear`

## Suggested Laravel structure

- `app/Http/Controllers/DashboardController.php`
- `app/Http/Controllers/LinearWebhookController.php`
- `app/Services/LinearGraphqlService.php`
- `app/Services/DashboardSnapshotBuilder.php`
- `app/Console/Commands/SyncLinearDashboard.php`

## Practical implementation notes

- Use Laravel's HTTP client to call `https://api.linear.app/graphql`.
- Cache the latest snapshot with `Cache::put()` so the dashboard page is cheap to serve.
- Schedule `php artisan dashboard:sync` every 5 minutes in `routes/console.php` or the scheduler.
- Keep the webhook endpoint separate so it can trigger an immediate refresh after signature verification.
- If you want real-time browser pushes in Laravel, use SSE from a streamed response or broadcast updates through Laravel Reverb.

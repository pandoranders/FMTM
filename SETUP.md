# FMTM setup

FMTM uses Supabase for a single password-protected account and a shared todo list. The app login name is `unibear`; Supabase verifies the password. The password is never stored in the browser code or this repository.

## 1. Configure Supabase Auth

In the Supabase dashboard:

- Disable Google and every other sign-in provider.
- Keep Email password sign-in enabled.
- Disable public sign-ups so no other accounts can be created through the app.
- Under **Authentication  Users**, create and confirm the one account with email `pandoranders@gmail.com`. Set its password there.

The app maps the fixed username `unibear` to this Supabase account. It does not show or manage other accounts.

## 2. Apply the database schema

Open **SQL Editor** and run the full `supabase-schema.sql` file from the repository. It removes the previous app membership table and Google-specific database policies, then restricts the shared todo table to the one FMTM account.

## 3. Project settings

`supabase-config.js` contains the project URL and publishable key. The publishable key is intended for browser use. Never put a Supabase secret or service-role key in this file.

## 4. Deploy

Commit and push the repository to GitHub. If GitHub Pages is enabled, configure it to serve the repository root. Add the deployed site URL to Supabase **Authentication  URL Configuration**.

## Access behavior

- One fixed login is shown: username `unibear`.
- The matching Supabase Auth account is `pandoranders@gmail.com`.
- The shared todo list is stored in Supabase and broadcasts updates to other open sessions using the same account.
- The old browser-only tasks are not uploaded automatically.


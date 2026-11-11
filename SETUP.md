# FMTM setup

FMTM is a static web app. Google sign-in and shared task storage are provided by Supabase. The database policies ensure only listed Google accounts can access the shared list.

## 1. Create the Supabase project

Create a Supabase project, then open **SQL Editor** and run the complete `supabase-schema.sql` file. It registers `pandoranders@gmail.com` as the protected owner and administrator.

## 2. Configure Google sign-in

In Supabase, enable Google under **Authentication  Sign In / Providers** and enter the Google OAuth client ID and client secret. Use the callback URL shown by Supabase when registering the OAuth client in Google Cloud.

Under **Authentication  URL Configuration**, add the deployed FMTM URL and the local development URL to the allowed redirect URLs. In **Authentication  Sign In / Providers**, disable every provider except Google. The database also checks that the authenticated account used Google sign-in.

## 3. Add the public project settings

In Supabase, open **Project Settings  API** and copy the Project URL and publishable/anon key into `supabase-config.js`:

```js
window.FMTM_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_PUBLISHABLE_OR_ANON_KEY"
};
```

The publishable/anon key is designed for browser use. Never put a service-role or secret key in this file.

## 4. Deploy

Commit and push the repository to GitHub. If GitHub Pages is enabled, configure it to serve the repository root. Also add the final GitHub Pages URL to the Supabase allowed redirect URLs.

## Access behavior

- The owner email seeded in `supabase-schema.sql` is the only administrator.
- The administrator can add or remove member email addresses in the app. Members must sign in with the same Google account email that was added.
- Members can add, complete, and remove tasks. Changes are stored in Supabase and broadcast live to other open app sessions.
- Removing a member blocks future database access through row-level security. They can still sign in, but the app will show that their account has no access.
- The existing browser-only tasks are left in that browser's local storage; they are not uploaded automatically.


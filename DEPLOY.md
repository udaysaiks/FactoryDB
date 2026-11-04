# Deployment

## Vercel frontend with Railway backend

The frontend can be hosted on Vercel, but the Express API and SQLite database must remain on a persistent service such as Railway. Vercel's serverless filesystem is not persistent and cannot safely store this app's SQLite database.

### 1. Deploy the backend to Railway

1. Push the project to a private GitHub repository. Do not commit `data/factory.db`, `data/admin.secret`, `data/factory-data.json`, or `.env`; `.gitignore` excludes these files.
2. In Railway, create a project from the repository.
3. Add a persistent volume to the service and mount it at `/data`.
4. Add these service variables:
   - `DATA_DIR=/data`
   - `NODE_ENV=production`
   - `ADMIN_SECRET=<unique random secret with at least 32 characters>`

Generate a secret locally with:

```powershell
node -p "require('crypto').randomBytes(32).toString('base64url')"
```

Paste the generated value directly into Railway's `ADMIN_SECRET` variable. Do not commit or share it.

5. Deploy the Railway service and generate its public HTTPS domain. This is the backend URL.

### 2. Deploy the frontend to Vercel

1. Import the same GitHub repository into Vercel. Vercel reads `vercel.json` and builds the Vite frontend.
2. In the Vercel project settings, add the environment variable `VITE_API_BASE_URL` with the Railway public URL, for example `https://your-service.up.railway.app` (no trailing slash).
3. Deploy or redeploy the Vercel project so the frontend build includes that URL. `VITE_` variables are public; only put the backend URL there, never a secret.
4. Copy the Vercel production domain, then add it in Railway as `CORS_ORIGINS`, for example `https://your-project.vercel.app`. For multiple allowed domains, use a comma-separated list of exact origins. Redeploy the Railway service after setting it.
5. Open the Vercel site and check that the login screen loads and can reach the backend. The backend health endpoint is `https://your-service.up.railway.app/healthz`.

For Vercel preview deployments, add the exact preview origin(s) you want to allow to `CORS_ORIGINS` in Railway and redeploy the backend.

## Operations

Keep one Railway service replica: sessions are held in server memory, and SQLite is stored on a single mounted volume. Back up `/data/factory.db` regularly; a persistent volume is not a backup. Changing or losing `ADMIN_SECRET` prevents administrator login, so store it in a password manager.

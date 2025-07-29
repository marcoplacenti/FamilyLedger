# Google Drive API Setup

## 1. Enable Required APIs (Required First!)

Before creating credentials, you must enable the required APIs:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project: `FamilyLedger` (ID: `familyledger-467317`)
3. Navigate to **APIs & Services** > **Library**
4. Search for and enable these APIs:
   - **Google Drive API** - Required for file storage
   - **Google Picker API** - Required for folder selection dialog
5. Click **"Enable"** for each API

## 2. Create API Key (Required)

After enabling the APIs, create an API key:

1. Navigate to **APIs & Services** > **Credentials**
2. Click **"Create Credentials"** > **"API Key"**
3. Copy the generated API key
4. **Restrict the key**:
   - Click on the key to edit it
   - Under "API restrictions", select "Restrict key"
   - Check both:
     - **Google Drive API**
     - **Google Picker API**
   - Save

## 3. Update Your .env File

Replace `YOUR_GOOGLE_API_KEY` in your `.env` file with the actual API key:

```env
VITE_GOOGLE_CLIENT_ID=875707593836-i69ce72nl8fn27e7inglole20kpkvn80.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-actual-api-key-here
```

## 4. GitHub Actions Secrets

When you push to GitHub, set these repository secrets:

1. Go to your GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **"New repository secret"** and add:

```
Name: VITE_GOOGLE_CLIENT_ID
Value: 875707593836-i69ce72nl8fn27e7inglole20kpkvn80.apps.googleusercontent.com

Name: VITE_GOOGLE_API_KEY  
Value: your-actual-api-key-here
```

## 5. GitHub Actions Workflow

Update your `.github/workflows/*.yml` files to inject the secrets:

```yaml
- name: Build Tauri App
  env:
    VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}
    VITE_GOOGLE_API_KEY: ${{ secrets.VITE_GOOGLE_API_KEY }}
  run: npm run tauri build
```

## Security Notes

- ✅ Client ID is safe to be public (it identifies your app)
- ✅ API Key is restricted to Google Drive API and Picker API only
- ✅ Both are already in .gitignore
- ✅ Authentication happens per-user with their Google account
- ❌ Never commit the actual API key to code

## Testing

After setup, the "Connect to Google Drive" button should work and open Google's OAuth flow.

## Troubleshooting

### "The API developer key is invalid"
- **Cause**: Google Picker API is not enabled
- **Solution**: Go to APIs & Services > Library and enable "Google Picker API"

### "Access blocked: FamilyLedger hasn't completed Google verification"
- **Cause**: App is in testing mode and user isn't added as test user
- **Solution**: Go to APIs & Services > OAuth consent screen > Test users and add your email

### Folder picker appears in background
- **Cause**: Z-index conflict with modal
- **Solution**: Already handled in code - modal temporarily hides during picker
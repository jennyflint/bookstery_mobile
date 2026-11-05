# Android Google Sign-In & Drive Sync Configuration

This guide documents the native Android configuration required for `@codetrix-studio/capacitor-google-auth` in Bookstery Mobile.

---

## 1. Capacitor Configuration (`capacitor.config.ts`)

In `capacitor.config.ts`, `plugins.GoogleAuth` must configure `clientId`, `androidClientId`, and `serverClientId` with the Google Web Client ID, along with Google Drive scopes and offline token refresh:

```ts
const googleClientId =
  process.env.VITE_GOOGLE_WEB_CLIENT_ID ||
  process.env.NUXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const config: CapacitorConfig = {
  appId: 'com.bookstery.app',
  appName: 'Bookstery',
  webDir: '.output/public',
  bundledWebRuntime: false,
  plugins: {
    GoogleAuth: {
      scopes: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata',
      ],
      clientId: googleClientId,
      androidClientId: googleClientId,
      serverClientId: googleClientId,
      forceCodeForRefreshToken: true,
    },
  },
};
```

> **Why all three client ID keys?**
> On Android, `@codetrix-studio/capacitor-google-auth` reads:
> ```java
> String clientId = getConfig().getString("androidClientId",
>   getConfig().getString("clientId",
>     this.getContext().getString(R.string.server_client_id)));
> ```
> Providing `androidClientId`, `clientId`, and `serverClientId` ensures the Web Client ID is loaded correctly across both Android and iOS/Web platforms.

---

## 2. Android Native Resources

### `android/app/src/main/res/values/strings.xml`
The plugin falls back to `R.string.server_client_id` if native configs are missing. Ensure this contains your Web Client ID:

```xml
<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Bookstery</string>
    <string name="title_activity_main">Bookstery</string>
    <string name="package_name">com.bookstery.app</string>
    <string name="custom_url_scheme">com.bookstery.app</string>

    <!-- Web Client ID from Google Cloud Console -->
    <string name="server_client_id">131341236682-hg2dv2iu117vosqoicmregjqnpn0iq44.apps.googleusercontent.com</string>
</resources>
```

### `android/app/src/main/AndroidManifest.xml`
Ensure the `INTERNET` permission is declared:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    ...
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
```

---

## 3. Google Cloud Console Setup

To enable Google Sign-In on Android devices:

1. **OAuth Consent Screen**:
   - In Google Cloud Console, navigate to **APIs & Services > OAuth consent screen**.
   - If the publishing status is **Testing**, add your testing Google accounts under **Test users**. Otherwise, status code `12500` will be returned.

2. **OAuth 2.0 Client IDs**:
   - **Web application client ID**:
     - Used in `.env` (`VITE_GOOGLE_WEB_CLIENT_ID`), `capacitor.config.ts`, and `strings.xml`.
     - Required as `serverClientId` so Android can request offline access and ID tokens.
   - **Android client ID**:
     - Package name: `com.bookstery.app`
     - SHA-1 certificate fingerprint:
       - Debug key: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
       - Release key: Fingerprint of your production keystore.

---

## 4. Status Codes & Diagnostics

When Google Sign-In fails on Android, `GoogleAuthService` extracts the Google Play Services status code:

| Status Code | Name | Cause & Solution |
|-------------|------|------------------|
| **10** | `DEVELOPER_ERROR` | Mismatched SHA-1 fingerprint in Google Cloud Console, incorrect package name (`com.bookstery.app`), or missing/mismatched Web Client ID. |
| **12500** | `SIGN_IN_FAILED` | OAuth Consent Screen is in "Testing" mode and the user is not in the Test Users list, or SHA-1 is not registered. |
| **12501** | `SIGN_IN_CANCELLED` | The user cancelled or dismissed the Google account picker dialog. Handled cleanly without presenting an error banner. |

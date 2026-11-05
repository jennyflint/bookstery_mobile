package com.bookstery.app;

import android.accounts.Account;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.auth.GoogleAuthException;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.UserRecoverableAuthException;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Task;

import java.io.IOException;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Google Auth plugin for Bookstery Mobile.
 * Authenticates purely via Android OAuth 2.0 Client ID (package name + APK SHA-1 fingerprint)
 * without requiring a Web Client ID or server backend.
 */
@CapacitorPlugin(name = "BooksteryGoogleAuth")
public class BooksteryGoogleAuthPlugin extends Plugin {

    private static final String OAUTH_SCOPES = "oauth2:https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata";

    private GoogleSignInClient googleSignInClient;
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private GoogleSignInAccount pendingAccount;

    @Override
    public void load() {
        super.load();
        initGoogleSignInClient();
    }

    private synchronized GoogleSignInClient initGoogleSignInClient() {
        if (googleSignInClient == null) {
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestScopes(
                            new Scope("https://www.googleapis.com/auth/drive.file"),
                            new Scope("https://www.googleapis.com/auth/drive.appdata")
                    )
                    .build();
            googleSignInClient = GoogleSignIn.getClient(getActivity() != null ? getActivity() : getContext(), gso);
        }
        return googleSignInClient;
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        initGoogleSignInClient();
        call.resolve();
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        GoogleSignInClient client = initGoogleSignInClient();
        Intent signInIntent = client.getSignInIntent();
        startActivityForResult(call, signInIntent, "handleSignInResult");
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        Intent data = result.getData();
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account == null) {
                call.reject("Google Sign-In returned null account.");
                return;
            }
            fetchOAuthTokenAndResolve(call, account);
        } catch (ApiException e) {
            int statusCode = e.getStatusCode();
            String diagnosticMessage = getDiagnosticMessage(statusCode);
            call.reject("Google Sign-In failed (code " + statusCode + "): " + diagnosticMessage, String.valueOf(statusCode), e);
        } catch (Exception e) {
            call.reject("Google Sign-In failed: " + e.getMessage(), e);
        }
    }

    @ActivityCallback
    private void handleAuthConsentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == Activity.RESULT_OK) {
            GoogleSignInAccount account = pendingAccount != null ? pendingAccount : GoogleSignIn.getLastSignedInAccount(getContext());
            pendingAccount = null;
            if (account == null) {
                call.reject("Consent granted but account is missing.");
                return;
            }
            fetchOAuthTokenAndResolve(call, account);
        } else {
            pendingAccount = null;
            call.reject("Google Drive authorization was denied or cancelled by user.", "USER_CONSENT_DENIED");
        }
    }

    private void fetchOAuthTokenAndResolve(PluginCall call, GoogleSignInAccount account) {
        executorService.execute(() -> {
            try {
                Account androidAccount = account.getAccount();
                if (androidAccount == null) {
                    call.reject("No Android account found on signed-in user.");
                    return;
                }
                String accessToken = GoogleAuthUtil.getToken(getContext(), androidAccount, OAUTH_SCOPES);
                resolveUserCall(call, account, accessToken);
            } catch (UserRecoverableAuthException e) {
                Intent consentIntent = e.getIntent();
                if (consentIntent != null) {
                    pendingAccount = account;
                    startActivityForResult(call, consentIntent, "handleAuthConsentResult");
                } else {
                    call.reject("User recoverable auth exception with null intent", e);
                }
            } catch (GoogleAuthException | IOException e) {
                call.reject("Failed to obtain OAuth2 token: " + e.getMessage(), e);
            } catch (Exception e) {
                call.reject("Unexpected error obtaining token: " + e.getMessage(), e);
            }
        });
    }

    private void resolveUserCall(PluginCall call, GoogleSignInAccount account, String accessToken) {
        JSObject user = new JSObject();
        user.put("id", account.getId() != null ? account.getId() : "");
        user.put("email", account.getEmail() != null ? account.getEmail() : "");
        user.put("name", account.getDisplayName() != null ? account.getDisplayName() : "");
        user.put("givenName", account.getGivenName() != null ? account.getGivenName() : "");
        user.put("familyName", account.getFamilyName() != null ? account.getFamilyName() : "");
        user.put("imageUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
        user.put("accessToken", accessToken != null ? accessToken : "");

        JSObject authentication = new JSObject();
        authentication.put("accessToken", accessToken != null ? accessToken : "");
        authentication.put("idToken", "");
        user.put("authentication", authentication);

        call.resolve(user);
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(getContext());
        if (account == null) {
            GoogleSignInClient client = initGoogleSignInClient();
            client.silentSignIn().addOnCompleteListener(getActivity(), task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    fetchFreshTokenForRefresh(call, task.getResult());
                } else {
                    call.reject("User not logged in.");
                }
            });
            return;
        }
        fetchFreshTokenForRefresh(call, account);
    }

    private void fetchFreshTokenForRefresh(PluginCall call, GoogleSignInAccount account) {
        executorService.execute(() -> {
            try {
                Account androidAccount = account.getAccount();
                if (androidAccount == null) {
                    call.reject("No Android account found.");
                    return;
                }

                try {
                    String existingToken = GoogleAuthUtil.getToken(getContext(), androidAccount, OAUTH_SCOPES);
                    if (existingToken != null) {
                        GoogleAuthUtil.clearToken(getContext(), existingToken);
                    }
                } catch (Exception ignored) {
                    // Continue to fresh token request if clearing fails
                }

                String freshToken = GoogleAuthUtil.getToken(getContext(), androidAccount, OAUTH_SCOPES);

                JSObject result = new JSObject();
                result.put("accessToken", freshToken != null ? freshToken : "");

                JSObject auth = new JSObject();
                auth.put("accessToken", freshToken != null ? freshToken : "");
                auth.put("idToken", "");
                result.put("authentication", auth);

                call.resolve(result);
            } catch (UserRecoverableAuthException e) {
                Intent consentIntent = e.getIntent();
                if (consentIntent != null) {
                    pendingAccount = account;
                    startActivityForResult(call, consentIntent, "handleRefreshConsentResult");
                } else {
                    call.reject("User recoverable auth exception during refresh", e);
                }
            } catch (Exception e) {
                call.reject("Failed to refresh token: " + e.getMessage(), e);
            }
        });
    }

    @ActivityCallback
    private void handleRefreshConsentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == Activity.RESULT_OK) {
            GoogleSignInAccount account = pendingAccount != null ? pendingAccount : GoogleSignIn.getLastSignedInAccount(getContext());
            pendingAccount = null;
            if (account == null) {
                call.reject("Account missing after refresh consent.");
                return;
            }
            fetchFreshTokenForRefresh(call, account);
        } else {
            pendingAccount = null;
            call.reject("Consent denied during token refresh.", "USER_CONSENT_DENIED");
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        GoogleSignInClient client = initGoogleSignInClient();
        client.signOut().addOnCompleteListener(getActivity(), task -> call.resolve());
    }

    @Override
    protected void handleOnDestroy() {
        executorService.shutdown();
        super.handleOnDestroy();
    }

    private String getDiagnosticMessage(int statusCode) {
        String packageName = getContext().getPackageName();
        String sha1 = getApkSha1Fingerprint();
        switch (statusCode) {
            case 10: // CommonStatusCodes.DEVELOPER_ERROR
                return "DEVELOPER_ERROR: Check Google Cloud Console OAuth 2.0 Android Client ID. pkg="
                        + packageName + ", APK_SHA1=" + sha1;
            case 12500: // GoogleSignInStatusCodes.SIGN_IN_FAILED
                return "SIGN_IN_FAILED: Verify OAuth Consent Screen Test Users, publishing status, and SHA-1. pkg="
                        + packageName + ", APK_SHA1=" + sha1;
            case 12501: // GoogleSignInStatusCodes.SIGN_IN_CANCELLED
                return "SIGN_IN_CANCELLED: User cancelled the sign-in flow.";
            case 12502: // GoogleSignInStatusCodes.SIGN_IN_CURRENTLY_IN_PROGRESS
                return "SIGN_IN_CURRENTLY_IN_PROGRESS: Sign-in operation is already in progress.";
            case 7: // CommonStatusCodes.NETWORK_ERROR
                return "NETWORK_ERROR: A network error occurred while attempting to sign in.";
            default:
                return "Sign-in error occurred (code " + statusCode + ").";
        }
    }

    private String getApkSha1Fingerprint() {
        try {
            Context context = getContext();
            String packageName = context.getPackageName();
            PackageManager pm = context.getPackageManager();
            Signature[] signatures;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
                SigningInfo signingInfo = packageInfo.signingInfo;
                if (signingInfo == null) {
                    return "UNKNOWN (null signingInfo)";
                }
                signatures = signingInfo.hasMultipleSigners()
                        ? signingInfo.getApkContentsSigners()
                        : signingInfo.getSigningCertificateHistory();
            } else {
                @SuppressWarnings("deprecation")
                PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
                signatures = packageInfo.signatures;
            }

            if (signatures == null || signatures.length == 0) {
                return "UNKNOWN (no signatures)";
            }

            byte[] cert = signatures[0].toByteArray();
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(cert);
            StringBuilder hexString = new StringBuilder();
            for (int i = 0; i < digest.length; i++) {
                if (i > 0) {
                    hexString.append(":");
                }
                String hex = Integer.toHexString(0xFF & digest[i]).toUpperCase(Locale.US);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return "ERROR (" + e.getMessage() + ")";
        }
    }
}

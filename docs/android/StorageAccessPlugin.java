package com.bookstery.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android 11+ blocks reading documents (PDF, EPUB, FB2) from shared storage unless the user
 * grants "All files access". This plugin reports and requests that access.
 */
@CapacitorPlugin(name = "StorageAccess")
public class StorageAccessPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean required = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        JSObject result = new JSObject();
        result.put("allFilesAccessRequired", required);
        result.put("granted", !required || Environment.isExternalStorageManager());
        call.resolve(result);
    }

    @PluginMethod
    public void openAllFilesAccessSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            call.resolve();
            return;
        }

        Uri packageUri = Uri.parse("package:" + getContext().getPackageName());
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, packageUri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception primaryError) {
            try {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
            } catch (Exception fallbackError) {
                call.reject("Unable to open all files access settings", fallbackError);
                return;
            }
        }
        call.resolve();
    }
}

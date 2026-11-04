package com.bookstery.app;

import android.os.Bundle;
import android.view.KeyEvent;
import androidx.activity.OnBackPressedCallback;

import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;


public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuth.class);
        registerPlugin(NativeReaderBridgePlugin.class);
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null) {
                    PluginHandle handle = getBridge().getPlugin("NativeReaderBridge");
                    if (handle != null) {
                        Plugin plugin = handle.getInstance();
                        if (plugin instanceof NativeReaderBridgePlugin) {
                            ((NativeReaderBridgePlugin) plugin).notifyBackButtonPressed();
                        }
                    }
                }
            }
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        if ((keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) && getBridge() != null) {
            PluginHandle handle = getBridge().getPlugin("NativeReaderBridge");
            if (handle != null) {
                Plugin plugin = handle.getInstance();
                if (plugin instanceof NativeReaderBridgePlugin
                    && ((NativeReaderBridgePlugin) plugin).handleVolumeKeyEvent(event)) {
                    return true;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }
}


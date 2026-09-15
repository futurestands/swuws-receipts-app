package org.swuws.portal;

import android.os.Bundle;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSExport;
import com.getcapacitor.Logger;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MainActivity extends BridgeActivity {

    /**
     * Plugins the offline fallback shell (public/offline.html) needs. Keep
     * this minimal: every entry is exposed to a page served from the local
     * asset origin.
     */
    private static final String[] OFFLINE_SHELL_PLUGINS = {
        "CapacitorSQLite",
        "BluetoothLe",
        "TcpSocket"
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must precede super.onCreate(): BridgeActivity.onCreate() calls
        // load(), which builds the Bridge from whatever the builder holds at
        // that moment. Registering afterwards only mutated the builder of an
        // already-created Bridge, so this call did nothing. It worked anyway
        // because capacitor.plugins.json auto-registers the plugin.
        registerPlugin(CapacitorSQLitePlugin.class);
        super.onCreate(savedInstanceState);
        exposeBridgeToOfflineShell();
    }

    /**
     * Makes the Capacitor bridge available to pages served from the local
     * asset origin (https://localhost), which is where server.errorPath
     * loads public/offline.html.
     *
     * Capacitor itself cannot do this when server.url points at a remote
     * origin: Bridge.loadWebView() registers its document-start script for
     * the server.url origin only and then discards the JSInjector, and
     * WebViewLocalServer returns error-URL responses before its HTML
     * injection branch. The result is a fallback page with no
     * window.Capacitor, so it cannot open the offline SQLite cache — the
     * data it exists to show. Registering the same script for the local
     * origin closes that gap without touching the remote app path.
     *
     * Failure here is non-fatal: the shell probes for the bridge and falls
     * back to a message telling the user their queued work is safe.
     */
    private void exposeBridgeToOfflineShell() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getServerUrl() == null) {
            return;
        }

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Logger.warn("Offline shell: DOCUMENT_START_SCRIPT unsupported, bridge unavailable in fallback page");
            return;
        }

        try {
            List<PluginHandle> handles = new ArrayList<>();
            for (String pluginId : OFFLINE_SHELL_PLUGINS) {
                PluginHandle handle = bridge.getPlugin(pluginId);
                if (handle != null) {
                    handles.add(handle);
                }
            }

            if (handles.isEmpty()) {
                Logger.warn("Offline shell: no plugins resolved, skipping bridge registration");
                return;
            }

            String localOrigin = bridge.getScheme() + "://" + bridge.getHost();

            // Same order JSInjector.getScriptString() uses: globals, server
            // url, native bridge, then the plugin shims that depend on it.
            String script =
                JSExport.getGlobalJS(getApplicationContext(), bridge.getConfig().isLoggingEnabled(), false) +
                "\n\n" +
                "window.WEBVIEW_SERVER_URL = '" + localOrigin + "';" +
                "\n\n" +
                JSExport.getBridgeJS(getApplicationContext()) +
                "\n\n" +
                JSExport.getPluginJS(handles);

            WebViewCompat.addDocumentStartJavaScript(bridge.getWebView(), script, Collections.singleton(localOrigin));
            Logger.debug("Offline shell: Capacitor bridge registered for " + localOrigin);
        } catch (Exception ex) {
            Logger.warn("Offline shell: could not register Capacitor bridge - " + ex.getMessage());
        }
    }
}

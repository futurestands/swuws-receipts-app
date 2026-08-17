package org.swuws.portal;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        
        // Use the Bridge's existing WebView and wrap the Client to handle offline fallback
        // without breaking Capacitor's internal plugin communication.
        WebView webView = this.getBridge().getWebView();
        
        webView.setWebViewClient(new BridgeWebViewClient(this.getBridge()) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Call the original Capacitor error handler first
                super.onReceivedError(view, request, error);
                
                // If it's a main frame failure (server unreachable), show our bundled offline page
                if (request.isForMainFrame()) {
                    view.loadUrl("file:///android_asset/public/offline.html");
                }
            }
        });
    }
}

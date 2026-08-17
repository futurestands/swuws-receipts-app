package org.swuws.portal;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        
        // Add an error listener to the WebView to handle offline boot
        WebView webView = this.getBridge().getWebView();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // If the main page fails to load (likely offline), fallback to bundled assets
                if (request.isForMainFrame()) {
                    view.loadUrl("file:///android_asset/public/offline.html");
                }
            }
        });
    }
}

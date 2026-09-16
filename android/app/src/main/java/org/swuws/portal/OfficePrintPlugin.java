package org.swuws.portal;

import android.app.Activity;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Office A4 printing via Android PrintManager.
 *
 * HP / Epson / Kyocera drivers are the print services the user installs
 * (Mopria, HP Print Service, Epson Print Enabler). This plugin never
 * ships vendor .inf files or ESC/POS bytes to a laser printer.
 */
@CapacitorPlugin(name = "OfficePrint")
public class OfficePrintPlugin extends Plugin {
    private WebView printWebView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html");
        final String jobName = call.getString("jobName", "SWUWS document");

        if (html == null || html.trim().isEmpty()) {
            call.reject("No document to print");
            return;
        }

        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("App is not in the foreground");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    call.reject("This phone cannot print. Install Mopria Print Service from Play Store — that is the driver for HP, Epson and Kyocera.");
                    return;
                }

                WebView webView = new WebView(activity);
                printWebView = webView;
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        try {
                            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                            // Do not force ISO_A4 — that preview on a phone is a
                            // mostly blank page with a tiny receipt. Let the
                            // printer dialog pick the paper the device supports.
                            PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                            printManager.print(jobName, adapter, attrs);
                            call.resolve();
                        } catch (Exception e) {
                            call.reject(e.getMessage() != null ? e.getMessage() : "Could not open the print sheet");
                        }
                    }
                });
                webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not start office print");
            }
        });
    }
}

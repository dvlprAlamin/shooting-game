package com.dvlpralamin.rimfire;

import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.dvlpralamin.rimfire.lan.LanPlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    // The most the launch screen waits for the page, in case it never says it has loaded.
    private static final long LAUNCH_SCREEN_MAX_MS = 4000;

    private boolean pageLoaded = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The launch screen (styles.xml) stays up until the page has loaded: index.html draws the same scope in the
        // same spot and takes it from there. Without the wait, the WebView's empty background shows in between.
        SplashScreen launchScreen = SplashScreen.installSplashScreen(this);
        // The app's own plugins (npm plugins register themselves).
        registerPlugin(LanPlugin.class);
        super.onCreate(savedInstanceState);

        long shownAt = SystemClock.uptimeMillis();
        launchScreen.setKeepOnScreenCondition(() -> !pageLoaded && SystemClock.uptimeMillis() - shownAt < LAUNCH_SCREEN_MAX_MS);
        if (bridge != null) {
            bridge.addWebViewListener(
                new WebViewListener() {
                    @Override
                    public void onPageLoaded(WebView webView) {
                        pageLoaded = true;
                    }
                }
            );
        }
    }

    // Immersive full screen. An edge swipe shows the system bars briefly over the game, then they hide
    // again; the default behaviour would leave them up after any swipe that starts near an edge.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }
}

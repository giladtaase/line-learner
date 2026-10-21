package com.line_learner.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in this app (not in npm packages) are registered here.
        registerPlugin(SpeechPlugin.class);
        registerPlugin(TtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

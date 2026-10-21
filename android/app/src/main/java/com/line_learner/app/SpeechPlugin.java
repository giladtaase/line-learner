package com.line_learner.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

/**
 * Speech-to-text for recording a line, using Android's SpeechRecognizer.
 * The Android WebView has no Web Speech API, so the web app's free
 * "built-in" recognition goes through this plugin in the app (see
 * src/lib/nativeSpeech.ts).
 *
 * SpeechRecognizer stops by itself after a short silence, but actors pause
 * mid-line, so while the user hasn't tapped stop each finished segment is
 * kept and listening restarts. stop() resolves with all segments joined.
 *
 * Errors are rejected with a code the web side maps to a translated message:
 * unavailable, permission, network, language, audio, or error-N.
 */
@CapacitorPlugin(
    name = "LineLearnerSpeech",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class SpeechPlugin extends Plugin {

    // How long stop() waits for the recognizer's final result.
    private static final long STOP_TIMEOUT_MS = 3000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private String language;
    private final List<String> segments = new ArrayList<>();
    private String partial = "";
    private String errorCode;
    // True from start() until stop() or cancel(): restart after each segment.
    private boolean active;
    private PluginCall startCall;
    private PluginCall stopCall;
    private final Runnable stopTimeout = this::finish;

    @PluginMethod
    public void start(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition is not available on this device.", "unavailable");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("Microphone access was blocked.", "permission");
        }
    }

    private void begin(PluginCall call) {
        main.post(() -> {
            reset();
            language = call.getString("language", "en-US");
            active = true;
            startCall = call;
            listen();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            stopCall = call;
            active = false;
            if (recognizer == null) {
                finish();
                return;
            }
            recognizer.stopListening();
            main.postDelayed(stopTimeout, STOP_TIMEOUT_MS);
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        main.post(() -> {
            if (startCall != null) startCall.reject("Cancelled.", "cancelled");
            if (stopCall != null) stopCall.reject("Cancelled.", "cancelled");
            reset();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::reset);
    }

    /** Stops listening and forgets the session. Main thread only. */
    private void reset() {
        main.removeCallbacks(stopTimeout);
        destroyRecognizer();
        segments.clear();
        partial = "";
        errorCode = null;
        active = false;
        startCall = null;
        stopCall = null;
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }
    }

    /** Starts (or restarts) listening with a fresh recognizer, which avoids
     *  "recognizer busy" errors when restarting. Main thread only. */
    private void listen() {
        destroyRecognizer();
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(new Listener());
        recognizer.startListening(intent);
    }

    /** Keeps the words heard so far in the current segment. */
    private void commitPartial() {
        if (!partial.isEmpty()) segments.add(partial);
        partial = "";
    }

    /** Resolves stop() with the transcript, or rejects it if an error left
     *  nothing to grade. Main thread only. */
    private void finish() {
        main.removeCallbacks(stopTimeout);
        commitPartial();
        destroyRecognizer();
        PluginCall call = stopCall;
        stopCall = null;
        if (call == null) return;
        String transcript = String.join(" ", segments).trim();
        if (transcript.isEmpty() && errorCode != null) {
            call.reject("Speech recognition failed.", errorCode);
        } else {
            JSObject result = new JSObject();
            result.put("transcript", transcript);
            call.resolve(result);
        }
    }

    private static String codeFor(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "permission";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
                return "network";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                return "language";
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio";
            default:
                return "error-" + error;
        }
    }

    private static String firstResult(Bundle bundle) {
        ArrayList<String> results = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (results == null || results.isEmpty() || results.get(0) == null) return "";
        return results.get(0).trim();
    }

    private class Listener implements RecognitionListener {

        @Override
        public void onReadyForSpeech(Bundle params) {
            if (startCall != null) {
                startCall.resolve();
                startCall = null;
            }
        }

        @Override
        public void onPartialResults(Bundle results) {
            String text = firstResult(results);
            if (!text.isEmpty()) partial = text;
        }

        @Override
        public void onResults(Bundle results) {
            String text = firstResult(results);
            if (!text.isEmpty()) partial = text;
            commitPartial();
            if (active) {
                listen();
            } else {
                finish();
            }
        }

        @Override
        public void onError(int error) {
            if (startCall != null) {
                // Never started listening, e.g. no permission or no network.
                startCall.reject("Speech recognition failed.", codeFor(error));
                reset();
                return;
            }
            boolean nothingHeard = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
            if (nothingHeard && active) {
                commitPartial();
                listen();
                return;
            }
            if (!active) {
                // Stopping: errors here usually just mean nothing more was heard.
                finish();
                return;
            }
            // A real failure mid-recording: keep what was heard and report the
            // error when the user taps stop, if there is nothing to grade.
            errorCode = codeFor(error);
            active = false;
            commitPartial();
            destroyRecognizer();
        }

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onEvent(int eventType, Bundle params) {}
    }
}

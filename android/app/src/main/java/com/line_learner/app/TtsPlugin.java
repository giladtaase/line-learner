package com.line_learner.app;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Speaks other characters' lines with Android's text-to-speech (see
 * src/lib/tts.ts). The WebView's speechSynthesis is unreliable, and like it,
 * a plain TTS plugin only uses the phone's default engine. Samsung's default
 * engine has no Hebrew, though Google's (usually installed too) does, so for
 * each language this picks the default engine if it can speak it, otherwise
 * another installed engine that can, preferring Google's.
 *
 * speak() resolves when the line ends or is interrupted (by stop() or the
 * next line), and rejects with code "language" when no engine can speak the
 * language, or "unavailable" when there is no engine at all.
 */
@CapacitorPlugin(name = "LineLearnerTts")
public class TtsPlugin extends Plugin {

    private static final String GOOGLE_ENGINE = "com.google.android.tts";

    // Key for the phone's default engine, whichever that is.
    private static final String DEFAULT_ENGINE = "";

    /** An engine that is starting up or ready. Calls wait in `pending` until it's ready. */
    private class Engine {

        final TextToSpeech tts;
        Boolean ready; // null while starting
        final List<Runnable> pending = new ArrayList<>();

        Engine(String name) {
            TextToSpeech.OnInitListener onInit = (status) -> {
                synchronized (TtsPlugin.this) {
                    ready = status == TextToSpeech.SUCCESS;
                    for (Runnable r : pending) r.run();
                    pending.clear();
                }
            };
            tts = DEFAULT_ENGINE.equals(name)
                ? new TextToSpeech(getContext(), onInit)
                : new TextToSpeech(getContext(), onInit, name);
            tts.setOnUtteranceProgressListener(progressListener);
        }

        /** Runs `action` once the engine has started (successfully or not). */
        void whenStarted(Runnable action) {
            synchronized (TtsPlugin.this) {
                if (ready == null) pending.add(action);
                else action.run();
            }
        }
    }

    private final Map<String, Engine> engines = new HashMap<>();
    // Engine chosen for each language tag, once found.
    private final Map<String, Engine> engineForLanguage = new HashMap<>();
    // Calls waiting for their utterance to finish, by utterance id.
    private final Map<String, PluginCall> speaking = new HashMap<>();
    private Engine current;
    private int nextUtteranceId = 0;

    private final UtteranceProgressListener progressListener = new UtteranceProgressListener() {
        @Override
        public void onStart(String utteranceId) {}

        @Override
        public void onDone(String utteranceId) {
            settle(utteranceId);
        }

        @Override
        public void onStop(String utteranceId, boolean interrupted) {
            settle(utteranceId);
        }

        @Override
        @Deprecated
        public void onError(String utteranceId) {
            settle(utteranceId);
        }
    };

    private synchronized void settle(String utteranceId) {
        PluginCall call = speaking.remove(utteranceId);
        if (call != null) call.resolve();
    }

    private synchronized Engine engine(String name) {
        Engine engine = engines.get(name);
        if (engine == null) {
            engine = new Engine(name);
            engines.put(name, engine);
        }
        return engine;
    }

    private static boolean canSpeak(Engine engine, Locale locale) {
        return Boolean.TRUE.equals(engine.ready) && engine.tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE;
    }

    /** Engines to try for a language: the default first, then Google's, then
     *  any other installed engine. Only engines that are installed. */
    private List<String> candidateEngines() {
        TextToSpeech probe = engine(DEFAULT_ENGINE).tts;
        String defaultName = probe.getDefaultEngine();
        List<String> installed = new ArrayList<>();
        for (TextToSpeech.EngineInfo info : probe.getEngines()) installed.add(info.name);
        List<String> names = new ArrayList<>();
        names.add(DEFAULT_ENGINE);
        if (installed.contains(GOOGLE_ENGINE) && !GOOGLE_ENGINE.equals(defaultName)) names.add(GOOGLE_ENGINE);
        for (String name : installed) {
            if (!names.contains(name) && !name.equals(defaultName)) names.add(name);
        }
        return names;
    }

    /** Finds an engine for `locale`, trying candidates one at a time. */
    private void findEngine(Locale locale, List<String> candidates, int index, EngineCallback callback) {
        if (index >= candidates.size()) {
            callback.found(null);
            return;
        }
        Engine candidate = engine(candidates.get(index));
        candidate.whenStarted(() -> {
            if (canSpeak(candidate, locale)) callback.found(candidate);
            else findEngine(locale, candidates, index + 1, callback);
        });
    }

    private interface EngineCallback {
        void found(Engine engine);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "en-US");
        float rate = call.getFloat("rate", 1.0f);
        Locale locale = Locale.forLanguageTag(lang);

        Engine known;
        synchronized (this) {
            known = engineForLanguage.get(lang);
        }
        if (known != null) {
            say(known, text, locale, rate, call);
            return;
        }
        // The default engine must have started before it can list the others.
        engine(DEFAULT_ENGINE).whenStarted(() -> {
            if (engine(DEFAULT_ENGINE).tts.getEngines().isEmpty()) {
                call.reject("No text-to-speech engine is installed.", "unavailable");
                return;
            }
            findEngine(locale, candidateEngines(), 0, (found) -> {
                if (found == null) {
                    call.reject("No text-to-speech engine can speak " + lang + ".", "language");
                    return;
                }
                synchronized (this) {
                    engineForLanguage.put(lang, found);
                }
                say(found, text, locale, rate, call);
            });
        });
    }

    private synchronized void say(Engine engine, String text, Locale locale, float rate, PluginCall call) {
        // A new line interrupts the previous one, which resolves through onStop.
        if (current != null && current != engine) current.tts.stop();
        current = engine;
        String id = "line-" + nextUtteranceId++;
        speaking.put(id, call);
        engine.tts.setLanguage(locale);
        engine.tts.setSpeechRate(rate);
        if (engine.tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id) != TextToSpeech.SUCCESS) {
            speaking.remove(id);
            call.resolve();
        }
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        if (current != null) current.tts.stop();
        // Engines don't always report onStop for an utterance that hadn't started yet.
        for (PluginCall pending : speaking.values()) pending.resolve();
        speaking.clear();
        call.resolve();
    }

    @Override
    protected synchronized void handleOnDestroy() {
        for (Engine engine : engines.values()) engine.tts.shutdown();
        engines.clear();
        engineForLanguage.clear();
        speaking.clear();
        current = null;
    }
}

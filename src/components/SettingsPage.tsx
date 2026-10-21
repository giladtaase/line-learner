import { useTranslation } from 'react-i18next';
import { isWebSpeechSupported } from '../lib/transcription';
import { isNativeApp } from '../platform/native';
import { useSettings } from '../settings/context';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { settings, updateSettings: update } = useSettings();

  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-xl font-semibold">{t('settings.title')}</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label htmlFor="ui-language" className="block text-sm font-medium mb-1">{t('settings.uiLanguage')}</label>
          <select
            id="ui-language"
            value={settings.uiLanguage}
            onChange={(e) => update({ uiLanguage: e.target.value as 'en' | 'he' })}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="en">English</option>
            <option value="he">עברית</option>
          </select>
        </div>

        <div>
          <label htmlFor="other-lines" className="block text-sm font-medium mb-1">
            {t('settings.defaultOtherLinesMode')}
          </label>
          <select
            id="other-lines"
            value={settings.defaultOtherLinesMode}
            onChange={(e) =>
              update({ defaultOtherLinesMode: e.target.value as 'speak' | 'display' })
            }
            className="border rounded px-2 py-1 w-full"
          >
            <option value="speak">{t('player.speak')}</option>
            <option value="display">{t('player.display')}</option>
          </select>
        </div>

        <div>
          <label htmlFor="my-line-input" className="block text-sm font-medium mb-1">
            {t('settings.defaultMyLineInputMode')}
          </label>
          <select
            id="my-line-input"
            value={settings.defaultMyLineInputMode}
            onChange={(e) =>
              update({ defaultMyLineInputMode: e.target.value as 'speak' | 'type' })
            }
            className="border rounded px-2 py-1 w-full"
          >
            <option value="speak">{t('settings.speak')}</option>
            <option value="type">{t('settings.type')}</option>
          </select>
        </div>

        <div>
          <label htmlFor="transcription" className="block text-sm font-medium mb-1">
            {t('settings.transcriptionProvider')}
          </label>
          <select
            id="transcription"
            value={settings.transcriptionProvider}
            onChange={(e) =>
              update({ transcriptionProvider: e.target.value as 'whisper' | 'webspeech' })
            }
            className="border rounded px-2 py-1 w-full"
          >
            <option value="whisper">{t('settings.whisper')}</option>
            <option value="webspeech">
              {t(isNativeApp() ? 'settings.webspeechNative' : 'settings.webspeech')}
            </option>
          </select>
          {settings.transcriptionProvider === 'webspeech' && !isWebSpeechSupported() && (
            <p className="text-xs text-red-600 mt-1">{t('settings.webspeechUnsupported')}</p>
          )}
        </div>

        {settings.transcriptionProvider === 'whisper' && (
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium mb-1">{t('settings.apiKey')}</label>
            <input
              id="api-key"
              type="password"
              value={settings.openAiApiKey ?? ''}
              onChange={(e) => update({ openAiApiKey: e.target.value })}
              className="border rounded px-2 py-1 w-full"
              placeholder="sk-..."
            />
            <p className="text-xs text-slate-500 mt-1">{t('settings.apiKeyHint')}</p>
          </div>
        )}

        <div>
          <label htmlFor="anthropic-key" className="block text-sm font-medium mb-1">
            {t('settings.anthropicApiKey')}
          </label>
          <input
            id="anthropic-key"
            type="password"
            autoComplete="off"
            value={settings.anthropicApiKey ?? ''}
            onChange={(e) => update({ anthropicApiKey: e.target.value.trim() })}
            className="border rounded px-2 py-1 w-full"
            placeholder="sk-ant-..."
          />
          <p className="text-xs text-slate-500 mt-1">{t('settings.anthropicApiKeyHint')}</p>
        </div>

        <div>
          <label htmlFor="tts-rate" className="block text-sm font-medium mb-1">
            {t('settings.ttsRate')}: {settings.ttsRate.toFixed(1)}x
          </label>
          <input
            id="tts-rate"
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={settings.ttsRate}
            onChange={(e) => update({ ttsRate: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label htmlFor="leniency" className="block text-sm font-medium mb-1">
            {t('settings.leniency')}: {Math.round(settings.leniencyThreshold * 100)}%
          </label>
          <input
            id="leniency"
            type="range"
            min={0.4}
            max={0.95}
            step={0.01}
            value={settings.leniencyThreshold}
            onChange={(e) => update({ leniencyThreshold: Number(e.target.value) })}
            className="w-full"
          />
          <p className="text-xs text-slate-500 mt-1">{t('settings.leniencyHint')}</p>
        </div>
      </div>
    </div>
  );
}

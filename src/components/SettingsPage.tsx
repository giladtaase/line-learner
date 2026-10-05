import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, saveSettings } from '../lib/db';
import type { AppSettings } from '../types';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  async function update(patch: Partial<AppSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    if (patch.uiLanguage) {
      await i18n.changeLanguage(patch.uiLanguage);
    }
  }

  if (!settings) return <p className="text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-xl font-semibold">{t('settings.title')}</h2>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('settings.uiLanguage')}</label>
          <select
            value={settings.uiLanguage}
            onChange={(e) => update({ uiLanguage: e.target.value as 'en' | 'he' })}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="en">English</option>
            <option value="he">עברית</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t('settings.defaultOtherLinesMode')}
          </label>
          <select
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
          <label className="block text-sm font-medium mb-1">
            {t('settings.defaultMyLineInputMode')}
          </label>
          <select
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
          <label className="block text-sm font-medium mb-1">
            {t('settings.transcriptionProvider')}
          </label>
          <select
            value={settings.transcriptionProvider}
            onChange={(e) =>
              update({ transcriptionProvider: e.target.value as 'whisper' | 'webspeech' })
            }
            className="border rounded px-2 py-1 w-full"
          >
            <option value="whisper">{t('settings.whisper')}</option>
            <option value="webspeech">{t('settings.webspeech')}</option>
          </select>
        </div>

        {settings.transcriptionProvider === 'whisper' && (
          <div>
            <label className="block text-sm font-medium mb-1">{t('settings.apiKey')}</label>
            <input
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
          <label className="block text-sm font-medium mb-1">
            {t('settings.ttsRate')}: {settings.ttsRate.toFixed(1)}x
          </label>
          <input
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
          <label className="block text-sm font-medium mb-1">
            {t('settings.leniency')}: {Math.round(settings.leniencyThreshold * 100)}%
          </label>
          <input
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

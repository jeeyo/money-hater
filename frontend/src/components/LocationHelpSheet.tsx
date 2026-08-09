import { useState } from 'react';
import { detectPlatform } from '../lib/platform';
import type { Platform } from '../lib/platform';
import { Sheet } from './Sheet';

interface Steps {
  label: string;
  camera: string[];
  sharing: string[];
}

/** Menu names drift between OS versions and phone makers, hence "roughly". */
const GUIDES: Record<'ios' | 'android', Steps> = {
  ios: {
    label: 'iPhone / iPad',
    camera: [
      'Settings → Privacy & Security → Location Services — switch it on.',
      'On the same screen, tap Camera → While Using the App, and turn on Precise Location.',
      'Photos taken before you did this have no coordinates stored, and cannot get them back.',
    ],
    sharing: [
      'In Photos, select your shots and tap Share.',
      'Tap Options at the top of the share sheet.',
      'Make sure Location is switched on, then share to Money Hater.',
    ],
  },
  android: {
    label: 'Android',
    camera: [
      'Settings → Location — switch it on.',
      'Open the Camera app’s settings and enable location tagging. It is called Save location on Pixel, Location tags on Samsung.',
      'Photos taken before you did this have no coordinates stored, and cannot get them back.',
    ],
    sharing: [
      'Share from your gallery app rather than a chat.',
      'In Google Photos, check Settings → Sharing and leave Remove geo location off.',
    ],
  },
};

function StepList({ title, steps }: { title: string; steps: string[] }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold text-ink-2">{title}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-3 marker:text-ink-4">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}

export function LocationHelpSheet({ onClose }: { onClose: () => void }) {
  const detected = detectPlatform();
  const [platform, setPlatform] = useState<Exclude<Platform, 'other'>>(
    detected === 'android' ? 'android' : 'ios',
  );
  const guide = GUIDES[platform];

  return (
    <Sheet title="Photos need a location" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-3">
          Money Hater builds your day from where each photo was taken, so a photo with no
          coordinates cannot become a stop. Here is where phones usually lose them.
        </p>

        <div className="flex gap-2" role="tablist">
          {(['ios', 'android'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={platform === option}
              onClick={() => setPlatform(option)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
                platform === option
                  ? 'bg-brand-600 text-white'
                  : 'border border-line-strong text-ink-2 active:bg-surface-2'
              }`}
            >
              {GUIDES[option].label}
              {detected === option && <span className="ml-1 text-xs opacity-75">· yours</span>}
            </button>
          ))}
        </div>

        <StepList title="Let the camera record where you are" steps={guide.camera} />
        <StepList title="Keep the location when you share" steps={guide.sharing} />

        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-3">
          <b className="text-ink-2">Photos sent through a chat app rarely survive.</b> WhatsApp,
          Telegram, LINE and Messenger re-compress what you send and drop the EXIF with it, so a
          photo a friend forwarded you usually has no location at all. Screenshots never had one.
        </p>

        <p className="text-xs text-ink-4">
          Menu names move around between phones and OS versions — if yours differ, look for
          anything about location, GPS or geotagging.
        </p>
      </div>
    </Sheet>
  );
}

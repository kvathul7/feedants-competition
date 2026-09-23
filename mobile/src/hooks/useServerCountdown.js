import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Countdown driven by the SERVER clock, not the device clock.
 *
 * Every response carries `serverTime`. On arrival we compute the skew between
 * that and the device, then tick against `Date.now() + skew`. A user whose
 * phone clock is wrong - or who sets it forward hoping to unlock a closed
 * deadline - still sees the true remaining time, and the server would reject
 * the action regardless.
 *
 * The ticker also re-syncs on foreground: JS timers are throttled or suspended
 * while backgrounded, so elapsed time is recomputed from the clock rather than
 * assumed from the number of ticks that fired.
 */
export function useServerCountdown(targetAt, serverTime) {
  const skewRef = useRef(0);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (serverTime) {
      skewRef.current = new Date(serverTime).getTime() - Date.now();
    }
  }, [serverTime]);

  useEffect(() => {
    if (!targetAt) {
      setRemainingMs(0);
      return undefined;
    }

    const target = new Date(targetAt).getTime();
    const compute = () => setRemainingMs(Math.max(0, target - (Date.now() + skewRef.current)));

    compute();
    const id = setInterval(compute, 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') compute();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [targetAt]);

  return { remainingMs, parts: splitDuration(remainingMs), expired: remainingMs <= 0 };
}

export function splitDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** Renders as `01d : 06h : 28m : 32s`, matching the design. */
export function formatCountdown({ days, hours, minutes, seconds }) {
  return `${pad(days)}d : ${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`;
}

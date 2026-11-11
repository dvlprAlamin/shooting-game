import { useEffect, useRef } from 'react';
import { addAfterEffect } from '@react-three/fiber';
import styles from './FpsMeter.module.scss';

/**
 * Frames per second, as text that changes once a second. Stands in for drei's <Stats>: stats.js redraws a
 * canvas graph every frame, which cost about a fifth of a low-end phone's GPU thread.
 */
const FpsMeter = () => {
  const ref = useRef(null);

  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    return addAfterEffect((now) => {
      frames++;
      if (now - since < 1000) return;
      if (ref.current) ref.current.textContent = `${Math.round((frames * 1000) / (now - since))} FPS`;
      frames = 0;
      since = now;
    });
  }, []);

  return <div ref={ref} className={styles.fps} aria-hidden="true" />;
};

export default FpsMeter;

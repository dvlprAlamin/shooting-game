import { useEffect, useState } from 'react';
import Button from './Button';

const LABELS = { idle: 'Copy', copied: 'Copied', failed: "Can't copy" };

/** Copies `text` and says so on the button for a moment. */
const CopyButton = ({ text, className }) => {
  const [state, setState] = useState('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(id);
  }, [state]);

  const copy = (e) => {
    // In a match, a click that reaches the document would also grab the pointer for mouse look.
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(
      () => setState('copied'),
      () => setState('failed')
    );
  };

  return (
    <Button variant="quiet" className={className} onClick={copy}>
      {LABELS[state]}
    </Button>
  );
};

export default CopyButton;

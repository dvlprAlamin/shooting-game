// Joystick.jsx
import React, { useEffect } from 'react';
import nipplejs from 'nipplejs';

const Joystick = ({ onMove, onEnd }) => {
  useEffect(() => {
    const options = {
      zone: document.getElementById('joystick-container'),
      mode: 'static',
      position: { left: '50%', bottom: '50%' },
      color: 'blue',
      size: 100,
    };

    const manager = nipplejs.create(options);

    manager.on('move', (evt, data) => {
      const { angle, distance } = data;
      if (angle) {
        const radianAngle = (angle.degree * Math.PI) / 180;
        onMove({ angle: radianAngle, distance });
      }
    });

    manager.on('end', () => {
      onEnd();
    });

    return () => {
      manager.destroy();
    };
  }, [onMove, onEnd]);

  return (
    <div
      id="joystick-container"
      style={{
        // width: '100%',
        // height: '100%',
        position: 'absolute',
        bottom: '10%',
        left: '10%',
        width: '150px',
        height: '150px',
        touchAction: 'none',
      }}
    />
  );
};

export default Joystick;

import { useEffect, useState } from 'react';

const MobilePointerLockControls = ({ camera }) => {
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [isTouching, setIsTouching] = useState(false);

  const handleTouchStart = (e) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    setIsTouching(true);
  };
  console.log('touchStart', touchStart);

  const handleTouchMove = (e) => {
    if (!isTouching) return;
    const touch = e.touches[0];
    const movementX = touch.clientX - touchStart.x;
    const movementY = touch.clientY - touchStart.y;
    setTouchStart({ x: touch.clientX, y: touch.clientY });

    const rotationSpeed = 0.002;
    camera.rotation.y -= movementX * rotationSpeed;
    camera.rotation.x -= movementY * rotationSpeed;
  };

  const handleTouchEnd = () => {
    setIsTouching(false);
  };

  return (
    <div
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        textAlign: 'right',
        height: '100dvh',
        width: '100vw',
        background: '#00000080',
        color: '#fff',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 999,
      }}
    >
      <h1>{JSON.stringify(touchStart)}</h1>
    </div>
  );
};
export default MobilePointerLockControls;

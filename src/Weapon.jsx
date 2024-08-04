import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { WeaponModel } from '@/WeaponModel.jsx';
import { useEffect, useRef, useState } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import SingleShootAK47 from '@/assets/sounds/single-shoot-ak47.mp3';
import ShootWithoutBullet from '@/assets/sounds/shoot-without-bullet.mp3';
import FlashShoot from '@/assets/images/flash_shoot.png';
import { useRoundsStore } from '@/store/RoundsStore.ts';
import { PositionalAudio } from '@react-three/drei';
import { usePersonControls } from './hooks';
import { socket, tweenGroup } from './App';
import { v4 as uuidv4 } from 'uuid';
const recoilAmount = 0.03;
const recoilDuration = 50;
const easing = Easing.Quadratic.Out;

export const Weapon = (props) => {
  const { shoot } = usePersonControls();
  const { camera } = useThree();
  const [recoilAnimation, setRecoilAnimation] = useState(null);
  const [isRecoilAnimationFinished, setIsRecoilAnimationFinished] =
    useState(true);
  const weaponRef = useRef();

  const countOfRounds = useRoundsStore((state) => state.countRounds);
  const dispatchDecreaseRounds = useRoundsStore(
    (state) => state.decreaseRounds
  );
  const shootRaycaster = new THREE.Raycaster();
  const shootDirection = new THREE.Vector3();
  const positionalAudioRef = useRef();
  const [audioUrl, setAudioUrl] = useState(SingleShootAK47);

  useEffect(() => {
    if (countOfRounds > 0) {
      setAudioUrl(SingleShootAK47);
    } else {
      setAudioUrl(ShootWithoutBullet);
    }
  }, [countOfRounds]);

  const texture = useLoader(THREE.TextureLoader, FlashShoot);
  const [flashAnimation, setFlashAnimation] = useState(null);

  const generateRecoilOffset = () => {
    return new THREE.Vector3(
      Math.random() * recoilAmount,
      Math.random() * recoilAmount,
      Math.random() * recoilAmount
    );
  };

  const generateNewPositionOfRecoil = (
    currentPosition = new THREE.Vector3(0, 0, 0)
  ) => {
    const recoilOffset = generateRecoilOffset();
    return currentPosition.clone().add(recoilOffset);
  };

  const initRecoilAnimation = () => {
    const currentPosition = new THREE.Vector3(0, 0, 0);
    const newPosition = generateNewPositionOfRecoil(currentPosition);

    const twRecoilAnimation = new Tween(currentPosition)
      .to(newPosition, recoilDuration)
      .easing(easing)
      .repeat(1)
      .yoyo(true)
      .onUpdate(() => {
        weaponRef.current.position.copy(currentPosition);
      })
      .onStart(() => {
        setIsRecoilAnimationFinished(false);
      })
      .onComplete(() => {
        setIsRecoilAnimationFinished(true);
      });

    setRecoilAnimation(twRecoilAnimation);

    tweenGroup.add(twRecoilAnimation);
  };

  const startShooting = () => {
    if (!recoilAnimation) return;

    positionalAudioRef.current.stop();
    positionalAudioRef.current.play();

    if (countOfRounds > 0 && props.playerRef?.current) {
      shootRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      shootDirection.copy(shootRaycaster.ray.direction);

      const { x, y, z } = props.playerRef.current.translation();

      socket.emit('shoot', {
        position: { x, y, z },
        direction: {
          x: shootDirection.x,
          y: shootDirection.y,
          z: shootDirection.z,
        },
        bulletId: uuidv4(),
      });

      dispatchDecreaseRounds();
      recoilAnimation.start();
      flashAnimation.start();
    }
  };

  useEffect(() => {
    initRecoilAnimation();
  }, []);

  useEffect(() => {
    if (shoot && isRecoilAnimationFinished) {
      startShooting();
    }
  }, [shoot, isRecoilAnimationFinished]);

  const [flashOpacity, setFlashOpacity] = useState(0);

  const initFlashAnimation = () => {
    const currentFlashParams = { opacity: 0 };

    const twFlashAnimation = new Tween(currentFlashParams)
      .to({ opacity: 1 }, recoilDuration)
      .easing(easing)
      .onUpdate(() => {
        setFlashOpacity(() => currentFlashParams.opacity);
      })
      .onComplete(() => {
        setFlashOpacity(() => 0);
      });

    setFlashAnimation(twFlashAnimation);

    tweenGroup.add(twFlashAnimation);
  };

  useEffect(() => {
    initFlashAnimation();
  }, []);

  return (
    <group {...props}>
      <group ref={weaponRef}>
        <mesh position={[0, 0.05, -2]} scale={[1, 1, 0]}>
          <planeGeometry attach="geometry" args={[1, 1]} />
          <meshBasicMaterial
            attach="material"
            map={texture}
            transparent={true}
            opacity={flashOpacity}
          />
        </mesh>
        <WeaponModel />
        <PositionalAudio
          url={audioUrl}
          autoplay={false}
          loop={false}
          ref={positionalAudioRef}
        />
      </group>
    </group>
  );
};

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersonControls } from './hooks';
import { useFrame } from '@react-three/fiber';
import { Weapon } from './Weapon';
import { useAimingStore } from './store/AimingStore';
import { socket, tweenGroup } from './App';
import { usePlayerStore } from './store/PlayersStore';
import blood from '@/assets/textures/blood_128x128.png';
import deathSound from '@/assets/sounds/death-sound-male.mp3';
import damageSound from '@/assets/sounds/damage-sound-male.mp3';
import { PositionalAudio, useTexture } from '@react-three/drei';
import { useControls } from 'leva';

const MOVE_SPEED = 5;
const direction = new THREE.Vector3();
const frontVector = new THREE.Vector3();
const sideVector = new THREE.Vector3();
const rotation = new THREE.Vector3();
const easing = Easing.Quadratic.Out;
const damageSounds = [damageSound, deathSound];
export const Player = ({
  id,
  initialPosition = { x: 0, y: 0, z: 0 },
  initialRotation = { x: 0, y: 0, z: 0 },
  isDead,
}) => {
  const playerRef = useRef();
  const bloodTexture = useTexture(blood);
  const { forward, backward, left, right, jump } = usePersonControls();
  const { updatePlayer } = usePlayerStore();
  const objectInHandRef = useRef();
  const swayingObjectRef = useRef();
  const [swayingAnimation, setSwayingAnimation] = useState(null);
  const [swayingBackAnimation, setSwayingBackAnimation] = useState(null);
  const [isSwayingAnimationFinished, setIsSwayingAnimationFinished] =
    useState(true);
  const [swayingNewPosition, setSwayingNewPosition] = useState(
    new THREE.Vector3(-0.005, 0.005, 0)
  );
  const [swayingDuration, setSwayingDuration] = useState(1000);
  const [isMoving, setIsMoving] = useState(false);
  const isAiming = useAimingStore((state) => state.isAiming);
  const [enableJump, setEnableJump] = useState(true);
  const positionalAudioRef = useRef();
  const [audioUrl, setAudioUrl] = useState(damageSound);
  const [bloodAnimation, setBloodAnimation] = useState(null);
  const [bloodOpacity, setBloodOpacity] = useState(0);
  const [bulletHitPositions, setBulletHitPositions] = useState([]);

  const bulletPos = [
    [-0.028925465718148136, 0.0016169992836073885, 0.9],
    [0.02291618630976753, -0.007385728167648705, 0.9],
    [0.0185328776786855, 0.006147296425424137, 0.9],
    [0.03971329708025691, -0.009401320280938992, 0.9],
    [-0.030639928403563665, -0.008088882703405277, 0.9],
  ];
  useFrame((state, delta) => {
    if (!playerRef.current) return;

    // Jumping
    if (jump) doJump();

    // Moving player
    const velocity = playerRef.current.linvel();

    frontVector.set(0, 0, backward - forward);
    sideVector.set(left - right, 0, 0);
    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(MOVE_SPEED)
      .applyEuler(state.camera.rotation);

    playerRef.current.wakeUp();
    playerRef.current.setLinvel({
      x: direction.x,
      y: velocity.y,
      z: direction.z,
    });

    const { x, y, z } = playerRef.current.translation();
    state.camera.position.set(x, y, z);

    // Moving object in hand for the player
    objectInHandRef.current.rotation.copy(state.camera.rotation);
    objectInHandRef.current.position
      .copy(state.camera.position)
      .add(state.camera.getWorldDirection(rotation));

    socket.emit('move', {
      position: { x, y, z },
      rotation: {
        x: state.camera.rotation.x,
        y: state.camera.rotation.y,
        z: state.camera.rotation.z,
      },
    });

    setIsMoving(direction.length() > 0);

    if (swayingAnimation && isSwayingAnimationFinished) {
      setIsSwayingAnimationFinished(false);
      swayingAnimation.start();
    }
    if (y < -50) {
      playerRef.current.setTranslation({ x: -10, y: 40, z: 15 }, true);
    }
  });

  let timeOutId;
  const doJump = () => {
    if (timeOutId) {
      clearTimeout(timeOutId);
    }
    if (!enableJump) return;
    playerRef.current.setLinvel({ x: 0, y: 8, z: 0 });
    setEnableJump(false);
    timeOutId = setTimeout(() => {
      setEnableJump(true);
    }, 1000);
  };

  const setSwayingAnimationParams = () => {
    if (!swayingAnimation) return;

    swayingAnimation.stop();
    setIsSwayingAnimationFinished(true);

    if (isMoving) {
      setSwayingDuration(() => 300);
      setSwayingNewPosition(() => new THREE.Vector3(-0.05, 0, 0));
    } else {
      setSwayingDuration(() => 1000);
      setSwayingNewPosition(() => new THREE.Vector3(-0.01, 0, 0));
    }
  };

  const initSwayingObjectAnimation = () => {
    if (!swayingObjectRef) return;
    const currentPosition = new THREE.Vector3(0, 0, 0);
    const initialPosition = new THREE.Vector3(0, 0, 0);
    const newPosition = swayingNewPosition;
    const animationDuration = swayingDuration;

    const twSwayingAnimation = new Tween(currentPosition)
      .to(newPosition, animationDuration)
      .easing(easing)
      .onUpdate(() => {
        swayingObjectRef.current &&
          swayingObjectRef.current.position.copy(currentPosition);
      });
    const twSwayingBackAnimation = new Tween(currentPosition)
      .to(initialPosition, animationDuration)
      .easing(easing)
      .onUpdate(() => {
        swayingObjectRef.current &&
          swayingObjectRef.current.position.copy(currentPosition);
      })
      .onComplete(() => {
        setIsSwayingAnimationFinished(true);
      });

    twSwayingAnimation.chain(twSwayingBackAnimation);

    setSwayingAnimation(twSwayingAnimation);
    setSwayingBackAnimation(twSwayingBackAnimation);

    tweenGroup.add(twSwayingAnimation);
    tweenGroup.add(twSwayingBackAnimation);
  };

  useEffect(() => {
    setSwayingAnimationParams();
  }, [isMoving]);

  useEffect(() => {
    initSwayingObjectAnimation();
  }, [swayingNewPosition, swayingDuration]);

  const [aimingAnimation, setAimingAnimation] = useState(null);
  const [aimingBackAnimation, setAimingBackAnimation] = useState(null);

  const initAimingAnimation = () => {
    const currentPosition = swayingObjectRef.current.position;
    const finalPosition = new THREE.Vector3(-0.3, -0.01, 0);

    const twAimingAnimation = new Tween(currentPosition)
      .to(finalPosition, 200)
      .easing(easing);

    const twAimingBackAnimation = new Tween(finalPosition.clone())
      .to(new THREE.Vector3(0, 0, 0), 200)
      .easing(easing)
      .onUpdate((position) => {
        swayingObjectRef.current.position.copy(position);
      });

    setAimingAnimation(twAimingAnimation);
    setAimingBackAnimation(twAimingBackAnimation);

    tweenGroup.add(twAimingAnimation);
    tweenGroup.add(twAimingBackAnimation);
  };

  useEffect(() => {
    initAimingAnimation();
  }, [swayingObjectRef]);

  useEffect(() => {
    if (isAiming) {
      swayingAnimation.stop();
      aimingAnimation.start();
    } else if (isAiming === false) {
      aimingBackAnimation?.start().onComplete(() => {
        setSwayingAnimationParams();
      });
    }
  }, [isAiming, aimingAnimation, aimingBackAnimation]);

  const twBloodAnimations = useMemo(() => {
    const currentBloodParams = { opacity: 1 };
    const bloodAnimation = new Tween(currentBloodParams)
      .to({ opacity: 1 }, 3000)
      .easing(Easing.Quartic.In)
      .onUpdate(() => {
        setBloodOpacity(() => currentBloodParams.opacity);
      })
      .onComplete(() => {
        setBloodOpacity(() => 0);
      });
    tweenGroup.add(bloodAnimation);
    return bloodAnimation;
  }, []);

  const handlePlayerHit = () => {
    const index = Math.floor(Math.random() * 2);
    setAudioUrl(damageSounds[index]);
    positionalAudioRef.current.stop();
    positionalAudioRef.current.play();
    setBulletHitPositions((pre) => [
      ...pre,
      [(Math.random() - 0.5) * 0.1, Math.random() * 0.06 - 0.03, 0.9],
    ]);
  };

  useEffect(() => {
    socket.on('hit', (player) => {
      updatePlayer(socket.id, 'health', player.health);
      handlePlayerHit();
    });

    return () => {
      socket.off('hit');
    };
  }, []);

  // const initBloodAnimation = () => {
  //   const currentBloodParams = { opacity: 0 };

  //   const twBloodAnimation = new Tween(currentBloodParams)
  //     .to({ opacity: 1 }, 100)
  //     .easing(easing)
  //     .onUpdate(() => {
  //       setBloodOpacity(() => currentBloodParams.opacity);
  //     })
  //     .onComplete(() => {
  //       setBloodOpacity(() => 0);
  //     });

  //   setBloodAnimation(twBloodAnimation);
  //   console.log('init blood animation');

  //   tweenGroup.add(twBloodAnimation);
  // };

  // useEffect(() => {
  //   initBloodAnimation();
  // }, []);

  // const { positionX, positionY, positionZ } = useControls({
  //   positionX: {
  //     step: 0.01,
  //     label: 'pX',
  //     value: 0,
  //   },
  //   positionY: {
  //     step: 0.01,
  //     label: 'pY',
  //     value: 0,
  //   },
  //   positionZ: {
  //     step: 0.1,
  //     label: 'pZ',
  //     value: 0.9,
  //   },
  // });
  // -3 to 3, -5 to 5
  console.log('bloodOpacity', bloodOpacity);
  //(Math.random()- 0.5)*0.1
  return (
    <>
      <RigidBody
        position={[0, 0, 0.9]}
        colliders={false}
        mass={1}
        ref={playerRef}
        lockRotations
      >
        <mesh castShadow visible={false}>
          <capsuleGeometry args={[0.5, 0.5]} />
          <CapsuleCollider args={[0.75, 0.5]} />
        </mesh>
      </RigidBody>
      <group visible={!isDead} ref={objectInHandRef}>
        <group ref={swayingObjectRef}>
          <Weapon
            playerRef={playerRef}
            position={[0.3, -0.1, 0.3]}
            scale={0.3}
          />
          <PositionalAudio
            url={audioUrl}
            autoplay={false}
            loop={false}
            ref={positionalAudioRef}
          />
        </group>
        {bulletHitPositions.map((position) => (
          <mesh scale={0.01} position={position}>
            <planeGeometry attach="geometry" args={[1, 1]} />
            <meshBasicMaterial
              attach="material"
              map={bloodTexture}
              transparent={true}
              // opacity={bloodOpacity}
            />
          </mesh>
        ))}
      </group>
    </>
  );
};

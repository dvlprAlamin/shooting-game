import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { Tween, Easing } from '@tweenjs/tween.js';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersonControls } from './hooks';
import { useFrame } from '@react-three/fiber';
import { Weapon } from './Weapon';
import { useAimingStore } from './store/AimingStore';
import { socket, tweenGroup } from './App';
// import { useRoundsStore } from './store/RoundsStore';

const MOVE_SPEED = 5;
const direction = new THREE.Vector3();
const frontVector = new THREE.Vector3();
const sideVector = new THREE.Vector3();
const rotation = new THREE.Vector3();
const easing = Easing.Quadratic.Out;

export const Player = ({
  id,
  initialPosition = { x: 0, y: 0, z: 0 },
  initialRotation = { x: 0, y: 0, z: 0 },
  isDead,
}) => {
  const playerRef = useRef();
  const { forward, backward, left, right, jump } = usePersonControls();
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
  const rapier = useRapier();

  useFrame((state, delta) => {
    if (!playerRef.current) return;

    // Jumping
    const world = rapier.world;
    const ray = world.castRay(
      new RAPIER.Ray(playerRef.current.translation(), { x: 0, y: -1, z: 0 })
    );
    const grounded = ray && ray.collider && Math.abs(ray.toi) <= 1.5;

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
      playerRef.current.setTranslation({ x, y: 40, z }, true);
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
    if (id === socket.id) {
      if (isAiming) {
        swayingAnimation.stop();
        aimingAnimation.start();
      } else if (isAiming === false) {
        aimingBackAnimation?.start().onComplete(() => {
          setSwayingAnimationParams();
        });
      }
    }
  }, [isAiming, aimingAnimation, aimingBackAnimation]);

  return (
    <>
      <RigidBody
        position={[initialPosition.x, initialPosition.y, initialPosition.z]}
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
        </group>
      </group>
    </>
  );
};

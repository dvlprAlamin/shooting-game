import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { Weapon } from './Weapon';
import { socket } from './App';
import * as THREE from 'three';
import { usePersonControls } from './hooks';

const MOVE_SPEED = 5;
const direction = new THREE.Vector3();
const frontVector = new THREE.Vector3();
const sideVector = new THREE.Vector3();
// const rotation = new THREE.Vector3();
// const easing = TWEEN.Easing.Quadratic.Out;

const Player2 = ({ id, initialPosition, initialRotation, isDead }) => {
  const playerRef = useRef();
  const { forward, backward, left, right, jump, shoot } = usePersonControls();
  //   useEffect(() => {
  //     api.position.set(initialPosition.x, initialPosition.y, initialPosition.z);
  //     api.rotation.set(initialRotation.x, initialRotation.y, initialRotation.z);
  //   }, [initialPosition, initialRotation]);

  useFrame((state) => {
    if (!playerRef.current) return;

    // Moving camera
    if (id === socket.id) {
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
      // for joystick
      if (joystickInput?.angle !== null) {
        const radianAngle = joystickInput.angle;
        const speed = 0.1 * joystickInput.distance;
        const deltaX = speed * Math.cos(radianAngle);
        const deltaZ = speed * Math.sin(radianAngle);

        frontVector.set(0, 0, -deltaZ);
        sideVector.set(deltaX, 0, 0);
      } else {
        frontVector.set(0, 0, backward - forward);
        sideVector.set(left - right, 0, 0);
      }

      // Moving object in hand for the player
      // objectInHandRef.current.rotation.copy(state.camera.rotation);
      // objectInHandRef.current.position
      //   .copy(state.camera.position)
      //   .add(state.camera.getWorldDirection(rotation));

      socket.emit('move', {
        position: { x, y, z },
        rotation: {
          x: state.camera.rotation.x,
          y: state.camera.rotation.y,
          z: state.camera.rotation.z,
        },
      });

      // setIsMoving(direction.length() > 0);

      // if (shoot) {
      //   if (countOfRounds > 0) {
      //     shootRaycaster.setFromCamera(new THREE.Vector2(0, 0), state.camera);
      //     shootDirection.copy(shootRaycaster.ray.direction);

      //     socket.emit('shoot', {
      //       position: { x, y, z },
      //       direction: {
      //         x: shootDirection.x,
      //         y: shootDirection.y,
      //         z: shootDirection.z,
      //       },
      //     });
      //   }
      // }
    } else {
      playerRef.current.setTranslation(initialPosition, true);
      playerRef.current.setRotation(initialRotation, true);
    }
  });

  return (
    <>
      <RigidBody
        position={[initialPosition.x, initialPosition.y, initialPosition.z]}
        colliders={false}
        mass={1}
        ref={playerRef}
      >
        <mesh castShadow visible={!isDead}>
          <capsuleGeometry args={[0.4, 1]} />
          <meshBasicMaterial color={'yellow'} />
          <CapsuleCollider args={[0.5, 0.5]} />
        </mesh>
      </RigidBody>
      <group visible={!isDead}>
        <group>
          <Weapon
            position={[0.3, -0.1, 0.3]}
            scale={0.3}
            currentPlayer={id === socket.id}
          />
        </group>
      </group>
    </>
  );
};

export default Player2;

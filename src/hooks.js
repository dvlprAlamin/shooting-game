import { useEffect, useState } from "react";
import { usePointerLockControlsStore } from "./store/PointerLockControlStore";
import { useAimingStore } from "./store/AimingStore";
import { useRoundsStore } from "./store/RoundsStore";

const SHOOT_BUTTON = parseInt(import.meta.env.VITE_SHOOT_BUTTON);
const AIM_BUTTON = parseInt(import.meta.env.VITE_AIM_BUTTON);
const RELOAD_BUTTON_CODE = import.meta.env.VITE_RELOAD_BUTTON_CODE;

export const usePersonControls = () => {
    const setIsAiming = useAimingStore((state) => state.setIsAiming);
    const dispatchReloadRounds = useRoundsStore((state) => state.reloadRounds);
    const keys = {
        KeyW: "forward",
        KeyS: "backward",
        KeyA: "left",
        KeyD: "right",
        Space: "jump",
    }

    const moveFieldByKey = (key) => keys[key];

    const [movement, setMovement] = useState({
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
        shoot: false,
        aim: false,
        reload: false
    });

    const setMovementStatus = (code, status) => {
        setMovement((m) => ({ ...m, [code]: status }))
    }

    useEffect(() => {
        const handleKeyDown = (ev) => {
            setMovementStatus(moveFieldByKey(ev.code), true);
        }

        const handleKeyUp = (ev) => {
            setMovementStatus(moveFieldByKey(ev.code), false);
        }
        const handleMouseDown = (ev) => {
            ev.preventDefault();
            mouseButtonHandler(ev.button, true);
        };

        const handleMouseUp = (ev) => {
            ev.preventDefault();
            mouseButtonHandler(ev.button, false);
        };

        const handleKeyPress = (ev) => {
            ev.preventDefault();
            if (ev.code === RELOAD_BUTTON_CODE) {
                dispatchReloadRounds();
            }
        };

        const mouseButtonHandler = (button, state) => {
            if (!usePointerLockControlsStore.getState().isLock) return;
            switch (button) {
                case SHOOT_BUTTON:
                    setMovementStatus("shoot", state);
                    break;
                case AIM_BUTTON:
                    setMovementStatus("aim", state);
                    setIsAiming(state)
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('keypress', handleKeyPress);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('keypress', handleKeyPress);
        }
    }, []);


    return movement;
}
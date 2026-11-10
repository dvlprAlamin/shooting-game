import {useRoundsStore, IRoundsStore} from "@/store/RoundsStore.ts";
import styles from "@/UI/NumberOfRounds/styles.module.scss";
import { IS_TOUCH, RELOAD_BUTTON_NAME } from "@/config";

const NumberOfRounds = () => {
    const countOfRounds = useRoundsStore((state: IRoundsStore) => state.countRounds);
    const isEmptyRounds = countOfRounds === 0;

    return (
        <div className={styles.rounds}>
            {!isEmptyRounds || IS_TOUCH ? countOfRounds : RELOAD_BUTTON_NAME}
        </div>
    );
};

export default NumberOfRounds;

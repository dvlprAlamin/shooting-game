import { useState } from 'react';
import { nanoid } from 'nanoid';
import { PLAYER_LIMITS, ROOM_DURATIONS } from '@shooter/shared';
import { DEFAULT_MAP, MAPS, getMap } from '@shooter/shared/maps';
import Button from '../elements/Button';
import CopyButton from '../elements/CopyButton';
import styles from './RoomSelector.module.scss';

const MODES = [
  { value: 'create', label: 'Create room' },
  { value: 'join', label: 'Join room' },
];
const NAME_MAX_LENGTH = 24; // the server keeps the first 24 characters
// Same rule as ROOM_ID_PATTERN in @shooter/shared, written for the `pattern` attribute (which needs `\-`).
const ROOM_CODE_PATTERN = '[A-Za-z0-9_\\-]{1,32}';

const read = (key) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

/** The map, as chips like the other options. Each one's tooltip says what it's like. */
const MapChoice = ({ value, onChange, away }) => (
  <fieldset className={`${styles.choices} ${away ? styles.away : ''}`} disabled={away}>
    <legend>Map</legend>
    <div className={styles.chips}>
      {MAPS.map((map) => (
        <label key={map.id} className={`${styles.chip} ${styles.mapChip}`} title={map.blurb}>
          <input type="radio" name="map" value={map.id} checked={value === map.id} onChange={() => onChange(map.id)} />
          {map.name}
        </label>
      ))}
    </div>
  </fieldset>
);

/** One row of choices shown as chips (radio buttons): every option visible, one tap to pick. */
const Choices = ({ legend, name, options }) => (
  <fieldset className={styles.choices}>
    <legend>{legend}</legend>
    <div className={styles.chips}>
      {options.map((value, i) => (
        <label key={value} className={styles.chip}>
          <input type="radio" name={name} value={value} defaultChecked={i === 0} />
          {value}
        </label>
      ))}
    </div>
  </fieldset>
);

const RoomSelector = ({ joinRoom }) => {
  const [mode, setMode] = useState('create');
  const [newRoomId] = useState(() => nanoid(6));
  const [mapId, setMapId] = useState(() => getMap(read('map') || DEFAULT_MAP).id);
  const isCreate = mode === 'create';

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const playerName = String(data.get('playerName') ?? '').trim();
    const roomId = isCreate ? newRoomId : String(data.get('roomId') ?? '').trim();
    if (!playerName || !roomId) return;
    try {
      localStorage.setItem('playerName', playerName);
      localStorage.setItem('roomId', roomId);
      if (isCreate) localStorage.setItem('map', mapId);
    } catch {
      // Private mode: the name just isn't remembered.
    }
    joinRoom(
      isCreate
        ? {
            roomId,
            playerName,
            isCreate,
            map: mapId,
            duration: data.get('duration'),
            playersLimit: data.get('playersLimit'),
          }
        : { roomId, playerName, isCreate }
    );
  };

  return (
    <main className={styles.menu}>
      <header className={styles.brand}>
        <h1 className={styles.title}>
          <span>Shooter</span> <span>Free</span>
        </h1>
        <p className={styles.tagline}>Deathmatch with friends. Create a room and share the code, or join theirs.</p>
      </header>

      <form className={styles.deploy} onSubmit={handleSubmit} aria-label={isCreate ? 'Create a room' : 'Join a room'}>
        <fieldset className={styles.tabs}>
          <legend className="sr-only">Room</legend>
          {MODES.map(({ value, label }) => (
            <label key={value} className={styles.tab}>
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
              {label}
            </label>
          ))}
        </fieldset>

        <div className={styles.panel}>
          {/* The map sits beside the name, so picking one adds no height. Joining has no map to pick: see .away. */}
          <div className={styles.identity}>
            <div className={styles.field}>
              <label htmlFor="playerName">Your name</label>
              <input
                id="playerName"
                name="playerName"
                type="text"
                required
                maxLength={NAME_MAX_LENGTH}
                pattern=".*\S.*"
                title="Type at least one letter or number"
                defaultValue={read('playerName')}
                autoComplete="nickname"
                spellCheck={false}
                enterKeyHint={isCreate ? 'go' : 'next'}
              />
            </div>
            <MapChoice value={mapId} onChange={setMapId} away={!isCreate} />
          </div>

          {/* Both panes share one grid cell, so switching tabs never changes the layout. The hidden one is
              disabled: its fields are skipped by validation and left out of the submitted form. */}
          <div className={styles.panes}>
            <fieldset className={styles.pane} disabled={!isCreate}>
              <legend className="sr-only">Match settings</legend>
              <div className={styles.settings}>
                <Choices legend="Match length (minutes)" name="duration" options={ROOM_DURATIONS} />
                <Choices legend="Max players" name="playersLimit" options={PLAYER_LIMITS} />
              </div>
              <div className={styles.actions}>
                <Button type="submit">Start match</Button>
                <p className={styles.code}>
                  <span>Room code</span>
                  <strong>{newRoomId}</strong>
                  <CopyButton text={newRoomId} />
                </p>
              </div>
            </fieldset>

            <fieldset className={styles.pane} disabled={isCreate}>
              <legend className="sr-only">Room to join</legend>
              <div className={styles.field}>
                <label htmlFor="roomId">Room code</label>
                <input
                  id="roomId"
                  name="roomId"
                  type="text"
                  required
                  maxLength={32}
                  pattern={ROOM_CODE_PATTERN}
                  title="Letters, numbers, - and _"
                  placeholder="From the friend who made the room"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                />
              </div>
              <div className={styles.actions}>
                <Button type="submit">Join match</Button>
              </div>
            </fieldset>
          </div>
        </div>
      </form>
    </main>
  );
};

export default RoomSelector;

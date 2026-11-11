import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { MODES, PLAYER_LIMITS, QUICK_PLAY, ROOM_DURATIONS } from '@shooter/shared';
import { DEFAULT_MAP, MAPS, getMap } from '@shooter/shared/maps';
import Button from '../elements/Button';
import CopyButton from '../elements/CopyButton';
import { fetchProfile, quickPlay } from '@/net/api';
import { PROFILE_ID } from '@/net/profile';
import { useFeedStore } from '@/store/FeedStore';
import styles from './RoomSelector.module.scss';

const TABS = [
  { value: 'quick', label: 'Quick play' },
  { value: 'create', label: 'Create room' },
  { value: 'join', label: 'Join room' },
];
const TAB_IDS = TABS.map((t) => t.value);
const quickNote = `${QUICK_PLAY.duration} min, ${QUICK_PLAY.mode === 'tdm' ? 'teams' : 'free for all'}`;
// Game modes (MODES in @shooter/shared). `short` is the label where space is tight.
const GAME_MODES = {
  ffa: { label: 'Free for all', short: 'FFA', blurb: 'Everyone against everyone' },
  tdm: { label: 'Teams', short: 'Teams', blurb: 'Two teams, no friendly fire. Most team kills wins' },
};
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

/** Free for all or teams, as chips with the mode's name. */
const ModeChoice = ({ value, onChange }) => (
  <fieldset className={styles.choices}>
    <legend>Mode</legend>
    <div className={styles.chips}>
      {MODES.map((mode) => (
        <label key={mode} className={`${styles.chip} ${styles.modeChip}`} title={GAME_MODES[mode].blurb}>
          <input type="radio" name="gameMode" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
          <span className={styles.long}>{GAME_MODES[mode].label}</span>
          <span className={styles.short} aria-hidden="true">
            {GAME_MODES[mode].short}
          </span>
        </label>
      ))}
    </div>
  </fieldset>
);

// Your profile's totals, in the same row of boxes as the match options. `profile` null: no matches yet.
const Record = ({ profile, note }) => {
  const { matches = 0, wins = 0, kills = 0, deaths = 0 } = profile ?? {};
  const stats = [
    ['Matches', matches],
    ['Wins', wins],
    ['Kills', kills],
    ['K/D', (kills / Math.max(1, deaths)).toFixed(2)],
  ];
  return (
    <div className={styles.record}>
      <div className={styles.recordHead}>
        <h2>Your record</h2>
        <p>{note}</p>
      </div>
      <dl>
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

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
  const [tab, setTab] = useState(() => (TAB_IDS.includes(read('tab')) ? read('tab') : TAB_IDS[0]));
  const [newRoomId] = useState(() => nanoid(6));
  const [mapId, setMapId] = useState(() => getMap(read('map') || DEFAULT_MAP).id);
  const [gameMode, setGameMode] = useState(() => (MODES.includes(read('mode')) ? read('mode') : MODES[0]));
  // undefined while loading or if the server has no profiles; null for a profile with no matches yet.
  const [profile, setProfile] = useState(undefined);
  const [finding, setFinding] = useState(false);
  const isCreate = tab === 'create';

  useEffect(() => {
    let live = true;
    fetchProfile(PROFILE_ID)
      .then((p) => live && setProfile(p))
      .catch(() => {}); // no record to show
    return () => {
      live = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (finding) return;
    const data = new FormData(e.currentTarget);
    const playerName = String(data.get('playerName') ?? '').trim();
    if (!playerName) return;
    try {
      localStorage.setItem('playerName', playerName);
      localStorage.setItem('tab', tab);
      if (isCreate) {
        localStorage.setItem('map', mapId);
        localStorage.setItem('mode', gameMode);
      }
    } catch {
      // Private mode: the name just isn't remembered.
    }

    // Practice: a private room of your own, against bots.
    if (e.nativeEvent.submitter?.value === 'practice') {
      joinRoom({ roomId: nanoid(10), playerName, practice: true });
      return;
    }
    if (tab === 'quick') {
      setFinding(true);
      try {
        joinRoom({ roomId: await quickPlay(), playerName, quick: true });
      } catch {
        useFeedStore.getState().pushNotice("Can't reach the game server. Check your connection and try again.");
        setFinding(false);
      }
      return;
    }

    const roomId = isCreate ? newRoomId : String(data.get('roomId') ?? '').trim();
    if (!roomId) return;
    try {
      localStorage.setItem('roomId', roomId);
    } catch {
      // As above.
    }
    joinRoom(
      isCreate
        ? {
            roomId,
            playerName,
            isCreate,
            map: mapId,
            mode: gameMode,
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

      <form className={styles.deploy} onSubmit={handleSubmit} aria-label={TABS.find((t) => t.value === tab).label}>
        <fieldset className={styles.tabs}>
          <legend className="sr-only">How to play</legend>
          {TABS.map(({ value, label }) => (
            <label key={value} className={styles.tab}>
              <input type="radio" name="tab" value={value} checked={tab === value} onChange={() => setTab(value)} />
              {label}
            </label>
          ))}
        </fieldset>

        <div className={styles.panel}>
          {/* The map sits beside the name, so picking one adds no height. Only creating a room has a map to pick:
              see .away. */}
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
                enterKeyHint={tab === 'join' ? 'next' : 'go'}
              />
            </div>
            <MapChoice value={mapId} onChange={setMapId} away={!isCreate} />
          </div>

          {/* The panes share one grid cell, so switching tabs never changes the layout. The hidden ones are
              disabled: their fields are skipped by validation and left out of the submitted form. */}
          <div className={styles.panes}>
            <fieldset className={styles.pane} disabled={tab !== 'quick'}>
              <legend className="sr-only">Quick play</legend>
              {profile !== undefined ? (
                <Record profile={profile} note={quickNote} />
              ) : (
                <p className={styles.blurb}>
                  Jump into a public match with free slots, or open one others can join. Bots play until people
                  come. {quickNote}.
                </p>
              )}
              <div className={styles.actions}>
                <Button type="submit" disabled={finding}>
                  {finding ? 'Finding a match' : 'Play now'}
                </Button>
                <Button type="submit" variant="quiet" name="action" value="practice" disabled={finding} title="A private match against bots">
                  Practice
                </Button>
              </div>
            </fieldset>

            <fieldset className={styles.pane} disabled={!isCreate}>
              <legend className="sr-only">Match settings</legend>
              <div className={styles.settings}>
                <Choices legend="Match length (minutes)" name="duration" options={ROOM_DURATIONS} />
                <Choices legend="Max players" name="playersLimit" options={PLAYER_LIMITS} />
                <ModeChoice value={gameMode} onChange={setGameMode} />
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

            <fieldset className={styles.pane} disabled={tab !== 'join'}>
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

import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { MODES, PLAYER_LIMITS, PROTOCOL_VERSION, QUICK_PLAY, ROOM_DURATIONS } from '@rimfire/shared';
import { DEFAULT_MAP, MAPS, getMap } from '@rimfire/shared/maps';
import Button from '../elements/Button';
import CopyButton from '../elements/CopyButton';
import Settings from '../Settings/Settings';
import { failureMessage, fetchProfile, quickPlay } from '@/net/api';
import { getProfileId } from '@/net/profile';
import { socket } from '@/net/socket';
import { NEARBY } from '@/net/lan/native';
import { startHosting } from '@/net/lan/host';
import { closeTunnels, parseAddress, probe, serverAt, watchNearby } from '@/net/lan/nearby';
import { STORE_URL } from '@/config';
import { useFeedStore } from '@/store/FeedStore';
import { APP_OUTDATED, HOST_OUTDATED, needUpdate, useUpdateStore } from '@/store/UpdateStore';
import SignIn from './Account';
import styles from './RoomSelector.module.scss';

const TABS = [
  { value: 'quick', label: 'Quick play' },
  { value: 'create', label: 'Create room' },
  { value: 'join', label: 'Join room' },
  // Games over Wi-Fi or a hotspot, no internet needed (net/lan): the mobile apps only.
  ...(NEARBY ? [{ value: 'nearby', label: 'Nearby' }] : []),
];
const TAB_IDS = TABS.map((t) => t.value);
const quickNote = `${QUICK_PLAY.duration} min, ${QUICK_PLAY.mode === 'tdm' ? 'teams' : 'free for all'}`;
// Game modes (MODES in @rimfire/shared). `short` is the label where space is tight.
const GAME_MODES = {
  ffa: { label: 'Free for all', short: 'FFA', blurb: 'Everyone against everyone' },
  tdm: { label: 'Teams', short: 'Teams', blurb: 'Two teams, no friendly fire. Most team kills wins' },
};
const NAME_MAX_LENGTH = 24; // the server keeps the first 24 characters
// Same rule as ROOM_ID_PATTERN in @rimfire/shared, written for the `pattern` attribute (which needs `\-`).
const ROOM_CODE_PATTERN = '[A-Za-z0-9_\\-]{1,32}';
// The phone hosting a nearby game has one room; this is its code.
const NEARBY_ROOM = 'lan';
// Bots walk a grid worked out from a map's boxes (buildNav in @rimfire/game), so block maps only.
const botsCanPlay = (map) => map.boxes.length > 0 && !!map.bounds;

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
// Under them (`children`): signing in to keep the record.
const Record = ({ profile, note, children }) => {
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
      {children}
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

/**
 * Games found on this phone's Wi-Fi and hotspot, as chips: the host's name, then map, mode and players. A game
 * from another version of the app can't be joined. Beside them, an address to type, for a game that isn't found.
 * `blocked`: the phone keeps the app off the local network, so none can be found.
 */
const NearbyGames = ({ games, blocked, pick, onPick, address, onAddress }) => (
  <div className={styles.nearby}>
    <fieldset className={styles.choices}>
      <legend>Games nearby</legend>
      {games.length ? (
        <div className={styles.chips}>
          {games.slice(0, 3).map((game) => (
            <label
              key={game.key}
              className={`${styles.chip} ${styles.gameChip}`}
              title={game.compatible ? `${game.host}` : 'Made with another version of RimFire'}
            >
              <input
                type="radio"
                name="nearbyGame"
                value={game.key}
                checked={pick === game.key}
                disabled={!game.compatible}
                onChange={() => onPick(game.key)}
              />
              <span className={styles.gameName}>{game.name || 'RimFire'}</span>
              <span className={styles.gameInfo}>
                {getMap(game.map).name} · {GAME_MODES[game.mode]?.short ?? 'FFA'} · {game.players}/{game.limit}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className={styles.looking}>
          {blocked
            ? 'Turn on Local Network for RimFire in the Settings app to find games nearby.'
            : 'Looking on your Wi-Fi and hotspot…'}
        </p>
      )}
    </fieldset>
    <div className={styles.field}>
      <label htmlFor="hostAddress">Or address</label>
      <input
        id="hostAddress"
        name="hostAddress"
        type="text"
        inputMode="decimal"
        placeholder="192.168.1.5"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        value={address}
        onChange={(e) => onAddress(e.target.value)}
      />
    </div>
  </div>
);

const RoomSelector = ({ joinRoom }) => {
  const [tab, setTab] = useState(() => (TAB_IDS.includes(read('tab')) ? read('tab') : TAB_IDS[0]));
  const [newRoomId] = useState(() => nanoid(6));
  const [mapId, setMapId] = useState(() => getMap(read('map') || DEFAULT_MAP).id);
  const [gameMode, setGameMode] = useState(() => (MODES.includes(read('mode')) ? read('mode') : MODES[0]));
  // undefined while loading or if the server has no profiles; null for a profile with no matches yet.
  const [profile, setProfile] = useState(undefined);
  // Working on it: finding a quick-play match, starting a nearby game or reaching one.
  const [finding, setFinding] = useState(false);
  // Nearby: finding games to join, or setting up one to host (with the Create room settings).
  const [hosting, setHosting] = useState(false);
  const [games, setGames] = useState([]);
  const [blocked, setBlocked] = useState(false); // iOS: Local Network access is off
  const [pick, setPick] = useState(null); // the key of the nearby game picked
  const [address, setAddress] = useState('');
  const joining = useRef(null); // the nearby game being joined, whose tunnel stays open
  const updateNeeded = useUpdateStore((s) => s.needed);
  const isCreate = tab === 'create';
  const settingUp = isCreate || (tab === 'nearby' && hosting); // the match settings pane
  const looking = tab === 'nearby' && !hosting;
  const botMap = botsCanPlay(getMap(mapId));

  useEffect(() => {
    let live = true;
    fetchProfile(getProfileId())
      .then((p) => live && setProfile(p))
      .catch(() => {}); // no record to show
    return () => {
      live = false;
    };
  }, []);

  // A join that fails (the notice says why) leaves the menu as it was.
  useEffect(() => {
    const ready = () => {
      joining.current = null;
      setFinding(false);
    };
    socket.on('disconnect', ready);
    return () => socket.off('disconnect', ready);
  }, []);

  useEffect(() => {
    if (!looking) return;
    const stop = watchNearby(setGames, setBlocked);
    return () => {
      stop();
      closeTunnels(joining.current);
      // Start from nothing next time (the pane is hidden meanwhile).
      setGames([]);
      setBlocked(false);
    };
  }, [looking]);

  const notice = (message) => useFeedStore.getState().pushNotice(message);

  // Hosts a nearby game with the match settings, and joins it.
  const host = async (playerName, data) => {
    const playersLimit = Number(data.get('playersLimit'));
    const settings = {
      map: mapId,
      mode: gameMode,
      duration: Number(data.get('duration')),
      playersLimit,
      bots: data.get('bots') && botMap ? Math.min(QUICK_PLAY.bots, playersLimit) : 0,
    };
    setFinding(true);
    try {
      const { server, addresses } = await startHosting({ playerName, settings });
      joinRoom({ roomId: NEARBY_ROOM, playerName, isCreate: true, server, nearby: addresses[0] ?? 'Wi-Fi off' });
    } catch {
      notice("Couldn't start the game. Try again.");
      setFinding(false);
    }
  };

  // Joins the nearby game typed in, or else the one picked (or else the only one found).
  const joinNearby = async (playerName) => {
    let game;
    if (address.trim()) {
      const at = parseAddress(address);
      if (!at) return notice("That isn't an address. It looks like 192.168.1.5.");
      setFinding(true);
      game = await probe(at.host, at.port);
      if (!game) {
        setFinding(false);
        return notice(`No game at ${address.trim()}. Check you're on the host's Wi-Fi or hotspot.`);
      }
    } else {
      const open = games.filter((g) => g.compatible);
      // With none to join, the first one found says whose version is behind.
      game = open.find((g) => g.key === pick) ?? (open.length === 1 ? open[0] : null) ?? (open.length ? null : games[0]);
      if (!game) return notice(open.length ? 'Pick a game to join.' : 'No games found yet.');
    }
    if (!game.compatible) {
      setFinding(false);
      if (game.version < PROTOCOL_VERSION) return notice(HOST_OUTDATED);
      needUpdate();
      return notice(APP_OUTDATED);
    }
    setFinding(true);
    try {
      const server = await serverAt(game.host, game.port);
      joining.current = game.key;
      joinRoom({ roomId: NEARBY_ROOM, playerName, server, nearby: game.host });
    } catch {
      notice(`Can't reach ${game.host}.`);
      setFinding(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (finding) return;
    const data = new FormData(e.currentTarget);
    const playerName = String(data.get('playerName') ?? '').trim();
    if (!playerName) return;
    try {
      localStorage.setItem('playerName', playerName);
      localStorage.setItem('tab', tab);
      if (settingUp) {
        localStorage.setItem('map', mapId);
        localStorage.setItem('mode', gameMode);
      }
    } catch {
      // Private mode: the name just isn't remembered.
    }

    if (tab === 'nearby') return hosting ? host(playerName, data) : joinNearby(playerName);

    // Practice: a private room of your own, against bots.
    if (e.nativeEvent.submitter?.value === 'practice') {
      joinRoom({ roomId: nanoid(10), playerName, practice: true });
      return;
    }
    if (tab === 'quick') {
      setFinding(true);
      try {
        joinRoom({ roomId: await quickPlay(), playerName, quick: true });
      } catch (error) {
        notice(failureMessage(error, "Can't reach the game server. Check your connection and try again."));
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
          <span>Rim</span><span>Fire</span>
        </h1>
        {/* A room refused this app as too old: say so where the tagline was, with the way to update. */}
        {updateNeeded ? (
          <div className={styles.update}>
            <p>{APP_OUTDATED}</p>
            {STORE_URL ? (
              <Button variant="quiet" href={STORE_URL} target="_blank" rel="noreferrer">
                Update
              </Button>
            ) : (
              <Button variant="quiet" onClick={() => window.location.reload()}>
                Reload
              </Button>
            )}
          </div>
        ) : (
          <p className={styles.tagline}>Deathmatch with friends. Create a room and share the code, or join theirs.</p>
        )}
        <div className={styles.about}>
          <Settings record={profile} onProfile={setProfile} />
        </div>
      </header>

      <form className={styles.deploy} onSubmit={handleSubmit} aria-label={TABS.find((t) => t.value === tab).label}>
        <fieldset className={`${styles.tabs} ${TABS.length > 3 ? styles.four : ''}`}>
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
            <MapChoice value={mapId} onChange={setMapId} away={!settingUp} />
          </div>

          {/* The panes share one grid cell, so switching tabs never changes the layout. The hidden ones are
              disabled: their fields are skipped by validation and left out of the submitted form. */}
          <div className={styles.panes}>
            <fieldset className={styles.pane} disabled={tab !== 'quick'}>
              <legend className="sr-only">Quick play</legend>
              {profile !== undefined ? (
                <Record profile={profile} note={quickNote}>
                  <SignIn onProfile={setProfile} />
                </Record>
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

            {/* Creating a room, or hosting a nearby game: the same settings. */}
            <fieldset className={styles.pane} disabled={!settingUp}>
              <legend className="sr-only">Match settings</legend>
              <div className={styles.settings}>
                <Choices legend="Match length (minutes)" name="duration" options={ROOM_DURATIONS} />
                <Choices legend="Max players" name="playersLimit" options={PLAYER_LIMITS} />
                <ModeChoice value={gameMode} onChange={setGameMode} />
              </div>
              {/* Both sets of buttons are always there, one hidden, so the pane is as tall on either tab. */}
              <div className={styles.actionSets}>
                <div className={`${styles.actions} ${tab === 'nearby' ? styles.off : ''}`}>
                  <Button type="submit">Start match</Button>
                  <p className={styles.code}>
                    <span>Room code</span>
                    <strong>{newRoomId}</strong>
                    <CopyButton text={newRoomId} />
                  </p>
                </div>
                {NEARBY && (
                  <div className={`${styles.actions} ${styles.tight} ${tab === 'nearby' ? '' : styles.off}`}>
                    <Button type="submit" disabled={finding}>
                      {finding ? 'Starting' : 'Host match'}
                    </Button>
                    <label
                      className={`${styles.chip} ${styles.toggle}`}
                      title={botMap ? 'Bots play until people take their places' : 'Bots play Depot and Outpost only'}
                    >
                      <input type="checkbox" name="bots" defaultChecked disabled={!botMap} />
                      Bots
                    </label>
                    <Button variant="quiet" onClick={() => setHosting(false)}>
                      Find games
                    </Button>
                  </div>
                )}
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

            {NEARBY && (
              <fieldset className={styles.pane} disabled={!looking}>
                <legend className="sr-only">Nearby games</legend>
                <NearbyGames
                  games={games}
                  blocked={blocked}
                  pick={pick}
                  onPick={(key) => {
                    setPick(key);
                    setAddress('');
                  }}
                  address={address}
                  onAddress={setAddress}
                />
                <div className={styles.actions}>
                  <Button type="submit" disabled={finding}>
                    {finding ? 'Joining' : 'Join match'}
                  </Button>
                  <Button variant="quiet" onClick={() => setHosting(true)}>
                    Host a game
                  </Button>
                </div>
              </fieldset>
            )}
          </div>
        </div>
      </form>
    </main>
  );
};

export default RoomSelector;

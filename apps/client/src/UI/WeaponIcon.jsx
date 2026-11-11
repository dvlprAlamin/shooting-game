// Side-on silhouettes of the guns and the medkit, muzzle to the right, for the slot bar, the kill feed and
// the touch buttons. All share one 32 x 12 box so they line up.
const PATHS = {
  rifle: 'M1 4h20l2-2h3v2h5v2h-7l-1 2h-4l-1 3h-4l1-3H8L5 9H2l1-3H1z',
  smg: 'M1 2.5h1.2v1h4.8V3h14v1h8v1.5h-8v1h-4.5V11H14V6.5h-2l-.8 3.5H8.8l.7-3.5H7V6H2.2v1.5H1zM13 3V1.5h4V3z',
  marksman: 'M1 4h20l2-2h3v2h5v2h-7l-1 2h-4l-1 3h-4l1-3H8L5 9H2l1-3H1zM8 .6h12v2.2h-2.5V4h-1.6V2.8h-3.8V4h-1.6V2.8H8z',
  pistol: 'M9 2.5h14v3h-9.6l-.4 1.6h2.6l-.4 1H12.8L11.6 11H8.3l1.5-5.5H9z',
  medkit: 'M10 2.5h12v9H10zM14.8 4v2.2h-2.2v2.1h2.2v2.2h2.4V8.3h2.2V6.2h-2.2V4z',
};

const WeaponIcon = ({ id, className }) => (
  <svg className={className} viewBox="0 0 32 12" aria-hidden="true">
    <path d={PATHS[id] ?? PATHS.rifle} fill="currentColor" fillRule="evenodd" />
  </svg>
);

export default WeaponIcon;
